"""MeasuringPoint — die logische Messstelle.

Eine MeasuringPoint ist dauerhaft (überlebt Zählertäusche) und trägt die
Konfiguration: Typ (Strom/Gas/Wasser/Öl), Standort, Strom-Tarif-Flags und
optional ein Tankvolumen. Die tatsächlichen Geräte sind ``PhysicalMeter`` —
einer davon ist zu jedem Zeitpunkt aktiv (``removed_at IS NULL``).
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin
from meters.db.types import DecimalText
from meters.models._enums import HeatingSource, MeterType

if TYPE_CHECKING:
    from meters.models.location import Location
    from meters.models.physical_meter import PhysicalMeter


class MeasuringPoint(Base, TimestampMixin):
    __tablename__ = "measuring_point"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[MeterType] = mapped_column(
        SAEnum(MeterType, name="meter_type", native_enum=False, length=16),
        nullable=False,
    )
    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("location.id", ondelete="SET NULL"), index=True
    )
    is_bidirectional: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_dual_tariff: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tank_capacity: Mapped[Decimal | None] = mapped_column(DecimalText(32))
    transformer_factor: Mapped[int | None] = mapped_column(Integer)
    heating_source: Mapped[HeatingSource | None] = mapped_column(
        SAEnum(HeatingSource, name="heating_source", native_enum=False, length=20),
        nullable=True,
    )

    location: Mapped[Location | None] = relationship("Location")
    physical_meters: Mapped[list[PhysicalMeter]] = relationship(
        "PhysicalMeter",
        back_populates="measuring_point",
        cascade="all, delete-orphan",
        order_by="PhysicalMeter.installed_at",
    )
