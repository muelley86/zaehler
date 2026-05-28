from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from meters.core.obis import RegisterDef
from meters.core.security import hash_password
from meters.models import (
    Delivery,
    HeatingSource,
    MeasuringPoint,
    MeterType,
    Reading,
    User,
    UserRole,
)
from meters.services.consumption import (
    consumption_for_measuring_point,
    consumption_for_register,
)
from meters.services.meter_replacement import install_first_meter, replace_meter

_HEATING_OIL_REGISTERS = [
    RegisterDef("heat.0", "Betriebsstunden", "h"),
    RegisterDef("heat.1", "Tankstand", "L", accepts_deliveries=True),
]


def _ensure_user(db: Session) -> int:
    """Idempotenter Test-User. Reading.created_by_user_id ist NOT NULL,
    daher müssen unit tests einen User parat haben."""
    existing = db.query(User).filter_by(username="consumption-test").first()
    if existing is not None:
        return existing.id
    user = User(
        username="consumption-test",
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


def _make_point(db: Session) -> MeasuringPoint:
    user_id = _ensure_user(db)
    mp = MeasuringPoint(name="Test", type=MeterType.WATER)
    db.add(mp)
    db.flush()
    install_first_meter(
        db,
        measuring_point=mp,
        serial_number="W1",
        installed_at=date(2024, 1, 1),
        initial_values={"water": Decimal("100.0")},
        user_id=user_id,
        ip_address=None,
    )
    db.commit()
    db.refresh(mp)
    return mp


def test_consumption_simple_increase(db: Session) -> None:
    mp = _make_point(db)
    register = mp.physical_meters[0].registers[0]
    db.add(
        Reading(
            register_id=register.id,
            value=Decimal("110.0"),
            reading_at=datetime(2024, 2, 1),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.add(
        Reading(
            register_id=register.id,
            value=Decimal("125.0"),
            reading_at=datetime(2024, 3, 1),
            created_by_user_id=_ensure_user(db),
        )
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
        Reading(
            register_id=register.id,
            value=Decimal("190.0"),
            reading_at=datetime(2024, 2, 1),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.add(
        Reading(
            register_id=register.id,
            value=Decimal("10.0"),
            reading_at=datetime(2024, 3, 1),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.commit()
    db.refresh(register)

    points = consumption_for_register(register)
    # (200 - 190) + 10 = 20
    assert points[1].consumption == Decimal("20.0")


def test_consumption_aggregates_over_meter_replacement(db: Session) -> None:
    mp = _make_point(db)
    register = mp.physical_meters[0].registers[0]
    db.add(
        Reading(
            register_id=register.id,
            value=Decimal("150.0"),
            reading_at=datetime(2024, 6, 1),
            created_by_user_id=_ensure_user(db),
        )
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
        user_id=_ensure_user(db),
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
            created_by_user_id=_ensure_user(db),
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
        Reading(
            register_id=register.id,
            value=Decimal("180.0"),
            reading_at=datetime(2024, 6, 1),
            created_by_user_id=_ensure_user(db),
        )
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
        user_id=_ensure_user(db),
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
            created_by_user_id=_ensure_user(db),
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
        db.add(
            Reading(
                register_id=getattr(reg, "id"),
                value=Decimal(value),
                reading_at=at,
                created_by_user_id=_ensure_user(db),
            )
        )
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
        user_id=_ensure_user(db),
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
        user_id=_ensure_user(db),
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
        Reading(
            register_id=register.id,
            value=Decimal("950.0"),
            reading_at=datetime(2024, 2, 1),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.add(
        Reading(
            register_id=register.id,
            value=Decimal("50.0"),
            reading_at=datetime(2024, 3, 1),
            created_by_user_id=_ensure_user(db),
        )
    )
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
    db.add(
        Reading(
            register_id=register.id,
            value=Decimal("50.0"),
            reading_at=datetime(2024, 2, 1),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.add(
        Reading(
            register_id=register.id,
            value=Decimal("10.0"),
            reading_at=datetime(2024, 3, 1),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.commit()
    db.refresh(register)

    points = consumption_for_register(register)
    # Schritt 1: 100 → 50 (negativ, kein Rollover)
    # Schritt 2: 50 → 10 (negativ, kein Rollover)
    assert points[0].consumption == Decimal("-50.0")
    assert points[1].consumption == Decimal("-40.0")


def test_consumption_tank_register_skips_rollover_path(db: Session) -> None:
    """Audit 5.2: Heizöl-Tank (accepts_deliveries) folgt eigener Logik, nie Rollover."""
    mp = MeasuringPoint(name="Tank", type=MeterType.HEATING, heating_source=HeatingSource.OIL)
    db.add(mp)
    db.flush()
    install_first_meter(
        db,
        measuring_point=mp,
        serial_number="OIL-1",
        installed_at=date(2024, 1, 1),
        initial_values={"heat.0": Decimal("0"), "heat.1": Decimal("2000")},
        user_id=_ensure_user(db),
        ip_address=None,
        register_defs=_HEATING_OIL_REGISTERS,
    )
    db.commit()
    db.refresh(mp)

    tank_register = next(r for r in mp.physical_meters[0].registers if r.accepts_deliveries)
    # Stand sinkt von 2000 auf 1500 — bei normalem Register wäre das Rollover.
    db.add(
        Reading(
            register_id=tank_register.id,
            value=Decimal("1500"),
            reading_at=datetime(2024, 3, 1),
            created_by_user_id=_ensure_user(db),
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
        Reading(
            register_id=register.id,
            value=Decimal("110.0"),
            reading_at=datetime(2024, 2, 1),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.add(
        Reading(
            register_id=register.id,
            value=Decimal("125.0"),
            reading_at=datetime(2024, 3, 1),
            created_by_user_id=_ensure_user(db),
        )
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
        Reading(
            register_id=register.id,
            value=Decimal("110.0"),
            reading_at=datetime(2024, 2, 1),
            created_by_user_id=_ensure_user(db),
        )
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
        Reading(
            register_id=register.id,
            value=Decimal("190.0"),
            reading_at=datetime(2024, 2, 1),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.add(
        Reading(
            register_id=register.id,
            value=Decimal("10.0"),
            reading_at=datetime(2024, 3, 1),
            created_by_user_id=_ensure_user(db),
        )
    )
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
        user_id=_ensure_user(db),
        ip_address=None,
    )
    db.commit()
    db.refresh(mp)
    register = mp.physical_meters[0].registers[0]
    db.add(
        Reading(
            register_id=register.id,
            value=Decimal("105.0"),
            reading_at=datetime(2024, 2, 1),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.commit()

    points = consumption_for_measuring_point(db, measuring_point_id=mp.id)
    consumptions = [p.consumption for p in points]
    # 100 → 105 = 5 * 50 = 250
    assert Decimal("250") in consumptions


def test_oil_consumption_with_multiple_deliveries_in_period(db: Session) -> None:
    """Audit 5.7: Mehrere Lieferungen zwischen zwei Readings — alle werden summiert."""
    mp = MeasuringPoint(name="Tank2", type=MeterType.HEATING, heating_source=HeatingSource.OIL)
    db.add(mp)
    db.flush()
    install_first_meter(
        db,
        measuring_point=mp,
        serial_number="OIL-2",
        installed_at=date(2024, 1, 1),
        initial_values={"heat.0": Decimal("0"), "heat.1": Decimal("1000")},
        user_id=_ensure_user(db),
        ip_address=None,
        register_defs=_HEATING_OIL_REGISTERS,
    )
    db.commit()
    db.refresh(mp)

    tank = next(r for r in mp.physical_meters[0].registers if r.accepts_deliveries)
    # Zwei Lieferungen zwischen den beiden Readings
    db.add(
        Delivery(
            register_id=tank.id,
            delivery_at=datetime(2024, 2, 5, 12, 0, 0),
            amount=Decimal("400"),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.add(
        Delivery(
            register_id=tank.id,
            delivery_at=datetime(2024, 2, 20, 12, 0, 0),
            amount=Decimal("250"),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.add(
        Reading(
            register_id=tank.id,
            value=Decimal("1300"),
            reading_at=datetime(2024, 3, 1),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.commit()
    db.refresh(tank)

    points = consumption_for_register(tank)
    assert len(points) == 1
    # Verbrauch = 1000 + 400 + 250 - 1300 = 350
    assert points[0].consumption == Decimal("350")


def test_oil_consumption_same_day_reading_then_delivery_then_reading(db: Session) -> None:
    """Lieferung und Reading am selben Tag — Reihenfolge per Zeitstempel.

    Szenario: morgens Tankstand abgelesen, mittags Lieferung, abends erneut
    abgelesen. Mit nur Datum (ohne Zeit) wäre die Lieferung weder dem ersten
    noch dem zweiten Reading-Intervall zuzuordnen → falsche Bilanz.
    """
    mp = MeasuringPoint(name="Tank3", type=MeterType.HEATING, heating_source=HeatingSource.OIL)
    db.add(mp)
    db.flush()
    install_first_meter(
        db,
        measuring_point=mp,
        serial_number="OIL-3",
        installed_at=date(2024, 1, 1),
        initial_values={"heat.0": Decimal("0"), "heat.1": Decimal("800")},
        user_id=_ensure_user(db),
        ip_address=None,
        register_defs=_HEATING_OIL_REGISTERS,
    )
    db.commit()
    db.refresh(mp)

    tank = next(r for r in mp.physical_meters[0].registers if r.accepts_deliveries)
    # Initial = 800 am 2024-01-01 (Default-Zeit aus install_first_meter)
    # Tag 2024-02-15: morgens 700, mittags Lieferung 1500, abends 2050
    db.add(
        Reading(
            register_id=tank.id,
            value=Decimal("700"),
            reading_at=datetime(2024, 2, 15, 8, 0),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.add(
        Delivery(
            register_id=tank.id,
            delivery_at=datetime(2024, 2, 15, 12, 0),
            amount=Decimal("1500"),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.add(
        Reading(
            register_id=tank.id,
            value=Decimal("2050"),
            reading_at=datetime(2024, 2, 15, 18, 0),
            created_by_user_id=_ensure_user(db),
        )
    )
    db.commit()
    db.refresh(tank)

    points = consumption_for_register(tank)
    consumptions = [p.consumption for p in points]
    # Erstes Intervall (Initial 800 → 700, vor der Lieferung): Verbrauch 100.
    # Zweites Intervall (700 → 2050, mit Lieferung 1500 dazwischen):
    #   Verbrauch = 700 + 1500 - 2050 = 150.
    assert consumptions == [Decimal("100"), Decimal("150")]


# ---------------------------------------------------------------------------
# Production-Config Boot-Assertion (assert_secure_production_config)
# ---------------------------------------------------------------------------


def test_production_config_requires_cookie_secure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Boot-Assertion: debug=False + cookie_secure=False → RuntimeError."""
    from meters.core import config as cfg

    monkeypatch.setattr(cfg.settings, "debug", False)
    monkeypatch.setattr(cfg.settings, "cookie_secure", False)
    with pytest.raises(RuntimeError, match="COOKIE_SECURE"):
        cfg.assert_secure_production_config()


def test_production_config_warns_on_trust_proxy_off(
    monkeypatch: pytest.MonkeyPatch,
    recwarn: pytest.WarningsRecorder,
) -> None:
    """Boot-Assertion: debug=False + cookie_secure=True + trust_proxy=False →
    Warning (kein Boot-Abort, weil Edge-Case ohne Proxy theoretisch denkbar)."""
    from meters.core import config as cfg

    monkeypatch.setattr(cfg.settings, "debug", False)
    monkeypatch.setattr(cfg.settings, "cookie_secure", True)
    monkeypatch.setattr(cfg.settings, "trust_proxy", False)
    cfg.assert_secure_production_config()
    assert any("TRUST_PROXY" in str(w.message) for w in recwarn.list)


def test_dev_config_skips_assertion(monkeypatch: pytest.MonkeyPatch) -> None:
    """Im Dev-Mode (debug=True) sind cookie_secure/trust_proxy egal — keine
    Assertions, keine Warnings."""
    from meters.core import config as cfg

    monkeypatch.setattr(cfg.settings, "debug", True)
    monkeypatch.setattr(cfg.settings, "cookie_secure", False)
    monkeypatch.setattr(cfg.settings, "trust_proxy", False)
    cfg.assert_secure_production_config()
