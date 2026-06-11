"""GUI-Restore eines Voll-Backups (ZIP) — Full-Replace mit Rollback.

Zwei Phasen, damit das (potenziell hunderte MB große) Archiv nur einmal
hochgeladen wird:

1. ``stage_upload``: validiert das ZIP vollständig (Struktur, SQLite-Magic,
   ``integrity_check``, Alembic-Revision), entpackt es in ein Staging-
   Verzeichnis NEBEN ``media_dir`` (gleiches Filesystem → atomare Renames)
   und liefert eine Vorschau samt Token.
2. ``perform_restore``: tauscht Fotos und Datenbank gegen den Backup-Stand.
   Vorher entsteht eine Sicherheitskopie der Live-DB; jeder Fehlschritt
   rollt vollständig auf den vorherigen Zustand zurück.

Die App läuft als ein einzelner uvicorn-Prozess — eine In-Memory-Registry
für die Staging-Tokens genügt.
"""

from __future__ import annotations

import logging
import os
import secrets
import shutil
import sqlite3
import threading
import time
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import BinaryIO

from alembic import command
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.pool import QueuePool

from meters.core.config import settings
from meters.core.maintenance import restore_in_progress, restore_lock
from meters.core.problem import ProblemError
from meters.db import SessionLocal, engine
from meters.models import AuditAction, AuditEntityType, Session, User, UserRole
from meters.schemas.backup import (
    BackupManifest,
    RestoreCommitResponse,
    RestoreCounts,
    RestorePreviewResponse,
)
from meters.services import audit
from meters.services.backup import (
    ARCHIVE_DB_NAME,
    ARCHIVE_MANIFEST_NAME,
    ARCHIVE_PHOTO_PREFIX,
    SQLITE_MAGIC,
    alembic_config,
    head_revision,
    read_alembic_revision,
    revision_known,
    snapshot_sqlite,
    sqlite_integrity_ok,
)

logger = logging.getLogger(__name__)

STAGE_TTL = timedelta(minutes=30)

_COPY_CHUNK_BYTES = 1024 * 1024

# Warte-Budget, bis laufende Requests ihre Pool-Connections zurückgegeben
# haben, bevor die DB getauscht wird. Danach geht es trotzdem weiter — der
# Backup-API-Swap ist eine normale Schreib-Transaktion und respektiert
# busy_timeout.
_POOL_DRAIN_TIMEOUT_S = 5.0
_POOL_DRAIN_POLL_S = 0.1


@dataclass(frozen=True)
class SessionKeepInfo:
    """Daten der laufenden Admin-Session, die den Restore überleben soll.

    Wird VOR dem DB-Swap aus dem ORM-Objekt materialisiert — danach darf
    nichts mehr lazy nachladen.
    """

    username: str
    token_hash: str
    expires_at: datetime
    user_agent: str | None
    ip_address: str | None


@dataclass(frozen=True)
class StagedRestore:
    token: str
    dir: Path
    preview: RestorePreviewResponse
    created_at: datetime


_staged: dict[str, StagedRestore] = {}
_staged_lock = threading.Lock()


def _staging_root() -> Path:
    """Staging neben dem Foto-Verzeichnis — garantiert gleiches Filesystem,
    damit die Verzeichnis-Swaps reine Renames sind."""
    return settings.media_dir.parent / "restore-tmp"


def _now() -> datetime:
    return datetime.now(UTC)


def _cleanup_expired() -> None:
    """Abgelaufene Staging-Einträge + verwaiste Verzeichnisse entsorgen."""
    cutoff = _now() - STAGE_TTL
    with _staged_lock:
        expired = [s for s in _staged.values() if s.created_at < cutoff]
        for entry in expired:
            del _staged[entry.token]
        known_dirs = {s.dir for s in _staged.values()}
    for entry in expired:
        shutil.rmtree(entry.dir, ignore_errors=True)
    root = _staging_root()
    if root.is_dir():
        for orphan in root.iterdir():
            if orphan not in known_dirs:
                shutil.rmtree(orphan, ignore_errors=True)


