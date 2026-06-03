"""Test für den CLI-Befehl ``relabel-register-unit``: benennt die Einheit
passender Register um (z. B. kWh→MWh bei versehentlich falsch angelegten
Wärmemengenzählern), OHNE die gespeicherten Werte zu ändern, und frischt den
denormalisierten ``unit`` im Monats-Cache nach.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from meters.cli import main
from meters.models import (
    MeasuringPoint,
    MeterType,
    PhysicalMeter,
    Reading,
    Register,
    User,
    UserRole,
)
from meters.models.monthly_consumption import MonthlyConsumption


def _admin(db: Session) -> User:
    user = db.scalar(select(User).where(User.username == "unit-admin"))
    if user is None:
        user = User(
            username="unit-admin",
            password_hash="x",
            role=UserRole.ADMIN,
            is_active=True,
            force_password_change=False,
        )
        db.add(user)
        db.flush()
    return user


def _register(
    db: Session, *, name: str, mp_type: MeterType, obis: str, label: str, unit: str
) -> Register:
    mp = MeasuringPoint(name=name, type=mp_type)
    db.add(mp)
    db.flush()
    pm = PhysicalMeter(
        measuring_point_id=mp.id,
        serial_number=f"{name}-1",
        installed_at=date(2024, 1, 1),
        initial_values={obis: "0"},
    )
    db.add(pm)
    db.flush()
    reg = Register(physical_meter_id=pm.id, obis_code=obis, label=label, unit=unit)
    db.add(reg)
    db.flush()
    return reg


def _reading(db: Session, reg: Register, value: str, at: datetime) -> Reading:
    user = _admin(db)
    r = Reading(register_id=reg.id, value=Decimal(value), reading_at=at, created_by_user_id=user.id)
    db.add(r)
    db.flush()
    return r


def test_relabel_dry_run_then_apply(db: Session, capsys: pytest.CaptureFixture[str]) -> None:
    heat = _register(
        db, name="Heiz MP", mp_type=MeterType.HEATING, obis="heat.0", label="Wärmemenge", unit="kWh"
    )
    strom = _register(
        db, name="Strom MP", mp_type=MeterType.ELECTRICITY, obis="1.8.0", label="Bezug", unit="kWh"
    )
    r1 = _reading(db, heat, "10", datetime(2025, 1, 1, 12, 0, 0))
    r2 = _reading(db, heat, "12", datetime(2025, 2, 1, 12, 0, 0))
    # Der CLI-Schema-Guard verlangt eine migrierte DB (alembic_version-Tabelle);
    # die Test-DB nutzt create_all -> hier nachstellen.
    db.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32))"))
    db.commit()  # Die CLI öffnet eine eigene SessionLocal -> committen.

    cmd = ["relabel-register-unit", "--type", "heating", "--from", "kWh", "--to", "MWh"]

    # Dry-Run: Exit 0, nichts geändert.
    assert main(cmd) == 0
    assert "DRY-RUN" in capsys.readouterr().out
    db.refresh(heat)
    assert heat.unit == "kWh"

    # --apply: Exit 0, Heizungs-Register umbenannt, Werte unverändert.
    assert main([*cmd, "--apply"]) == 0
    assert "Angewendet" in capsys.readouterr().out
    db.expire_all()
    db.refresh(heat)
    db.refresh(strom)
    db.refresh(r1)
    db.refresh(r2)
    assert heat.unit == "MWh"
    assert r1.value == Decimal("10")
    assert r2.value == Decimal("12")
    # Strom-kWh-Register wurde NICHT angefasst (Typ-Filter).
    assert strom.unit == "kWh"
    # Monats-Cache der betroffenen Register zeigt die neue Einheit.
    monthly = list(
        db.scalars(select(MonthlyConsumption).where(MonthlyConsumption.register_id == heat.id))
    )
    assert len(monthly) >= 1
    assert all(m.unit == "MWh" for m in monthly)
