"""CLI ``seed-readings``: Dry-Run schreibt nichts, ``--apply`` legt markierte
Monatsstände 2025 an und füllt den Monats-Cache, ein zweiter Lauf ist
idempotent, ``--remove --apply`` entfernt exakt die Testdaten.
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
from meters.services.seed_readings import seed_note


def _admin(db: Session) -> User:
    user = User(
        username="admin",
        password_hash="x",
        role=UserRole.ADMIN,
        is_active=True,
        force_password_change=False,
    )
    db.add(user)
    db.flush()
    return user


def _register(db: Session) -> Register:
    mp = MeasuringPoint(name="Strom Halle", type=MeterType.ELECTRICITY)
    db.add(mp)
    db.flush()
    pm = PhysicalMeter(
        measuring_point_id=mp.id,
        serial_number="SN-1",
        installed_at=date(2026, 5, 1),
        initial_values={"1.8.0": "0"},
    )
    db.add(pm)
    db.flush()
    reg = Register(physical_meter_id=pm.id, obis_code="1.8.0", label="Bezug", unit="kWh")
    db.add(reg)
    db.flush()
    return reg


def _prepare(db: Session) -> tuple[Register, list[int]]:
    user = _admin(db)
    reg = _register(db)
    real = [
        Reading(
            register_id=reg.id,
            value=Decimal("5000"),
            reading_at=datetime(2026, 5, 31, 21, 59, 59),
            created_by_user_id=user.id,
        ),
        Reading(
            register_id=reg.id,
            value=Decimal("5300"),
            reading_at=datetime(2026, 6, 30, 21, 59, 59),
            created_by_user_id=user.id,
        ),
    ]
    db.add_all(real)
    # Der CLI-Schema-Guard verlangt eine migrierte DB (alembic_version-Tabelle).
    db.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32))"))
    db.commit()
    return reg, [r.id for r in real]


def _seeded(db: Session, reg: Register) -> list[Reading]:
    return list(
        db.scalars(
            select(Reading)
            .where(Reading.register_id == reg.id, Reading.note == seed_note(2025))
            .order_by(Reading.reading_at)
        )
    )


def _monthly_2025(db: Session, reg: Register) -> list[MonthlyConsumption]:
    return list(
        db.scalars(
            select(MonthlyConsumption).where(
                MonthlyConsumption.register_id == reg.id,
                MonthlyConsumption.period_start >= date(2025, 1, 1),
                MonthlyConsumption.period_start < date(2026, 1, 1),
            )
        )
    )


def test_dry_run_apply_idempotent_and_remove(
    db: Session, capsys: pytest.CaptureFixture[str]
) -> None:
    reg, real_ids = _prepare(db)

    assert main(["seed-readings", "--year", "2025"]) == 0
    out = capsys.readouterr().out
    assert "DRY-RUN: 13 Ablesungen" in out
    db.expire_all()
    assert _seeded(db, reg) == []

    assert main(["seed-readings", "--year", "2025", "--apply"]) == 0
    out = capsys.readouterr().out
    assert "Angewendet: 13 Ablesungen" in out
    assert "Snapshot vor dem Schreiben" in out
    db.expire_all()
    seeded = _seeded(db, reg)
    assert len(seeded) == 13
    values = [r.value for r in seeded]
    assert values == sorted(values)
    assert values[-1] < Decimal("5000")
    assert seeded[0].reading_at.year == 2024
    assert {r.reading_at.year for r in seeded[1:]} == {2025}
    monthly = _monthly_2025(db, reg)
    assert len(monthly) == 12
    assert all(m.consumption > 0 for m in monthly)

    # Zweiter Lauf: Stichtage belegt -> nichts Neues.
    assert main(["seed-readings", "--year", "2025", "--apply"]) == 0
    assert "0 Ablesungen" in capsys.readouterr().out
    db.expire_all()
    assert len(_seeded(db, reg)) == 13

    # Rückbau: Dry-Run zählt, --apply entfernt nur die Seeds.
    assert main(["seed-readings", "--year", "2025", "--remove"]) == 0
    assert "13 Ablesungen" in capsys.readouterr().out
    db.expire_all()
    assert len(_seeded(db, reg)) == 13
    assert main(["seed-readings", "--year", "2025", "--remove", "--apply"]) == 0
    assert "Entfernt: 13" in capsys.readouterr().out
    db.expire_all()
    assert _seeded(db, reg) == []
    remaining = list(db.scalars(select(Reading.id).where(Reading.register_id == reg.id)))
    assert sorted(remaining) == sorted(real_ids)
    assert _monthly_2025(db, reg) == []


def test_unknown_user_fails(db: Session, capsys: pytest.CaptureFixture[str]) -> None:
    _prepare(db)
    assert main(["seed-readings", "--year", "2025", "--user", "niemand"]) == 2
    assert "nicht gefunden" in capsys.readouterr().err
