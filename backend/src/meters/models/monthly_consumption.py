"""MonthlyConsumption — materialisierter Monatsverbrauch je Register.

Abgeleitete Statistik (eine Zeile je Register und Monat), neu berechnet aus den
Roh-``Reading``-Werten via ``services.monthly_consumption.recompute_register``
(taggenaue Interpolation über Monatsgrenzen). NICHT die Wahrheit — bei Zweifel
aus den Readings neu berechenbar. ``unit``/``obis_code`` sind denormalisiert,
damit Lesezugriffe ohne Join auf Register/PhysicalMeter auskommen.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from meters.db import Base
from meters.db.types import DecimalText


class MonthlyConsumption(Base):
    __tablename__ = "monthly_consumption"
    __table_args__ = (
        UniqueConstraint(
            "register_id", "period_start", name="uq_monthly_consumption_register_period"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    register_id: Mapped[int] = mapped_column(
        ForeignKey("register.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period_start: Mapped[date] = mapped_column(nullable=False)
    period_end: Mapped[date] = mapped_column(nullable=False)
    consumption: Mapped[Decimal] = mapped_column(DecimalText(32), nullable=False)
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    obis_code: Mapped[str] = mapped_column(String(16), nullable=False)
