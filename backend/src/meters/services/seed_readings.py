"""Synthetische Monatsstände für ein Kalenderjahr (Dev-/Testdaten).

Zweck: den Perioden-Vergleich (z. B. 2026 vs. 2025) in einer Datenbank testbar
machen, deren Ablesungen erst später beginnen. Für jedes aktive Register werden
**rückwärts** von der frühesten echten Ablesung (Anker) plausible Stände am
31.12. des Vorjahres und an allen Monatsenden des Zieljahres erzeugt — monoton
steigend, nie negativ, mit saisonalem Verlauf und deterministischem Rauschen
(Läufe sind reproduzierbar). Jede erzeugte Ablesung trägt die Notiz
``"Testdaten <Jahr>"`` und lässt sich darüber wieder restlos entfernen.

Der reine Planer (``plan_register_seed``) ist ohne DB testbar; ``seed_year`` und
``remove_seed`` kapseln den DB-Teil. Der Monats-Cache wird hier NICHT gepflegt —
der Aufrufer (CLI) frischt ihn für die zurückgegebenen Register auf.
"""

from __future__ import annotations

import calendar
import random
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.models import (
    HeatingSource,
    MeasuringPoint,
    MeterType,
    PhysicalMeter,
    Reading,
    Register,
)
from meters.services.import_readings import reading_at_for_date

SEED_NOTE_PREFIX = "Testdaten"


def seed_note(year: int) -> str:
    """Marker-Notiz aller synthetischen Ablesungen eines Jahres."""
    return f"{SEED_NOTE_PREFIX} {year}"


@dataclass(frozen=True, slots=True)
class SeedPoint:
    reading_at: datetime
    value: Decimal


@dataclass(slots=True)
class SeedReport:
    """Ergebnis eines (Dry-)Laufs: geplante Punkte je Register + Übersprungene."""

    planned: dict[int, list[SeedPoint]] = field(default_factory=dict)
    skipped: dict[int, str] = field(default_factory=dict)
    created: int = 0

    @property
    def point_count(self) -> int:
        return sum(len(points) for points in self.planned.values())

    @property
    def register_ids(self) -> set[int]:
        return set(self.planned)


# Saisonfaktoren je Kalendermonat (Jan..Dez), Mittelwert ≈ 1.
_HEATING_SEASON = (1.8, 1.6, 1.3, 0.9, 0.5, 0.3, 0.3, 0.3, 0.6, 1.1, 1.5, 1.8)
_FEED_IN_SEASON = (0.3, 0.5, 0.9, 1.3, 1.6, 1.8, 1.8, 1.6, 1.2, 0.8, 0.4, 0.3)
_ELECTRICITY_SEASON = (1.15, 1.1, 1.05, 0.95, 0.9, 0.9, 0.9, 0.9, 0.95, 1.0, 1.1, 1.15)
_FLAT_SEASON = (1.0,) * 12

# ±8 % Rauschen je Monat, deterministisch aus der Register-ID.
_NOISE = 0.08
# Maximale Nachkommastellen der erzeugten Werte.
_MAX_SCALE = 3


def _season(
    meter_type: MeterType, heating_source: HeatingSource | None, obis_code: str
) -> tuple[float, ...]:
    if obis_code.startswith("2.8"):
        return _FEED_IN_SEASON
    if meter_type is MeterType.HEATING or heating_source is not None:
        return _HEATING_SEASON
    if meter_type is MeterType.ELECTRICITY:
        return _ELECTRICITY_SEASON
    return _FLAT_SEASON


def _fallback_rate(obis_code: str, unit: str) -> Decimal:
    """Tagesverbrauch, wenn die vorhandenen Ablesungen keine Rate hergeben."""
    if obis_code.startswith("2.8"):
        return Decimal("5")
    if obis_code.startswith("1.8"):
        return Decimal("8")
    if obis_code.startswith("heat"):
        if unit == "MWh":
            return Decimal("0.03")
        if unit == "h":
            return Decimal("3")
        return Decimal("1")
    return Decimal("0.3")


def _observed_rate(existing: Sequence[tuple[datetime, Decimal]]) -> Decimal | None:
    """Mittlerer Tagesverbrauch aus erster und letzter echter Ablesung."""
    if len(existing) < 2:
        return None
    (first_at, first_value), (last_at, last_value) = existing[0], existing[-1]
    days = (last_at - first_at).days
    if days <= 0 or last_value <= first_value:
        return None
    return (last_value - first_value) / Decimal(days)


def _scale_of(existing: Sequence[tuple[datetime, Decimal]]) -> int:
    scale = max((-int(v.as_tuple().exponent) for _, v in existing), default=0)
    return max(0, min(scale, _MAX_SCALE))


def month_end_dates(year: int) -> list[date]:
    """31.12. des Vorjahres (Basis) + alle Monatsenden des Jahres."""
    return [date(year - 1, 12, 31)] + [
        date(year, m, calendar.monthrange(year, m)[1]) for m in range(1, 13)
    ]


