from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from meters.schemas.common import APIModel


class SupplierAssignmentRead(APIModel):
    id: int
    supplier_id: int | None
    supplier_name: str | None = None
    valid_from: date
    valid_to: date | None


class ChangeSupplierRequest(BaseModel):
    """Lieferantenwechsel: schliesst die aktuelle Periode mit
    ``valid_to = valid_from`` und legt eine neue offene an."""

    supplier_id: int
    valid_from: date


class SupplierAssignmentCreate(BaseModel):
    """Historien-Editor: neue Periode anlegen. ``valid_to = None`` heisst
    offene (aktive) Periode — davon darf es je MP nur eine geben."""

    supplier_id: int
    valid_from: date
    valid_to: date | None = None


class SupplierAssignmentUpdate(BaseModel):
    """Historien-Editor: Periode korrigieren. Bewusst Vollkoerper statt
    partieller PATCH-Semantik, damit ``valid_to = null`` (Periode oeffnen)
    nicht mit „Feld nicht gesendet" verwechselt werden kann."""

    supplier_id: int
    valid_from: date
    valid_to: date | None
