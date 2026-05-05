"""Helper zum Schreiben von Audit-Log-Einträgen.

Wird aus den Routes nach jeder erfolgreichen Schreib-Operation aufgerufen.
``record(...)`` ist absichtlich synchron und nutzt ``db.flush()`` (kein
``commit``) — der Audit-Eintrag landet zusammen mit der eigentlichen Änderung
in einer Transaktion.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from meters.models import AuditAction, AuditEntityType, AuditLog

# Soft-Limit für die JSON-Größe von ``diff``. Bei Überschreitung wird der
# Inhalt durch einen Marker ersetzt — schützt vor DB-Bloat bei sehr großen
# Bulk-Operationen oder Custom-Register-Listen.
_DIFF_MAX_BYTES = 8 * 1024


def _capped_diff(diff: dict[str, Any] | None) -> dict[str, Any] | None:
    if diff is None:
        return None
    try:
        encoded = json.dumps(diff, default=str)
    except (TypeError, ValueError):
        return {"_truncated": True, "reason": "not-json-serializable"}
    if len(encoded.encode("utf-8")) <= _DIFF_MAX_BYTES:
        return diff
    return {
        "_truncated": True,
        "reason": "diff-too-large",
        "original_bytes": len(encoded.encode("utf-8")),
        "preview": encoded[:512],
    }


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
        diff=_capped_diff(diff),
        ip_address=ip_address,
    )
    db.add(entry)
    db.flush()
    return entry
