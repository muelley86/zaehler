from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from meters.schemas._master_data import (
    EMAIL_RE,
    POSTCODE_RE,
    strip_name,
    strip_or_none,
)
from meters.schemas.common import APIModel


class MieterCreate(BaseModel):
    first_name: str | None = Field(default=None, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    address_street: str | None = Field(default=None, max_length=200)
    address_postcode: str | None = Field(default=None, max_length=5, pattern=POSTCODE_RE)
    address_city: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200, pattern=EMAIL_RE)
    phone: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("last_name")
    @classmethod
    def _vn(cls, value: str) -> str:
        return strip_name(value)

    @field_validator(
        "first_name",
        "address_street",
        "address_postcode",
        "address_city",
        "email",
        "phone",
        "note",
    )
    @classmethod
    def _strip_optional(cls, value: str | None) -> str | None:
        return strip_or_none(value)


class MieterUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=80)
    # PATCH erlaubt leeren String zum Loeschen des Vornamens; deshalb hier
    # keine Regex/Pflicht — Nachname bleibt jedoch nicht-leerbar (Validator).
    last_name: str | None = Field(default=None, min_length=1, max_length=80)
    address_street: str | None = Field(default=None, max_length=200)
    address_postcode: str | None = Field(default=None, max_length=20)
    address_city: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("last_name")
    @classmethod
    def _vn(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return strip_name(value)


class MieterRead(APIModel):
    id: int
    first_name: str | None
    last_name: str
    # „Nachname, Vorname" — aus der Model-Property ``Mieter.display_name``.
    display_name: str
    address_street: str | None
    address_postcode: str | None
    address_city: str | None
    email: str | None
    phone: str | None
    note: str | None
