"""OwnerAssignment — periodisierte Zuordnung MeasuringPoint → Owner.

Halboffenes Intervall ``[valid_from, valid_to)``. Genau ein Assignment pro
MP hat ``valid_to IS NULL`` (= aktueller Eigentuemer). Bei einem Wechsel
schliesst der Service die offene Periode mit ``valid_to = neuer.valid_from``
und legt eine neue offene Periode an — analog dem Zaehlertausch-Workflow,
der historische PhysicalMeter-Eintraege fuehrt.

Owner-Delete: ``owner_id`` wird NULL (Periode bleibt, „unbekannter
Eigentuemer"). MP-Delete: Cascade — Historie hat ohne MP keinen Wert,
und MPs sind nur loeschbar, wenn keine Readings dranhaengen.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:  # pragma: no cover
    from meters.models.measuring_point import MeasuringPoint
    from meters.models.owner import Owner


class OwnerAssignment(Base, TimestampMixin):
    __tablename__ = "owner_assignment"

    id: Mapped[int] = mapped_column(primary_key=True)
    measuring_point_id: Mapped[int] = mapped_column(
        ForeignKey("measuring_point.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("owner.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    measuring_point: Mapped[MeasuringPoint] = relationship(back_populates="owner_assignments")
    owner: Mapped[Owner | None] = relationship(back_populates="assignments", lazy="joined")
