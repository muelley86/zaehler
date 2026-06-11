"""Gemeinsame Helfer für Voll-Backup (ZIP) und Restore.

Hier liegt alles, was Export- und Restore-Pfad teilen: SQLite-Snapshot über
die Online-Backup-API, Integritäts-Checks, Alembic-Revisions-Auskunft und der
Aufbau des Backup-Archivs (``meters.db`` + ``manifest.json`` + ``photos/*``).
"""

from __future__ import annotations

import hashlib
import json
import logging
import sqlite3
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.util.exc import CommandError

from meters.core.config import REPO_ROOT, settings
from meters.schemas.backup import BackupManifest

logger = logging.getLogger(__name__)

# Magic-Bytes am Anfang jeder SQLite-Datei — billiger Vorab-Check, bevor wir
# eine hochgeladene Datei überhaupt öffnen.
SQLITE_MAGIC = b"SQLite format 3\x00"

# Dateinamen im Backup-Archiv (Format-Version siehe schemas.backup.BACKUP_FORMAT).
ARCHIVE_DB_NAME = "meters.db"
ARCHIVE_MANIFEST_NAME = "manifest.json"
ARCHIVE_PHOTO_PREFIX = "photos/"

_HASH_CHUNK_BYTES = 1024 * 1024


def snapshot_sqlite(src: Path, dest: Path) -> None:
    """Konsistenter Hot-Snapshot via SQLite-Online-Backup-API.

    WAL-sicher: parallele Schreiber der App bleiben unberührt; die Destination
    wird in einer Transaktion geschrieben (bei Fehler bleibt sie unverändert).
    """
    source = sqlite3.connect(str(src))
    try:
        target = sqlite3.connect(str(dest))
        try:
            source.backup(target)
        finally:
            target.close()
    finally:
        source.close()


def _connect_readonly(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def sqlite_integrity_ok(path: Path, *, quick: bool = False) -> bool:
    """``PRAGMA integrity_check`` (bzw. ``quick_check``) über eine read-only-
    Verbindung. ``True`` nur bei exakt ``ok``."""
    pragma = "quick_check" if quick else "integrity_check"
    try:
        conn = _connect_readonly(path)
        try:
            row = conn.execute(f"PRAGMA {pragma}").fetchone()
        finally:
            conn.close()
    except sqlite3.Error:
        logger.warning("Integritäts-Check fehlgeschlagen für %s", path, exc_info=True)
        return False
    return bool(row) and row[0] == "ok"


def read_alembic_revision(db_path: Path) -> str | None:
    """Liest ``alembic_version.version_num`` aus einer SQLite-Datei (read-only).

    ``None``, wenn Tabelle/Zeile fehlt — z. B. bei Test-DBs aus ``create_all``
    oder sehr alten Backups.
    """
    try:
        conn = _connect_readonly(db_path)
        try:
            row = conn.execute("SELECT version_num FROM alembic_version").fetchone()
        finally:
            conn.close()
    except sqlite3.Error:
        return None
    if row is None or not isinstance(row[0], str):
        return None
    return row[0]


def alembic_config() -> Config:
    """Alembic-Config mit absolutem ``script_location``.

    Die ``alembic.ini`` setzt ``script_location = alembic`` (cwd-relativ) —
    der Service läuft aber nicht zwingend mit cwd=backend, daher hier absolut
    überschreiben.
    """
    cfg = Config(str(REPO_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(REPO_ROOT / "alembic"))
    return cfg


def revision_known(revision: str) -> bool:
    """Kennt der installierte Migrationsstand diese Revision?

    ``False`` bedeutet: das Backup stammt von einer NEUEREN App-Version —
    einspielen wäre ein Downgrade mit unbekanntem Schema.
    """
    script = ScriptDirectory.from_config(alembic_config())
    try:
        script.get_revision(revision)
    except CommandError:
        return False
    return True


def head_revision() -> str | None:
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def app_version() -> str | None:
    """App-Version aus dem release-please-Manifest im Repo-Root (best-effort)."""
    manifest_path = REPO_ROOT.parent / ".release-please-manifest.json"
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    version = data.get(".") if isinstance(data, dict) else None
    return version if isinstance(version, str) else None


def _sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        while chunk := fh.read(_HASH_CHUNK_BYTES):
            digest.update(chunk)
    return digest.hexdigest()


def list_photo_files() -> list[Path]:
    """Alle Foto-Dateien im Medienverzeichnis (flach, nur ``*.jpg``).

    ``save_photo`` schreibt ausschließlich re-encodierte JPEGs — andere
    Dateien wären Fremdkörper und gehören nicht ins Backup.
    """
    media_dir = settings.media_dir
    if not media_dir.is_dir():
        return []
    return sorted(p for p in media_dir.glob("*.jpg") if p.is_file())


def build_backup_zip(db_path: Path, tmp_dir: Path) -> Path:
    """Baut das Voll-Backup-Archiv in ``tmp_dir`` und gibt den ZIP-Pfad zurück.

    Inhalt: ``meters.db`` (Snapshot), ``manifest.json``, ``photos/<name>.jpg``.
    DB + Manifest mit Deflate; Fotos als bereits komprimierte JPEGs nur
    gespeichert (``ZIP_STORED``) — spart CPU ohne Größennachteil.
    """
    snapshot = tmp_dir / ARCHIVE_DB_NAME
    snapshot_sqlite(db_path, snapshot)

    photos = list_photo_files()
    manifest = BackupManifest(
        app_version=app_version(),
        alembic_revision=read_alembic_revision(snapshot),
        created_at=datetime.now(UTC),
        photo_count=len(photos),
        db_sha256=_sha256_of(snapshot),
    )

    zip_path = tmp_dir / "backup.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.write(snapshot, ARCHIVE_DB_NAME, compress_type=zipfile.ZIP_DEFLATED)
        archive.writestr(
            ARCHIVE_MANIFEST_NAME,
            manifest.model_dump_json(indent=2),
            compress_type=zipfile.ZIP_DEFLATED,
        )
        for photo in photos:
            archive.write(
                photo,
                f"{ARCHIVE_PHOTO_PREFIX}{photo.name}",
                compress_type=zipfile.ZIP_STORED,
            )
    # Snapshot ist jetzt im Archiv — löschen halbiert den Peak-Diskbedarf.
    snapshot.unlink(missing_ok=True)
    return zip_path
