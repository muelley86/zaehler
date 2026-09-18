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
from sqlalchemy import Engine, create_engine, event, text


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
            "user_measuring_point_access",
            "qr_token",
            "report_config",
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


def test_0035_verschiebt_faktor_ohne_datenverlust(fresh_engine: Engine) -> None:
    """Regression: Der Tabellen-Neuaufbau von ``measuring_point`` (drop_column im Batch) darf
    bei ``PRAGMA foreign_keys=ON`` (wie im Betrieb) keine ON-DELETE-CASCADE-Loeschung von
    Zaehlern, Registern und Ablesungen ausloesen. Am 17.09.2026 an einer Backup-Kopie
    aufgefallen: ohne Schutz waren danach alle Zaehler und Ablesungen weg."""
    event.listen(
        fresh_engine, "connect", lambda dbapi, _rec: dbapi.execute("PRAGMA foreign_keys=ON")
    )
    _upgrade(fresh_engine, "0034_virtual_mp_location")
    with fresh_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO measuring_point (id, name, type, is_bidirectional, has_dual_tariff, "
                "transformer_factor, created_at) VALUES "
                "(1, 'Wandler', 'ELECTRICITY', 0, 0, 80, datetime('now')), "
                "(2, 'Ohne', 'ELECTRICITY', 0, 0, NULL, datetime('now'))"
            )
        )
        conn.execute(
            text(
                "INSERT INTO physical_meter (id, measuring_point_id, serial_number, installed_at, "
                "removed_at, created_at) VALUES (1, 1, 'ALT', '2024-01-01', '2024-06-30', "
                "datetime('now')), (2, 1, 'NEU', '2024-06-30', NULL, datetime('now')), "
                "(3, 2, 'X', '2024-01-01', NULL, datetime('now'))"
            )
        )
    _upgrade(fresh_engine, "0035_transformer_factor_meter")
    with fresh_engine.connect() as conn:
        zaehler = conn.execute(
            text("SELECT id, transformer_factor FROM physical_meter ORDER BY id")
        ).all()
        assert [tuple(z) for z in zaehler] == [(1, 80), (2, 80), (3, None)]
        mp_spalten = [r[1] for r in conn.execute(text("PRAGMA table_info(measuring_point)"))]
        assert "transformer_factor" not in mp_spalten


def test_0035_downgrade_bricht_bei_abweichenden_faktoren_ab(fresh_engine: Engine) -> None:
    """Der Downgrade kann nur einen Faktor je Messstelle speichern. Haben Geraete einer Messstelle
    verschiedene Faktoren, wuerde ein erneutes Upgrade den aktiven Faktor auf alle Geraete kopieren
    und fruehere Monate falsch rechnen — deshalb Abbruch statt stillem Verlust."""
    _upgrade(fresh_engine, "0035_transformer_factor_meter")
    with fresh_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO measuring_point (id, name, type, is_bidirectional, has_dual_tariff, "
                "created_at) VALUES (1, 'Wandler', 'ELECTRICITY', 0, 0, datetime('now'))"
            )
        )
        conn.execute(
            text(
                "INSERT INTO physical_meter (id, measuring_point_id, serial_number, installed_at, "
                "removed_at, transformer_factor, created_at) VALUES "
                "(1, 1, 'ALT', '2024-01-01', '2024-06-30', 60, datetime('now')), "
                "(2, 1, 'NEU', '2024-06-30', NULL, 80, datetime('now'))"
            )
        )
    with pytest.raises(RuntimeError, match="Wandlerfaktor"):
        _downgrade(fresh_engine, "0034_virtual_mp_location")
    with fresh_engine.connect() as conn:
        zaehler = conn.execute(
            text("SELECT id, transformer_factor FROM physical_meter ORDER BY id")
        ).all()
        assert [tuple(z) for z in zaehler] == [(1, 60), (2, 80)]


def test_0036_uebernimmt_kostenstelle_ohne_datenverlust(fresh_engine: Engine) -> None:
    """Kostenstelle wird offene Periode ab erstem Einbau; mit ``foreign_keys=ON`` darf das
    Entfernen der MP-Spalte keine Kinddaten loeschen (vgl. 0035)."""
    event.listen(
        fresh_engine, "connect", lambda dbapi, _rec: dbapi.execute("PRAGMA foreign_keys=ON")
    )
    _upgrade(fresh_engine, "0035_transformer_factor_meter")
    with fresh_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO measuring_point (id, name, type, is_bidirectional, has_dual_tariff, "
                "kostenstelle, created_at) VALUES "
                "(1, 'Stall', 'ELECTRICITY', 0, 0, 10111, '2023-05-01 10:00:00'), "
                "(2, 'Ohne Zaehler', 'ELECTRICITY', 0, 0, 98860, '2023-06-02 10:00:00'), "
                "(3, 'Ohne KST', 'ELECTRICITY', 0, 0, NULL, '2023-06-02 10:00:00')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO physical_meter (id, measuring_point_id, serial_number, installed_at, "
                "removed_at, created_at) VALUES (1, 1, 'ALT', '2024-01-01', '2024-06-30', "
                "datetime('now')), (2, 1, 'NEU', '2024-06-30', NULL, datetime('now'))"
            )
        )
    _upgrade(fresh_engine, "0036_kostenstelle_assignment")
    with fresh_engine.connect() as conn:
        perioden = conn.execute(
            text(
                "SELECT measuring_point_id, kostenstelle, valid_from, valid_to "
                "FROM kostenstelle_assignment ORDER BY measuring_point_id"
            )
        ).all()
        assert [tuple(p) for p in perioden] == [
            (1, 10111, "2024-01-01", None),
            (2, 98860, "2023-06-02", None),
        ]
        assert conn.execute(text("SELECT COUNT(*) FROM physical_meter")).scalar_one() == 2
        mp_spalten = [r[1] for r in conn.execute(text("PRAGMA table_info(measuring_point)"))]
        assert "kostenstelle" not in mp_spalten

    # Downgrade ohne Historie: Wert zurueck an die Messstelle.
    _downgrade(fresh_engine, "0035_transformer_factor_meter")
    with fresh_engine.connect() as conn:
        werte = conn.execute(text("SELECT id, kostenstelle FROM measuring_point ORDER BY id")).all()
        assert [tuple(w) for w in werte] == [(1, 10111), (2, 98860), (3, None)]
        assert conn.execute(text("SELECT COUNT(*) FROM physical_meter")).scalar_one() == 2