def _valid_photo_basename(name: str) -> bool:
    """Gleiche Regeln wie ``reading_photo.photo_full_path``: kein Pfad-Anteil."""
    return bool(name) and not ("/" in name or "\\" in name or ".." in name)


def _copy_limited(src: BinaryIO, dest_path: Path, *, limit: int) -> int:
    """Upload chunked auf Platte schreiben, mit laufender Größenprüfung."""
    total = 0
    with open(dest_path, "wb") as dest:
        while chunk := src.read(_COPY_CHUNK_BYTES):
            total += len(chunk)
            if total > limit:
                raise ProblemError(
                    status_code=413,
                    title="Datei zu groß",
                    detail=(
                        f"Das Backup überschreitet das Upload-Limit von "
                        f"{limit // (1024 * 1024)} MB."
                    ),
                )
            dest.write(chunk)
    return total


def _count_rows(conn: sqlite3.Connection, table: str) -> int | None:
    """Zeilen zählen; ``None`` wenn die Tabelle fehlt (sehr altes Backup)."""
    try:
        row = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()
    except sqlite3.Error:
        return None
    return int(row[0]) if row else None


def _extract_archive(archive: zipfile.ZipFile, staging: Path, warnings: list[str]) -> int:
    """Whitelist-Extraktion ohne ``extractall`` (Zip-Slip-sicher).

    Gibt die Anzahl extrahierter Fotos zurück. Zielpfade werden ausschließlich
    selbst konstruiert; unerwartete Einträge werden ignoriert und gemeldet.
    """
    photos_dir = staging / "photos"
    photos_dir.mkdir()
    photo_count = 0
    db_found = False
    for member in archive.infolist():
        name = member.filename
        if name.endswith("/"):
            continue  # Verzeichnis-Einträge
        if name == ARCHIVE_DB_NAME:
            target = staging / "snapshot.db"
            db_found = True
        elif name == ARCHIVE_MANIFEST_NAME:
            target = staging / "manifest.json"
        elif name.startswith(ARCHIVE_PHOTO_PREFIX):
            basename = name[len(ARCHIVE_PHOTO_PREFIX) :]
            if not _valid_photo_basename(basename) or not basename.endswith(".jpg"):
                warnings.append(f"Unerwartete Datei im Archiv ignoriert: {name}")
                continue
            target = photos_dir / basename
            photo_count += 1
        else:
            warnings.append(f"Unerwartete Datei im Archiv ignoriert: {name}")
            continue
        with archive.open(member) as src, open(target, "wb") as dest:
            shutil.copyfileobj(src, dest, _COPY_CHUNK_BYTES)
    if not db_found:
        raise ProblemError(
            status_code=400,
            title="Backup unvollständig",
            detail="Im Archiv fehlt die Datenbank-Datei meters.db.",
        )
    return photo_count


def _read_manifest(staging: Path, warnings: list[str]) -> BackupManifest | None:
    manifest_path = staging / "manifest.json"
    if not manifest_path.is_file():
        warnings.append("Das Archiv enthält keine manifest.json — Metadaten unbekannt.")
        return None
    try:
        return BackupManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        warnings.append("manifest.json ist nicht lesbar — Metadaten unbekannt.")
        return None


