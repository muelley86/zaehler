"""End-to-End-Tests für Alembic-Migrationen.

Die übliche Test-Suite baut ihr Schema mit ``Base.metadata.create_all`` —
das deckt den Migration-Pfad **nicht** ab. Genau dort hat sich der
Heating-Uppercase-Bug versteckt (Migration 0011 matchte ``type='oil'``
statt ``type='OIL'``).

Diese Tests nutzen eine separate Datei-DB und reichen ihre Connection
über ``cfg.attributes["connection"]`` an Alembic durch — env.py prüft das
Attribut und nutzt die Connection statt eigene aus settings zu bauen.
"""

from __future__ import annotations

import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, text


@pytest.fixture
def fresh_engine() -> Iterator[Engine]:
    tmpdir = Path(tempfile.mkdtemp(prefix="meters-mig-"))
    db_file = tmpdir / "mig.db"
    eng = create_engine(f"sqlite:///{db_file}")
    yield eng
    eng.dispose()
    if db_file.exists():
        db_file.unlink()


def _alembic_cfg() -> Config:
    cfg_path = Path(__file__).resolve().parents[2] / "alembic.ini"
    return Config(str(cfg_path))


def _upgrade(eng: Engine, target: str) -> None:
    cfg = _alembic_cfg()
    with eng.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, target)


def _downgrade(eng: Engine, target: str) -> None:
    cfg = _alembic_cfg()
    with eng.begin() as conn:
        cfg.attributes["connection"] = conn
        command.downgrade(cfg, target)


def test_full_upgrade_to_head(fresh_engine: Engine) -> None:
    _upgrade(fresh_engine, "head")
    with fresh_engine.connect() as conn:
        version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        assert version is not None and version != ""
        for table in (
            "user",
            "session",
            "audit_log",
            "measuring_point",
            "physical_meter",
            "register",
            "reading",
            "delivery",
            "location",
        ):
            row = conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name=:n"),
                {"n": table},
            ).scalar()
            assert row == table, f"Tabelle {table} fehlt nach upgrade head"


def test_downgrade_to_base_and_back(fresh_engine: Engine) -> None:
    _upgrade(fresh_engine, "head")
    _downgrade(fresh_engine, "base")
    _upgrade(fresh_engine, "head")
    # Wenn das ohne Exception durchläuft, sind alle up()/down()-Pfade
    # syntaktisch und semantisch verträglich.


def test_uppercase_oil_is_migrated_to_heating(fresh_engine: Engine) -> None:
    """Regression: Migration 0012 muss type='OIL' (Enum-Name, wie SAEnum
    speichert) auf type='HEATING', heating_source='OIL' umstellen."""
    _upgrade(fresh_engine, "0011_heating_modular")
    with fresh_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO measuring_point "
                "(name, type, is_bidirectional, has_dual_tariff, created_at) "
                "VALUES ('Alt-Heizöl', 'OIL', 0, 0, datetime('now'))"
            )
        )
    _upgrade(fresh_engine, "0012_heating_uppercase_fix")
    with fresh_engine.connect() as conn:
        row = conn.execute(
            text("SELECT type, heating_source FROM measuring_point WHERE name='Alt-Heizöl'")
        ).first()
        assert row is not None
        assert row[0] == "HEATING", f"type sollte HEATING sein, ist {row[0]!r}"
        assert row[1] == "OIL", f"heating_source sollte OIL sein, ist {row[1]!r}"
