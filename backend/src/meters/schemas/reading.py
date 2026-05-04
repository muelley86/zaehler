from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from meters.schemas.common import APIModel, DecimalStr


class ReadingCreate(BaseModel):
    register_id: int
    value: Decimal
    reading_at: datetime
    note: str | None = Field(default=None, max_length=500)
    acknowledge_warnings: bool = Field(
        default=False,
        description=(
            "Wenn true, wird ein vorhandener Plausibilitätsverstoß "
            "(Wert kleiner als Vorgänger / größer als Nachfolger) akzeptiert. "
            "Der Frontend-Confirm-Dialog setzt das Flag bei der zweiten Übermittlung."
        ),
    )


class ReadingUpdate(BaseModel):
    value: Decimal | None = None
    reading_at: datetime | None = None
    note: str | None = Field(default=None, max_length=500)
    acknowledge_warnings: bool = False


class ReadingRead(APIModel):
    id: int
    register_id: int
    value: DecimalStr
    reading_at: datetime
    note: str | None
    created_at: datetime
    created_by_user_id: int | None
    created_by_username: str | None = None


class ConsumptionPoint(APIModel):
    period_start: date
    period_end: date
    register_id: int
    obis_code: str
    consumption: DecimalStr
    unit: str