def stage_upload(upload: UploadFile) -> RestorePreviewResponse:
    """Backup-ZIP validieren, entpacken und für den Commit vormerken."""
    _cleanup_expired()

    filename = upload.filename or ""
    if not filename.lower().endswith(".zip"):
        raise ProblemError(
            status_code=400,
            title="Nicht unterstütztes Format",
            detail="Es wird eine .zip-Backup-Datei erwartet (Admin ▸ System ▸ Backup).",
        )

    token = secrets.token_urlsafe(16)
    staging = _staging_root() / f"restore-{token}"
    staging.mkdir(parents=True, exist_ok=False)
    try:
        return _stage_into(upload, token, staging)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def _stage_into(upload: UploadFile, token: str, staging: Path) -> RestorePreviewResponse:
    zip_path = staging / "upload.zip"
    _copy_limited(upload.file, zip_path, limit=settings.backup_max_upload_bytes)

    if not zipfile.is_zipfile(zip_path):
        raise ProblemError(
            status_code=400,
            title="Keine gültige ZIP-Datei",
            detail="Die hochgeladene Datei ist kein lesbares ZIP-Archiv.",
        )

    warnings: list[str] = []
    with zipfile.ZipFile(zip_path) as archive:
        photos_in_zip = _extract_archive(archive, staging, warnings)
    zip_path.unlink(missing_ok=True)  # entpackt — Platz freigeben

    snapshot = staging / "snapshot.db"
    with open(snapshot, "rb") as fh:
        if fh.read(len(SQLITE_MAGIC)) != SQLITE_MAGIC:
            raise ProblemError(
                status_code=400,
                title="Ungültige Datenbank im Archiv",
                detail="meters.db im Archiv ist keine SQLite-Datenbank.",
            )
    if not sqlite_integrity_ok(snapshot):
        raise ProblemError(
            status_code=400,
            title="Datenbank im Archiv ist beschädigt",
            detail="Der Integritäts-Check (PRAGMA integrity_check) ist fehlgeschlagen.",
        )

    manifest = _read_manifest(staging, warnings)
    db_revision = read_alembic_revision(snapshot)
    if (
        manifest is not None
        and manifest.alembic_revision is not None
        and db_revision is not None
        and manifest.alembic_revision != db_revision
    ):
        warnings.append(
            "Manifest und Datenbank nennen unterschiedliche Schema-Revisionen — "
            "es gilt die Datenbank."
        )

    counts = RestoreCounts(photos_in_zip=photos_in_zip)
    conn = sqlite3.connect(f"file:{snapshot}?mode=ro", uri=True)
    try:
        for field, table in (
            ("users", "user"),
            ("measuring_points", "measuring_point"),
            ("readings", "reading"),
            ("photos_in_db", "reading_photo"),
        ):
            value = _count_rows(conn, table)
            if value is None:
                warnings.append(f"Tabelle „{table}“ fehlt im Backup (sehr alter Stand?).")
                value = 0
            counts = counts.model_copy(update={field: value})
    finally:
        conn.close()

    if counts.photos_in_db != photos_in_zip:
        warnings.append(
            f"Das Backup referenziert {counts.photos_in_db} Fotos, "
            f"enthält aber {photos_in_zip} Foto-Dateien."
        )

    head = head_revision()
    compatibility: str
    if db_revision is None or not revision_known(db_revision):
        compatibility = "unknown_revision"
        warnings.append(
            "Die Schema-Revision des Backups ist dieser App-Version unbekannt. "
            "Stammt es von einer neueren Version, bitte zuerst die App aktualisieren."
        )
    elif head is not None and db_revision != head:
        compatibility = "migration_needed"
        warnings.append(
            "Das Backup stammt von einer älteren App-Version — die Datenbank wird "
            "nach dem Einspielen automatisch aktualisiert."
        )
    else:
        compatibility = "ok"

    backup_age_days: int | None = None
    if manifest is not None:
        age = _now() - manifest.created_at
        backup_age_days = max(age.days, 0)
        if backup_age_days >= 1:
            warnings.append(f"Das Backup ist {backup_age_days} Tag(e) alt.")

    created_at = _now()
    preview = RestorePreviewResponse(
        token=token,
        expires_at=created_at + STAGE_TTL,
        manifest=manifest,
        db_alembic_revision=db_revision,
        counts=counts,
        compatibility=compatibility,  # type: ignore[arg-type]
        backup_age_days=backup_age_days,
        warnings=warnings,
    )
    with _staged_lock:
        _staged[token] = StagedRestore(
            token=token, dir=staging, preview=preview, created_at=created_at
        )
    return preview


