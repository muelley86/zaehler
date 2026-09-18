"""Abrechnungslaeufe je Kreis und Monat (admin-only, Plan Phase 4c).

Entwurf anlegen (Snapshot aus der App + Rechnung des Monats) -> Parameter/Zeilen anpassen (jede
Aenderung rechnet neu) -> aus der App aktualisieren -> festschreiben (nur ohne blockierende
Befunde; vorige Version wird ``ersetzt``). Festgeschriebene Laeufe sind unveraenderlich.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from meters.api.deps import AdminUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.models import (
    AuditAction,
    AuditEntityType,
    BillingCircle,
    BillingRun,
    BillingRunLine,
)
from meters.schemas.billing_attachment import BillingAttachmentRead
from meters.schemas.billing_run import (
    BillingRunCreate,
    BillingRunLineUpdate,
    BillingRunRead,
    BillingRunSummary,
    BillingRunUpdate,
)
from meters.schemas.billing_transfer import BillingTransferCreate, BillingTransferView
from meters.services.audit import record
from meters.services.billing_attachment import attachment
from meters.services.billing_invoice_helper import invoice_of_run
from meters.services.billing_run import (
    assert_entwurf,
    berechne_lauf,
    blocking,
    create_run,
    finalize_run,
    refresh_run,
)
from meters.services.billing_transfer import (
    mark_transferred,
    transfer_view,
    unmark_transferred,
)

router = APIRouter(prefix="/billing-circles", tags=["billing"])

_MANUELL = ("manual_stand_alt", "manual_stand_neu", "manual_korrektur_kwh")


def _circle(db: DbDep, circle_id: int) -> BillingCircle:
    circle = db.get(BillingCircle, circle_id)
    if circle is None:
        raise ProblemError(status_code=404, title="Billing circle not found")
    return circle


def _run(db: DbDep, circle_id: int, run_id: int) -> BillingRun:
    run = db.get(BillingRun, run_id)
    if run is None or run.circle_id != circle_id:
        raise ProblemError(status_code=404, title="Billing run not found")
    return run


def _kopf(run: BillingRun) -> dict[str, Any]:
    ergebnis = run.result or {}
    return {
        "preis_eur": ergebnis.get("preis_eur"),
        "gesamt_eur": ergebnis.get("gesamt_eur"),
        "saldo_eur": ergebnis.get("saldo_eur"),
        "blocking_count": len(blocking(run)),
    }


def _summary(run: BillingRun) -> BillingRunSummary:
    return BillingRunSummary.model_validate(run).model_copy(update=_kopf(run))


def _read(run: BillingRun) -> BillingRunRead:
    return BillingRunRead.model_validate(run).model_copy(update=_kopf(run))


def _json(value: Any) -> Any:
    return value if value is None or isinstance(value, str) else format(value, "f")


def _audit(
    db: DbDep,
    request: Request,
    admin: AdminUser,
    run: BillingRun,
    action: AuditAction,
    diff: dict[str, Any],
) -> None:
    record(
        db,
        user_id=admin.id,
        action=action,
        entity_type=AuditEntityType.BILLING_RUN,
        entity_id=run.id,
        diff={"circle_id": run.circle_id, "monat": run.monat, "version": run.version, **diff},
        ip_address=client_ip(request),
    )


def _commit(db: DbDep) -> None:
    """Paralleler zweiter Entwurf (partieller Unique-Index) bzw. Versionskonflikt -> 409."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(
            status_code=409,
            title="Billing run conflict",
            detail="Der Lauf wurde gleichzeitig angelegt oder geaendert - bitte neu laden.",
        ) from exc


@router.get("/{circle_id}/runs", response_model=list[BillingRunSummary])
def list_runs(circle_id: int, db: DbDep, _admin: AdminUser) -> list[BillingRunSummary]:
    _circle(db, circle_id)
    rows = db.scalars(
        select(BillingRun)
        .where(BillingRun.circle_id == circle_id)
        .order_by(BillingRun.monat.desc(), BillingRun.version.desc())
    )
    return [_summary(r) for r in rows]


