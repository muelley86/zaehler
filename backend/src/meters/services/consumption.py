from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import selectinload

from meters.core.config import settings
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


def _local_date(dt: datetime) -> date:
    """Lokales Kalenderdatum (App-Zeitzone ``METERS_TIMEZONE``) eines in der DB
    als naive-UTC gespeicherten Zeitstempels — fuer Verbrauchs-Perioden, damit
    die Chart-X-Achse und CSV-Perioden den lokalen Tagen entsprechen.
    """
    return dt.replace(tzinfo=UTC).astimezone(ZoneInfo(settings.timezone)).date()


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
                    period_start=_local_date(prev.reading_at),
                    period_end=_local_date(cur.reading_at),
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
                period_start=_local_date(prev.reading_at),
                period_end=_local_date(cur.reading_at),
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


Granularity = Literal["day", "week", "month", "year"]


def _bucket_bounds(d: date, granularity: Granularity) -> tuple[date, date]:
    """Start-/Enddatum des Buckets, in den ``d`` fällt.

    Woche = ISO-Woche (Montag bis Sonntag). Monat/Jahr = Kalendergrenzen.
    """
    if granularity == "day":
        return d, d
    if granularity == "week":
        monday = d - timedelta(days=d.weekday())
        return monday, monday + timedelta(days=6)
    if granularity == "month":
        start = d.replace(day=1)
        nxt = date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)
        return start, nxt - timedelta(days=1)
    return date(d.year, 1, 1), date(d.year, 12, 31)


def aggregate_consumption(
    points: list[ConsumptionPoint],
    *,
    granularity: Granularity | None,
    from_date: date | None,
    to_date: date | None,
) -> list[ConsumptionPoint]:
    """Filtert Verbrauchs-Punkte nach Zeitraum und aggregiert sie je Granularität.

    Filterung erfolgt über ``period_end`` (konsistent mit der bisherigen
    Frontend-Logik). Bei ``granularity is None`` werden die gefilterten Rohpunkte
    zurückgegeben (rückwärtskompatibel). Andernfalls wird jeder Punkt vollständig
    dem Bucket seines ``period_end`` zugeschlagen (kein anteiliges Splitten über
    Bucket-Grenzen) und der Verbrauch je ``(obis_code, unit, bucket)`` summiert.
    ``register_id`` im aggregierten Punkt ist nur repräsentativ (erster Beitrag).
    """
    filtered = [
        p
        for p in points
        if (from_date is None or p.period_end >= from_date)
        and (to_date is None or p.period_end <= to_date)
    ]
    if granularity is None:
        filtered.sort(key=lambda p: (p.period_end, p.obis_code))
        return filtered

    buckets: dict[tuple[str, str, date, date], ConsumptionPoint] = {}
    for p in filtered:
        start, end = _bucket_bounds(p.period_end, granularity)
        key = (p.obis_code, p.unit, start, end)
        existing = buckets.get(key)
        if existing is None:
            buckets[key] = ConsumptionPoint(
                period_start=start,
                period_end=end,
                register_id=p.register_id,
                obis_code=p.obis_code,
                consumption=p.consumption,
                unit=p.unit,
            )
        else:
            existing.consumption += p.consumption
    out = list(buckets.values())
    out.sort(key=lambda p: (p.period_end, p.obis_code))
    return out