def test_0036_downgrade_bricht_bei_historie_ab(fresh_engine: Engine) -> None:
    _upgrade(fresh_engine, "0036_kostenstelle_assignment")
    with fresh_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO measuring_point (id, name, type, is_bidirectional, has_dual_tariff, "
                "created_at) VALUES (1, 'Stall', 'ELECTRICITY', 0, 0, datetime('now'))"
            )
        )
        conn.execute(
            text(
                "INSERT INTO kostenstelle_assignment (measuring_point_id, kostenstelle, "
                "valid_from, valid_to, created_at) VALUES (1, 10111, '2024-01-01', '2026-09-01', "
                "datetime('now')), (1, 98860, '2026-09-01', NULL, datetime('now'))"
            )
        )
    with pytest.raises(RuntimeError, match="Kostenstellen-Historie"):
        _downgrade(fresh_engine, "0035_transformer_factor_meter")


def test_0037_owner_spalte_ohne_verlust_der_zuordnungen(fresh_engine: Engine) -> None:
    """``owner.internal_allocation`` per nativem ALTER TABLE: ein Neuaufbau der Owner-Tabelle
    wuerde bei ``foreign_keys=ON`` die Eigentuemer-Zuordnungen per SET NULL entkoppeln."""
    event.listen(
        fresh_engine, "connect", lambda dbapi, _rec: dbapi.execute("PRAGMA foreign_keys=ON")
    )
    _upgrade(fresh_engine, "0036_kostenstelle_assignment")
    with fresh_engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO measuring_point (id, name, type, is_bidirectional, has_dual_tariff, "
                "created_at) VALUES (1, 'Stall', 'ELECTRICITY', 0, 0, datetime('now'))"
            )
        )
        conn.execute(
            text("INSERT INTO owner (id, name, created_at) VALUES (7, 'Muster', datetime('now'))")
        )
        conn.execute(
            text(
                "INSERT INTO owner_assignment "
                "(measuring_point_id, owner_id, valid_from, created_at) "
                "VALUES (1, 7, '2024-01-01', datetime('now'))"
            )
        )
    _upgrade(fresh_engine, "0037_billing_circle")
    with fresh_engine.connect() as conn:
        assert conn.execute(text("SELECT owner_id FROM owner_assignment")).scalar_one() == 7
        assert conn.execute(text("SELECT internal_allocation FROM owner")).scalar_one() == 0
    _downgrade(fresh_engine, "0036_kostenstelle_assignment")
    with fresh_engine.connect() as conn:
        assert conn.execute(text("SELECT owner_id FROM owner_assignment")).scalar_one() == 7
        spalten = [r[1] for r in conn.execute(text("PRAGMA table_info(owner)"))]
        assert "internal_allocation" not in spalten


def test_0038_rechnungstabellen_hin_und_zurueck(fresh_engine: Engine) -> None:
    _upgrade(fresh_engine, "0038_billing_invoice")
    with fresh_engine.connect() as conn:
        tabellen = {
            r[0] for r in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        }
    assert {"billing_invoice", "billing_invoice_position", "billing_invoice_file"} <= tabellen
    _downgrade(fresh_engine, "0037_billing_circle")
    with fresh_engine.connect() as conn:
        rest = conn.execute(
            text("SELECT count(*) FROM sqlite_master WHERE name LIKE 'billing_invoice%'")
        ).scalar_one()
    assert rest == 0


def test_0039_abrechnungslauf_hin_und_zurueck(fresh_engine: Engine) -> None:
    _upgrade(fresh_engine, "0039_billing_run")
    with fresh_engine.connect() as conn:
        tabellen = {
            r[0] for r in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        }
        index = conn.execute(
            text("SELECT sql FROM sqlite_master WHERE name = 'uq_billing_run_entwurf'")
        ).scalar_one()
    assert {"billing_run", "billing_run_line"} <= tabellen
    assert "WHERE status = 'ENTWURF'" in index
    _downgrade(fresh_engine, "0038_billing_invoice")
    with fresh_engine.connect() as conn:
        rest = conn.execute(
            text("SELECT count(*) FROM sqlite_master WHERE name LIKE 'billing_run%'")
        ).scalar_one()
    assert rest == 0


def test_0040_uebertragung_hin_und_zurueck(fresh_engine: Engine) -> None:
    _upgrade(fresh_engine, "0040_billing_transfer")
    with fresh_engine.connect() as conn:
        spalten = [r[1] for r in conn.execute(text("PRAGMA table_info(billing_transfer)"))]
    assert {"run_id", "owner_name", "belegnummer", "transferred_at"} <= set(spalten)
    _downgrade(fresh_engine, "0039_billing_run")
    with fresh_engine.connect() as conn:
        rest = conn.execute(
            text("SELECT count(*) FROM sqlite_master WHERE name LIKE 'billing_transfer%'")
        ).scalar_one()
    assert rest == 0
