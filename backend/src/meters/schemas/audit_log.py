from __future__ import annotations

from typing import Any

from meters.models import AuditAction, AuditEntityType
from meters.schemas.common import APIModel, UtcDateTime


class AuditLogRead(APIModel):
    id: int
    user_id: int | None
    action: AuditAction
    entity_type: AuditEntityType
    entity_id: int | None
    diff: dict[str, Any] | None
    ip_address: str | None
    created_at: UtcDateTime
