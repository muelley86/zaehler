"""Zaehlerstaende an Periodengrenzen fuer den Auswertungs-CSV-Export.

Nur Dimension "Messstelle" und nur echte Messstellen: je Ergebniszeile
Seriennummer(n), Wandlerfaktor und Zaehlerstand Beginn/Ende, damit sich der
Verbrauch nachrechnen laesst (Ende - Beginn = Verbrauch, bei Wandlerzaehlern
mal Faktor). Die JSON-Auswertung bleibt unberuehrt — die Spalten gibt es nur
im Export.

Konventionen (deckungsgleich mit ``consumption.py``):

- Ein Ablese-Intervall zaehlt die Tage ``(tag_alt, tag_neu]``. Der Stand "am
  Ende von Tag d" wird zwischen zwei Ablesungen linear interpoliert
  (konstanter Tagesverbrauch) — genau so, wie ``split_across_buckets`` und
  ``clip_consumption_to_range`` den Verbrauch verteilen. Liegt eine Ablesung
  auf der Grenze (Monatsend-Stand), ist es der echte Ablesewert.
- Beginn = Stand am Ende des Tages VOR ``Periode_von``, Ende = Stand am Ende
  von ``Periode_bis``; offene Enden -> erste bzw. letzte Ablesung.
- Staende wie am Display (Rohwert, NICHT mal Wandlerfaktor). Bei einem
  Ueberlauf (Rollover bei ``max_value``) in der Periode ist daher Ende < Beginn;
  der Verbrauch ist dann ``(Ende - Beginn + max_value) x Wandlerfaktor``.
- Mehrere Register derselben Richtung/Einheit (HT/NT) werden summiert — die
  Ergebniszeile summiert deren Verbrauch ebenfalls.
- Zaehlerwechsel: Beginn vom ersten, Ende vom letzten in der Periode
  beitragenden Geraet, Seriennummern "alt / neu" (Ende - Beginn geht dann
  bewusst nicht auf).
- Tank-Register (``accepts_deliveries``) bleiben aussen vor: ihr Verbrauch ist
  Stand + Lieferung - Stand, kein Zaehlerstands-Delta.
"""

from __future__ import annotations

from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import selectinload

from meters.models import MeasuringPoint, PhysicalMeter, Register, ReportDimension
from meters.services.consumption import direction_of, local_date
from meters.services.report_aggregation import GroupBucketRow, ReportDirection

SERIAL_SEPARATOR = " / "


@dataclass(frozen=True, slots=True)
class DayValue:
    day: date
    value: Decimal


@dataclass(frozen=True, slots=True)
class RegisterSeries:
    """Staende eines Registers, nach Tag sortiert — je Tag der letzte Stand."""

    values: tuple[DayValue, ...]
    max_value: Decimal


@dataclass(frozen=True, slots=True)
class MeterSeries:
    """Ein Geraet mit den fuer die Ergebniszeile relevanten Registern."""

    serial_number: str
    registers: tuple[RegisterSeries, ...]
    transformer_factor: int | None = None  # Faktor dieses Geraets (seit 0035)

    def span(self) -> tuple[date, date] | None:
        """Erster und letzter Ablesetag ueber alle Register, ``None`` ohne Stand."""
        days = [v.day for reg in self.registers for v in reg.values]
        return (min(days), max(days)) if days else None


@dataclass(frozen=True, slots=True)
class MeterColumns:
    serial_number: str = ""
    transformer_factor: int | None = None
    start_value: Decimal | None = None
    end_value: Decimal | None = None


EMPTY_METER_COLUMNS = MeterColumns()


def value_at(series: RegisterSeries, day: date) -> Decimal:
    """Stand am Ende von ``day``: taggenau interpoliert, ausserhalb der
    Ablesungen auf den ersten/letzten Stand begrenzt. Ein Rueckgang gilt wie in
    ``consumption_for_register`` als Ueberlauf bei ``max_value``."""
    values = series.values
    if not values:
        raise ValueError("value_at braucht mindestens einen Stand")
    if day <= values[0].day:
        return values[0].value
    if day >= values[-1].day:
        return values[-1].value
    idx = bisect_right(values, day, key=lambda v: v.day)
    prev, cur = values[idx - 1], values[idx]
    if prev.day == day:
        # Ablesung auf der Grenze: echten Wert unveraendert (sonst 10 + 2.5*0 = "10.0").
        return prev.value
    delta = cur.value - prev.value
    rolled_over = delta < 0 and series.max_value > 0
    if rolled_over:
        delta = (series.max_value - prev.value) + cur.value
    value = prev.value + delta * (day - prev.day).days / (cur.day - prev.day).days
    if rolled_over and value >= series.max_value:
        value -= series.max_value
    return value


