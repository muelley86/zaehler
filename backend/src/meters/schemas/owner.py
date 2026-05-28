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


_POSTCODE_RE = r"^\d{5}$"
_VAT_RE = r"^[A-Z]{2}[A-Z0-9]{2,18}$"
# Bewusst lockerer als RFC 5322 — wir wollen Tippfehler abfangen, nicht
# jede gueltige E-Mail blockieren.
_EMAIL_RE = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


def _normalize_vat(value: str | None) -> str | None:
    """Auto-uppercase und strip; leerer String → None."""
    if value is None:
        return None
    stripped = value.strip().upper()
    return stripped or None


class OwnerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address_street: str | None = Field(default=None, max_length=200)
    address_postcode: str | None = Field(default=None, max_length=5, pattern=_POSTCODE_RE)
    address_city: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200, pattern=_EMAIL_RE)
    phone: str | None = Field(default=None, max_length=64)
    vat_id: str | None = Field(default=None, max_length=20, pattern=_VAT_RE)
    tax_id: str | None = Field(default=None, max_length=32)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def _vn(cls, value: str) -> str:
        return _strip_name(value)

    @field_validator("vat_id", mode="before")
    @classmethod
    def _vat_normalize(cls, value: str | None) -> str | None:
        return _normalize_vat(value)

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
        return _strip_or_none(value)


class OwnerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    address_street: str | None = Field(default=None, max_length=200)
    # PATCH erlaubt leeren String zum Loeschen; deshalb keine pattern-Regex
    # auf Schema-Ebene — die Pruefung verlagern wir in den API-Layer
    # (Strip + Regex pruefen, NULL fuer leeren String). Sonst koennten wir
    # nicht mit "" zurueck auf NULL setzen, ohne 422 zu kassieren.
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
