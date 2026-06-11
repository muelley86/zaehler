"""GUI-Restore eines Voll-Backups (admin-only).

Zwei-Schritt-Flow ohne Doppel-Upload: ``upload`` validiert + staged das ZIP
und liefert die Vorschau; ``commit`` führt den Full-Replace aus. ``DELETE``
verwirft einen Upload (Abbrechen im Frontend).

Wichtig: Der Commit-Handler nutzt bewusst KEINE eigene ``DbDep`` für den
Restore selbst — die Auth-Session (``AdminUser``) ist abgeschlossen, bevor
das Wartungs-Gate gesetzt wird; alles Weitere läuft über eigene Connections
in ``services.restore``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Request, UploadFile

from meters.api.deps import AdminUser, DbDep, client_ip
from meters.models import Session
from meters.schemas.backup import RestoreCommitResponse, RestorePreviewResponse
from meters.services import restore as restore_service
from meters.services.restore import SessionKeepInfo

router = APIRouter(prefix="/restore", tags=["restore"])


@router.post("/upload", response_model=RestorePreviewResponse)
def upload_backup(
    _admin: AdminUser,
    file: Annotated[UploadFile, File()],
) -> RestorePreviewResponse:
    return restore_service.stage_upload(file)


@router.post("/{token}/commit", response_model=RestoreCommitResponse)
def commit_restore(
    token: str,
    request: Request,
    db: DbDep,
    admin: AdminUser,
) -> RestoreCommitResponse:
    # Session-Daten VOR dem Restore materialisieren — nach dem DB-Swap darf
    # kein ORM-Objekt mehr lazy nachladen. ``request.state.session`` wird in
    # ``get_current_user`` gesetzt.
    session: Session = request.state.session
    keep = SessionKeepInfo(
        username=admin.username,
        token_hash=session.token_hash,
        expires_at=session.expires_at,
        user_agent=session.user_agent,
        ip_address=session.ip_address,
    )
    ip = client_ip(request)
    # Auth-Connection sofort zurückgeben, damit der Pool-Drain nicht auf das
    # Request-Ende warten muss (das dependency-eigene close() später ist ok).
    db.close()
    return restore_service.perform_restore(token, session_keep=keep, ip=ip)


@router.delete("/{token}", status_code=204)
def discard_upload(token: str, _admin: AdminUser) -> None:
    restore_service.discard(token)
