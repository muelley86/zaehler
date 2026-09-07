"""Tests für die zentrale Verbrauchs-Quellenwahl (``consumption_source``).

Prüft: ``month``/``year`` lesen die materialisierte Monatstabelle (nicht
on-the-fly), der Jahres-Rollup aus der Monatstabelle stimmt exakt mit der
On-the-fly-Berechnung überein, und die Bulk-Loader (``prime_source_cache``)
füllen den ``SourceCache`` ohne Query je Messstelle.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import event
from sqlalchemy.orm import Session

from meters.core.security import hash_password
from meters.db import engine
from meters.models import MeasuringPoint, MeterType, MonthlyConsumption, Reading, User, UserRole
from meters.services.consumption import aggregate_consumption, consumption_for_measuring_point
from meters.services.consumption_source import (
    SourceCache,
    points_for_measuring_point,
    prime_source_cache,
)
from meters.services.meter_replacement import install_first_meter


def _ensure_user(db: Session) -> int:
    existing = db.query(User).filter_by(username="consumption-source-test").first()
    if existing is not None:
        return existing.id
    user = User(
        username="consumption-source-test",
        email=None,
        password_hash=hash_password("test-pass-12345"),
        role=UserRole.ADMIN,
        is_active=True,
        force_password_change=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user.id


def _make_water_point(db: Session, name: str = "Test") -> MeasuringPoint:
    user_id = _ensure_user(db)
    mp = MeasuringPoint(name=name, type=MeterType.WATER)
    db.add(mp)
    db.flush()
    install_first_meter(
        db,
        measuring_point=mp,
        serial_number=f"W-{name}",
        installed_at=date(2024, 1, 1),
        initial_values={"water": Decimal("100.0")},
        user_id=user_id,
        ip_address=None,
    )
    db.commit()
    db.refresh(mp)
    return mp


def _add_reading(db: Session, register_id: int, value: str, at: datetime) -> None:
    db.add(
        Reading(
            register_id=register_id,
            value=Decimal(value),
            reading_at=at,
            created_by_user_id=_ensure_user(db),
        )
    )
    db.commit()


def test_month_and_year_use_monthly_table(db: Session) -> None:
    """month + year liefern die (verfälschte) Monats-Zeile aus der Tabelle;
    day/None rechnen weiterhin on-the-fly und sehen die Verfälschung nicht."""
    mp = _make_water_point(db)
    register = mp.physical_meters[0].registers[0]
    _add_reading(db, register.id, "110.0", datetime(2024, 1, 31, 12, 0))

    db.expire_all()
    row = db.query(MonthlyConsumption).filter_by(register_id=register.id).one()
    row.consumption = Decimal("999")
    db.commit()  # nur die Cache-Zeile ändern -- Hook triggert kein Recompute

    month_points = points_for_measuring_point(db, mp.id, granularity="month")
    year_points = points_for_measuring_point(db, mp.id, granularity="year")
    day_points = points_for_measuring_point(db, mp.id, granularity="day")
    none_points = points_for_measuring_point(db, mp.id, granularity=None)

    assert Decimal("999") in {p.consumption for p in month_points}
    assert Decimal("999") in {p.consumption for p in year_points}
    assert Decimal("999") not in {p.consumption for p in day_points}
    assert Decimal("999") not in {p.consumption for p in none_points}


def test_year_rollup_equals_on_the_fly(db: Session) -> None:
    """Ablesungen über eine Jahresgrenze mit glattem Tagesverbrauch: das
    Jahres-Rollup aus der Monatstabelle stimmt exakt mit der On-the-fly-
    Aggregation der Roh-Readings überein (Toleranz 1e-20)."""
    mp = _make_water_point(db)
    register = mp.physical_meters[0].registers[0]
    # 100 @ 2024-01-01 (initial) -> 100 @ 2024-12-20 (kein Verbrauch bis dahin)
    # -> 121 @ 2025-01-10 (21 Tage, 1/Tag: 11 Tage in 2024, 10 Tage in 2025)
    _add_reading(db, register.id, "100.0", datetime(2024, 12, 20, 12, 0))
    _add_reading(db, register.id, "121.0", datetime(2025, 1, 10, 12, 0))

    monthly_source_points = points_for_measuring_point(db, mp.id, granularity="year")
    raw_points = consumption_for_measuring_point(db, measuring_point_id=mp.id)

    from_the_table = aggregate_consumption(
        monthly_source_points, granularity="year", from_date=None, to_date=None
    )
    on_the_fly = aggregate_consumption(raw_points, granularity="year", from_date=None, to_date=None)

    by_year_table = {p.period_end.year: p.consumption for p in from_the_table}
    by_year_raw = {p.period_end.year: p.consumption for p in on_the_fly}
    assert by_year_table.keys() == by_year_raw.keys()
    for year, value in by_year_raw.items():
        assert abs(by_year_table[year] - value) <= Decimal("1e-20")
    assert by_year_raw == {2024: Decimal("11.0"), 2025: Decimal("10.0")}


def test_prime_source_cache_raw_avoids_per_mp_queries(db: Session) -> None:
    """Nach ``prime_source_cache(source="raw")`` lösen weitere Aufrufe von
    ``points_for_measuring_point`` je MP KEINE DB-Query mehr aus (0 Queries)
    und liefern dieselben Werte wie ohne Cache."""
    mp1 = _make_water_point(db, name="Bulk1")
    mp2 = _make_water_point(db, name="Bulk2")
    _add_reading(db, mp1.physical_meters[0].registers[0].id, "130.0", datetime(2024, 3, 1))
    _add_reading(db, mp2.physical_meters[0].registers[0].id, "150.0", datetime(2024, 3, 1))

    uncached = {
        mp.id: points_for_measuring_point(db, mp.id, granularity="day") for mp in (mp1, mp2)
    }

    cache = SourceCache()
    prime_source_cache(db, [mp1.id, mp2.id], source="raw", cache=cache)

    queries: list[str] = []

    def collect(_c: object, _cur: object, statement: str, *_a: object, **_kw: object) -> None:
        queries.append(statement)

    event.listen(engine, "before_cursor_execute", collect)
    try:
        cached = {
            mp.id: points_for_measuring_point(db, mp.id, granularity="day", cache=cache)
            for mp in (mp1, mp2)
        }
    finally:
        event.remove(engine, "before_cursor_execute", collect)

    assert queries == []
    for mp_id in (mp1.id, mp2.id):
        assert [(p.period_end, p.consumption) for p in cached[mp_id]] == [
            (p.period_end, p.consumption) for p in uncached[mp_id]
        ]


def test_prime_source_cache_monthly_fills_empty_lists_for_mps_without_rows(db: Session) -> None:
    """Eine MP ohne Ablesungen (keine ``monthly_consumption``-Zeilen) bekommt
    im ``monthly``-Cache eine leere Liste statt zu fehlen -- ``points_for_measuring_point``
    liest dann aus dem Cache statt erneut die DB abzufragen."""
    mp_with_data = _make_water_point(db, name="WithData")
    mp_without_data = _make_water_point(db, name="WithoutData")
    reg_id = mp_with_data.physical_meters[0].registers[0].id
    _add_reading(db, reg_id, "110.0", datetime(2024, 2, 15))

    cache = SourceCache()
    prime_source_cache(db, [mp_with_data.id, mp_without_data.id], source="monthly", cache=cache)

    assert mp_without_data.id in cache.monthly
    assert cache.monthly[mp_without_data.id] == []
    assert cache.monthly[mp_with_data.id] != []

    queries: list[str] = []

    def collect(_c: object, _cur: object, statement: str, *_a: object, **_kw: object) -> None:
        queries.append(statement)

    event.listen(engine, "before_cursor_execute", collect)
    try:
        points = points_for_measuring_point(
            db, mp_without_data.id, granularity="month", cache=cache
        )
    finally:
        event.remove(engine, "before_cursor_execute", collect)
    assert points == []
    assert queries == []
