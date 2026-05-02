from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field

from meters.models import MeterType
from meters.schemas.common import APIModel, DecimalStr
from meters.schemas.physical_meter import PhysicalMeterRead


class MeasuringPointBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: MeterType
    location_id: int | None = None
    is_bidirectional: bool = False
    has_dual_tariff: bool = False
    tank_capacity: Decimal | None = Field(default=None, gt=Decimal("0"))


class MeasuringPointCreate(MeasuringPointBase):
    serial_number: str = Field(min_length=1, max_length=64)
    installed_at: date
    initial_values: dict[str, Decimal] = Field(default_factory=dict)


class MeasuringPointUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    location_id: int | None = None
    clear_location: bool = False
    is_bidirectional: bool | None = None
    has_dual_tariff: bool | None = None
    tank_capacity: Decimal | None = Field(default=None, gt=Decimal("0"))
    clear_tank_capacity: bool = False


class MeasuringPointRead(APIModel):
    id: int
    name: str
    type: MeterType
    location_id: int | None
    location_name: str | None = None
    is_bidirectional: bool
    has_dual_tariff: bool
    tank_capacity: DecimalStr | None
    physical_meters: list[PhysicalMeterRead]


class ReplaceMeterRequest(BaseModel):
    final_readings: dict[str, DecimalStr]
    removed_at: date
    new_serial_number: str = Field(min_length=1, max_length=64)
    installed_at: date
    initial_readings: dict[str, DecimalStr] = Field(default_factory=dict)
