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


class OwnerAssignmentCreate(BaseModel):
    """Historien-Editor: neue Periode anlegen. ``valid_to = None`` heisst
    offene (aktive) Periode — davon darf es je MP nur eine geben."""

    owner_id: int
    valid_from: date
    valid_to: date | None = None


class OwnerAssignmentUpdate(BaseModel):
    """Historien-Editor: Periode korrigieren. Bewusst Vollkoerper statt
    partieller PATCH-Semantik, damit ``valid_to = null`` (Periode oeffnen)
    nicht mit „Feld nicht gesendet" verwechselt werden kann."""

    owner_id: int
    valid_from: date
    valid_to: date | None
