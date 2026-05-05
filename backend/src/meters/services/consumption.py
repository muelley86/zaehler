from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import selectinload

from meters.models import MeasuringPoint, PhysicalMeter, Reading, Register


@dataclass(slots=True)
class ConsumptionPoint:
    period_start: date
    period_end: date
    register_id: int
    obis_code: str
    consumption: Decimal
    unit: str


def _pairwise(readings: list[Reading]) -> Iterator[tuple[Reading, Reading]]:
    it = iter(readings)
    try:
        prev = next(it)
    except StopIteration:
        return
    for cur in it:
        yield prev, cur
        prev = cur


def consumption_for_register(
    register: Register,
    *,
    rollover_max: Decimal | None = None,
    transformer_factor: int | None = None,
) -> list[ConsumptionPoint]:
    """Berechnet Verbrauch zwischen aufeinanderfolgenden Readings eines Registers.

    ``transformer_factor`` (nur Strom) multipliziert die berechnete Differenz, weil
    Wandlerzähler nur den Sekundärwert anzeigen. Mathematisch identisch zu
    "Stände multiplizieren, dann Differenz". Auf Deliveries-Pfaden (Heizöl-Tank)
    nicht anwendbar — der Validator schließt das oben aus.
    """
    out: list[ConsumptionPoint] = []
    sorted_readings = sorted(register.readings, key=lambda r: (r.reading_at, r.id))

    if register.accepts_deliveries:
        deliveries = sorted(register.deliveries, key=lambda d: d.delivery_at)
        for prev, cur in _pairwise(sorted_readings):
            refilled = sum(
                (d.amount for d in deliveries if prev.reading_at < d.delivery_at <= cur.reading_at),
                start=Decimal("0"),
            )
            delta = prev.value + refilled - cur.value
            out.append(
                ConsumptionPoint(
                    period_start=prev.reading_at.date(),
                    period_end=cur.reading_at.date(),
                    register_id=register.id,
                    obis_code=register.obis_code,
                    consumption=delta,
                    unit=register.unit,
                )
            )
        return out

    rollover = rollover_max if rollover_max is not None else register.max_value
    for prev, cur in _pairwise(sorted_readings):
        delta = cur.value - prev.value
        if delta < 0 and rollover > 0:
            delta = (rollover - prev.value) + cur.value
        if transformer_factor is not None:
            delta = delta * transformer_factor
        out.append(
            ConsumptionPoint(
                period_start=prev.reading_at.date(),
                period_end=cur.reading_at.date(),
                register_id=register.id,
                obis_code=register.obis_code,
                consumption=delta,
                unit=register.unit,
            )
        )
    return out


def consumption_for_measuring_point(
    db: DbSession,
    *,
    measuring_point_id: int,
) -> list[ConsumptionPoint]:
    """Aggregiert Verbrauch über alle PhysicalMeter und Register einer MeasuringPoint."""
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
    out: list[ConsumptionPoint] = []
    factor = mp.transformer_factor
    for meter in mp.physical_meters:
        for register in meter.registers:
            out.extend(consumption_for_register(register, transformer_factor=factor))
    out.sort(key=lambda p: (p.period_end, p.obis_code))
    return out
