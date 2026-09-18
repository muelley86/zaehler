"""Importformat ``stromabrechnung-stammdaten`` v1 (erzeugt von ``stromabrechnung.export_app``)."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from meters.models import BillingPositionKind


class ImportPosition(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    sort_order: int = Field(ge=0, le=100000)
    kind: BillingPositionKind
    serial_number: str | None = Field(default=None, max_length=64)
    owner_name: str = Field(min_length=1, max_length=120)
    internal_allocation: bool = False
    kostenstelle: int | None = Field(default=None, ge=0, le=99999)
    transformer_factor: int | None = Field(default=None, gt=0, le=10000)
    parent_label: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=500)


class ImportCircle(BaseModel):
    code: str = Field(min_length=1, max_length=16, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    rechnungsleger: str = Field(min_length=1, max_length=120)
    abnahmestelle: str = Field(min_length=1, max_length=64)
    marktlokation: str | None = Field(default=None, pattern=r"^\d{11}$")
    positions: list[ImportPosition] = Field(max_length=300)


class StammdatenImport(BaseModel):
    format: Literal["stromabrechnung-stammdaten"]
    version: Literal[1]
    erzeugt: date | None = None
    valid_from: date
    circles: list[ImportCircle] = Field(max_length=10)


ImportLevel = Literal["aktion", "hinweis", "fehler"]


class ImportEntry(BaseModel):
    level: ImportLevel
    circle: str
    label: str | None
    message: str


class ImportReport(BaseModel):
    applied: bool
    valid_from: date
    entries: list[ImportEntry]
    counts: dict[str, int]
