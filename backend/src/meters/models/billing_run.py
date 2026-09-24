"""Abrechnungslauf je Kreis und Monat (Plan Phase 4c).

Ein Lauf haelt alles fest, was die Monatsabrechnung braucht: Rechnung, Aufschlaege/Zusatzkosten,
je Position einen Snapshot (Empfaenger, KST, Rechnungszeile, Zaehler, Staende, Korrektur) und das
Ergebnis des Rechenkerns. Status ``entwurf`` ist aenderbar (manuelle Werte je Zeile mit
Begruendung, Neuaufbau aus der App); ``festgeschrieben`` ist unveraenderlich (Service-Pruefung).
Eine neue Version fuer einen bereits festgeschriebenen Monat braucht eine Begruendung; beim
Festschreiben wird die vorige Version ``ersetzt``. Je Kreis und Monat hoechstens ein Entwurf
(partieller Unique-Index).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin
from meters.db.types import DecimalText
from meters.models._enums import BillingPositionKind, BillingRunStatus, BillTo


class BillingRun(Base, TimestampMixin):
    __tablename__ = "billing_run"
    __table_args__ = (
        UniqueConstraint("circle_id", "monat", "version", name="uq_billing_run_version"),
        Index(
            "uq_billing_run_entwurf",
            "circle_id",
            "monat",
            unique=True,
            sqlite_where=text("status = 'ENTWURF'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    circle_id: Mapped[int] = mapped_column(
        ForeignKey("billing_circle.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    monat: Mapped[str] = mapped_column(String(7), nullable=False)  # JJJJ-MM
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[BillingRunStatus] = mapped_column(
        SAEnum(BillingRunStatus, name="billing_run_status", native_enum=False, length=16),
        nullable=False,
    )
    # RESTRICT: eine verwendete Rechnung ist nicht loeschbar (API -> 409).
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("billing_invoice.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    zusatzkosten: Mapped[Decimal] = mapped_column(DecimalText(32), nullable=False)
    aufschlag_prozent: Mapped[Decimal] = mapped_column(DecimalText(32), nullable=False)  # 0.05
    aufschlag_ct: Mapped[Decimal] = mapped_column(DecimalText(32), nullable=False)
    begruendung: Mapped[str | None] = mapped_column(String(500))
    # Ergebnis des Rechenkerns (Decimals als Text); None, wenn die Eingaben ungueltig sind.
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    # Befunde beim Aufbau aus der App (Pruefbericht, Monatsend-Staende) bzw. nach jeder Berechnung.
    befunde_snapshot: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    befunde: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    finalized_at: Mapped[datetime | None] = mapped_column()
    finalized_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))

    lines: Mapped[list[BillingRunLine]] = relationship(
        back_populates="run",
        order_by="BillingRunLine.sort_order",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )


class BillingRunLine(Base):
    __tablename__ = "billing_run_line"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(
        ForeignKey("billing_run.id", ondelete="CASCADE"), index=True, nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    # Snapshot der Position; die Verweise duerfen spaeter verschwinden (SET NULL).
    position_id: Mapped[int | None] = mapped_column(
        ForeignKey("billing_position.id", ondelete="SET NULL"), index=True
    )
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[BillingPositionKind] = mapped_column(
        SAEnum(BillingPositionKind, name="billing_position_kind", native_enum=False, length=16),
        nullable=False,
    )
    parent_label: Mapped[str | None] = mapped_column(String(120))  # Hauptzaehler (Abzug)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("owner.id", ondelete="SET NULL"))
    owner_name: Mapped[str | None] = mapped_column(String(200))  # Empfaenger (Eigentuemer/Mieter)
    # Art des Empfaengers (seit 0047); bei MIETER ist ``owner_id`` leer.
    recipient_kind: Mapped[BillTo] = mapped_column(
        SAEnum(BillTo, name="bill_to", native_enum=False, length=16),
        nullable=False,
        default=BillTo.OWNER,
        server_default=BillTo.OWNER.name,
    )
    internal_allocation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    kostenstelle: Mapped[int | None] = mapped_column(Integer)
    mieter_name: Mapped[str | None] = mapped_column(String(200))
    invoice_line: Mapped[str | None] = mapped_column(String(200))
    measuring_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("measuring_point.id", ondelete="SET NULL")
    )
    measuring_point_name: Mapped[str | None] = mapped_column(String(200))
    serial_numbers: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    transformer_factor: Mapped[int | None] = mapped_column(Integer)
    # Werte aus der App (Monatsend-Staende, automatische Korrektur)
    stand_alt: Mapped[Decimal | None] = mapped_column(DecimalText(32))
    stand_alt_art: Mapped[str | None] = mapped_column(String(16))
    stand_alt_abstand: Mapped[int | None] = mapped_column(Integer)
    stand_neu: Mapped[Decimal | None] = mapped_column(DecimalText(32))
    stand_neu_art: Mapped[str | None] = mapped_column(String(16))
    stand_neu_abstand: Mapped[int | None] = mapped_column(Integer)
    korrektur_kwh: Mapped[Decimal | None] = mapped_column(DecimalText(32))
    korrektur_note: Mapped[str | None] = mapped_column(String(1000))
    # Manuelle Werte ersetzen die App-Werte (Begruendung Pflicht)
    manual_stand_alt: Mapped[Decimal | None] = mapped_column(DecimalText(32))
    manual_stand_neu: Mapped[Decimal | None] = mapped_column(DecimalText(32))
    manual_korrektur_kwh: Mapped[Decimal | None] = mapped_column(DecimalText(32))
    manual_note: Mapped[str | None] = mapped_column(String(500))
    # Ergebnis
    kwh: Mapped[Decimal | None] = mapped_column(DecimalText(32))
    eur: Mapped[Decimal | None] = mapped_column(DecimalText(32))
    pruefung: Mapped[str | None] = mapped_column(String(40))

    run: Mapped[BillingRun] = relationship(back_populates="lines")

    @property
    def effektiv_stand_alt(self) -> Decimal | None:
        return self.manual_stand_alt if self.manual_stand_alt is not None else self.stand_alt

    @property
    def effektiv_stand_neu(self) -> Decimal | None:
        return self.manual_stand_neu if self.manual_stand_neu is not None else self.stand_neu

    @property
    def effektiv_korrektur(self) -> Decimal | None:
        if self.manual_korrektur_kwh is not None:
            return self.manual_korrektur_kwh
        return self.korrektur_kwh