@router.post(
    "/{circle_id}/runs", response_model=BillingRunRead, status_code=status.HTTP_201_CREATED
)
def create(
    circle_id: int, payload: BillingRunCreate, request: Request, db: DbDep, admin: AdminUser
) -> BillingRunRead:
    circle = _circle(db, circle_id)
    run = create_run(
        db,
        circle,
        payload.monat,
        zusatzkosten=payload.zusatzkosten,
        aufschlag_prozent=payload.aufschlag_prozent,
        aufschlag_ct=payload.aufschlag_ct,
        begruendung=payload.begruendung,
        user_id=admin.id,
    )
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(
            status_code=409,
            title="Billing run conflict",
            detail="Der Lauf wurde gleichzeitig angelegt - bitte neu laden.",
        ) from exc
    diff = {k: _json(v) for k, v in payload.model_dump().items()}
    _audit(db, request, admin, run, AuditAction.CREATE, diff)
    _commit(db)
    return _read(run)


@router.get("/{circle_id}/runs/{run_id}", response_model=BillingRunRead)
def get_run(circle_id: int, run_id: int, db: DbDep, _admin: AdminUser) -> BillingRunRead:
    return _read(_run(db, circle_id, run_id))


@router.patch("/{circle_id}/runs/{run_id}", response_model=BillingRunRead)
def update_run(
    circle_id: int,
    run_id: int,
    payload: BillingRunUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> BillingRunRead:
    run = _run(db, circle_id, run_id)
    assert_entwurf(run)
    diff: dict[str, Any] = {}
    for name in sorted(payload.model_fields_set):
        neu = getattr(payload, name)
        if neu is None and name != "begruendung":
            raise ProblemError(
                status_code=422, title="Invalid field", detail=f"{name} ist Pflicht."
            )
        if neu != getattr(run, name):
            diff[name] = {"from": _json(getattr(run, name)), "to": _json(neu)}
            setattr(run, name, neu)
    if diff:
        berechne_lauf(db, run)
        _audit(db, request, admin, run, AuditAction.UPDATE, diff)
    _commit(db)
    return _read(run)


@router.patch("/{circle_id}/runs/{run_id}/lines/{line_id}", response_model=BillingRunRead)
def update_line(
    circle_id: int,
    run_id: int,
    line_id: int,
    payload: BillingRunLineUpdate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> BillingRunRead:
    run = _run(db, circle_id, run_id)
    assert_entwurf(run)
    line = db.get(BillingRunLine, line_id)
    if line is None or line.run_id != run.id:
        raise ProblemError(status_code=404, title="Billing run line not found")
    ziel: dict[str, Any] = {f: getattr(line, f) for f in (*_MANUELL, "manual_note")}
    for name in payload.model_fields_set:
        ziel[name] = getattr(payload, name)
    note = (ziel["manual_note"] or "").strip() or None
    gesetzt = any(ziel[f] is not None for f in _MANUELL)
    if gesetzt and note is None:
        raise ProblemError(
            status_code=422,
            title="Reason required",
            detail="Manuelle Werte brauchen eine Begruendung.",
        )
    ziel["manual_note"] = note if gesetzt else None
    diff = {
        f: {"from": _json(getattr(line, f)), "to": _json(v)}
        for f, v in ziel.items()
        if v != getattr(line, f)
    }
    for f, v in ziel.items():
        setattr(line, f, v)
    if diff:
        berechne_lauf(db, run)
        _audit(db, request, admin, run, AuditAction.UPDATE, {"line": line.label, "felder": diff})
    _commit(db)
    return _read(run)


@router.post("/{circle_id}/runs/{run_id}/refresh", response_model=BillingRunRead)
def refresh(
    circle_id: int, run_id: int, request: Request, db: DbDep, admin: AdminUser
) -> BillingRunRead:
    """Neuaufbau der Zeilen aus der App (Empfaenger, KST, Staende); manuelle Werte bleiben."""
    circle = _circle(db, circle_id)
    run = _run(db, circle_id, run_id)
    refresh_run(db, circle, run)
    _audit(db, request, admin, run, AuditAction.UPDATE, {"refresh": True})
    _commit(db)
    return _read(run)


@router.post("/{circle_id}/runs/{run_id}/finalize", response_model=BillingRunRead)
def finalize(
    circle_id: int, run_id: int, request: Request, db: DbDep, admin: AdminUser
) -> BillingRunRead:
    run = _run(db, circle_id, run_id)
    ersetzt = finalize_run(db, run, admin.id)
    result = run.result or {}
    _audit(
        db,
        request,
        admin,
        run,
        AuditAction.BILLING_RUN_FINALIZED,
        {
            "ersetzt_run_id": ersetzt.id if ersetzt else None,
            "preis_eur": result.get("preis_eur"),
            "gesamt_eur": result.get("gesamt_eur"),
            "saldo_eur": result.get("saldo_eur"),
        },
    )
    _commit(db)
    return _read(run)


@router.delete("/{circle_id}/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(circle_id: int, run_id: int, request: Request, db: DbDep, admin: AdminUser) -> None:
    run = _run(db, circle_id, run_id)
    assert_entwurf(run)
    _audit(db, request, admin, run, AuditAction.DELETE, {})
    db.delete(run)
    _commit(db)


@router.get("/{circle_id}/runs/{run_id}/transfer", response_model=BillingTransferView)
def transfer(circle_id: int, run_id: int, db: DbDep, _admin: AdminUser) -> BillingTransferView:
    """Zeilen des Agrarmonitor-Formulars je Empfaenger inkl. Uebertragungsstatus."""
    return transfer_view(db, _run(db, circle_id, run_id))


@router.post(
    "/{circle_id}/runs/{run_id}/transfers",
    response_model=BillingTransferView,
    status_code=status.HTTP_201_CREATED,
)
def mark_transfer(
    circle_id: int,
    run_id: int,
    payload: BillingTransferCreate,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> BillingTransferView:
    """Empfaenger als nach Agrarmonitor uebertragen markieren (nur festgeschriebene Laeufe)."""
    run = _run(db, circle_id, run_id)
    eintrag = mark_transferred(
        db,
        run,
        payload.owner_name,
        belegnummer=payload.belegnummer,
        note=payload.note,
        user_id=admin.id,
    )
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ProblemError(
            status_code=409,
            title="Already transferred",
            detail=f"{payload.owner_name} ist bereits als uebertragen markiert.",
        ) from exc
    _audit(
        db,
        request,
        admin,
        run,
        AuditAction.BILLING_TRANSFERRED,
        {
            "owner_name": eintrag.owner_name,
            "belegnummer": eintrag.belegnummer,
            "note": eintrag.note,
        },
    )
    _commit(db)
    return transfer_view(db, run)


@router.delete(
    "/{circle_id}/runs/{run_id}/transfers/{transfer_id}", response_model=BillingTransferView
)
def unmark_transfer(
    circle_id: int,
    run_id: int,
    transfer_id: int,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> BillingTransferView:
    """Markierung zuruecknehmen (z. B. falsche Belegnummer)."""
    run = _run(db, circle_id, run_id)
    eintrag = unmark_transferred(db, run, transfer_id)
    _audit(
        db,
        request,
        admin,
        run,
        AuditAction.BILLING_TRANSFERRED,
        {
            # Die Zeile wird geloescht - Belegnummer und Notiz bleiben nur im Audit-Log erhalten.
            "owner_name": eintrag.owner_name,
            "belegnummer": eintrag.belegnummer,
            "note": eintrag.note,
            "zurueckgenommen": True,
        },
    )
    _commit(db)
    return transfer_view(db, run)


@router.get("/{circle_id}/runs/{run_id}/anhang", response_model=BillingAttachmentRead)
def anhang(circle_id: int, run_id: int, db: DbDep, _admin: AdminUser) -> BillingAttachmentRead:
    """Rechnungsanhang je Empfaenger (Preisermittlung, Zaehlertabelle, KST, Zusammensetzung)."""
    run = _run(db, circle_id, run_id)
    return attachment(run, _circle(db, circle_id), invoice_of_run(db, run))
