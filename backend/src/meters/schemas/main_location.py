from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from meters.schemas.common import APIModel


def _strip_nonempty(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        raise ValueError("name darf nicht leer oder nur Whitespace sein")
    return stripped


class MainLocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        result = _strip_nonempty(value)
        assert result is not None
        return result


class MainLocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        return _strip_nonempty(value)


class MainLocationRead(APIModel):
    id: int
    name: str
    note: str | None
