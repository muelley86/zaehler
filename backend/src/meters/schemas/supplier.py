from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from meters.schemas._master_data import (
    EMAIL_RE,
    POSTCODE_RE,
    VAT_RE,
    normalize_vat,
    strip_name,
    strip_or_none,
)
from meters.schemas.common import APIModel


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address_street: str | None = Field(default=None, max_length=200)
    address_postcode: str | None = Field(default=None, max_length=5, pattern=POSTCODE_RE)
    address_city: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200, pattern=EMAIL_RE)
    phone: str | None = Field(default=None, max_length=64)
    vat_id: str | None = Field(default=None, max_length=20, pattern=VAT_RE)
    tax_id: str | None = Field(default=None, max_length=32)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def _vn(cls, value: str) -> str:
        return strip_name(value)

    @field_validator("vat_id", mode="before")
    @classmethod
    def _vat_normalize(cls, value: str | None) -> str | None:
        return normalize_vat(value)

    @field_validator(
        "address_street",
        "address_postcode",
        "address_city",
        "email",
        "phone",
        "tax_id",
        "note",
    )
    @classmethod
    def _strip_optional(cls, value: str | None) -> str | None:
        return strip_or_none(value)


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    address_street: str | None = Field(default=None, max_length=200)
    # PATCH erlaubt leeren String zum Loeschen; deshalb keine pattern-Regex
    # auf Schema-Ebene — wie beim Owner-Update (siehe schemas/owner.py).
    address_postcode: str | None = Field(default=None, max_length=20)
    address_city: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=64)
    vat_id: str | None = Field(default=None, max_length=32)
    tax_id: str | None = Field(default=None, max_length=32)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def _vn(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return strip_name(value)


class SupplierRead(APIModel):
    id: int
    name: str
    address_street: str | None
    address_postcode: str | None
    address_city: str | None
    email: str | None
    phone: str | None
    vat_id: str | None
    tax_id: str | None
    note: str | None
