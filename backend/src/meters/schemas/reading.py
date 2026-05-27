from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from meters.schemas.common import APIModel, DecimalStr

# Toleranz für Client-Server-Clock-Skew — Smartphones im Feld können
# leicht falsch laufen; 5 Min Puffer verhindert sinnlose 422er bei
# legitimer Erfassung "jetzt".
_FUTURE_TOLERANCE = timedelta(minutes=5)


def _reject_future_timestamp(value: datetime | None) -> datetime | None:
    if value is None:
        return value
    # Naive datetimes (kein tzinfo) werden als UTC interpretiert.
    aware = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    if aware > datetime.now(UTC) + _FUTURE_TOLERANCE:
        raise ValueError("reading_at darf nicht in der Zukunft liegen.")
    return value


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

    @field_validator("reading_at")
    @classmethod
    def _no_future_reading_at(cls, value: datetime) -> datetime:
        result = _reject_future_timestamp(value)
        assert result is not None
        return result


class ReadingUpdate(BaseModel):
    value: Decimal | None = None
    reading_at: datetime | None = None
    note: str | None = Field(default=None, max_length=500)
    acknowledge_warnings: bool = False

    @field_validator("reading_at")
    @classmethod
    def _no_future_reading_at(cls, value: datetime | None) -> datetime | None:
        return _reject_future_timestamp(value)


class ReadingRead(APIModel):
    id: int
    register_id: int
    value: DecimalStr
    reading_at: datetime
    note: str | None
    created_at: datetime
    created_by_user_id: int | None
    created_by_username: str | None = None
    has_photo: bool = False
    photo_lat: float | None = None
    photo_lon: float | None = None


class ConsumptionPoint(APIModel):
    period_start: date
    period_end: date
    register_id: int
    obis_code: str
    consumption: DecimalStr
    unit: str
