"""PhysicalMeter — ein konkretes Zählergerät an einer MeasuringPoint.

Beim Zählertausch wird das alte Gerät mit ``removed_at`` versehen und ein
neues angelegt; alle Register und Erfassungen bleiben pro Gerät erhalten.
Pro MeasuringPoint ist immer höchstens ein Gerät aktiv (``removed_at IS NULL``).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin

if TYPE_CHECKING:
    from meters.models.measuring_point import MeasuringPoint
    from meters.models.register import Register


class PhysicalMeter(Base, TimestampMixin):
    __tablename__ = "physical_meter"
    # Partieller UNIQUE-Index — pro MeasuringPoint nur ein Gerät mit
    # removed_at IS NULL. DB-Garantie gegen parallele Zählertäusche, die
    # zwei aktive Meter erzeugen würden.
    __table_args__ = (
        Index(
            "uq_physical_meter_active_per_mp",
            "measuring_point_id",
            unique=True,
            sqlite_where=text("removed_at IS NULL"),
        ),
    )

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
