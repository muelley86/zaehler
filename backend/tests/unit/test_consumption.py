from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from meters.models import MeasuringPoint, MeterType, Reading
from meters.services.consumption import (
    consumption_for_measuring_point,
    consumption_for_register,
)
from meters.services.meter_replacement import install_first_meter


def _make_point(db: Session) -> MeasuringPoint:
    mp = MeasuringPoint(name="Test", type=MeterType.WATER)
    db.add(mp)
    db.flush()
    install_first_meter(
        db,
        measuring_point=mp,
        serial_number="W1",
        installed_at=date(2024, 1, 1),
        initial_values={"water": Decimal("100.0")},
        user_id=None,
        ip_address=None,
    )
    db.commit()
    db.refresh(mp)
    return mp


def test_consumption_simple_increase(db: Session) -> None:
    mp = _make_point(db)
    register = mp.physical_meters[0].registers[0]
    db.add(
        Reading(register_id=register.id, value=Decimal("110.0"), reading_at=datetime(2024, 2, 1))
    )
    db.add(
        Reading(register_id=register.id, value=Decimal("125.0"), reading_at=datetime(2024, 3, 1))
    )
    db.commit()
    db.refresh(register)

    points = consumption_for_register(register)
    assert [p.consumption for p in points] == [Decimal("10.0"), Decimal("15.0")]


def test_consumption_rollover(db: Session) -> None:
    mp = _make_point(db)
    register = mp.physical_meters[0].registers[0]
    register.max_value = Decimal("200")
    db.add(
        Reading(register_id=register.id, value=Decimal("190.0"), reading_at=datetime(2024, 2, 1))
    )
    db.add(Reading(register_id=register.id, value=Decimal("10.0"), reading_at=datetime(2024, 3, 1)))
    db.commit()
    db.refresh(register)

    points = consumption_for_register(register)
    # (200 - 190) + 10 = 20
    assert points[1].consumption == Decimal("20.0")


def test_consumption_aggregates_over_meter_replacement(db: Session) -> None:
    mp = _make_point(db)
    register = mp.physical_meters[0].registers[0]
    db.add(
        Reading(register_id=register.id, value=Decimal("150.0"), reading_at=datetime(2024, 6, 1))
    )
    db.commit()

    from meters.services.meter_replacement import replace_meter

    replace_meter(
        db,
        measuring_point=mp,
        final_readings={"water": Decimal("160.0")},
        removed_at=date(2024, 7, 1),
        new_serial_number="W2",
        installed_at=date(2024, 7, 1),
        initial_readings={"water": Decimal("0.0")},
        user_id=None,
        ip_address=None,
    )
    db.commit()
    db.expire(mp, ["physical_meters"])

    new_register = mp.physical_meters[1].registers[0]
    db.add(
        Reading(
            register_id=new_register.id,
            value=Decimal("5.0"),
            reading_at=datetime(2024, 8, 1),
        )
    )
    db.commit()

    points = consumption_for_measuring_point(db, measuring_point_id=mp.id)
    consumptions = [p.consumption for p in points]
    # alter Meter: 100→150 (50), 150→160 (10); neuer Meter: 0→5 (5)
    assert Decimal("50.0") in consumptions
    assert Decimal("10.0") in consumptions
    assert Decimal("5.0") in consumptions
