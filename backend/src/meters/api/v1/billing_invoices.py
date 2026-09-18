"""Eingangsrechnungen je Abrechnungskreis (admin-only, Plan Phase 4a).

Upload der Monatsrechnung als PDF: Parser (``billing/invoice_pdf.py``) liest Kopf und Positionen,
die Abnahmestelle muss zum Kreis passen. Gespeichert werden Kopf, Positionen und Original-PDF
(SHA-256). Keine Aenderung nach dem Import - falsche Rechnung loeschen und neu hochladen.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Annotated

from fastapi import APIRouter, File, Request, Response, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from meters.api.deps import AdminUser, DbDep, client_ip
from meters.billing.invoice_pdf import MAX_PDF_BYTES, InvoiceParseError, read_invoice_pdf
from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    BillingCircle,
    BillingInvoice,
    BillingInvoiceFile,
    BillingInvoicePosition,
    BillingRun,
)
from meters.schemas.billing_invoice import BillingInvoiceRead
from meters.services.audit import record

router = APIRouter(prefix="/billing-circles", tags=["billing"])

_ZU_GROSS = f"Maximal {MAX_PDF_BYTES // (1024 * 1024)} MB."


def _circle(db: DbDep, circle_id: int) -> BillingCircle:
    circle = db.get(BillingCircle, circle_id)
    if circle is None:
        raise ProblemError(status_code=404, title="Billing circle not found")
    return circle


def _invoice(db: DbDep, circle_id: int, invoice_id: int) -> BillingInvoice:
    invoice = db.get(BillingInvoice, invoice_id)
    if invoice is None or invoice.circle_id != circle_id:
        raise ProblemError(status_code=404, title="Billing invoice not found")
    return invoice


def _dateiname(roh: str | None) -> str:
    """Nur zur Anzeige: Basisname ohne Pfad- und Steuerzeichen, begrenzt."""
    name = re.split(r"[\\/]", roh or "")[-1]
    name = "".join(c for c in name if unicodedata.category(c)[0] != "C").strip()
    return name[:255] or "rechnung.pdf"


def _lies_upload(upload: UploadFile) -> bytes:
    if upload.size is not None and upload.size > MAX_PDF_BYTES:
        raise ProblemError(status_code=413, title="Datei zu groß", detail=_ZU_GROSS)
    upload.file.seek(0)
    daten = upload.file.read(MAX_PDF_BYTES + 1)
    if len(daten) > MAX_PDF_BYTES:
        raise ProblemError(status_code=413, title="Datei zu groß", detail=_ZU_GROSS)
    return daten


def _konflikt(detail: str) -> ProblemError:
    return ProblemError(status_code=409, title="Invoice already imported", detail=detail)


@router.get("/{circle_id}/invoices", response_model=list[BillingInvoiceRead])
def list_invoices(circle_id: int, db: DbDep, _admin: AdminUser) -> list[BillingInvoiceRead]:
    _circle(db, circle_id)
    rows = db.scalars(
        select(BillingInvoice)
        .where(BillingInvoice.circle_id == circle_id)
        .order_by(BillingInvoice.period_from.desc(), BillingInvoice.id.desc())
    )
    return [BillingInvoiceRead.model_validate(i) for i in rows]


@router.post(
    "/{circle_id}/invoices",
    response_model=BillingInvoiceRead,
    status_code=status.HTTP_201_CREATED,
)
def upload_invoice(
    circle_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
    file: Annotated[UploadFile, File()],
) -> BillingInvoiceRead:
    circle = _circle(db, circle_id)
    daten = _lies_upload(file)
    try:
        gelesen = read_invoice_pdf(daten)
    except InvoiceParseError as exc:
        raise ProblemError(status_code=422, title="Invoice not readable", detail=str(exc)) from exc
    kopf = gelesen.kopf
    if kopf.aid != circle.abnahmestelle:
        raise ProblemError(
            status_code=422,
            title="Invoice belongs to another circle",
            detail=f"Abnahmestelle der Rechnung {kopf.aid} passt nicht zum Kreis {circle.code}.",
        )
    if circle.marktlokation and kopf.marktlokation != circle.marktlokation:
        raise ProblemError(
            status_code=422,
            title="Invoice belongs to another circle",
            detail=f"Marktlokation der Rechnung passt nicht zum Kreis {circle.code}.",
        )
    sha = hashlib.sha256(daten).hexdigest()
    monat = f"{kopf.von:%Y-%m}"
    if db.scalar(select(BillingInvoice.id).where(BillingInvoice.pdf_sha256 == sha)) is not None:
        raise _konflikt("Diese PDF-Datei wurde bereits importiert.")
    vorhanden = db.scalar(
        select(BillingInvoice.nummer).where(
            BillingInvoice.circle_id == circle.id,
            (BillingInvoice.nummer == kopf.nummer) | (BillingInvoice.period_month == monat),
        )
    )
    if vorhanden is not None:
        raise _konflikt(
            f"Für {kopf.von:%m/%Y} liegt bereits die Rechnung {vorhanden} vor - erst diese löschen."
        )

    invoice = BillingInvoice(
        circle_id=circle.id,
        nummer=kopf.nummer,
        datum=kopf.datum,
        aid=kopf.aid,
        marktlokation=kopf.marktlokation,
        period_from=kopf.von,
        period_to=kopf.bis,
        period_month=monat,
        verbrauch_kwh=kopf.verbrauch_kwh,
        leistungsspitze_kw=kopf.leistungsspitze_kw,
        betrag_netto=kopf.betrag_netto,
        hinweise=list(gelesen.hinweise),
        pdf_sha256=sha,
        pdf_size=len(daten),
        pdf_filename=_dateiname(file.filename),
        uploaded_by=admin.id,
        positions=[
            BillingInvoicePosition(
                sort_order=i,
                name=z.name,
                abschnitt=z.abschnitt,
                zeitraum=z.zeitraum,
                menge=z.menge,
                preis_ct=z.preis_ct,
                betrag=z.betrag,
                kategorie=z.kategorie,
            )
            for i, z in enumerate(gelesen.zeilen)
        ],
    )
    db.add(invoice)
    try:
        db.flush()
    except IntegrityError as exc:  # paralleler Upload derselben Rechnung
        db.rollback()
        raise _konflikt("Die Rechnung wurde soeben bereits importiert.") from exc
    db.add(BillingInvoiceFile(invoice_id=invoice.id, data=daten))
    record(
        db,
        user_id=admin.id,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.BILLING_INVOICE,
        entity_id=invoice.id,
        diff={
            "circle_id": circle.id,
            "nummer": kopf.nummer,
            "period_from": kopf.von.isoformat(),
            "betrag_netto": format(kopf.betrag_netto, "f"),
            "pdf_sha256": sha,
        },
        ip_address=client_ip(request),
    )
    db.commit()
    db.refresh(invoice)
    return BillingInvoiceRead.model_validate(invoice)


@router.get("/{circle_id}/invoices/{invoice_id}", response_model=BillingInvoiceRead)
def get_invoice(
    circle_id: int, invoice_id: int, db: DbDep, _admin: AdminUser
) -> BillingInvoiceRead:
    return BillingInvoiceRead.model_validate(_invoice(db, circle_id, invoice_id))


@router.get("/{circle_id}/invoices/{invoice_id}/pdf")
def get_invoice_pdf(circle_id: int, invoice_id: int, db: DbDep, _admin: AdminUser) -> Response:
    invoice = _invoice(db, circle_id, invoice_id)
    datei = db.get(BillingInvoiceFile, invoice.id)
    if datei is None:
        raise ProblemError(status_code=404, title="Invoice PDF not found")
    return Response(
        content=datei.data,
        media_type="application/pdf",
        headers={
            # Fester ASCII-Name: Rechnungsnummer/Upload-Name nie ungeprueft in den Header.
            "Content-Disposition": f'inline; filename="rechnung-{invoice.id}.pdf"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/{circle_id}/invoices/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(
    circle_id: int, invoice_id: int, request: Request, db: DbDep, admin: AdminUser
) -> None:
    invoice = _invoice(db, circle_id, invoice_id)
    if db.scalar(select(BillingRun.id).where(BillingRun.invoice_id == invoice.id)) is not None:
        raise ProblemError(
            status_code=409,
            title="Invoice used by billing run",
            detail="Die Rechnung wird von einem Abrechnungslauf verwendet.",
        )
    record(
        db,
        user_id=admin.id,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.BILLING_INVOICE,
        entity_id=invoice.id,
        diff={
            "circle_id": circle_id,
            "nummer": invoice.nummer,
            "period_from": invoice.period_from.isoformat(),
            "pdf_sha256": invoice.pdf_sha256,
        },
        ip_address=client_ip(request),
    )
    db.execute(delete(BillingInvoiceFile).where(BillingInvoiceFile.invoice_id == invoice.id))
    db.delete(invoice)
    try:
        db.commit()
    except IntegrityError as exc:  # paralleler Abrechnungslauf verweist soeben auf die Rechnung
        db.rollback()
        raise ProblemError(
            status_code=409,
            title="Invoice used by billing run",
            detail="Die Rechnung wird von einem Abrechnungslauf verwendet.",
        ) from exc
