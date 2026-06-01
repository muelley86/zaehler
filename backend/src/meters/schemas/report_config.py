from __future__ import annotations

from datetime import date
from typing import Self

from pydantic import BaseModel, Field, field_validator, model_validator

from meters.models import MeterType, ReportDimension, ReportGranularity, ReportPeriodKind
from meters.schemas.common import APIModel, UtcDateTime


class ReportFilterModel(BaseModel):
    """Kategoriale Filter einer Auswertung. Leere Liste = keine Einschraenkung.
    ``None`` als Listenelement schliesst den jeweiligen "ohne ..."-Bucket ein."""

    main_location_ids: list[int | None] = Field(default_factory=list)
    location_ids: list[int | None] = Field(default_factory=list)
    owner_ids: list[int | None] = Field(default_factory=list)
    kostenstellen: list[int | None] = Field(default_factory=list)
    meter_types: list[MeterType] = Field(default_factory=list)


def validate_period(
    period_kind: ReportPeriodKind,
    from_date: date | None,
    to_date: date | None,
) -> None:
    """``FIXED`` braucht beide Daten; alle relativen Varianten duerfen keine
    festen Daten tragen (werden beim Ausfuehren aufgeloest)."""
    if period_kind is ReportPeriodKind.FIXED:
        if from_date is None or to_date is None:
            raise ValueError("period_kind=fixed erfordert from_date und to_date")
        if to_date < from_date:
            raise ValueError("to_date darf nicht vor from_date liegen")
    elif from_date is not None or to_date is not None:
        raise ValueError("from_date/to_date sind nur bei period_kind=fixed zulaessig")


class ReportConfigCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    dimension: ReportDimension
    granularity: ReportGranularity
    period_kind: ReportPeriodKind
    from_date: date | None = None
    to_date: date | None = None
    filters: ReportFilterModel = Field(default_factory=ReportFilterModel)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("name darf nicht leer oder nur Whitespace sein")
        return stripped

    @model_validator(mode="after")
    def _check_period(self) -> Self:
        validate_period(self.period_kind, self.from_date, self.to_date)
        return self


class ReportConfigUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    dimension: ReportDimension | None = None
    granularity: ReportGranularity | None = None
    period_kind: ReportPeriodKind | None = None
    from_date: date | None = None
    to_date: date | None = None
    filters: ReportFilterModel | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("name darf nicht leer oder nur Whitespace sein")
        return stripped


class ReportConfigRead(APIModel):
    id: int
    name: str
    dimension: ReportDimension
    granularity: ReportGranularity
    period_kind: ReportPeriodKind
    from_date: date | None = None
    to_date: date | None = None
    filters: ReportFilterModel
    created_at: UtcDateTime
