from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from meters.models import Delivery, MeasuringPoint, MeterType, Reading
from meters.services.consumption import (
    consumption_for_measuring_point,
    consumption_for_register,
)
from meters.services.meter_replacement import install_first_meter, replace_meter


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


def test_consumption_replacement_with_nonzero_initial(db: Session) -> None:
    """Audit 5.1: Neuer Meter startet nicht bei 0.

    Manche Versorger setzen Tausch-Meter mit dem Endstand des alten Meters fort
    (z. B. Wasserzähler-Wechsel mit Vorsteuer). Der Verbrauch nach dem Tausch
    muss von ``initial_readings`` weg gerechnet werden, nicht von 0.
    """
    mp = _make_point(db)
    register = mp.physical_meters[0].registers[0]
    db.add(
        Reading(register_id=register.id, value=Decimal("180.0"), reading_at=datetime(2024, 6, 1))
    )
    db.commit()

    replace_meter(
        db,
        measuring_point=mp,
        final_readings={"water": Decimal("200.0")},
        removed_at=date(2024, 7, 1),
        new_serial_number="W2",
        installed_at=date(2024, 7, 1),
        initial_readings={"water": Decimal("50.0")},  # nicht null!
        user_id=None,
        ip_address=None,
    )
    db.commit()
    db.expire(mp, ["physical_meters"])

    new_register = mp.physical_meters[1].registers[0]
    db.add(
        Reading(
            register_id=new_register.id,
            value=Decimal("60.0"),
            reading_at=datetime(2024, 8, 1),
        )
    )
    db.commit()

    points = consumption_for_measuring_point(db, measuring_point_id=mp.id)
    consumptions = [p.consumption for p in points]
    # Letzter Schritt: 50 → 60 = 10, NICHT 60.
    assert Decimal("10.0") in consumptions
    # alter Meter: 180→200 = 20
    assert Decimal("20.0") in consumptions
    # Es darf kein Verbrauch von 60 (vom 0-Anfang) im Ergebnis sein.
    assert Decimal("60.0") not in consumptions


def test_consumption_triple_replacement(db: Session) -> None:
    """Audit 5.1: Drei aufeinanderfolgende Zählerwechsel."""
    mp = _make_point(db)

    def _add_reading(reg: object, value: str, at: datetime) -> None:
        db.add(Reading(register_id=getattr(reg, "id"), value=Decimal(value), reading_at=at))
        db.commit()

    r1 = mp.physical_meters[0].registers[0]
    _add_reading(r1, "120.0", datetime(2024, 3, 1))

    replace_meter(
        db,
        measuring_point=mp,
        final_readings={"water": Decimal("130.0")},
        removed_at=date(2024, 4, 1),
        new_serial_number="W2",
        installed_at=date(2024, 4, 1),
        initial_readings={"water": Decimal("0.0")},
        user_id=None,
        ip_address=None,
    )
    db.commit()
    db.expire(mp, ["physical_meters"])
    r2 = mp.physical_meters[1].registers[0]
    _add_reading(r2, "20.0", datetime(2024, 5, 1))

    replace_meter(
        db,
        measuring_point=mp,
        final_readings={"water": Decimal("25.0")},
        removed_at=date(2024, 6, 1),
        new_serial_number="W3",
        installed_at=date(2024, 6, 1),
        initial_readings={"water": Decimal("0.0")},
        user_id=None,
        ip_address=None,
    )
    db.commit()
    db.expire(mp, ["physical_meters"])
    r3 = mp.physical_meters[2].registers[0]
    _add_reading(r3, "8.0", datetime(2024, 7, 1))

    points = consumption_for_measuring_point(db, measuring_point_id=mp.id)
    sums = [p.consumption for p in points]

    # Erwartete Einzel-Schritte:
    # M1: 100 → 120 (20)
    # M1: 120 → 130 (10)
    # M2: 0 → 20 (20)
    # M2: 20 → 25 (5)
    # M3: 0 → 8 (8)
    assert Decimal("20.0") in sums
    assert Decimal("10.0") in sums
    assert Decimal("5.0") in sums
    assert Decimal("8.0") in sums
    # Summe aller Verbräuche
    assert sum(sums, start=Decimal("0")) == Decimal("63.0")


def test_consumption_rollover_with_custom_max_value(db: Session) -> None:
    """Audit 5.2: Rollover funktioniert mit custom max_value (nicht Default)."""
    mp = _make_point(db)
    register = mp.physical_meters[0].registers[0]
    register.max_value = Decimal("999.9")
    db.add(
        Reading(register_id=register.id, value=Decimal("950.0"), reading_at=datetime(2024, 2, 1))
    )
    db.add(Reading(register_id=register.id, value=Decimal("50.0"), reading_at=datetime(2024, 3, 1)))
    db.commit()
    db.refresh(register)

    points = consumption_for_register(register)
    # Schritt 1: 100 → 950 = 850
    # Schritt 2 mit Rollover: (999.9 - 950) + 50 = 99.9
    assert points[0].consumption == Decimal("850.0")
    assert points[1].consumption == Decimal("99.9")


def test_consumption_no_rollover_when_max_value_zero(db: Session) -> None:
    """Audit 5.2: max_value=0 deaktiviert Rollover; Differenz darf negativ sein."""
    mp = _make_point(db)
    register = mp.physical_meters[0].registers[0]
    register.max_value = Decimal("0")
    db.add(Reading(register_id=register.id, value=Decimal("50.0"), reading_at=datetime(2024, 2, 1)))
    db.add(Reading(register_id=register.id, value=Decimal("10.0"), reading_at=datetime(2024, 3, 1)))
    db.commit()
    db.refresh(register)

    points = consumption_for_register(register)
    # Schritt 1: 100 → 50 (negativ, kein Rollover)
    # Schritt 2: 50 → 10 (negativ, kein Rollover)
    assert points[0].consumption == Decimal("-50.0")
    assert points[1].consumption == Decimal("-40.0")


