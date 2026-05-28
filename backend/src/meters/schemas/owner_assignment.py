from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from meters.schemas.common import APIModel


class OwnerAssignmentRead(APIModel):
    id: int
    owner_id: int | None
    owner_name: str | None = None
    valid_from: date
    valid_to: date | None


class ChangeOwnerRequest(BaseModel):
    """Eigentuemerwechsel: schliesst die aktuelle Periode mit
    ``valid_to = valid_from`` und legt eine neue offene an."""

    owner_id: int
    valid_from: date