def discard(token: str) -> bool:
    """Staging-Eintrag verwerfen (Abbrechen im Frontend). True = existierte."""
    with _staged_lock:
        entry = _staged.pop(token, None)
    if entry is None:
        return False
    shutil.rmtree(entry.dir, ignore_errors=True)
    return True


def _take_staged(token: str) -> StagedRestore:
    _cleanup_expired()
    with _staged_lock:
        entry = _staged.get(token)
    if entry is None or not (entry.dir / "snapshot.db").is_file():
        raise ProblemError(
            status_code=404,
            title="Upload nicht (mehr) gefunden",
            detail="Die Vorschau ist abgelaufen — bitte das Backup erneut hochladen.",
        )
    return entry


def _drain_pool() -> None:
    """Laufenden Requests kurz Zeit geben, ihre Connections zurückzugeben,
    dann den Pool schließen. Nach Timeout geht es trotzdem weiter — der
    DB-Swap ist eine normale Schreib-Transaktion und respektiert busy_timeout.

    Wichtig: erst auf den ALTEN Pool warten, dann ``dispose()`` — dispose
    ersetzt den Pool, ein danach befragter (frischer) Pool wäre immer leer.
    """
    pool = engine.pool
    if isinstance(pool, QueuePool):
        deadline = time.monotonic() + _POOL_DRAIN_TIMEOUT_S
        while pool.checkedout() > 0 and time.monotonic() < deadline:
            time.sleep(_POOL_DRAIN_POLL_S)
    engine.dispose()


def _swap_photos(staged_photos: Path, bak_dir: Path) -> bool:
    """Foto-Verzeichnis durch den Backup-Stand ersetzen (reine Renames).

    Gibt zurück, ob ein altes Verzeichnis nach ``bak_dir`` gesichert wurde.
    """
    media_dir = settings.media_dir
    media_dir.parent.mkdir(parents=True, exist_ok=True)
    had_old = media_dir.is_dir()
    if had_old:
        os.rename(media_dir, bak_dir)
    try:
        os.rename(staged_photos, media_dir)
    except OSError:
        if had_old:
            os.rename(bak_dir, media_dir)
        raise
    return had_old


def _rollback_photos(staged_photos: Path, bak_dir: Path, had_old: bool) -> None:
    media_dir = settings.media_dir
    try:
        if media_dir.is_dir():
            os.rename(media_dir, staged_photos)
        if had_old:
            os.rename(bak_dir, media_dir)
    except OSError:
        logger.exception("Foto-Rollback fehlgeschlagen — manueller Eingriff nötig.")


def _restore_failed(detail: str) -> ProblemError:
    return ProblemError(status_code=500, title="Wiederherstellung fehlgeschlagen", detail=detail)


def perform_restore(
    token: str, *, session_keep: SessionKeepInfo, ip: str | None
) -> RestoreCommitResponse:
    """Full-Replace: Live-DB und Fotos durch den Staging-Stand ersetzen.

    Reihenfolge und Rollback-Pfade siehe Schritt-Kommentare. Grundsatz:
    Vor jedem destruktiven Schritt existiert eine Rückfall-Kopie; erst nach
    erfolgreichem Abschluss wird aufgeräumt.
    """
    if not restore_lock.acquire(blocking=False):
        raise ProblemError(
            status_code=409,
            title="Wiederherstellung läuft bereits",
            detail="Es kann nur eine Wiederherstellung gleichzeitig laufen.",
        )
    try:
        staged = _take_staged(token)
        if staged.preview.compatibility == "unknown_revision":
            raise ProblemError(
                status_code=409,
                title="Backup nicht kompatibel",
                detail=(
                    "Die Schema-Revision des Backups ist dieser App-Version "
                    "unbekannt. Bitte zuerst die App aktualisieren."
                ),
            )
        db_path_str = engine.url.database
        if engine.dialect.name != "sqlite" or not db_path_str:
            raise ProblemError(
                status_code=409,
                title="Restore nur für SQLite-Datenbanken verfügbar",
            )
        live_db = Path(db_path_str)

        restore_in_progress.set()
        try:
            return _replace_everything(staged, live_db, session_keep, ip)
        finally:
            restore_in_progress.clear()
    finally:
        restore_lock.release()