def _consumption_between(
    start: date,
    end: date,
    *,
    rate: Decimal,
    season: tuple[float, ...],
    noise: dict[tuple[int, int], float],
) -> Decimal:
    """Verbrauch im Intervall (start, end], monatsweise mit Saison + Rauschen."""
    total = Decimal(0)
    cursor = start
    while cursor < end:
        # Segment (cursor, stop] liegt komplett im Monat des Folgetags von cursor.
        first = cursor + timedelta(days=1)
        month_last = date(first.year, first.month, calendar.monthrange(first.year, first.month)[1])
        stop = min(month_last, end)
        days = (stop - cursor).days
        factor = season[first.month - 1] * noise.setdefault((first.year, first.month), 1.0)
        total += rate * Decimal(days) * Decimal(str(round(factor, 4)))
        cursor = stop
    return total


def plan_register_seed(
    existing: Sequence[tuple[datetime, Decimal]],
    *,
    register_id: int,
    obis_code: str,
    unit: str,
    meter_type: MeterType,
    heating_source: HeatingSource | None,
    year: int,
) -> list[SeedPoint]:
    """Plant die synthetischen Stände eines Registers (ohne DB).

    Nur Stichtage VOR der frühesten echten Ablesung, die nicht schon belegt
    sind. Ohne Ablesung oder mit Anker 0 gibt es nichts zu planen (leer).
    """
    ordered = sorted(existing, key=lambda e: e[0])
    if not ordered:
        return []
    anchor_at, anchor_value = ordered[0]
    if anchor_value <= 0:
        return []
    taken = {at for at, _ in ordered}
    targets = [
        (d, at)
        for d in month_end_dates(year)
        if (at := reading_at_for_date(d)) < anchor_at and at not in taken
    ]
    if not targets:
        return []

    rate = _observed_rate(ordered) or _fallback_rate(obis_code, unit)
    season = _season(meter_type, heating_source, obis_code)
    rng = random.Random(register_id)
    noise: dict[tuple[int, int], float] = {}
    for d, _ in targets:
        noise[(d.year, d.month)] = 1 + rng.uniform(-_NOISE, _NOISE)
    anchor_date = anchor_at.date()

    # Verbrauch je Intervall zwischen aufeinanderfolgenden Stichtagen bzw. bis zum Anker.
    dates = [d for d, _ in targets]
    consumptions = [
        _consumption_between(
            dates[i],
            dates[i + 1] if i + 1 < len(dates) else anchor_date,
            rate=rate,
            season=season,
            noise=noise,
        )
        for i in range(len(dates))
    ]
    total = sum(consumptions, Decimal(0))
    # Basiswert darf nicht negativ werden: Verbrauch ggf. global stauchen.
    factor = Decimal(1) if total <= anchor_value else (anchor_value / total) * Decimal("0.999")

    quantum = Decimal(1).scaleb(-_scale_of(ordered))
    values: list[Decimal] = []
    running = anchor_value
    for consumption in reversed(consumptions):
        running -= consumption * factor
        values.append(running.quantize(quantum, rounding=ROUND_HALF_UP))
    values.reverse()
    return [
        SeedPoint(reading_at=at, value=max(v, Decimal(0)))
        for (_, at), v in zip(targets, values, strict=True)
    ]


def _existing_readings(db: Session, register_id: int) -> list[tuple[datetime, Decimal]]:
    rows = db.execute(
        select(Reading.reading_at, Reading.value)
        .where(Reading.register_id == register_id)
        .order_by(Reading.reading_at, Reading.id)
    ).all()
    return [(at, Decimal(v)) for at, v in rows]


def seed_year(db: Session, *, user_id: int, year: int, apply: bool) -> SeedReport:
    """Plant (und schreibt bei ``apply``) die Testdaten aller aktiven Register."""
    report = SeedReport()
    stmt = (
        select(Register, MeasuringPoint)
        .join(PhysicalMeter, PhysicalMeter.id == Register.physical_meter_id)
        .join(MeasuringPoint, MeasuringPoint.id == PhysicalMeter.measuring_point_id)
        .where(Register.is_active.is_(True), PhysicalMeter.removed_at.is_(None))
        .order_by(Register.id)
    )
    note = seed_note(year)
    for register, mp in db.execute(stmt).all():
        existing = _existing_readings(db, register.id)
        if not existing:
            report.skipped[register.id] = "keine Ablesung als Anker"
            continue
        points = plan_register_seed(
            existing,
            register_id=register.id,
            obis_code=register.obis_code,
            unit=register.unit,
            meter_type=mp.type,
            heating_source=mp.heating_source,
            year=year,
        )
        if not points:
            report.skipped[register.id] = (
                "Anker-Stand 0" if existing[0][1] <= 0 else "Stichtage bereits belegt"
            )
            continue
        report.planned[register.id] = points
        if apply:
            db.add_all(
                Reading(
                    register_id=register.id,
                    value=p.value,
                    reading_at=p.reading_at,
                    note=note,
                    created_by_user_id=user_id,
                )
                for p in points
            )
            report.created += len(points)
    if apply:
        db.commit()
    return report


def remove_seed(db: Session, *, year: int, apply: bool) -> tuple[int, set[int]]:
    """Entfernt alle mit ``seed_note(year)`` markierten Ablesungen.

    Liefert (Anzahl, betroffene Register-IDs); ohne ``apply`` nur zählen.
    """
    readings = list(db.scalars(select(Reading).where(Reading.note == seed_note(year))))
    register_ids = {r.register_id for r in readings}
    if apply:
        for r in readings:
            db.delete(r)
        db.commit()
    return len(readings), register_ids
