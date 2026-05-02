"""Helper zum Schreiben von Audit-Log-Einträgen.

Wird aus den Routes nach jeder erfolgreichen Schreib-Operation aufgerufen.
``record(...)`` ist absichtlich synchron und nutzt ``db.flush()`` (kein
``commit``) — der Audit-Eintrag landet zusammen mit der eigentlichen Änderung
in einer Transaktion.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from meters.models import AuditAction, AuditEntityType, AuditLog


def record(
    db: Session,
    *,
    user_id: int | None,
    action: AuditAction,
    entity_type: AuditEntityType,
    entity_id: int | None,
    diff: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        diff=diff,
        ip_address=ip_address,
    )
    db.add(entry)
    db.flush()
    return entry
