"""Aktueller Bestand pro Register.

Für nachfüllbare Register (z. B. Heizöl-Tank):
    current = letzter_reading.value
              + Summe(Lieferungen, delivery_at > letzter_reading.reading_at)

Für reguläre Zähler:
    current = letzter_reading.value

Implementierung lädt nur die tatsächlich benötigten Datensätze direkt per SQL —
nicht die volle Reading-/Delivery-Liste über die ORM-Beziehung. Bei großen
Registern (viele Readings) deutlich günstiger.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import selectinload

from meters.models import Delivery, MeasuringPoint, PhysicalMeter, Reading, Register


@dataclass(slots=True)
class RegisterState:
    register_id: int
    physical_meter_id: int
    obis_code: str
    label: str
    unit: str
    is_active: bool
    accepts_deliveries: bool
    last_reading_at: datetime | None
    last_reading_value: Decimal | None
    refilled_since: Decimal
    current_value: Decimal | None


def state_for_register(db: DbSession, register: Register) -> RegisterState:
    """Aktueller Bestand eines einzelnen Registers.

    Lädt das letzte Reading per ORDER BY ... LIMIT 1 und — falls
    nachfüllbar — die Summe der Deliveries nach diesem Reading.
    Vermeidet, alle Readings/Deliveries des Registers in Memory zu
    laden.
    """
    last = db.scalar(
        select(Reading)
        .where(Reading.register_id == register.id)
        .order_by(Reading.reading_at.desc(), Reading.id.desc())
        .limit(1)
    )

    refilled = Decimal("0")
    if register.accepts_deliveries:
        delivery_filter = Delivery.register_id == register.id
        if last is not None:
            delivery_filter = delivery_filter & (Delivery.delivery_at > last.reading_at)
        rows = db.execute(select(Delivery.amount).where(delivery_filter)).all()
        # Summen über DecimalText klappen in Python: kleine Listen, ok.
        refilled = sum((row[0] for row in rows), start=Decimal("0"))

    # Lieferungen ohne bisherigen Stand: Bestand ist nicht aussagekräftig
    # (wir wissen nicht, mit wie viel der Tank gestartet ist).
    current: Decimal | None = last.value + refilled if last is not None else None

    return RegisterState(
        register_id=register.id,
        physical_meter_id=register.physical_meter_id,
        obis_code=register.obis_code,
        label=register.label,
        unit=register.unit,
        is_active=register.is_active,
        accepts_deliveries=register.accepts_deliveries,
        last_reading_at=last.reading_at if last else None,
        last_reading_value=last.value if last else None,
        refilled_since=refilled,
        current_value=current,
    )


def state_for_measuring_point(
    db: DbSession,
    *,
    measuring_point_id: int,
) -> list[RegisterState]:
    """Aktueller Bestand aller aktiven Register des aktuell installierten Zählers."""
    mp = db.scalar(
        select(MeasuringPoint)
        .where(MeasuringPoint.id == measuring_point_id)
        .options(
            selectinload(MeasuringPoint.physical_meters).selectinload(PhysicalMeter.registers),
        )
    )
    if mp is None:
        return []
    out: list[RegisterState] = []
    for meter in mp.physical_meters:
        if meter.removed_at is not None:
            continue
        for register in meter.registers:
            if not register.is_active:
                continue
            out.append(state_for_register(db, register))
    return out


__all__ = ["RegisterState", "state_for_measuring_point", "state_for_register"]
