"""Tests für den GUI-Restore eines Voll-Backups (Full-Replace).

Kernszenario ist der Roundtrip: Backup ziehen → Daten kaputt machen →
Backup einspielen → exakter Alt-Zustand inkl. Foto-Dateien, und der
ausführende Admin bleibt eingeloggt. Dazu Negativ-Pfade (ungültige
Archive, fremde Schema-Revisionen, Rollback bei Migrationsfehlern) und
das 503-Wartungs-Gate.

Die Test-DB entsteht per ``create_all`` (ohne ``alembic_version``) — für
Kompatibilitäts-Checks stempeln die Tests die Head-Revision selbst.
"""

from __future__ import annotations

import io
import sqlite3
import tempfile
import zipfile
from pathlib import Path
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select

from meters.core.config import settings
from meters.core.maintenance import restore_in_progress
from meters.db import SessionLocal, engine
from meters.models import AuditAction, AuditLog, Reading, ReadingPhoto
from meters.services.backup import head_revision

# ---------------------------------------------------------------- Helpers


def _stamp_alembic_head() -> None:
    """Head-Revision in die Live-Test-DB stempeln (create_all legt keine an)."""
    head = head_revision()
    assert head, "Migrationen müssen eine Head-Revision haben"
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS alembic_version "
            "(version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
        )
        conn.exec_driver_sql("DELETE FROM alembic_version")
        conn.exec_driver_sql("INSERT INTO alembic_version (version_num) VALUES (?)", (head,))


