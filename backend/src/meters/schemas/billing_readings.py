from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel

from meters.models import BillingPositionKind
from meters.schemas.billing_circle import BillingFinding
from meters.schemas.common import DecimalStr


class BillingStandRead(BaseModel):
    wert: DecimalStr
    # abgelesen = Ablesung am Stichtag; interpoliert = zwischen zwei Ablesungen;
    # nur_davor/nur_danach = auf einer Seite fehlt eine Ablesung (letzter/erster Stand uebernommen)
    art: Literal["abgelesen", "interpoliert", "nur_davor", "nur_danach"]
    ablesung_vor: date | None
    ablesung_nach: date | None
    abstand_tage: int


class BillingReadingRow(BaseModel):
    position_id: int
    label: str
    kind: BillingPositionKind
    measuring_point_id: int | None = None
    measuring_point_name: str | None = None
    serial_numbers: str = ""
    transformer_factor: int | None = None
    stand_alt: BillingStandRead | None = None
    stand_neu: BillingStandRead | None = None
    korrektur_kwh: DecimalStr | None = None
    korrektur_note: str | None = None
    kwh: DecimalStr | None = None


class BillingReadingsRead(BaseModel):
    monat: str
    stichtag_alt: date
    stichtag_neu: date
    max_abstand_tage: int
    positions: list[BillingReadingRow]
    findings: list[BillingFinding]
