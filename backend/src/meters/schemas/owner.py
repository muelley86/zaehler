from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from meters.schemas.common import APIModel


def _strip_or_none(value: str | None) -> str | None:
    """Leerer / Whitespace-only String → None. Sonst getrimmt."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _strip_name(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("name darf nicht leer oder nur Whitespace sein")
    return stripped


class OwnerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address_street: str | None = Field(default=None, max_length=200)
    address_postcode: str | None = Field(default=None, max_length=20)
    address_city: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=64)
    vat_id: str | None = Field(default=None, max_length=32)
    tax_id: str | None = Field(default=None, max_length=32)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def _vn(cls, value: str) -> str:
        return _strip_name(value)

    @field_validator(
        "address_street",
        "address_postcode",
        "address_city",
        "email",
        "phone",
        "vat_id",
        "tax_id",
        "note",
    )
    @classmethod
    def _strip_optional(cls, value: str | None) -> str | None:
        return _strip_or_none(value)


class OwnerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    address_street: str | None = Field(default=None, max_length=200)
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
        return _strip_name(value)


class OwnerRead(APIModel):
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
