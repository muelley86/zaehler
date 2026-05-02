from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from meters.schemas.common import APIModel, DecimalStr


class DeliveryCreate(BaseModel):
    delivery_date: date
    amount: Decimal = Field(gt=Decimal("0"))
    note: str | None = Field(default=None, max_length=500)


class DeliveryUpdate(BaseModel):
    delivery_date: date | None = None
    amount: Decimal | None = Field(default=None, gt=Decimal("0"))
    note: str | None = Field(default=None, max_length=500)


class DeliveryRead(APIModel):
    id: int
    register_id: int
    delivery_date: date
    amount: DecimalStr
    note: str | None
    created_at: datetime
    created_by_user_id: int | None
    created_by_username: str | None = None
