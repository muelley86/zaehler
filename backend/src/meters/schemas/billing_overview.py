from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from meters.schemas.common import DecimalStr

BillingMonthStatus = Literal["leer", "rechnung", "entwurf", "festgeschrieben", "uebertragen"]


class BillingMonthCell(BaseModel):
    """Ein Monat eines Kreises: wie weit ist die Abrechnung?"""

    monat: str
    status: BillingMonthStatus
    invoice: bool
    run_id: int | None
    version: int | None
    eur: DecimalStr | None
    empfaenger: int
    uebertragen: int
    blocking: int


class BillingMonthRow(BaseModel):
    circle_id: int
    code: str
    name: str
    monate: list[BillingMonthCell]


class BillingMonthOverview(BaseModel):
    von: str
    bis: str
    monate: list[str]
    kreise: list[BillingMonthRow]
