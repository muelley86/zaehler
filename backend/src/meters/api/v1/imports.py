"""Import historischer Zählerstände aus Excel/CSV (admin-only).

``preview`` parst die hochgeladene Datei (zustandslos) und liefert das
Zeilen-Mapping mit Auto-Match der Messstellennamen; ``commit`` legt für das im
Frontend aufgelöste Mapping die Readings an (idempotent). Siehe
``services/import_readings.py``.
"""

from __future__ import annotations

from typing import Annotated, BinaryIO

from fastapi import APIRouter, BackgroundTasks, File, Request, UploadFile

from meters.api.deps import AdminUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.schemas.import_readings import (
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewResponse,
)
from meters.services.import_readings import build_preview, commit_readings
from meters.services.monthly_consumption import defer_recompute, recompute_registers

router = APIRouter(prefix="/imports", tags=["imports"])

_MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB reichen für Monats-Zählerstände dicke.
_READ_CHUNK_BYTES = 1024 * 1024


def _read_limited(fp: BinaryIO, limit: int) -> bytes:
    """Upload chunk-weise einlesen und bei Überschreitung SOFORT abbrechen —
    statt erst alles in den RAM zu lesen und danach zu prüfen."""
    chunks: list[bytes] = []
    total = 0
    while chunk := fp.read(_READ_CHUNK_BYTES):
        total += len(chunk)
        if total > limit:
            raise ProblemError(status_code=400, title="Datei zu groß", detail="Maximal 5 MB.")
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/readings/preview", response_model=ImportPreviewResponse)
def preview_import(
    db: DbDep,
    _admin: AdminUser,
    file: Annotated[UploadFile, File()],
) -> ImportPreviewResponse:
    filename = file.filename or ""
    lower = filename.lower()
    if not (lower.endswith(".xlsx") or lower.endswith(".csv")):
        raise ProblemError(
            status_code=400,
            title="Nicht unterstütztes Format",
            detail="Nur .xlsx oder .csv werden unterstützt.",
        )
    content = _read_limited(file.file, _MAX_UPLOAD_BYTES)
    try:
        return build_preview(db, filename=filename, content=content)
    except Exception as exc:
        # Parsefehler (kaputte Datei o. Ä.) dem Nutzer als 400 zurückmelden.
        raise ProblemError(
            status_code=400,
            title="Datei konnte nicht gelesen werden",
            detail=str(exc),
        ) from exc


@router.post("/readings/commit", response_model=ImportCommitResponse)
def commit_import(
    payload: ImportCommitRequest,
    request: Request,
    db: DbDep,
    admin: AdminUser,
    background: BackgroundTasks,
) -> ImportCommitResponse:
    result = commit_readings(
        db,
        rows=payload.rows,
        user_id=admin.id,
        ip_address=client_ip(request),
        source_filename=payload.source_filename,
    )
    # Monats-Cache NICHT synchron im Request neu berechnen — ein Massen-Import
    # kann hunderte Register betreffen; die sequenzielle Neuberechnung würde die
    # Response blockieren (Reverse-Proxy-Timeout). Stattdessen nach dem Commit
    # im Hintergrund. Bis der Task durch ist, sind die Monats-Diagramme kurz
    # veraltet (wie beim bereits akzeptierten Stale-Verhalten, kein Datenverlust).
    register_ids = defer_recompute(db)
    db.commit()
    if register_ids:
        background.add_task(recompute_registers, register_ids)
    return result
