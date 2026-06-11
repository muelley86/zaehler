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


def clip_consumption_to_range(
    points: list[ConsumptionPoint],
    *,
    from_date: date | None,
    to_date: date | None,
) -> list[ConsumptionPoint]:
    """Schneidet Verbrauchs-Intervalle **taggenau** auf ``[from_date, to_date]`` zu.

    Anders als die ``period_end``-Filterung in :func:`aggregate_consumption`
    (Gesamt-Modus-Altverhalten: ein Intervall zählt ganz oder gar nicht) wird hier
    pro Intervall der anteilige Verbrauch der Tage im Bereich berechnet — lineare
    Interpolation mit derselben Tag-Zuordnung wie :func:`split_across_buckets`
    (Tag ``d`` gehört zum Intervall, wenn ``period_start < d <= period_end``).
    Damit gilt: Gesamt-Summe über einen Zeitraum == Summe der Tages-/Monats-Buckets
    desselben Zeitraums. Null-Spannen (``period_end <= period_start``) bleiben
    ungeteilt und zählen, wenn ``period_end`` im Bereich liegt.
    """

    def in_range(d: date) -> bool:
        return (from_date is None or d >= from_date) and (to_date is None or d <= to_date)

    out: list[ConsumptionPoint] = []
    for p in points:
        total_days = (p.period_end - p.period_start).days
        if total_days <= 0:
            if in_range(p.period_end):
                out.append(p)
            continue
        # Tage des Intervalls: period_start+1 .. period_end (jeweils inklusive).
        first_day = p.period_start + timedelta(days=1)
        lo = first_day if from_date is None else max(first_day, from_date)
        hi = p.period_end if to_date is None else min(p.period_end, to_date)
        overlap = (hi - lo).days + 1 if lo <= hi else 0
        if overlap <= 0:
            continue
        if overlap == total_days:
            out.append(p)
            continue
        out.append(
            ConsumptionPoint(
                # period_start bleibt exklusiv (Tag VOR dem ersten gezählten Tag),
                # konsistent zur (start, end]-Konvention der Intervalle.
                period_start=lo - timedelta(days=1),
                period_end=hi,
                register_id=p.register_id,
                obis_code=p.obis_code,
                consumption=p.consumption * overlap / total_days,
                unit=p.unit,
            )
        )
    out.sort(key=lambda p: (p.period_end, p.obis_code))
    return out


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


def split_across_buckets(
    point: ConsumptionPoint, granularity: Granularity
) -> list[ConsumptionPoint]:
    """Verteilt den Verbrauch eines Ablese-Intervalls **taggenau** auf die
    Buckets, die ``(period_start, period_end]`` überspannt (lineare Interpolation
    = konstanter Tagesverbrauch). Reicht ein Intervall über eine Monatsgrenze,
    landet der Verbrauch anteilig nach Tagen in beiden Monaten — damit die
    Monats-/Tages-Diagramme korrekt bleiben.

    Liegt das Intervall ganz in einem Bucket (oder Null-Spanne, z. B. ein
    Monatsend-Wert direkt auf der Grenze), gibt es genau einen Punkt zurück
    (kein Split). Der Rundungsrest wird dem letzten Bucket zugeschlagen, sodass
    die Summe der Teilbeträge **exakt** dem Original-Verbrauch entspricht.
    """
    total_days = (point.period_end - point.period_start).days
    if total_days <= 0:
        start, end = _bucket_bounds(point.period_end, granularity)
        return [
            ConsumptionPoint(
                period_start=start,
                period_end=end,
                register_id=point.register_id,
                obis_code=point.obis_code,
                consumption=point.consumption,
                unit=point.unit,
            )
        ]

    # Jeden Tag d mit period_start < d <= period_end dem Bucket von d zuordnen.
    order: list[tuple[date, date]] = []
    days_in: dict[tuple[date, date], int] = {}
    for i in range(1, total_days + 1):
        bounds = _bucket_bounds(point.period_start + timedelta(days=i), granularity)
        if bounds not in days_in:
            days_in[bounds] = 0
            order.append(bounds)
        days_in[bounds] += 1

    out: list[ConsumptionPoint] = []
    allocated = Decimal("0")
    for idx, bounds in enumerate(order):
        if idx < len(order) - 1:
            amount = point.consumption * days_in[bounds] / total_days
            allocated += amount
        else:
            # Letzter Bucket bekommt den Rest -> Summe exakt erhalten.
            amount = point.consumption - allocated
        out.append(
            ConsumptionPoint(
                period_start=bounds[0],
                period_end=bounds[1],
                register_id=point.register_id,
                obis_code=point.obis_code,
                consumption=amount,
                unit=point.unit,
            )
        )
    return out


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
    zurückgegeben (rückwärtskompatibel). Andernfalls wird jeder Punkt über
    :func:`split_across_buckets` **taggenau** auf die überspannten Buckets
    verteilt (lineare Interpolation; Intervalle innerhalb eines Buckets bzw.
    Null-Spannen bleiben ungeteilt) und der Verbrauch je ``(obis_code, unit,
    bucket)`` summiert. ``register_id`` im aggregierten Punkt ist nur
    repräsentativ (erster Beitrag).
    """

    def in_range(d: date) -> bool:
        return (from_date is None or d >= from_date) and (to_date is None or d <= to_date)

    if granularity is None:
        filtered = [p for p in points if in_range(p.period_end)]
        filtered.sort(key=lambda p: (p.period_end, p.obis_code))
        return filtered

    # Erst taggenau auf Buckets verteilen, DANN nach Bucket-Periode filtern —
    # so liefert ein Zeitraum-Filter genau die anteiligen Bucket-Beträge im
    # Zeitraum (nicht das ganze Intervall, dessen period_end zufällig drin liegt).
    buckets: dict[tuple[str, str, date, date], ConsumptionPoint] = {}
    for p in points:
        for sp in split_across_buckets(p, granularity):
            if not in_range(sp.period_end):
                continue
            key = (sp.obis_code, sp.unit, sp.period_start, sp.period_end)
            existing = buckets.get(key)
            if existing is None:
                buckets[key] = sp
            else:
                existing.consumption += sp.consumption
    out = list(buckets.values())
    out.sort(key=lambda p: (p.period_end, p.obis_code))
    return out