def _meter_total(meter: MeterSeries, day: date) -> Decimal:
    return sum((value_at(reg, day) for reg in meter.registers if reg.values), Decimal("0"))


def meter_columns(
    meters: Sequence[MeterSeries],
    *,
    start_day: date,
    end_day: date,
) -> MeterColumns:
    """Spalten einer Ergebniszeile. ``start_day``/``end_day`` sind die Tage, an
    deren Ende Beginn- bzw. Endstand gelten (``date.min``/``date.max`` = offen)."""
    spans = sorted(
        ((span, meter) for meter in meters if (span := meter.span()) is not None),
        key=lambda item: item[0][0],
    )
    # Beitragend = mindestens ein Ablesetag im Intervall (start_day, end_day]
    # UND Verbrauch nach start_day. Ein neues Geraet, dessen Anfangsstand genau
    # auf end_day liegt, traegt in dieser Periode nichts bei.
    contributing = [m for (first, last), m in spans if first < end_day and last > start_day]
    if not contributing:
        # Null-Spanne (alle Ablesungen am Periodenende): Geraete mit einem Stand darin.
        contributing = [m for (first, last), m in spans if first <= end_day and last > start_day]
    if not contributing:
        return EMPTY_METER_COLUMNS
    serials = dict.fromkeys(m.serial_number for m in contributing)
    return MeterColumns(
        serial_number=SERIAL_SEPARATOR.join(serials),
        # Faktor des Geraets am Periodenende (seit 0035 je Geraet)
        transformer_factor=contributing[-1].transformer_factor,
        start_value=_meter_total(contributing[0], start_day),
        end_value=_meter_total(contributing[-1], end_day),
    )


def register_series(register: Register) -> RegisterSeries:
    by_day: dict[date, Decimal] = {}
    for reading in sorted(register.readings, key=lambda r: (r.reading_at, r.id)):
        by_day[local_date(reading.reading_at)] = reading.value  # letzter Stand des Tages
    return RegisterSeries(
        values=tuple(DayValue(day=d, value=v) for d, v in sorted(by_day.items())),
        max_value=register.max_value,
    )


def _meter_series(mp: MeasuringPoint, direction: ReportDirection, unit: str) -> list[MeterSeries]:
    out: list[MeterSeries] = []
    for meter in mp.physical_meters:
        registers = tuple(
            register_series(reg)
            for reg in meter.registers
            if not reg.accepts_deliveries
            and reg.unit == unit
            and direction_of(reg.obis_code) == direction
        )
        out.append(
            MeterSeries(
                serial_number=meter.serial_number,
                registers=registers,
                transformer_factor=meter.transformer_factor,
            )
        )
    return out


def _load_measuring_points(db: DbSession, ids: set[int]) -> dict[int, MeasuringPoint]:
    if not ids:
        return {}
    stmt = (
        select(MeasuringPoint)
        .where(MeasuringPoint.id.in_(ids))
        .options(
            selectinload(MeasuringPoint.physical_meters)
            .selectinload(PhysicalMeter.registers)
            .selectinload(Register.readings)
        )
    )
    return {mp.id: mp for mp in db.scalars(stmt)}


def meter_columns_for_rows(
    db: DbSession,
    rows: Sequence[GroupBucketRow],
    *,
    dimension: ReportDimension,
    from_date: date | None,
    to_date: date | None,
) -> list[MeterColumns]:
    """Zaehlerstands-Spalten je Ergebniszeile (gleiche Reihenfolge wie ``rows``).

    Befuellt nur bei Dimension Messstelle fuer echte Messstellen; andere
    Gruppierungen summieren mehrere Zaehler, verrechnete Messstellen haben kein
    Geraet — dort bleiben die Spalten leer. Die Roh-Ablesungen werden gebuendelt
    geladen (die Monats-Auswertung liest sonst nur ``monthly_consumption``).
    """
    if dimension is not ReportDimension.MEASURING_POINT:
        return [EMPTY_METER_COLUMNS] * len(rows)
    mps = _load_measuring_points(
        db, {r.group_key for r in rows if not r.is_virtual and r.group_key is not None}
    )
    series_cache: dict[tuple[int, ReportDirection, str], list[MeterSeries]] = {}
    out: list[MeterColumns] = []
    for row in rows:
        mp = None if row.is_virtual or row.group_key is None else mps.get(row.group_key)
        if mp is None:
            out.append(EMPTY_METER_COLUMNS)
            continue
        key = (mp.id, row.direction, row.unit)
        if key not in series_cache:
            series_cache[key] = _meter_series(mp, row.direction, row.unit)
        period_start = row.period_start or from_date
        out.append(
            meter_columns(
                series_cache[key],
                start_day=date.min if period_start is None else period_start - timedelta(days=1),
                end_day=row.period_end or to_date or date.max,
            )
        )
    return out
