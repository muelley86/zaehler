"""Tests fuer die Altdaten-Reparatur der synthetischen Readings.

Vor Fix #148 (``_local_combine``) wurden ``Anfangsstand`` (00:00:01) und
``Endstand vor Tausch`` (23:59:00) als *naive UTC* gespeichert. In einem
Europe/Berlin-Browser erscheinen sie dadurch um den (DST-abhaengigen)
Berlin-Offset zu spaet. Die Reparatur interpretiert den gespeicherten Wert
als lokale Wand-Zeit und schreibt den korrekten UTC-Wert zurueck — exakt
das, was ``_local_combine`` fuer neue Readings tut.
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
from meters.services.legacy_timestamp_repair import repair_legacy_timestamps


def _register(db: Session) -> Register:
    """Minimale MeasuringPoint -> PhysicalMeter -> Register-Kette."""
    user = db.scalar(select(User).where(User.username == "rep-admin"))
    if user is None:
        user = User(
            username="rep-admin",
            password_hash="x",
            role=UserRole.ADMIN,
            is_active=True,
            force_password_change=False,
        )
        db.add(user)
        db.flush()
    mp = MeasuringPoint(name="Repair MP", type=MeterType.ELECTRICITY)
    db.add(mp)
    db.flush()
    pm = PhysicalMeter(
        measuring_point_id=mp.id,
        serial_number="REP-1",
        installed_at=date(2024, 1, 1),
        initial_values={"1.8.0": "0"},
    )
    db.add(pm)
    db.flush()
    reg = Register(physical_meter_id=pm.id, obis_code="1.8.0", label="Bezug", unit="kWh")
    db.add(reg)
    db.flush()
    return reg


def _reading(db: Session, reg: Register, value: str, at: datetime, note: str) -> Reading:
    user = db.scalar(select(User).where(User.username == "rep-admin"))
    assert user is not None
    r = Reading(
        register_id=reg.id,
        value=Decimal(value),
        reading_at=at,
        note=note,
        created_by_user_id=user.id,
    )
    db.add(r)
    db.flush()
    return r


def test_dry_run_plans_but_does_not_change(db: Session) -> None:
    reg = _register(db)
    # Winter: lokale Mitternacht 01.01.2025 wurde naiv als UTC 00:00:01 abgelegt.
    r = _reading(db, reg, "10", datetime(2025, 1, 1, 0, 0, 1), "Anfangsstand")

    result = repair_legacy_timestamps(db, dry_run=True)

    assert result.dry_run is True
    assert result.affected == 1
    fix = result.planned[0]
    assert fix.reading_id == r.id
    # Korrekt: lokale Wand-Zeit 00:00:01 Berlin -> UTC 23:00:01 am Vortag (CET).
    assert fix.after == datetime(2024, 12, 31, 23, 0, 1)
    assert fix.collision is False
    assert result.applied == 0
    # DB unveraendert.
    db.refresh(r)
    assert r.reading_at == datetime(2025, 1, 1, 0, 0, 1)
    # Kein Audit-Eintrag im Dry-Run.
    assert db.scalar(select(AuditLog).limit(1)) is None


def test_apply_corrects_winter_and_summer(db: Session) -> None:
    reg = _register(db)
    winter = _reading(db, reg, "10", datetime(2025, 1, 1, 0, 0, 1), "Anfangsstand")
    # Sommer (CEST = UTC+2): Endstand 23:59:00 lokal -> UTC 21:59:00.
    summer = _reading(db, reg, "20", datetime(2025, 6, 15, 23, 59, 0), "Endstand vor Tausch")

    result = repair_legacy_timestamps(db, dry_run=False)
    db.commit()

    assert result.applied == 2
    assert result.skipped_collisions == 0
    db.refresh(winter)
    db.refresh(summer)
    assert winter.reading_at == datetime(2024, 12, 31, 23, 0, 1)
    assert summer.reading_at == datetime(2025, 6, 15, 21, 59, 0)
    # Audit pro korrigierter Zeile, mit Vorher/Nachher.
    logs = list(
        db.scalars(
            select(AuditLog).where(
                AuditLog.action == AuditAction.UPDATE,
                AuditLog.entity_type == AuditEntityType.READING,
            )
        )
    )
    assert len(logs) == 2
    assert all(log.diff is not None and "reading_at" in log.diff for log in logs)


def test_already_corrected_rows_are_ignored(db: Session) -> None:
    reg = _register(db)
    # Bereits korrekt (nach Fix gespeichert: 23:00:01 UTC) -> nicht antasten.
    good = _reading(db, reg, "10", datetime(2024, 12, 31, 23, 0, 1), "Anfangsstand")

    result = repair_legacy_timestamps(db, dry_run=True)

    assert result.affected == 0
    db.refresh(good)
    assert good.reading_at == datetime(2024, 12, 31, 23, 0, 1)


def test_idempotent_second_run_is_noop(db: Session) -> None:
    reg = _register(db)
    _reading(db, reg, "10", datetime(2025, 1, 1, 0, 0, 1), "Anfangsstand")

    first = repair_legacy_timestamps(db, dry_run=False)
    db.commit()
    assert first.applied == 1

    second = repair_legacy_timestamps(db, dry_run=False)
    db.commit()
    assert second.affected == 0
    assert second.applied == 0


def test_collision_is_reported_and_skipped(db: Session) -> None:
    reg = _register(db)
    marker = _reading(db, reg, "10", datetime(2025, 1, 1, 0, 0, 1), "Anfangsstand")
    # Es existiert bereits ein Reading am korrigierten Zeitpunkt (23:00:01 Vortag).
    blocker = _reading(db, reg, "9", datetime(2024, 12, 31, 23, 0, 1), "echte Erfassung")

    result = repair_legacy_timestamps(db, dry_run=False)
    db.commit()

    assert result.affected == 1
    assert result.planned[0].collision is True
    assert result.applied == 0
    assert result.skipped_collisions == 1
    # Beide Zeilen unveraendert (kein Constraint-Bruch, kein Datenverlust).
    db.refresh(marker)
    db.refresh(blocker)
    assert marker.reading_at == datetime(2025, 1, 1, 0, 0, 1)
    assert blocker.reading_at == datetime(2024, 12, 31, 23, 0, 1)


def test_cli_dry_run_changes_nothing_then_apply_writes(
    db: Session, capsys: pytest.CaptureFixture[str]
) -> None:
    reg = _register(db)
    r = _reading(db, reg, "10", datetime(2025, 1, 1, 0, 0, 1), "Anfangsstand")
    # Der CLI-Schema-Guard verlangt eine migrierte DB (alembic_version-Tabelle);
    # die Test-DB nutzt create_all -> hier nachstellen.
    db.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32))"))
    db.commit()  # Die CLI oeffnet eine eigene SessionLocal -> committen.

    # Dry-Run: Exit 0, DB unveraendert.
    assert main(["repair-legacy-timestamps"]) == 0
    assert "DRY-RUN" in capsys.readouterr().out
    db.refresh(r)
    assert r.reading_at == datetime(2025, 1, 1, 0, 0, 1)

    # --apply: Exit 0, DB korrigiert.
    assert main(["repair-legacy-timestamps", "--apply"]) == 0
    assert "Angewendet" in capsys.readouterr().out
    db.refresh(r)
    assert r.reading_at == datetime(2024, 12, 31, 23, 0, 1)
