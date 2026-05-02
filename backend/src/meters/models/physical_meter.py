"""PhysicalMeter — ein konkretes Zählergerät an einer MeasuringPoint.

Beim Zählertausch wird das alte Gerät mit ``removed_at`` versehen und ein
neues angelegt; alle Register und Erfassungen bleiben pro Gerät erhalten.
Pro MeasuringPoint ist immer höchstens ein Gerät aktiv (``removed_at IS NULL``).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:
    from meters.models.measuring_point import MeasuringPoint
    from meters.models.register import Register


class PhysicalMeter(Base, TimestampMixin):
    __tablename__ = "physical_meter"

    id: Mapped[int] = mapped_column(primary_key=True)
    measuring_point_id: Mapped[int] = mapped_column(
        ForeignKey("measuring_point.id", ondelete="CASCADE"), nullable=False, index=True
    )
    serial_number: Mapped[str] = mapped_column(String(64), nullable=False)
    installed_at: Mapped[date] = mapped_column(nullable=False)
    removed_at: Mapped[date | None] = mapped_column()
    initial_values: Mapped[dict[str, Decimal] | None] = mapped_column(JSON)

    measuring_point: Mapped[MeasuringPoint] = relationship(
        "MeasuringPoint", back_populates="physical_meters"
    )
    registers: Mapped[list[Register]] = relationship(
        "Register",
        back_populates="physical_meter",
        cascade="all, delete-orphan",
    )