def _replace_everything(
    staged: StagedRestore,
    live_db: Path,
    session_keep: SessionKeepInfo,
    ip: str | None,
) -> RestoreCommitResponse:
    preview = staged.preview
    snapshot = staged.dir / "snapshot.db"
    staged_photos = staged.dir / "photos"
    safety_db = staged.dir / "safety.db"
    stamp = _now().strftime("%Y%m%d-%H%M%S")
    bak_dir = settings.media_dir.parent / f"photos.bak-{stamp}"

    # 1) Laufende Requests auslaufen lassen, Pool leeren.
    _drain_pool()

    # 2) Sicherheitskopie der aktuellen DB — ohne sie wird nichts angefasst.
    try:
        snapshot_sqlite(live_db, safety_db)
    except sqlite3.Error as exc:
        logger.exception("Safety-Snapshot fehlgeschlagen")
        raise _restore_failed(
            "Die Sicherheitskopie der aktuellen Datenbank konnte nicht erstellt "
            "werden — es wurde nichts verändert."
        ) from exc

    # 3) Fotos tauschen (atomare Renames, altes Verzeichnis bleibt als .bak).
    try:
        had_old_photos = _swap_photos(staged_photos, bak_dir)
    except OSError as exc:
        logger.exception("Foto-Swap fehlgeschlagen")
        raise _restore_failed(
            "Die Foto-Dateien konnten nicht getauscht werden — es wurde nichts verändert."
        ) from exc

    # 4) DB tauschen: Backup-API schreibt den Snapshot transaktional in die
    #    Live-Datei (kein Datei-Rename → kein Stale-WAL-Problem).
    try:
        snapshot_sqlite(snapshot, live_db)
        if not sqlite_integrity_ok(live_db, quick=True):
            raise sqlite3.Error("quick_check nach dem Swap nicht 'ok'")
    except sqlite3.Error as exc:
        logger.exception("DB-Swap fehlgeschlagen — Rollback")
        try:
            snapshot_sqlite(safety_db, live_db)
        except sqlite3.Error:
            logger.exception("DB-Rollback fehlgeschlagen — manueller Eingriff nötig!")
        _rollback_photos(staged_photos, bak_dir, had_old_photos)
        engine.dispose()
        raise _restore_failed(
            "Die Datenbank konnte nicht ersetzt werden — der vorherige Stand "
            "wurde wiederhergestellt."
        ) from exc

    engine.dispose()  # frische Connections sehen den neuen Stand

    # 5) Stammt das Backup von einer älteren Version: auf head migrieren.
    migrations_applied = False
    if preview.compatibility == "migration_needed":
        try:
            command.upgrade(alembic_config(), "head")
            migrations_applied = True
        except Exception as exc:
            logger.exception("Migration des Backups fehlgeschlagen — Rollback")
            try:
                snapshot_sqlite(safety_db, live_db)
            except sqlite3.Error:
                logger.exception("DB-Rollback fehlgeschlagen — manueller Eingriff nötig!")
            _rollback_photos(staged_photos, bak_dir, had_old_photos)
            engine.dispose()
            raise _restore_failed(
                "Die Migration des Backups ist fehlgeschlagen — der vorherige "
                "Stand wurde wiederhergestellt."
            ) from exc

    # Ab hier ist der Backup-Stand verbindlich — Fehler in den Folge-Schritten
    # werden gemeldet, aber nicht mehr zurückgerollt.
    monthly_recomputed = False
    if migrations_applied:
        monthly_recomputed = _recompute_monthly_safe()

    relogin_required = not _reinsert_session(session_keep)
    _write_restore_audit(preview, session_keep, ip, migrations_applied)

    # 6) Erfolg → Staging, Safety-Kopie und Foto-Backup aufräumen.
    with _staged_lock:
        _staged.pop(staged.token, None)
    shutil.rmtree(staged.dir, ignore_errors=True)
    shutil.rmtree(bak_dir, ignore_errors=True)

    message = "Wiederherstellung abgeschlossen."
    if migrations_applied:
        message += " Die Datenbank wurde auf den aktuellen Stand migriert."
    if migrations_applied and not monthly_recomputed:
        message += (
            " Achtung: Der Monats-Cache konnte nicht neu berechnet werden — "
            "bitte auf dem Server „recompute-monthly“ ausführen."
        )
    if relogin_required:
        message += " Bitte neu anmelden."
    return RestoreCommitResponse(
        migrations_applied=migrations_applied,
        monthly_cache_recomputed=monthly_recomputed,
        relogin_required=relogin_required,
        restored=preview.counts,
        message=message,
    )


