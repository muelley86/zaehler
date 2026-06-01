"""Tests für die Bestands-Reparatur: Mitternachts-Readings → Vortag 23:59:59.

Läuft deterministisch über den METERS_TIMEZONE-Default (Europe/Berlin).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from meters.cli import main
from meters.models import (
    AuditAction,
    AuditEntityType,
    AuditLog,
    MeasuringPoint,
    MeterType,
    PhysicalMeter,
    Reading,
    Register,
    User,
    UserRole,
)
from meters.services.midnight_repair import repair_midnight_readings

# Lokal Berlin 2025-03-01 00:00 (Winter, +01:00) == naiv-UTC 2025-02-28 23:00:00.
LOCAL_MIDNIGHT_UTC = datetime(2025, 2, 28, 23, 0, 0)
SHIFTED_UTC = datetime(2025, 2, 28, 22, 59, 59)  # 2025-02-28 23:59:59 lokal


def _register(db: Session) -> Register:
    user = db.scalar(select(User).where(User.username == "mn-admin"))
    if user is None:
        user = User(
            username="mn-admin",
            password_hash="x",
            role=UserRole.ADMIN,
            is_active=True,
            force_password_change=False,
        )
        db.add(user)
        db.flush()
    mp = MeasuringPoint(name="MN MP", type=MeterType.ELECTRICITY)
    db.add(mp)
    db.flush()
    pm = PhysicalMeter(
        measuring_point_id=mp.id,
        serial_number="MN-1",
        installed_at=date(2024, 1, 1),
        initial_values={"1.8.0": "0"},
    )
    db.add(pm)
    db.flush()
    reg = Register(physical_meter_id=pm.id, obis_code="1.8.0", label="Bezug", unit="kWh")
    db.add(reg)
    db.flush()
    return reg


def _reading(db: Session, reg: Register, value: str, at: datetime) -> Reading:
    user = db.scalar(select(User).where(User.username == "mn-admin"))
    assert user is not None
    r = Reading(
        register_id=reg.id,
        value=Decimal(value),
        reading_at=at,
        created_by_user_id=user.id,
    )
    db.add(r)
    db.flush()
    return r


def test_dry_run_plans_but_changes_nothing(db: Session) -> None:
    reg = _register(db)
    r = _reading(db, reg, "100", LOCAL_MIDNIGHT_UTC)

    result = repair_midnight_readings(db, dry_run=True)

    assert result.affected == 1
    assert result.planned[0].after == SHIFTED_UTC
    assert result.applied == 0
    db.refresh(r)
    assert r.reading_at == LOCAL_MIDNIGHT_UTC
    assert db.scalar(select(AuditLog).limit(1)) is None


def test_apply_shifts_and_audits(db: Session) -> None:
    reg = _register(db)
    r = _reading(db, reg, "100", LOCAL_MIDNIGHT_UTC)

    result = repair_midnight_readings(db, dry_run=False)
    db.commit()

    assert result.applied == 1
    db.refresh(r)
    assert r.reading_at == SHIFTED_UTC
    log = db.scalar(
        select(AuditLog).where(
            AuditLog.action == AuditAction.UPDATE,
            AuditLog.entity_type == AuditEntityType.READING,
        )
    )
    assert log is not None and log.diff is not None and "reading_at" in log.diff


def test_non_midnight_reading_ignored(db: Session) -> None:
    reg = _register(db)
    noon = datetime(2025, 3, 1, 11, 0, 0)  # lokal 12:00
    _reading(db, reg, "50", noon)
    result = repair_midnight_readings(db, dry_run=True)
    assert result.affected == 0


def test_idempotent(db: Session) -> None:
    reg = _register(db)
    _reading(db, reg, "100", LOCAL_MIDNIGHT_UTC)
    first = repair_midnight_readings(db, dry_run=False)
    db.commit()
    assert first.applied == 1
    second = repair_midnight_readings(db, dry_run=False)
    db.commit()
    assert second.affected == 0


def test_collision_is_skipped(db: Session) -> None:
    reg = _register(db)
    marker = _reading(db, reg, "100", LOCAL_MIDNIGHT_UTC)
    blocker = _reading(db, reg, "99", SHIFTED_UTC)  # belegt bereits den Zielzeitpunkt

    result = repair_midnight_readings(db, dry_run=False)
    db.commit()

    assert result.affected == 1
    assert result.planned[0].collision is True
    assert result.applied == 0
    assert result.skipped_collisions == 1
    db.refresh(marker)
    db.refresh(blocker)
    assert marker.reading_at == LOCAL_MIDNIGHT_UTC
    assert blocker.reading_at == SHIFTED_UTC


def test_cli_dry_run_then_apply(db: Session, capsys: pytest.CaptureFixture[str]) -> None:
    reg = _register(db)
    r = _reading(db, reg, "100", LOCAL_MIDNIGHT_UTC)
    db.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32))"))
    db.commit()

    assert main(["repair-midnight-readings"]) == 0
    assert "DRY-RUN" in capsys.readouterr().out
    db.refresh(r)
    assert r.reading_at == LOCAL_MIDNIGHT_UTC

    assert main(["repair-midnight-readings", "--apply"]) == 0
    assert "Angewendet" in capsys.readouterr().out
    db.refresh(r)
    assert r.reading_at == SHIFTED_UTC
