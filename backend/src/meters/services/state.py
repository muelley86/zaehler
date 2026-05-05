"""Aktueller Bestand pro Register.

Für nachfüllbare Register (z. B. Heizöl-Tank):
    current = letzter_reading.value
              + Summe(Lieferungen, delivery_at > letzter_reading.reading_at)

Für reguläre Zähler:
    current = letzter_reading.value
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import selectinload

from meters.models import MeasuringPoint, PhysicalMeter, Register


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


def state_for_register(register: Register) -> RegisterState:
    sorted_readings = sorted(register.readings, key=lambda r: (r.reading_at, r.id))
    last = sorted_readings[-1] if sorted_readings else None

    refilled = Decimal("0")
    if register.accepts_deliveries:
        for d in register.deliveries:
            if last is None or d.delivery_at > last.reading_at:
                refilled += d.amount

    current: Decimal | None
    if last is not None:
        current = last.value + refilled
    elif refilled > 0:
        # Lieferungen ohne Anfangsstand: ohne Bezug nicht aussagekräftig
        current = None
    else:
        current = None

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
            selectinload(MeasuringPoint.physical_meters)
            .selectinload(PhysicalMeter.registers)
            .selectinload(Register.readings),
            selectinload(MeasuringPoint.physical_meters)
            .selectinload(PhysicalMeter.registers)
            .selectinload(Register.deliveries),
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
            out.append(state_for_register(register))
    return out