def _recompute_monthly_safe() -> bool:
    """Monats-Cache nach Migrationen backfillen — Fehler nur loggen, der
    Datenbestand selbst ist konsistent (Cache lässt sich per CLI nachholen)."""
    from meters.services.monthly_consumption import recompute_all

    try:
        with SessionLocal() as db:
            recompute_all(db)
            db.commit()
    except Exception:
        logger.exception("recompute-monthly nach Restore fehlgeschlagen")
        return False
    return True


def _reinsert_session(keep: SessionKeepInfo) -> bool:
    """Die Session des ausführenden Admins in die restaurierte DB übernehmen.

    Nur wenn dort ein aktiver Admin mit gleichem Username existiert — sonst
    muss er sich neu anmelden (mit den Zugangsdaten aus dem Backup-Stand).
    """
    try:
        with SessionLocal() as db:
            user = db.scalar(
                select(User).where(
                    User.username == keep.username,
                    User.role == UserRole.ADMIN,
                    User.is_active.is_(True),
                )
            )
            if user is None:
                return False
            existing = db.scalar(select(Session).where(Session.token_hash == keep.token_hash))
            if existing is None:
                db.add(
                    Session(
                        user_id=user.id,
                        token_hash=keep.token_hash,
                        expires_at=keep.expires_at,
                        last_seen_at=_now(),
                        user_agent=keep.user_agent,
                        ip_address=keep.ip_address,
                    )
                )
            db.commit()
            return True
    except Exception:
        logger.exception("Session-Übernahme nach Restore fehlgeschlagen")
        return False


def _write_restore_audit(
    preview: RestorePreviewResponse,
    keep: SessionKeepInfo,
    ip: str | None,
    migrations_applied: bool,
) -> None:
    """Audit-Eintrag IN der restaurierten DB — der alte Audit-Trail wurde
    mitsamt der DB ersetzt, deshalb erst nach dem Swap schreiben."""
    try:
        with SessionLocal() as db:
            user = db.scalar(select(User).where(User.username == keep.username))
            manifest = preview.manifest
            audit.record(
                db,
                user_id=user.id if user else None,
                action=AuditAction.RESTORE_PERFORMED,
                entity_type=AuditEntityType.SYSTEM,
                entity_id=None,
                diff={
                    "backup_created_at": (manifest.created_at.isoformat() if manifest else None),
                    "alembic_revision": preview.db_alembic_revision,
                    "migrations_applied": migrations_applied,
                    "readings": preview.counts.readings,
                    "photos": preview.counts.photos_in_zip,
                },
                ip_address=ip,
            )
            db.commit()
    except Exception:
        logger.exception("Audit-Eintrag für Restore fehlgeschlagen")
