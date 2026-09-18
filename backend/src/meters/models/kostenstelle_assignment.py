"""KostenstelleAssignment — periodisierte Kostenstelle einer MeasuringPoint.

Halboffenes Intervall ``[valid_from, valid_to)``; hoechstens eine offene Periode
(``valid_to IS NULL``) je MP = aktuelle Kostenstelle. Muster wie
``MieterAssignment``, nur mit einer Zahl statt eines Stammdatensatzes. Die
Abrechnung liest die Kostenstelle zum Stichtag (Monatsende), damit ein Wechsel
fruehere Monate nicht umschreibt. Seit Migration 0036 (vorher Spalte
``measuring_point.kostenstelle``).
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Index, Integer, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:  # pragma: no cover
    from meters.models.measuring_point import MeasuringPoint


class KostenstelleAssignment(Base, TimestampMixin):
    __tablename__ = "kostenstelle_assignment"
    __table_args__ = (
        Index(
            "uq_kostenstelle_assignment_open_per_mp",
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
    # Ganzzahl 0-99999 (Validierung im Schema), keine fuehrenden Nullen.
    kostenstelle: Mapped[int] = mapped_column(Integer, nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    measuring_point: Mapped[MeasuringPoint] = relationship(
        back_populates="kostenstelle_assignments"
    )
