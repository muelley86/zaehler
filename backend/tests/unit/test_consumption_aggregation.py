"""Unit-Tests für ``aggregate_consumption`` — reine Nachverarbeitung der bereits
korrekten Verbrauchs-Deltas in Buckets (Tag/Woche/Monat/Jahr) + Zeitraum-Filter.

Arbeitet direkt auf dem ``ConsumptionPoint``-Dataclass, daher ohne DB-Fixture.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from meters.services.consumption import (
    ConsumptionPoint,
    aggregate_consumption,
    clip_consumption_to_range,
    split_across_buckets,
)


def _interval(start: str, end: str, consumption: str) -> ConsumptionPoint:
    """ConsumptionPoint über ein echtes Intervall (period_start != period_end)."""
    return ConsumptionPoint(
        period_start=date.fromisoformat(start),
        period_end=date.fromisoformat(end),
        register_id=1,
        obis_code="water",
        consumption=Decimal(consumption),
        unit="m³",
    )


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


# --- Tages-Interpolation über Bucket-Grenzen (split_across_buckets) ----------


def test_split_across_month_boundary_by_days() -> None:
    # Analog-Szenario: 15.05 -> 05.06, Verbrauch 21 -> Mai 16 Tage, Juni 5 Tage.
    # total_days = (05.06 - 15.05) = 21; Mai: 16.05..31.05 = 16 Tage, Juni: 5.
    parts = split_across_buckets(_interval("2024-05-15", "2024-06-05", "21"), "month")
    by_end = {p.period_end: p.consumption for p in parts}
    assert by_end[date(2024, 5, 31)] == Decimal("16")
    assert by_end[date(2024, 6, 30)] == Decimal("5")


def test_split_conserves_total_with_rounding() -> None:
    # 10 / 21 Tage geht nicht glatt auf -> Rundungsrest darf nichts verlieren.
    parts = split_across_buckets(_interval("2024-05-15", "2024-06-05", "10"), "month")
    assert sum((p.consumption for p in parts), Decimal("0")) == Decimal("10")


def test_split_within_single_month_is_not_divided() -> None:
    parts = split_across_buckets(_interval("2024-05-05", "2024-05-20", "8"), "month")
    assert len(parts) == 1
    assert parts[0].period_start == date(2024, 5, 1)
    assert parts[0].period_end == date(2024, 5, 31)
    assert parts[0].consumption == Decimal("8")


def test_month_end_reading_lands_in_single_month() -> None:
    # Digital-Szenario: aufeinanderfolgende Monatsend-Werte -> kein Split.
    parts = split_across_buckets(_interval("2024-04-30", "2024-05-31", "100"), "month")
    assert len(parts) == 1
    assert parts[0].period_end == date(2024, 5, 31)
    assert parts[0].consumption == Decimal("100")


def test_aggregate_interpolates_real_intervals() -> None:
    # End-to-end über aggregate_consumption: ein Intervall über die Monatsgrenze
    # wird taggenau auf Mai/Juni verteilt.
    out = aggregate_consumption(
        [_interval("2024-05-15", "2024-06-05", "21")],
        granularity="month",
        from_date=None,
        to_date=None,
    )
    by_end = {p.period_end: p.consumption for p in out}
    assert by_end[date(2024, 5, 31)] == Decimal("16")
    assert by_end[date(2024, 6, 30)] == Decimal("5")


# --- Taggenaues Clipping für den Gesamt-Modus (clip_consumption_to_range) ----


def test_clip_without_range_keeps_all_points() -> None:
    points = [_interval("2024-01-15", "2024-02-15", "10"), _p("2024-03-10", "5")]
    out = clip_consumption_to_range(points, from_date=None, to_date=None)
    assert sum((p.consumption for p in out), Decimal("0")) == Decimal("15")


def test_clip_interval_fully_inside_is_unchanged() -> None:
    out = clip_consumption_to_range(
        [_interval("2024-02-05", "2024-02-20", "8")],
        from_date=date(2024, 2, 1),
        to_date=date(2024, 2, 28),
    )
    assert len(out) == 1
    assert out[0].consumption == Decimal("8")
    assert out[0].period_start == date(2024, 2, 5)
    assert out[0].period_end == date(2024, 2, 20)


def test_clip_interval_fully_outside_is_dropped() -> None:
    out = clip_consumption_to_range(
        [_interval("2024-01-05", "2024-01-20", "8")],
        from_date=date(2024, 6, 1),
        to_date=date(2024, 6, 30),
    )
    assert out == []


def test_clip_interval_across_boundary_is_prorated() -> None:
    # 15.05 -> 05.06 (21 Tage), Zeitraum nur Mai: 16 der 21 Tage liegen im Mai.
    out = clip_consumption_to_range(
        [_interval("2024-05-15", "2024-06-05", "21")],
        from_date=date(2024, 5, 1),
        to_date=date(2024, 5, 31),
    )
    assert len(out) == 1
    assert out[0].consumption == Decimal("16")
    assert out[0].period_end == date(2024, 5, 31)


def test_clip_zero_span_counts_when_end_in_range() -> None:
    inside = _p("2024-02-10", "7")
    outside = _p("2024-03-10", "9")
    out = clip_consumption_to_range(
        [inside, outside], from_date=date(2024, 2, 1), to_date=date(2024, 2, 28)
    )
    assert [p.consumption for p in out] == [Decimal("7")]


def test_clip_total_equals_sum_of_month_buckets() -> None:
    # Invariante des Gesamt-Modus: Clipping auf einen Zeitraum == Summe der
    # Monats-Buckets desselben Zeitraums (gleiche Tages-Interpolation).
    points = [
        _interval("2024-01-15", "2024-02-15", "10"),
        _interval("2024-02-15", "2024-04-10", "30"),
    ]
    frm, to = date(2024, 2, 1), date(2024, 2, 29)
    clipped = sum(
        (p.consumption for p in clip_consumption_to_range(points, from_date=frm, to_date=to)),
        Decimal("0"),
    )
    months = sum(
        (
            p.consumption
            for p in aggregate_consumption(points, granularity="month", from_date=frm, to_date=to)
        ),
        Decimal("0"),
    )
    assert clipped == months
