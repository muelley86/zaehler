"""Schemas für QR-Token-Verheiratung (Feature A)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from meters.schemas.common import APIModel, UtcDateTime


class QrTokenRead(APIModel):
    id: int
    token: str
    measuring_point_id: int | None
    measuring_point_name: str | None  # vorausgefüllt für die Liste
    created_at: UtcDateTime
    created_by_user_id: int
    assigned_at: UtcDateTime | None
    assigned_by_user_id: int | None


class QrTokenBulkCreateRequest(BaseModel):
    """Erzeugt ``count`` neue (unzugeordnete) Tokens."""

    count: int = Field(ge=1, le=200)


class QrTokenAssignRequest(BaseModel):
    """Ordnet einen Token einer Messstelle zu."""

    measuring_point_id: int


class QrTokenResolveResponse(APIModel):
    """Antwort des resolve-Endpoints für den Scan-Flow.

    - ``measuring_point_id`` ist None, wenn der Token existiert aber noch
      nicht zugeordnet ist; der Frontend zeigt dann eine Assign-Modal,
      sofern ``can_assign`` True ist.
    - ``can_assign`` zeigt, ob der aktuelle User die Zuordnung selbst
      durchführen darf (Admin oder Recorder mit Flag).
    """

    measuring_point_id: int | None
    can_assign: bool
