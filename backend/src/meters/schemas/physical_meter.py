from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field

from meters.schemas.common import APIModel, DecimalStr


class RegisterRead(APIModel):
    id: int
    obis_code: str
    label: str
    unit: str
    is_active: bool
    max_value: DecimalStr
    accepts_deliveries: bool


class RegisterUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=64)
    unit: str | None = Field(default=None, min_length=1, max_length=16)
    is_active: bool | None = None
    max_value: Decimal | None = None
    accepts_deliveries: bool | None = None


class PhysicalMeterRead(APIModel):
    id: int
    serial_number: str
    installed_at: date
    removed_at: date | None
    registers: list[RegisterRead]


class PhysicalMeterUpdate(BaseModel):
    serial_number: str | None = Field(default=None, min_length=1, max_length=64)
    installed_at: date | None = None
    removed_at: date | None = None
    clear_removed_at: bool = False