def _sqlite_bytes_with_revision(revision: str) -> bytes:
    """Minimale, valide SQLite-Datei, die nur ``alembic_version`` enthält."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        path = Path(tmp.name)
    try:
        con = sqlite3.connect(path)
        try:
            con.execute("CREATE TABLE alembic_version (version_num VARCHAR(32))")
            con.execute("INSERT INTO alembic_version VALUES (?)", (revision,))
            con.commit()
        finally:
            con.close()
        return path.read_bytes()
    finally:
        path.unlink(missing_ok=True)


def _zip_bytes(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    return buf.getvalue()


def _upload(client: TestClient, content: bytes, filename: str = "backup.zip") -> Any:
    return client.post(
        "/api/v1/restore/upload",
        files={"file": (filename, content, "application/zip")},
    )


def _create_mp_with_reading(client: TestClient) -> tuple[int, int]:
    """Wasser-MP + ein manuelles Reading; gibt (register_id, reading_id) zurück."""
    mp = client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Restore-MP",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "RST-W-1",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "10"},
        },
    ).json()
    register_id = cast(int, mp["physical_meters"][0]["registers"][0]["id"])
    reading = client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "42.5",
            "reading_at": "2024-06-01T08:00:00",
        },
    ).json()
    return register_id, cast(int, reading["id"])


# ---------------------------------------------------------------- Tests


def test_restore_roundtrip_restores_data_photos_and_session(
    admin_client: TestClient,
) -> None:
    register_id, reading_id = _create_mp_with_reading(admin_client)

    # Foto-Datei + DB-Zeile anlegen, damit das Backup beides enthält.
    # Vorher Reste anderer Foto-Tests entsorgen — das Medienverzeichnis ist
    # suite-weit geteilt und die Zähl-Assertions sollen deterministisch sein.
    photo_name = f"{reading_id}-roundtrip.jpg"
    photo_bytes = b"\xff\xd8\xff\xe0roundtrip-jpeg"
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    for leftover in settings.media_dir.glob("*.jpg"):
        leftover.unlink()
    (settings.media_dir / photo_name).write_bytes(photo_bytes)
    with SessionLocal() as db:
        db.add(ReadingPhoto(reading_id=reading_id, photo_path=photo_name, sort_index=0))
        db.commit()

    _stamp_alembic_head()
    backup = admin_client.get("/api/v1/export/backup.zip")
    assert backup.status_code == 200, backup.text

    # Daten "kaputt machen": zusätzliches Reading, Foto-Datei weg, Fremd-Datei rein.
    admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "99.9",
            "reading_at": "2024-07-01T08:00:00",
        },
    )
    (settings.media_dir / photo_name).unlink()
    (settings.media_dir / "fremdkoerper.jpg").write_bytes(b"sollte verschwinden")

    preview = _upload(admin_client, backup.content)
    assert preview.status_code == 200, preview.text
    data = preview.json()
    assert data["compatibility"] == "ok"
    assert data["counts"]["users"] == 1
    assert data["counts"]["measuring_points"] == 1
    assert data["counts"]["readings"] == 2  # Anfangsstand + manuelles Reading
    assert data["counts"]["photos_in_db"] == 1
    assert data["counts"]["photos_in_zip"] == 1

    commit = admin_client.post(f"/api/v1/restore/{data['token']}/commit")
    assert commit.status_code == 200, commit.text
    result = commit.json()
    assert result["relogin_required"] is False
    assert result["migrations_applied"] is False

    # Exakter Alt-Zustand: das nachträgliche Reading ist weg …
    with SessionLocal() as db:
        values = sorted(str(v) for v in db.scalars(select(Reading.value)).all())
        assert "99.9" not in values
        assert any(v.startswith("42.5") for v in values)
        # … und der Restore steht im (restaurierten) Audit-Log.
        audit_entry = db.scalar(
            select(AuditLog).where(AuditLog.action == AuditAction.RESTORE_PERFORMED)
        )
        assert audit_entry is not None

    # Foto byte-identisch zurück, Fremdkörper verschwunden.
    assert (settings.media_dir / photo_name).read_bytes() == photo_bytes
    assert not (settings.media_dir / "fremdkoerper.jpg").exists()

    # Gleicher Client bleibt eingeloggt (Session-Reinsert).
    me = admin_client.get("/api/v1/auth/me")
    assert me.status_code == 200, me.text
    assert me.json()["username"] == "admin"

    # Wartungs-Gate ist wieder offen.
    assert not restore_in_progress.is_set()


def test_restore_rejects_unknown_revision(admin_client: TestClient) -> None:
    """Backup von einer neueren App-Version → Vorschau warnt, Commit 409."""
    content = _zip_bytes({"meters.db": _sqlite_bytes_with_revision("zukunft123")})
    preview = _upload(admin_client, content)
    assert preview.status_code == 200, preview.text
    data = preview.json()
    assert data["compatibility"] == "unknown_revision"

    commit = admin_client.post(f"/api/v1/restore/{data['token']}/commit")
    assert commit.status_code == 409, commit.text
    assert "App-Version" in commit.json()["detail"]


def test_restore_rejects_non_zip_upload(admin_client: TestClient) -> None:
    resp = _upload(admin_client, b"kein zip", filename="backup.txt")
    assert resp.status_code == 400
    resp = _upload(admin_client, b"kein zip inhalt")
    assert resp.status_code == 400
    assert "ZIP" in resp.json()["title"]


def test_restore_rejects_zip_without_db(admin_client: TestClient) -> None:
    resp = _upload(admin_client, _zip_bytes({"manifest.json": b"{}"}))
    assert resp.status_code == 400
    assert "meters.db" in resp.json()["detail"]


def test_restore_rejects_garbage_db(admin_client: TestClient) -> None:
    resp = _upload(admin_client, _zip_bytes({"meters.db": b"das ist kein sqlite"}))
    assert resp.status_code == 400
    assert "SQLite" in resp.json()["detail"]


def test_restore_ignores_zip_slip_entries(admin_client: TestClient) -> None:
    """Pfad-Traversal-Einträge werden ignoriert und gemeldet, nie extrahiert."""
    head = head_revision()
    assert head
    content = _zip_bytes(
        {
            "meters.db": _sqlite_bytes_with_revision(head),
            "photos/../../evil.jpg": b"boese bytes",
        }
    )
    resp = _upload(admin_client, content)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert any("ignoriert" in w for w in data["warnings"])
    media_root = settings.media_dir.parent
    assert not (media_root / "evil.jpg").exists()
    assert not (media_root.parent / "evil.jpg").exists()
    # Aufräumen: Staging-Eintrag verwerfen.
    admin_client.delete(f"/api/v1/restore/{data['token']}")


def test_restore_forbidden_for_non_admin(recorder_client: TestClient) -> None:
    resp = _upload(recorder_client, b"egal")
    assert resp.status_code == 403
    assert recorder_client.post("/api/v1/restore/xyz/commit").status_code == 403
    assert recorder_client.delete("/api/v1/restore/xyz").status_code == 403


def test_restore_commit_unknown_token_404(admin_client: TestClient) -> None:
    resp = admin_client.post("/api/v1/restore/gibt-es-nicht/commit")
    assert resp.status_code == 404, resp.text


def _old_revision_db_bytes() -> bytes:
    """DB auf der Vorgänger-Revision von head bauen (Migrations-Pfad)."""
    from alembic import command
    from alembic.script import ScriptDirectory

    from meters.services.backup import alembic_config

    script = ScriptDirectory.from_config(alembic_config())
    head = script.get_current_head()
    assert head
    down = script.get_revision(head).down_revision
    assert isinstance(down, str), "head muss genau einen Vorgänger haben"

    tmpdir = Path(tempfile.mkdtemp(prefix="meters-restore-old-"))
    db_file = tmpdir / "old.db"
    eng = create_engine(f"sqlite:///{db_file}")
    try:
        cfg = alembic_config()
        with eng.begin() as conn:
            cfg.attributes["connection"] = conn
            command.upgrade(cfg, down)
        # Erst dispose: der App-weite Pragma-Hook schaltet auch diese DB in
        # den WAL-Modus — ohne Checkpoint (löst beim letzten Close aus) läge
        # der Inhalt noch im -wal-File und read_bytes() sähe eine leere DB.
        eng.dispose()
        return db_file.read_bytes()
    finally:
        eng.dispose()
        db_file.unlink(missing_ok=True)


def test_restore_migrates_old_backup_and_requires_relogin(
    admin_client: TestClient,
) -> None:
    """Backup einer älteren Version wird automatisch auf head migriert.

    Die alte DB enthält den eingeloggten Admin nicht → ``relogin_required``
    und Folge-Requests laufen in 401."""
    content = _zip_bytes({"meters.db": _old_revision_db_bytes()})
    preview = _upload(admin_client, content)
    assert preview.status_code == 200, preview.text
    data = preview.json()
    assert data["compatibility"] == "migration_needed"

    commit = admin_client.post(f"/api/v1/restore/{data['token']}/commit")
    assert commit.status_code == 200, commit.text
    result = commit.json()
    assert result["migrations_applied"] is True
    assert result["monthly_cache_recomputed"] is True
    assert result["relogin_required"] is True

    # Schema steht nach der Migration auf head.
    with engine.connect() as conn:
        version = conn.exec_driver_sql("SELECT version_num FROM alembic_version").scalar()
    assert version == head_revision()

    # Der Admin aus der alten Welt existiert nicht mehr → neu anmelden.
    assert admin_client.get("/api/v1/auth/me").status_code == 401
    assert not restore_in_progress.is_set()


def test_restore_failure_rolls_back_db_and_photos(
    admin_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Schlägt die Migration fehl, kommt der vorherige Stand zurück —
    inklusive Fotos und weiterhin gültiger Session."""
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    marker = settings.media_dir / "rollback-marker.jpg"
    marker.write_bytes(b"\xff\xd8marker")
    try:
        content = _zip_bytes({"meters.db": _old_revision_db_bytes()})
        preview = _upload(admin_client, content)
        assert preview.status_code == 200, preview.text
        token = preview.json()["token"]

        def _boom(*args: object, **kwargs: object) -> None:
            raise RuntimeError("Migration absichtlich kaputt")

        monkeypatch.setattr("meters.services.restore.command.upgrade", _boom)

        commit = admin_client.post(f"/api/v1/restore/{token}/commit")
        assert commit.status_code == 500, commit.text
        assert "wiederhergestellt" in commit.json()["detail"]

        # Alter Stand zurück: Session gültig, Foto-Datei wieder da, Gate offen.
        assert admin_client.get("/api/v1/auth/me").status_code == 200
        assert marker.read_bytes() == b"\xff\xd8marker"
        assert not restore_in_progress.is_set()
    finally:
        marker.unlink(missing_ok=True)


def test_requests_blocked_with_503_during_restore(admin_client: TestClient) -> None:
    restore_in_progress.set()
    try:
        resp = admin_client.get("/api/v1/measuring-points")
        assert resp.status_code == 503, resp.text
        assert resp.json()["title"] == "Wartung"
    finally:
        restore_in_progress.clear()
