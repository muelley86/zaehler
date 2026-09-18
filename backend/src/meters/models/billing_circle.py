"""Abrechnungskreis und Abrechnungsposition fuer die Stromabrechnung.

Ein Kreis entspricht einer Abnahmestelle des Stromlieferanten. Abgerechnet wird nur, was als
Position im Kreis steht (Entscheidung des Nutzers 2026-09-17: weitere Zaehler der App sind
Dokumentation).

Position ``meter``: eine Strom-Messstelle; Empfaenger (Eigentuemer) und Kostenstelle kommen aus
der Messstelle zum Stichtag. Position ``rest``: Restmenge ohne Messstelle, traegt
Empfaenger und Kostenstelle selbst. ``parent_position_id`` = Unterzaehler: der Verbrauch dieser
Position wird vom Hauptzaehler abgezogen. Gueltigkeit halboffen
``[valid_from, valid_to)``.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin
from meters.models._enums import BillingPositionKind

if TYPE_CHECKING:  # pragma: no cover
    from meters.models.measuring_point import MeasuringPoint
    from meters.models.owner import Owner


class BillingCircle(Base, TimestampMixin):
    __tablename__ = "billing_circle"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    rechnungsleger: Mapped[str] = mapped_column(String(120), nullable=False)
    abnahmestelle: Mapped[str] = mapped_column(String(64), nullable=False)
    marktlokation: Mapped[str | None] = mapped_column(String(11))
    note: Mapped[str | None] = mapped_column(String(500))

    positions: Mapped[list[BillingPosition]] = relationship(
        back_populates="circle",
        order_by="(BillingPosition.sort_order, BillingPosition.label)",
        passive_deletes="all",
    )


class BillingPosition(Base, TimestampMixin):
    __tablename__ = "billing_position"

    id: Mapped[int] = mapped_column(primary_key=True)
    circle_id: Mapped[int] = mapped_column(
        ForeignKey("billing_circle.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[BillingPositionKind] = mapped_column(
        SAEnum(BillingPositionKind, name="billing_position_kind", native_enum=False, length=16),
        nullable=False,
    )
    # RESTRICT: eine abgerechnete Messstelle darf nicht still verschwinden (Delete-Endpoint -> 409).
    measuring_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("measuring_point.id", ondelete="RESTRICT"), index=True
    )
    # SET NULL statt RESTRICT: das Loeschen eines Hauptzaehlers verhindert die API (409); ein
    # RESTRICT-Selbstverweis blockierte sonst ``DELETE FROM billing_position`` je nach Zeilenfolge.
    parent_position_id: Mapped[int | None] = mapped_column(
        ForeignKey("billing_position.id", ondelete="SET NULL"), index=True
    )
    # Nur bei ``rest``: Empfaenger und Kostenstelle der Restmenge.
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("owner.id", ondelete="SET NULL"), index=True
    )
    kostenstelle: Mapped[int | None] = mapped_column(Integer)
    # Agrarmonitor-Rechnungszeile; leer = Standardregel (Mieter bzw. Kostenstelle).
    invoice_line: Mapped[str | None] = mapped_column(String(120))
    note: Mapped[str | None] = mapped_column(String(500))
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date)

    circle: Mapped[BillingCircle] = relationship(back_populates="positions")
    measuring_point: Mapped[MeasuringPoint | None] = relationship(lazy="joined")
    owner: Mapped[Owner | None] = relationship(lazy="joined")
