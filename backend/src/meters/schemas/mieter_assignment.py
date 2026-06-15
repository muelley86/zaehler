from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from meters.schemas.common import APIModel


class MieterAssignmentRead(APIModel):
    id: int
    mieter_id: int | None
    mieter_name: str | None = None
    valid_from: date
    valid_to: date | None


class ChangeMieterRequest(BaseModel):
    """Mieterwechsel: schliesst die aktuelle Periode mit
    ``valid_to = valid_from`` und legt eine neue offene an."""

    mieter_id: int
    valid_from: date


class MieterAssignmentCreate(BaseModel):
    """Historien-Editor: neue Periode anlegen. ``valid_to = None`` heisst
    offene (aktive) Periode — davon darf es je MP nur eine geben."""

    mieter_id: int
    valid_from: date
    valid_to: date | None = None


class MieterAssignmentUpdate(BaseModel):
    """Historien-Editor: Periode korrigieren. Bewusst Vollkoerper statt
    partieller PATCH-Semantik, damit ``valid_to = null`` (Periode oeffnen)
    nicht mit „Feld nicht gesendet" verwechselt werden kann."""

    mieter_id: int
    valid_from: date
    valid_to: date | None
