from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field

from meters.models import BillingPositionKind, BillingRunStatus
from meters.schemas.common import APIModel, DecimalStr

_MONAT = r"^(19|20)\d{2}-(0[1-9]|1[0-2])$"


class BillingRunCreate(BaseModel):
    monat: str = Field(pattern=_MONAT)
    zusatzkosten: Decimal = Field(default=Decimal("0"), ge=-1_000_000, le=1_000_000)
    aufschlag_prozent: Decimal = Field(default=Decimal("0"), ge=0, le=1)  # 0.05 = 5 %
    aufschlag_ct: Decimal = Field(default=Decimal("0"), ge=-100, le=100)
    begruendung: str | None = Field(default=None, max_length=500)


class BillingRunUpdate(BaseModel):
    """Nur gesendete Felder; nur im Entwurf."""

    zusatzkosten: Decimal | None = Field(default=None, ge=-1_000_000, le=1_000_000)
    aufschlag_prozent: Decimal | None = Field(default=None, ge=0, le=1)
    aufschlag_ct: Decimal | None = Field(default=None, ge=-100, le=100)
    begruendung: str | None = Field(default=None, max_length=500)


class BillingRunLineUpdate(BaseModel):
    """Manuelle Werte einer Zeile; ``null`` entfernt einen manuellen Wert. Begruendung Pflicht,
    solange ein manueller Wert gesetzt ist."""

    manual_stand_alt: Decimal | None = Field(default=None, ge=0, le=Decimal("1e12"))
    manual_stand_neu: Decimal | None = Field(default=None, ge=0, le=Decimal("1e12"))
    manual_korrektur_kwh: Decimal | None = Field(
        default=None, ge=Decimal("-1e12"), le=Decimal("1e12")
    )
    manual_note: str | None = Field(default=None, max_length=500)


class BillingRunFinding(BaseModel):
    position_id: int | None
    label: str
    code: str
    message: str
    blocking: bool


class BillingRunLineRead(APIModel):
    id: int
    sort_order: int
    position_id: int | None
    label: str
    kind: BillingPositionKind
    parent_label: str | None
    owner_id: int | None
    owner_name: str | None
    internal_allocation: bool
    kostenstelle: int | None
    mieter_name: str | None
    invoice_line: str | None
    measuring_point_id: int | None
    measuring_point_name: str | None
    serial_numbers: str
    transformer_factor: int | None
    stand_alt: DecimalStr | None
    stand_alt_art: str | None
    stand_alt_abstand: int | None
    stand_neu: DecimalStr | None
    stand_neu_art: str | None
    stand_neu_abstand: int | None
    korrektur_kwh: DecimalStr | None
    korrektur_note: str | None
    manual_stand_alt: DecimalStr | None
    manual_stand_neu: DecimalStr | None
    manual_korrektur_kwh: DecimalStr | None
    manual_note: str | None
    kwh: DecimalStr | None
    eur: DecimalStr | None
    pruefung: str | None


class BillingRunSummary(APIModel):
    id: int
    circle_id: int
    monat: str
    version: int
    status: BillingRunStatus
    invoice_id: int
    begruendung: str | None
    created_at: datetime
    created_by: int | None
    finalized_at: datetime | None
    finalized_by: int | None
    preis_eur: str | None = None
    gesamt_eur: str | None = None
    saldo_eur: str | None = None
    blocking_count: int = 0


class BillingRunRead(BillingRunSummary):
    zusatzkosten: DecimalStr
    aufschlag_prozent: DecimalStr
    aufschlag_ct: DecimalStr
    result: dict[str, Any] | None
    befunde: list[BillingRunFinding]
    lines: list[BillingRunLineRead]
