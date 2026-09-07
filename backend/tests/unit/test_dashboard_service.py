"""Unit-Tests der reinen Dashboard-Rechenlogik (``services/dashboard.py``).

Ohne DB: Vorperioden-Regel, Monats-Alignment und die Totals-Summierung
(Monats-Cache-Pfad vs. taggenauer Roh-Clip) sind reine Funktionen auf
``ConsumptionPoint``-Listen.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from meters.services.consumption import ConsumptionPoint, aggregate_consumption
from meters.services.dashboard import (
    DateRange,
    PeriodTotal,
    is_month_aligned,
    merge_totals,
    previous_range,
    range_total,
    use_monthly_totals,
)


def _rng(start: str, end: str) -> DateRange:
    return DateRange(start=date.fromisoformat(start), end=date.fromisoformat(end))


# ---------------------------------------------------------------------------
# previous_range
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("start", "end", "prev_start", "prev_end"),
    [
        # Monatsaligned: um dieselbe Anzahl GANZER Monate zurueck.
        ("2025-03-01", "2025-03-31", "2025-02-01", "2025-02-28"),
        ("2025-02-01", "2025-03-31", "2024-12-01", "2025-01-31"),
        ("2025-01-01", "2025-12-31", "2024-01-01", "2024-12-31"),
        # Nicht aligned: gleiche Tageslaenge, endend am Tag VOR ``start``.
        ("2025-02-15", "2025-03-14", "2025-01-18", "2025-02-14"),
        ("2025-03-05", "2025-03-05", "2025-03-04", "2025-03-04"),
        ("2025-01-01", "2025-03-15", "2024-10-19", "2024-12-31"),
    ],
)
def test_previous_range(start: str, end: str, prev_start: str, prev_end: str) -> None:
    assert previous_range(_rng(start, end)) == _rng(prev_start, prev_end)


@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [
        ("2025-03-01", "2025-03-31", True),
        ("2024-02-01", "2024-02-29", True),  # Schaltjahr: 29.02. ist Monatsende
        ("2025-01-01", "2025-12-31", True),
        ("2025-01-02", "2025-01-31", False),  # Start nicht am Monatsersten
        ("2025-01-01", "2025-01-30", False),  # Ende nicht am Monatsletzten
        ("2024-02-01", "2024-02-28", False),  # Schaltjahr: 28.02. ist NICHT Monatsende
    ],
)
def test_is_month_aligned(start: str, end: str, expected: bool) -> None:
    assert is_month_aligned(_rng(start, end)) is expected


@pytest.mark.parametrize(
    ("granularity", "rng", "expected"),
    [
        ("month", None, True),
        ("year", None, True),
        ("month", _rng("2025-03-01", "2025-03-31"), True),
        ("month", _rng("2025-02-15", "2025-03-14"), False),
        ("day", None, False),
        ("week", _rng("2025-03-01", "2025-03-31"), False),
        (None, None, False),
    ],
)
def test_use_monthly_totals(granularity: str | None, rng: DateRange | None, expected: bool) -> None:
    assert use_monthly_totals(granularity, rng) is expected  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# range_total
# ---------------------------------------------------------------------------


def _point(start: str, end: str, value: str) -> ConsumptionPoint:
    return ConsumptionPoint(
        period_start=date.fromisoformat(start),
        period_end=date.fromisoformat(end),
        register_id=1,
        obis_code="water",
        consumption=Decimal(value),
        unit="m³",
    )


def _raw_points() -> list[ConsumptionPoint]:
    # Beide Intervalle ueberspannen Monatsgrenzen -> die beiden Rechenpfade
    # muessen anteilig (taggenau) dasselbe liefern.
    return [_point("2024-01-15", "2024-02-15", "10"), _point("2024-02-15", "2024-04-10", "30")]


def test_range_total_monthly_matches_raw_on_aligned_range() -> None:
    raw = _raw_points()
    monthly = aggregate_consumption(raw, granularity="month", from_date=None, to_date=None)
    february = _rng("2024-02-01", "2024-02-29")

    from_monthly = range_total(monthly, february, monthly=True)
    from_raw = range_total(raw, february, monthly=False)

    assert from_monthly == from_raw
    # Nicht versehentlich leer: Februar bekommt Anteile aus BEIDEN Intervallen.
    assert from_raw[("water", "m³")] > Decimal("12")


def test_range_total_without_range_sums_everything() -> None:
    assert range_total(_raw_points(), None, monthly=False) == {("water", "m³"): Decimal("40")}


def test_range_total_monthly_ignores_partially_covered_buckets() -> None:
    monthly = aggregate_consumption(
        _raw_points(), granularity="month", from_date=None, to_date=None
    )
    # Bereich deckt nur den halben Maerz -> kein Monats-Bucket liegt vollstaendig
    # darin, es gibt also keinen Key (kein "0").
    assert range_total(monthly, _rng("2024-03-01", "2024-03-15"), monthly=True) == {}


# ---------------------------------------------------------------------------
# merge_totals
# ---------------------------------------------------------------------------


def test_merge_totals_unions_keys_and_derives_direction() -> None:
    current = {("1.8.0", "kWh"): Decimal("5")}
    previous = {("2.8.0", "kWh"): Decimal("3")}

    assert merge_totals(current, previous) == [
        PeriodTotal(
            obis_code="1.8.0",
            unit="kWh",
            direction="bezug",
            current=Decimal("5"),
            previous=None,
        ),
        PeriodTotal(
            obis_code="2.8.0",
            unit="kWh",
            direction="einspeisung",
            current=None,
            previous=Decimal("3"),
        ),
    ]


def test_merge_totals_without_previous_period_yields_none() -> None:
    current = {("1.8.0", "kWh"): Decimal("5"), ("2.8.0", "kWh"): Decimal("2")}

    out = merge_totals(current, None)

    assert [t.obis_code for t in out] == ["1.8.0", "2.8.0"]
    assert all(t.previous is None for t in out)
    assert [t.current for t in out] == [Decimal("5"), Decimal("2")]
