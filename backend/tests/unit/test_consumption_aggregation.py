"""Unit-Tests für ``aggregate_consumption`` — reine Nachverarbeitung der bereits
korrekten Verbrauchs-Deltas in Buckets (Tag/Woche/Monat/Jahr) + Zeitraum-Filter.

Arbeitet direkt auf dem ``ConsumptionPoint``-Dataclass, daher ohne DB-Fixture.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from meters.services.consumption import ConsumptionPoint, aggregate_consumption


def _p(
    period_end: str, consumption: str, obis: str = "1.8.0", unit: str = "kWh"
) -> ConsumptionPoint:
    """Kompakter ConsumptionPoint-Builder. period_start ist für die Aggregation
    irrelevant (Zuordnung erfolgt über period_end), wird hier = period_end gesetzt."""
    d = date.fromisoformat(period_end)
    return ConsumptionPoint(
        period_start=d,
        period_end=d,
        register_id=1,
        obis_code=obis,
        consumption=Decimal(consumption),
        unit=unit,
    )


def test_granularity_none_returns_filtered_passthrough() -> None:
    points = [_p("2024-01-10", "5"), _p("2024-02-10", "7")]
    out = aggregate_consumption(points, granularity=None, from_date=None, to_date=None)
    assert [p.consumption for p in out] == [Decimal("5"), Decimal("7")]


def test_filters_by_period_end_range() -> None:
    points = [_p("2024-01-10", "5"), _p("2024-02-10", "7"), _p("2024-03-10", "9")]
    out = aggregate_consumption(
        points, granularity=None, from_date=date(2024, 2, 1), to_date=date(2024, 2, 28)
    )
    assert [p.consumption for p in out] == [Decimal("7")]


def test_aggregate_by_month_sums_within_month() -> None:
    points = [_p("2024-02-05", "3"), _p("2024-02-20", "4"), _p("2024-03-01", "10")]
    out = aggregate_consumption(points, granularity="month", from_date=None, to_date=None)
    by_end = {p.period_end: p.consumption for p in out}
    assert by_end[date(2024, 2, 29)] == Decimal("7")
    assert by_end[date(2024, 3, 31)] == Decimal("10")


def test_month_bucket_bounds() -> None:
    out = aggregate_consumption(
        [_p("2024-02-15", "1")], granularity="month", from_date=None, to_date=None
    )
    assert out[0].period_start == date(2024, 2, 1)
    assert out[0].period_end == date(2024, 2, 29)  # 2024 ist Schaltjahr


def test_aggregate_by_year() -> None:
    points = [_p("2023-05-01", "2"), _p("2023-11-01", "8"), _p("2024-01-01", "1")]
    out = aggregate_consumption(points, granularity="year", from_date=None, to_date=None)
    by_end = {p.period_end: p.consumption for p in out}
    assert by_end[date(2023, 12, 31)] == Decimal("10")
    assert by_end[date(2024, 12, 31)] == Decimal("1")
    assert out[0].period_start == date(2023, 1, 1)


def test_aggregate_by_iso_week() -> None:
    # 2024-06-03 ist Montag, 2024-06-09 Sonntag (eine ISO-Woche).
    points = [_p("2024-06-05", "2"), _p("2024-06-07", "3"), _p("2024-06-10", "4")]
    out = aggregate_consumption(points, granularity="week", from_date=None, to_date=None)
    by_end = {p.period_end: p for p in out}
    week1 = by_end[date(2024, 6, 9)]
    assert week1.consumption == Decimal("5")
    assert week1.period_start == date(2024, 6, 3)
    week2 = by_end[date(2024, 6, 16)]
    assert week2.consumption == Decimal("4")
    assert week2.period_start == date(2024, 6, 10)


def test_aggregate_by_day_keeps_points_separate() -> None:
    points = [_p("2024-06-05", "2"), _p("2024-06-06", "3")]
    out = aggregate_consumption(points, granularity="day", from_date=None, to_date=None)
    assert [(p.period_start, p.period_end, p.consumption) for p in out] == [
        (date(2024, 6, 5), date(2024, 6, 5), Decimal("2")),
        (date(2024, 6, 6), date(2024, 6, 6), Decimal("3")),
    ]


def test_different_obis_codes_not_merged() -> None:
    points = [_p("2024-02-05", "3", obis="1.8.1"), _p("2024-02-20", "4", obis="1.8.2")]
    out = aggregate_consumption(points, granularity="month", from_date=None, to_date=None)
    by_obis = {p.obis_code: p.consumption for p in out}
    assert by_obis == {"1.8.1": Decimal("3"), "1.8.2": Decimal("4")}


def test_result_sorted_by_period_end_then_obis() -> None:
    points = [
        _p("2024-03-10", "1", obis="2.8.0"),
        _p("2024-01-10", "1", obis="1.8.0"),
        _p("2024-01-10", "1", obis="2.8.0"),
    ]
    out = aggregate_consumption(points, granularity="month", from_date=None, to_date=None)
    keys = [(p.period_end, p.obis_code) for p in out]
    assert keys == sorted(keys)


def test_empty_input() -> None:
    assert aggregate_consumption([], granularity="month", from_date=None, to_date=None) == []
