from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from meters.models import BillTo
from meters.schemas.common import APIModel


class BillToAssignmentRead(APIModel):
    id: int
    bill_to: BillTo
    valid_from: date
    valid_to: date | None


class ChangeBillToRequest(BaseModel):
    """Wechsel: schliesst die offene Periode mit ``valid_to = valid_from`` und oeffnet
    eine neue."""

    bill_to: BillTo
    valid_from: date


class BillToAssignmentCreate(BaseModel):
    """Historien-Editor: ``valid_to = None`` = offene Periode (max. eine je MP)."""

    bill_to: BillTo
    valid_from: date
    valid_to: date | None = None


class BillToAssignmentUpdate(BaseModel):
    """Historien-Editor: Vollkoerper, damit ``valid_to = null`` eindeutig ist."""

    bill_to: BillTo
    valid_from: date
    valid_to: date | None