def test_consumption_tank_register_skips_rollover_path(db: Session) -> None:
    """Audit 5.2: Heizöl-Tank (accepts_deliveries) folgt eigener Logik, nie Rollover."""
    # Oil-MP anlegen — Tank-Register hat accepts_deliveries=True
    mp = MeasuringPoint(name="Tank", type=MeterType.OIL)
    db.add(mp)
    db.flush()
    install_first_meter(
        db,
        measuring_point=mp,
        serial_number="OIL-1",
        installed_at=date(2024, 1, 1),
        initial_values={"oil.hours": Decimal("0"), "oil.tank": Decimal("2000")},
        user_id=None,
        ip_address=None,
    )
    db.commit()
    db.refresh(mp)

    tank_register = next(r for r in mp.physical_meters[0].registers if r.obis_code == "oil.tank")
    # Stand sinkt von 2000 auf 1500 — bei normalem Register wäre das Rollover.
    db.add(
        Reading(
            register_id=tank_register.id,
            value=Decimal("1500"),
            reading_at=datetime(2024, 3, 1),
        )
    )
    db.commit()
    db.refresh(tank_register)

    points = consumption_for_register(tank_register)
    # Tank: prev (2000) + refilled (0) - cur (1500) = 500 (positiver Verbrauch)
    assert len(points) == 1
    assert points[0].consumption == Decimal("500")


def test_consumption_with_transformer_factor(db: Session) -> None:
    """Strom-Wandlerzähler: Differenzen werden mit dem Faktor multipliziert."""
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

    points = consumption_for_register(register, transformer_factor=20)
    # 100→110 = 10 * 20 = 200; 110→125 = 15 * 20 = 300
    assert [p.consumption for p in points] == [Decimal("200.0"), Decimal("300.0")]


def test_consumption_without_transformer_factor_unchanged(db: Session) -> None:
    """Regression: ohne Faktor (None) verhält sich die Berechnung wie bisher."""
    mp = _make_point(db)
    register = mp.physical_meters[0].registers[0]
    db.add(
        Reading(register_id=register.id, value=Decimal("110.0"), reading_at=datetime(2024, 2, 1))
    )
    db.commit()
    db.refresh(register)

    points = consumption_for_register(register, transformer_factor=None)
    assert points[0].consumption == Decimal("10.0")


def test_consumption_with_transformer_factor_and_rollover(db: Session) -> None:
    """Rollover wird ZUERST aufgelöst, danach mit dem Faktor multipliziert."""
    mp = _make_point(db)
    register = mp.physical_meters[0].registers[0]
    register.max_value = Decimal("200")
    db.add(
        Reading(register_id=register.id, value=Decimal("190.0"), reading_at=datetime(2024, 2, 1))
    )
    db.add(Reading(register_id=register.id, value=Decimal("10.0"), reading_at=datetime(2024, 3, 1)))
    db.commit()
    db.refresh(register)

    points = consumption_for_register(register, transformer_factor=10)
    # Rollover: (200 - 190) + 10 = 20; * 10 = 200
    assert points[1].consumption == Decimal("200")


def test_consumption_for_measuring_point_applies_transformer_factor(db: Session) -> None:
    """consumption_for_measuring_point liest den Faktor aus dem MP und reicht ihn durch."""
    mp = MeasuringPoint(name="Strom mit Wandler", type=MeterType.ELECTRICITY, transformer_factor=50)
    db.add(mp)
    db.flush()
    install_first_meter(
        db,
        measuring_point=mp,
        serial_number="E-1",
        installed_at=date(2024, 1, 1),
        initial_values={"1.8.0": Decimal("100.0")},
        user_id=None,
        ip_address=None,
    )
    db.commit()
    db.refresh(mp)
    register = mp.physical_meters[0].registers[0]
    db.add(
        Reading(register_id=register.id, value=Decimal("105.0"), reading_at=datetime(2024, 2, 1))
    )
    db.commit()

    points = consumption_for_measuring_point(db, measuring_point_id=mp.id)
    consumptions = [p.consumption for p in points]
    # 100 → 105 = 5 * 50 = 250
    assert Decimal("250") in consumptions


def test_oil_consumption_with_multiple_deliveries_in_period(db: Session) -> None:
    """Audit 5.7: Mehrere Lieferungen zwischen zwei Readings — alle werden summiert."""
    mp = MeasuringPoint(name="Tank2", type=MeterType.OIL)
    db.add(mp)
    db.flush()
    install_first_meter(
        db,
        measuring_point=mp,
        serial_number="OIL-2",
        installed_at=date(2024, 1, 1),
        initial_values={"oil.hours": Decimal("0"), "oil.tank": Decimal("1000")},
        user_id=None,
        ip_address=None,
    )
    db.commit()
    db.refresh(mp)

    tank = next(r for r in mp.physical_meters[0].registers if r.obis_code == "oil.tank")
    # Zwei Lieferungen zwischen den beiden Readings
    db.add(Delivery(register_id=tank.id, delivery_date=date(2024, 2, 5), amount=Decimal("400")))
    db.add(Delivery(register_id=tank.id, delivery_date=date(2024, 2, 20), amount=Decimal("250")))
    db.add(Reading(register_id=tank.id, value=Decimal("1300"), reading_at=datetime(2024, 3, 1)))
    db.commit()
    db.refresh(tank)

    points = consumption_for_register(tank)
    assert len(points) == 1
    # Verbrauch = 1000 + 400 + 250 - 1300 = 350
    assert points[0].consumption == Decimal("350")
