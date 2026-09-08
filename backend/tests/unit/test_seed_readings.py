"""Reiner Planer der Testdaten (``services/seed_readings.plan_register_seed``):
nur Stichtage vor dem Anker, monoton, nie negativ, deterministisch, saisonal.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from meters.models import HeatingSource, MeterType
from meters.services.import_readings import reading_at_for_date
from meters.services.seed_readings import (
    SeedPoint,
    month_end_dates,
    plan_register_seed,
    seed_note,
)


def _plan(
    existing: list[tuple[datetime, Decimal]],
    *,
    register_id: int = 7,
    obis_code: str = "1.8.0",
    unit: str = "kWh",
    meter_type: MeterType = MeterType.ELECTRICITY,
    heating_source: HeatingSource | None = None,
    year: int = 2025,
) -> list[SeedPoint]:
    return plan_register_seed(
        existing,
        register_id=register_id,
        obis_code=obis_code,
        unit=unit,
        meter_type=meter_type,
        heating_source=heating_source,
        year=year,
    )


ANCHOR = (datetime(2026, 5, 31, 21, 59, 59), Decimal("5000.5"))
LATER = (datetime(2026, 8, 31, 21, 59, 59), Decimal("5900.5"))


def test_seed_note_marks_year() -> None:
    assert seed_note(2025) == "Testdaten 2025"


def test_month_end_dates_cover_base_and_twelve_months() -> None:
    dates = month_end_dates(2025)
    assert dates[0] == date(2024, 12, 31)
    assert dates[1] == date(2025, 1, 31)
    assert dates[2] == date(2025, 2, 28)
    assert dates[-1] == date(2025, 12, 31)
    assert len(dates) == 13


def test_plans_thirteen_points_before_anchor_monotone_and_non_negative() -> None:
    points = _plan([ANCHOR, LATER])
    assert len(points) == 13
    assert points[0].reading_at == reading_at_for_date(date(2024, 12, 31))
    assert points[-1].reading_at == reading_at_for_date(date(2025, 12, 31))
    values = [p.value for p in points]
    assert values == sorted(values)
    assert all(v >= 0 for v in values)
    # Letzter Seed liegt unter dem Anker, Werte tragen die Stellenzahl der echten Daten.
    assert values[-1] < ANCHOR[1]
    assert all(-int(v.as_tuple().exponent) <= 1 for v in values)


def test_uses_observed_rate_when_available() -> None:
    # 900 kWh in 92 Tagen ≈ 9,8/Tag -> 2025 rund 3.500 kWh Verbrauch.
    points = _plan([ANCHOR, LATER])
    consumed_2025 = points[-1].value - points[0].value
    assert Decimal("2800") < consumed_2025 < Decimal("4400")


def test_deterministic_per_register() -> None:
    assert _plan([ANCHOR, LATER]) == _plan([ANCHOR, LATER])
    assert _plan([ANCHOR, LATER], register_id=8) != _plan([ANCHOR, LATER], register_id=9)


def test_heating_consumes_more_in_january_than_in_july() -> None:
    points = _plan(
        [ANCHOR, LATER],
        obis_code="heat.0",
        unit="MWh",
        meter_type=MeterType.HEATING,
        heating_source=HeatingSource.DISTRICT_HEAT,
    )
    by_month = {p.reading_at.month: p.value for p in points if p.reading_at.year == 2025}
    december_base = points[0].value
    january = by_month[1] - december_base
    july = by_month[7] - by_month[6]
    assert january > july * 3


def test_skips_dates_at_or_after_anchor_and_already_taken() -> None:
    anchor = (reading_at_for_date(date(2025, 6, 30)), Decimal("100"))
    taken = (reading_at_for_date(date(2025, 3, 31)), Decimal("50"))
    points = _plan([taken, anchor])
    assert all(p.reading_at < taken[0] for p in points)
    # Basis + Jan + Feb = 3 Stichtage vor der frühesten Ablesung.
    assert len(points) == 3


def test_scales_down_when_anchor_is_small() -> None:
    small = [(datetime(2026, 1, 31, 22, 59, 59), Decimal("12.5"))]
    points = _plan(small)
    assert points[0].value >= 0
    assert points[0].value < points[-1].value < Decimal("12.5")


def test_no_existing_or_zero_anchor_yields_nothing() -> None:
    assert _plan([]) == []
    assert _plan([(datetime(2026, 1, 31), Decimal("0"))]) == []
