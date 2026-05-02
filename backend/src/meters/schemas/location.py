from __future__ import annotations

from pydantic import BaseModel, Field

from meters.schemas.common import APIModel


class LocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)


class LocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)


class LocationRead(APIModel):
    id: int
    name: str
    note: str | None
