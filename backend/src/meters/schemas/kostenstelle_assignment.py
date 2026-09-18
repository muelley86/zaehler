from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

from meters.schemas.common import APIModel

# Kostenstelle: Ganzzahl 0-99999 (wie das fruehere Einzelfeld an der Messstelle).
_KST = Field(ge=0, le=99999)


class KostenstelleAssignmentRead(APIModel):
    id: int
    kostenstelle: int
    valid_from: date
    valid_to: date | None


class ChangeKostenstelleRequest(BaseModel):
    """Wechsel: schliesst die offene Periode mit ``valid_to = valid_from`` und oeffnet
    eine neue."""

    kostenstelle: int = _KST
    valid_from: date


class KostenstelleAssignmentCreate(BaseModel):
    """Historien-Editor: ``valid_to = None`` = offene Periode (max. eine je MP)."""

    kostenstelle: int = _KST
    valid_from: date
    valid_to: date | None = None


class KostenstelleAssignmentUpdate(BaseModel):
    """Historien-Editor: Vollkoerper, damit ``valid_to = null`` eindeutig ist."""

    kostenstelle: int = _KST
    valid_from: date
    valid_to: date | None
