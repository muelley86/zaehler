"""BillToAssignment — periodisiertes "Abrechnen an" einer MeasuringPoint.

Halboffenes Intervall ``[valid_from, valid_to)``; hoechstens eine offene Periode
(``valid_to IS NULL``) je MP. Muster wie ``KostenstelleAssignment``. Ohne Periode zum
Stichtag gilt ``BillTo.OWNER`` (Bestand und neue Messstellen brauchen keinen Datensatz).
``BillTo.MIETER`` macht den zum Stichtag aktuellen Mieter zum Rechnungsempfaenger; ohne
Mieter geht die Rechnung an den Eigentuemer (``services.billing_circle``). Seit 0047.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Index, text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin
from meters.models._enums import BillTo

if TYPE_CHECKING:  # pragma: no cover
    from meters.models.measuring_point import MeasuringPoint


class BillToAssignment(Base, TimestampMixin):
    __tablename__ = "bill_to_assignment"
    __table_args__ = (
        Index(
            "uq_bill_to_assignment_open_per_mp",
            "measuring_point_id",
            unique=True,
            sqlite_where=text("valid_to IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    measuring_point_id: Mapped[int] = mapped_column(
        ForeignKey("measuring_point.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    bill_to: Mapped[BillTo] = mapped_column(
        SAEnum(BillTo, name="bill_to", native_enum=False, length=16), nullable=False
    )
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    measuring_point: Mapped[MeasuringPoint] = relationship(back_populates="bill_to_assignments")
