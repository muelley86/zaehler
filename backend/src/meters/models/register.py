"""Register — eine konkrete Zählwert-Spur an einem PhysicalMeter.

Strom-Zähler haben je nach Konfiguration 1-4 Register (1.8.0, oder 1.8.1+1.8.2,
plus 2.8.0/2.8.1/2.8.2 für Einspeisung). Gas/Wasser haben genau ein Register.
Ölheizung hat zwei: Betriebsstunden (kumulativ) und Tankstand (nachfüllbar,
``accepts_deliveries=True``). Pro Register liegen Readings (Stände) und —
falls nachfüllbar — Deliveries (Lieferungen).
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from meters.db import Base, TimestampMixin
from meters.db.types import DecimalText

if TYPE_CHECKING:
    from meters.models.delivery import Delivery
    from meters.models.physical_meter import PhysicalMeter
    from meters.models.reading import Reading


class Register(Base, TimestampMixin):
    __tablename__ = "register"
    __table_args__ = (
        UniqueConstraint("physical_meter_id", "obis_code", name="uq_register_meter_obis"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    physical_meter_id: Mapped[int] = mapped_column(
        ForeignKey("physical_meter.id", ondelete="CASCADE"), nullable=False, index=True
    )
    obis_code: Mapped[str] = mapped_column(String(16), nullable=False)
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    max_value: Mapped[Decimal] = mapped_column(
        DecimalText(32), default=Decimal("99999.9"), nullable=False
    )
    accepts_deliveries: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    physical_meter: Mapped[PhysicalMeter] = relationship(
        "PhysicalMeter", back_populates="registers"
    )
    readings: Mapped[list[Reading]] = relationship(
        "Reading",
        back_populates="register",
        cascade="all, delete-orphan",
        order_by="Reading.reading_at",
    )
    deliveries: Mapped[list[Delivery]] = relationship(
        "Delivery",
        back_populates="register",
        cascade="all, delete-orphan",
        order_by="Delivery.delivery_at",
    )
