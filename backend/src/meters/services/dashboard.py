"""Perioden-Totals fuer das Dashboard: Summe je ``(obis_code, unit)`` fuer den
gewaehlten Zeitraum und die passende Vorperiode.

Zwei Eigenschaften machen die Zahlen im Dashboard vergleichbar:

* **Taggenau** — ein Ablese-Intervall, das nur teilweise im Zeitraum liegt,
  zaehlt anteilig (dieselbe lineare Interpolation wie die Buckets, siehe
  ``consumption.clip_consumption_to_range`` / ``split_across_buckets``).
* **Granularitaetsunabhaengig** — die Totals aendern sich nicht, wenn der Nutzer
  die Chart-Granularitaet umschaltet; nur der Rechenweg unterscheidet sich.

Rechenwege (siehe :func:`use_monthly_totals`):

* Monats-Cache: liegt die Quelle ohnehin als Monats-Bucket vor (``month``/``year``)
  UND deckt der Bereich ganze Monate ab, werden die bereits geladenen Buckets
  einfach aufsummiert — **ohne** ``clip_consumption_to_range``. Dessen
  ``(period_start, period_end]``-Konvention (Start exklusiv) wuerde bei den
  inklusiven Monats-Buckets ``[1., letzter]`` je Monat einen Tag verlieren.
* Sonst: taggenauer Clip auf den Roh-Intervallen.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session as DbSession

from meters.models import VirtualMeasuringPoint
from meters.services.consumption import (
    ConsumptionPoint,
    FlowDirectionStr,
    Granularity,
    clip_consumption_to_range,
    direction_of,
)
from meters.services.consumption_source import (
    SourceCache,
    points_for_measuring_point,
    source_for,
)
from meters.services.virtual_measuring_point import (
    VIRTUAL_OBIS_CODE,
    consumption_for_virtual_mp,
)


@dataclass(frozen=True, slots=True)
class DateRange:
    """Geschlossener Datumsbereich — ``start`` und ``end`` sind inklusiv."""

    start: date
    end: date


TotalsKey = tuple[str, str]  # (obis_code, unit)


@dataclass(slots=True)
class PeriodTotal:
    """Eine Ergebniszeile: Verbrauch im Zeitraum und in der Vorperiode.

    ``None`` heisst "kein Intervall deckt diese Periode" — bewusst
    unterschieden von ``0`` (gemessen, aber kein Verbrauch)."""

    obis_code: str
    unit: str
    direction: FlowDirectionStr
    current: Decimal | None
    previous: Decimal | None


def _last_day_of_month(d: date) -> date:
    nxt = date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)
    return nxt - timedelta(days=1)


def _month_index(d: date) -> int:
    """Fortlaufende Monatsnummer — macht Monats-Differenzen zu simpler Arithmetik."""
    return d.year * 12 + (d.month - 1)


def _shift_months(d: date, months: int) -> date:
    """Monatserster des um ``months`` Monate zurueckliegenden Monats."""
    idx = _month_index(d) - months
    return date(idx // 12, idx % 12 + 1, 1)


def is_month_aligned(rng: DateRange) -> bool:
    """Deckt ``rng`` ganze Kalendermonate ab (Monatserster bis Monatsletzter)?"""
    return rng.start.day == 1 and rng.end == _last_day_of_month(rng.end)


def previous_range(rng: DateRange) -> DateRange:
    """Die zu ``rng`` passende Vorperiode.

    Monatsaligned: um dieselbe Anzahl GANZER Monate zurueck — damit ein
    Monatsvergleich nicht an unterschiedlich langen Monaten scheitert
    (Maerz 1.-31. vergleicht gegen Februar 1.-28.). Sonst: gleiche Anzahl
    Tage, endend am Tag vor ``rng.start``.
    """
    if is_month_aligned(rng):
        months = _month_index(rng.end) - _month_index(rng.start) + 1
        return DateRange(
            start=_shift_months(rng.start, months),
            end=_last_day_of_month(_shift_months(rng.end, months)),
        )
    length = (rng.end - rng.start).days + 1
    end = rng.start - timedelta(days=1)
    return DateRange(start=end - timedelta(days=length - 1), end=end)


def use_monthly_totals(granularity: Granularity | None, rng: DateRange | None) -> bool:
    """Duerfen die Totals aus den (bereits geladenen) Monats-Buckets summiert
    werden? Nur wenn die Quelle ohnehin monatlich ist UND der Bereich ganze
    Monate abdeckt — sonst braeuchte es einen Teil-Monat, den der Cache nicht
    aufloesen kann."""
    return source_for(granularity) == "monthly" and (rng is None or is_month_aligned(rng))


def range_total(
    points: list[ConsumptionPoint], rng: DateRange | None, *, monthly: bool
) -> dict[TotalsKey, Decimal]:
    """Summe je ``(obis_code, unit)`` fuer ``rng`` (``None`` = alles).

    ``monthly=True`` erwartet Monats-Buckets und nimmt nur die, die
    VOLLSTAENDIG im Bereich liegen (kein Clipping, s. Modul-Docstring).
    ``monthly=False`` schneidet die Roh-Intervalle taggenau zu. Keys ohne
    Beitrag fehlen im Ergebnis — der Aufrufer macht daraus ``None``.
    """
    if monthly:
        selected = [
            p
            for p in points
            if rng is None or (rng.start <= p.period_start and p.period_end <= rng.end)
        ]
    else:
        selected = clip_consumption_to_range(
            points,
            from_date=rng.start if rng is not None else None,
            to_date=rng.end if rng is not None else None,
        )
    out: dict[TotalsKey, Decimal] = {}
    for p in selected:
        key = (p.obis_code, p.unit)
        out[key] = out.get(key, Decimal("0")) + p.consumption
    return out


def merge_totals(
    current: dict[TotalsKey, Decimal], previous: dict[TotalsKey, Decimal] | None
) -> list[PeriodTotal]:
    """Fuehrt beide Perioden zu einer Zeile je Key zusammen (Union, sortiert).

    ``previous is None`` = es gibt keine Vorperiode (offener Zeitraum); fehlt
    nur der Key, hatte die Vorperiode keine Daten. Beides wird zu ``None``.
    """
    keys = set(current) | (set(previous) if previous is not None else set())
    return [
        PeriodTotal(
            obis_code=obis_code,
            unit=unit,
            direction=direction_of(obis_code),
            current=current.get((obis_code, unit)),
            previous=None if previous is None else previous.get((obis_code, unit)),
        )
        for obis_code, unit in sorted(keys)
    ]


def totals_for_measuring_point(
    db: DbSession,
    measuring_point_id: int,
    *,
    granularity: Granularity | None,
    rng: DateRange | None,
    prev: DateRange | None,
    series_points: list[ConsumptionPoint],
    cache: SourceCache,
) -> list[PeriodTotal]:
    """Totals einer realen Messstelle.

    ``series_points`` sind die (unaggregierten) Punkte, die der Aufrufer schon
    fuer die Chart-Reihe geladen hat — im Monats-Pfad sind das genau die
    Monats-Buckets. Im Roh-Pfad wird ``cache.raw`` gelesen (vom Aufrufer
    vorgewaermt), es entsteht also kein zweiter Load.
    """
    monthly = use_monthly_totals(granularity, rng)
    points = (
        series_points
        if monthly
        else points_for_measuring_point(db, measuring_point_id, granularity=None, cache=cache)
    )
    current = range_total(points, rng, monthly=monthly)
    previous = range_total(points, prev, monthly=monthly) if prev is not None else None
    return merge_totals(current, previous)


def _virtual_period_total(
    db: DbSession,
    vmp: VirtualMeasuringPoint,
    *,
    granularity: Granularity | None,
    rng: DateRange | None,
    cache: SourceCache,
) -> dict[TotalsKey, Decimal]:
    """Netto-Summe der virtuellen MP je Einheit — Vorzeichen sind schon
    verrechnet, der Wert darf also negativ sein."""
    points = consumption_for_virtual_mp(
        db,
        vmp,
        granularity=granularity,
        from_date=rng.start if rng is not None else None,
        to_date=rng.end if rng is not None else None,
        cache=cache,
    )
    out: dict[TotalsKey, Decimal] = {}
    for p in points:
        key = (VIRTUAL_OBIS_CODE, p.unit)
        out[key] = out.get(key, Decimal("0")) + p.consumption
    return out


def totals_for_virtual_mp(
    db: DbSession,
    vmp: VirtualMeasuringPoint,
    *,
    granularity: Granularity | None,
    rng: DateRange | None,
    prev: DateRange | None,
    cache: SourceCache,
) -> list[PeriodTotal]:
    """Totals einer virtuellen (verrechneten) Messstelle — je Periode einmal
    verrechnet und je Einheit summiert. Es gibt kein Quell-Register, der Key
    ist deshalb ``("virtual", unit)``."""
    inner: Granularity | None = "month" if use_monthly_totals(granularity, rng) else None
    current = _virtual_period_total(db, vmp, granularity=inner, rng=rng, cache=cache)
    previous = (
        _virtual_period_total(db, vmp, granularity=inner, rng=prev, cache=cache)
        if prev is not None
        else None
    )
    return merge_totals(current, previous)
