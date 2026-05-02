"""Audit-Log (admin-only).

Read-only-Endpoint zum Anzeigen aller protokollierten Änderungen. Einträge
werden von den anderen Routen über ``services.audit.record`` geschrieben —
hier nur Auflistung.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import select

from meters.api.deps import AdminUser, DbDep
from meters.models import AuditLog
from meters.schemas import AuditLogRead

router = APIRouter(prefix="/audit-log", tags=["audit"])


@router.get("", response_model=list[AuditLogRead])
def list_audit_log(
    db: DbDep,
    _admin: AdminUser,
    limit: int = Query(200, ge=1, le=1000),
) -> list[AuditLogRead]:
    rows = list(
        db.scalars(
            select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit)
        )
    )
    return [AuditLogRead.model_validate(r) for r in rows]
