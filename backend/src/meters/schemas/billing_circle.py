from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

from meters.models import BillingPositionKind
from meters.schemas.common import APIModel


class BillingCircleCreate(BaseModel):
    code: str = Field(min_length=1, max_length=16, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    rechnungsleger: str = Field(min_length=1, max_length=120)
    abnahmestelle: str = Field(min_length=1, max_length=64)
    marktlokation: str | None = Field(default=None, pattern=r"^\d{11}$")
    note: str | None = Field(default=None, max_length=500)


class BillingCircleUpdate(BaseModel):
    """Nur gesendete Felder werden uebernommen; ``null`` leert optionale Felder."""

    code: str | None = Field(default=None, min_length=1, max_length=16, pattern=r"^[A-Za-z0-9_-]+$")
    name: str | None = Field(default=None, min_length=1, max_length=120)
    rechnungsleger: str | None = Field(default=None, min_length=1, max_length=120)
    abnahmestelle: str | None = Field(default=None, min_length=1, max_length=64)
    marktlokation: str | None = Field(default=None, pattern=r"^\d{11}$")
    note: str | None = Field(default=None, max_length=500)


class BillingCircleRead(APIModel):
    id: int
    code: str
    name: str
    rechnungsleger: str
    abnahmestelle: str
    marktlokation: str | None
    note: str | None


class BillingPositionCreate(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    kind: BillingPositionKind
    sort_order: int = Field(default=0, ge=0, le=100000)
    measuring_point_id: int | None = None
    parent_position_id: int | None = None
    owner_id: int | None = None
    kostenstelle: int | None = Field(default=None, ge=0, le=99999)
    invoice_line: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=500)
    valid_from: date
    valid_to: date | None = None


class BillingPositionUpdate(BaseModel):
    """Nur gesendete Felder werden uebernommen; ``null`` leert optionale Felder."""

    label: str | None = Field(default=None, min_length=1, max_length=120)
    kind: BillingPositionKind | None = None
    sort_order: int | None = Field(default=None, ge=0, le=100000)
    measuring_point_id: int | None = None
    parent_position_id: int | None = None
    owner_id: int | None = None
    kostenstelle: int | None = Field(default=None, ge=0, le=99999)
    invoice_line: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=500)
    valid_from: date | None = None
    valid_to: date | None = None


class BillingPositionRead(APIModel):
    id: int
    circle_id: int
    sort_order: int
    label: str
    kind: BillingPositionKind
    measuring_point_id: int | None
    measuring_point_name: str | None = None
    parent_position_id: int | None
    owner_id: int | None
    owner_name: str | None = None
    kostenstelle: int | None
    invoice_line: str | None
    note: str | None
    valid_from: date
    valid_to: date | None


class BillingCheckRow(BaseModel):
    """Aufgeloeste Position zum Stichtag (Vorschau fuer die Abrechnung)."""

    position_id: int
    label: str
    kind: BillingPositionKind
    measuring_point_id: int | None
    measuring_point_name: str | None
    parent_position_id: int | None
    owner_id: int | None
    owner_name: str | None
    internal_allocation: bool
    kostenstelle: int | None
    mieter_name: str | None
    invoice_line: str | None


class BillingFinding(BaseModel):
    position_id: int | None
    label: str
    code: str
    message: str


class UnassignedMeterRead(BaseModel):
    """Strom-Messstelle mit Zaehler, die zum Stichtag in keinem Kreis abgerechnet wird."""

    id: int
    name: str
    serial_numbers: str


class BillingCheckRead(BaseModel):
    stichtag: date
    positions: list[BillingCheckRow]
    findings: list[BillingFinding]
