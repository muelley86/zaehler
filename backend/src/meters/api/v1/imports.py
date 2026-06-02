"""Import historischer Zählerstände aus Excel/CSV (admin-only).

``preview`` parst die hochgeladene Datei (zustandslos) und liefert das
Zeilen-Mapping mit Auto-Match der Messstellennamen; ``commit`` legt für das im
Frontend aufgelöste Mapping die Readings an (idempotent). Siehe
``services/import_readings.py``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Request, UploadFile

from meters.api.deps import AdminUser, DbDep, client_ip
from meters.core.problem import ProblemError
from meters.schemas.import_readings import (
    ImportCommitRequest,
    ImportCommitResponse,
    ImportPreviewResponse,
)
from meters.services.import_readings import build_preview, commit_readings

router = APIRouter(prefix="/imports", tags=["imports"])

_MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB reichen für Monats-Zählerstände dicke.


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
    content = file.file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise ProblemError(status_code=400, title="Datei zu groß", detail="Maximal 5 MB.")
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
) -> ImportCommitResponse:
    result = commit_readings(
        db,
        rows=payload.rows,
        user_id=admin.id,
        ip_address=client_ip(request),
        source_filename=payload.source_filename,
    )
    db.commit()
    return result
