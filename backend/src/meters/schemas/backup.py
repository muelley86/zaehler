"""DTOs für Voll-Backup (ZIP) und GUI-Restore.

``BackupManifest`` ist das Format der ``manifest.json`` im Backup-Archiv —
bewusst versioniert (``format``), damit künftige Layout-Änderungen erkennbar
bleiben. Die Restore-Schemas tragen alles, was das Frontend für die
Vorschau-/Bestätigungs-UI braucht.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# Layout-Version des Backup-Archivs (meters.db + manifest.json + photos/*).
BACKUP_FORMAT = 1


class BackupManifest(BaseModel):
    format: int = BACKUP_FORMAT
    app_version: str | None = None
    alembic_revision: str | None = None
    created_at: datetime
    photo_count: int = 0
    db_sha256: str | None = None


class RestoreCounts(BaseModel):
    users: int = 0
    measuring_points: int = 0
    readings: int = 0
    photos_in_db: int = 0
    photos_in_zip: int = 0


RestoreCompatibility = Literal["ok", "migration_needed", "unknown_revision"]


class RestorePreviewResponse(BaseModel):
    token: str
    expires_at: datetime
    manifest: BackupManifest | None
    db_alembic_revision: str | None
    counts: RestoreCounts
    compatibility: RestoreCompatibility
    backup_age_days: int | None
    warnings: list[str]


class RestoreCommitResponse(BaseModel):
    migrations_applied: bool
    monthly_cache_recomputed: bool
    relogin_required: bool
    restored: RestoreCounts
    message: str
