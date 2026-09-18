"""Eingangsrechnung des Stromlieferanten je Abrechnungskreis (Plan Phase 4a).

Kopf und Positionen stammen aus dem PDF-Parser (``billing/invoice_pdf.py``) und werden nach dem
Import nicht mehr geaendert - eine falsche Rechnung wird geloescht und neu importiert (solange kein
festgeschriebener Abrechnungslauf sie verwendet). Das Original-PDF liegt als BLOB in einer eigenen
Tabelle statt im Dateisystem: das Voll-Backup (DB + Fotos) sichert es damit ohne Erweiterung, und
Listenabfragen laden die Bytes nie mit.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import JSON, Date, ForeignKey, Integer, LargeBinary, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin
from meters.db.types import DecimalText


class BillingInvoice(Base, TimestampMixin):
    __tablename__ = "billing_invoice"
    __table_args__ = (
        UniqueConstraint("circle_id", "nummer", name="uq_billing_invoice_nummer"),
        # Eine Rechnung je Kreis und Monat - als Constraint, damit parallele Uploads nicht beide
        # durch die Vorabpruefung rutschen.
        UniqueConstraint("circle_id", "period_month", name="uq_billing_invoice_month"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    circle_id: Mapped[int] = mapped_column(
        ForeignKey("billing_circle.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    nummer: Mapped[str] = mapped_column(String(40), nullable=False)
    datum: Mapped[date] = mapped_column(Date, nullable=False)
    aid: Mapped[str] = mapped_column(String(64), nullable=False)
    marktlokation: Mapped[str] = mapped_column(String(11), nullable=False)
    period_from: Mapped[date] = mapped_column(Date, nullable=False)
    period_to: Mapped[date] = mapped_column(Date, nullable=False)
    period_month: Mapped[str] = mapped_column(
        String(7), nullable=False
    )  # "JJJJ-MM" von period_from
    verbrauch_kwh: Mapped[Decimal] = mapped_column(DecimalText(32), nullable=False)
    leistungsspitze_kw: Mapped[Decimal] = mapped_column(DecimalText(32), nullable=False)
    betrag_netto: Mapped[Decimal] = mapped_column(DecimalText(32), nullable=False)
    hinweise: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    # Gleiche Datei zweimal (auch in einem anderen Kreis) -> 409.
    pdf_sha256: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    pdf_size: Mapped[int] = mapped_column(Integer, nullable=False)
    pdf_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))

    positions: Mapped[list[BillingInvoicePosition]] = relationship(
        back_populates="invoice",
        order_by="BillingInvoicePosition.sort_order",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )


class BillingInvoicePosition(Base):
    __tablename__ = "billing_invoice_position"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("billing_invoice.id", ondelete="CASCADE"), index=True, nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    abschnitt: Mapped[str] = mapped_column(String(60), nullable=False)
    zeitraum: Mapped[str] = mapped_column(String(40), nullable=False)
    menge: Mapped[Decimal | None] = mapped_column(DecimalText(32))
    preis_ct: Mapped[Decimal | None] = mapped_column(DecimalText(32))
    betrag: Mapped[Decimal] = mapped_column(DecimalText(32), nullable=False)
    # "Sonstige" fuer unbekannte Positionen (Reservezeilen), sonst NULL = Kategorie laut Standard.
    kategorie: Mapped[str | None] = mapped_column(String(32))

    invoice: Mapped[BillingInvoice] = relationship(back_populates="positions")


class BillingInvoiceFile(Base):
    __tablename__ = "billing_invoice_file"

    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("billing_invoice.id", ondelete="CASCADE"), primary_key=True
    )
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
