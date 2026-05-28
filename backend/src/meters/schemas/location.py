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


def _strip_or_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class LocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    address_street: str | None = Field(default=None, max_length=200)
    address_postcode: str | None = Field(default=None, max_length=20)
    address_city: str | None = Field(default=None, max_length=120)
    main_location_id: int | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        result = _strip_nonempty(value)
        assert result is not None
        return result

    @field_validator("address_street", "address_postcode", "address_city")
    @classmethod
    def _strip_address(cls, value: str | None) -> str | None:
        return _strip_or_none(value)


class LocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    clear_coordinates: bool = False
    address_street: str | None = Field(default=None, max_length=200)
    address_postcode: str | None = Field(default=None, max_length=20)
    address_city: str | None = Field(default=None, max_length=120)
    # Hauptstandort-Zuordnung: ``None`` als Wert allein ist nicht aussage-
    # kraeftig (= „nicht aendern"). Mit ``clear_main_location=True`` kann
    # der Admin die Zuordnung explizit aufheben.
    main_location_id: int | None = None
    clear_main_location: bool = False

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        return _strip_nonempty(value)


class LocationRead(APIModel):
    id: int
    name: str
    note: str | None
    latitude: float | None
    longitude: float | None
    address_street: str | None = None
    address_postcode: str | None = None
    address_city: str | None = None
    main_location_id: int | None = None
    main_location_name: str | None = None
