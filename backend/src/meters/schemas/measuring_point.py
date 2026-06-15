from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Self

from pydantic import BaseModel, Field, model_validator

from meters.models import HeatingSource, MeterType
from meters.schemas.common import APIModel, DecimalStr
from meters.schemas.physical_meter import PhysicalMeterRead
from meters.schemas.state import RegisterStateRead

# Erlaubte Einheiten für vom User definierte Wärme-Register.
# Die alten Wärme-Einheiten (h, L) bleiben für migrierte Heizöl-Bestände
# kompatibel; m³ ist auch für Gas-Heizungen sinnvoll.
ALLOWED_HEATING_UNITS = frozenset({"kWh", "MWh", "SRM", "CBM", "To", "h", "L", "m³"})


class HeatingRegisterCreate(BaseModel):
    """Vom User konfiguriertes Register für eine Heizungs-Messstelle."""

    label: str = Field(min_length=1, max_length=120)
    unit: str = Field(min_length=1, max_length=16)
    accepts_deliveries: bool = False
    initial_value: Decimal | None = Field(default=None, ge=Decimal("0"))
    max_value: Decimal | None = Field(default=None, ge=Decimal("0"))

    @model_validator(mode="after")
    def _unit_in_allowed(self) -> Self:
        if self.unit not in ALLOWED_HEATING_UNITS:
            raise ValueError(
                f"unit muss eine von {sorted(ALLOWED_HEATING_UNITS)} sein, war {self.unit!r}"
            )
        return self


class MeasuringPointBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: MeterType
    location_id: int | None = None
    is_bidirectional: bool = False
    has_dual_tariff: bool = False
    tank_capacity: Decimal | None = Field(default=None, gt=Decimal("0"))
    transformer_factor: int | None = Field(default=None, gt=0, le=10000)
    heating_source: HeatingSource | None = None
    # Vertragsnummer (Versorger-Kundennr.) — fuer Strom + Wasser. Marktlokation
    # (MaLo-ID, exakt 11 Ziffern) — nur Strom. Beide optional.
    contract_number: str | None = Field(default=None, max_length=64)
    market_location: str | None = Field(default=None, max_length=11, pattern=r"^\d{11}$")
    # Genauer Einbauort innerhalb des Standorts (z. B. „1. Stock, Wohnung 4b").
    installation_location: str | None = Field(default=None, max_length=200)
    # Kostenstelle: optionale Ganzzahl 0-99999 (keine fuehrenden Nullen), alle Typen.
    kostenstelle: int | None = Field(default=None, ge=0, le=99999)

    @model_validator(mode="after")
    def _tank_capacity_only_heating(self) -> Self:
        if self.tank_capacity is not None and self.type is not MeterType.HEATING:
            raise ValueError("tank_capacity ist nur für Wärme-Messstellen zulässig")
        return self

    @model_validator(mode="after")
    def _transformer_factor_only_electricity(self) -> Self:
        if self.transformer_factor is not None and self.type is not MeterType.ELECTRICITY:
            raise ValueError(
                "transformer_factor ist nur für Messstellen vom Typ 'electricity' zulässig"
            )
        return self

    @model_validator(mode="after")
    def _heating_source_requires_heating(self) -> Self:
        if self.type is MeterType.HEATING and self.heating_source is None:
            raise ValueError("heating_source ist für Wärme-Messstellen Pflicht")
        if self.type is not MeterType.HEATING and self.heating_source is not None:
            raise ValueError("heating_source ist nur für Wärme-Messstellen zulässig")
        return self

    @model_validator(mode="after")
    def _contract_number_only_electricity_or_water(self) -> Self:
        if self.contract_number is not None and self.type not in (
            MeterType.ELECTRICITY,
            MeterType.WATER,
        ):
            raise ValueError("contract_number ist nur für Strom- oder Wasser-Messstellen zulässig")
        return self

    @model_validator(mode="after")
    def _market_location_only_electricity(self) -> Self:
        if self.market_location is not None and self.type is not MeterType.ELECTRICITY:
            raise ValueError("market_location ist nur für Strom-Messstellen zulässig")
        return self


class MeasuringPointCreate(MeasuringPointBase):
    serial_number: str = Field(min_length=1, max_length=64)
    installed_at: date
    initial_values: dict[str, Decimal] = Field(default_factory=dict)
    # Nur für type=heating relevant: User-konfigurierte Register-Liste
    # statt OBIS-Defaults. Ihre Anfangsstände kommen aus
    # ``HeatingRegisterCreate.initial_value`` (initial_values bleibt für
    # Strom/Wasser, wo der OBIS-Code als Schlüssel dient).
    registers: list[HeatingRegisterCreate] = Field(default_factory=list)
    # Optionaler erster Eigentuemer + Stichtag (Default = installed_at).
    # Bleibt ``owner_id=None``, wird kein Assignment angelegt.
    owner_id: int | None = None
    owner_valid_from: date | None = None
    # Optionaler erster Lieferant — gleiche Semantik wie owner_id.
    supplier_id: int | None = None
    supplier_valid_from: date | None = None
    # Optionaler erster Mieter — gleiche Semantik wie owner_id (optional,
    # kein Assignment, wenn ``mieter_id=None``).
    mieter_id: int | None = None
    mieter_valid_from: date | None = None

    @model_validator(mode="after")
    def _registers_match_type(self) -> Self:
        if self.type is MeterType.HEATING and not self.registers:
            raise ValueError("Wärme-Messstellen brauchen mindestens ein Register")
        if self.type is not MeterType.HEATING and self.registers:
            raise ValueError("registers ist nur für Wärme-Messstellen zulässig")
        return self


class MeasuringPointUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    location_id: int | None = None
    clear_location: bool = False
    is_bidirectional: bool | None = None
    has_dual_tariff: bool | None = None
    tank_capacity: Decimal | None = Field(default=None, gt=Decimal("0"))
    clear_tank_capacity: bool = False
    transformer_factor: int | None = Field(default=None, gt=0, le=10000)
    clear_transformer_factor: bool = False
    heating_source: HeatingSource | None = None
    contract_number: str | None = Field(default=None, max_length=64)
    clear_contract_number: bool = False
    market_location: str | None = Field(default=None, max_length=64)
    clear_market_location: bool = False
    installation_location: str | None = Field(default=None, max_length=200)
    clear_installation_location: bool = False
    kostenstelle: int | None = Field(default=None, ge=0, le=99999)
    clear_kostenstelle: bool = False


class MeasuringPointRead(APIModel):
    id: int
    name: str
    type: MeterType
    location_id: int | None
    location_name: str | None = None
    # Hauptstandort wird zur Anzeige im Dashboard mitgeliefert — es ist der
    # ``main_location_id``/``name`` der gerade verknuepften Location (per
    # joined-load zweistufig). ``None``, wenn der Zaehlerstandort entweder
    # selbst nicht gesetzt ist oder keinen Hauptstandort hat.
    main_location_id: int | None = None
    main_location_name: str | None = None
    is_bidirectional: bool
    has_dual_tariff: bool
    tank_capacity: DecimalStr | None
    transformer_factor: int | None
    heating_source: HeatingSource | None
    contract_number: str | None = None
    market_location: str | None = None
    installation_location: str | None = None
    kostenstelle: int | None = None
    # Aktueller Eigentuemer (vom Router aus dem ``OwnerAssignment`` mit
    # ``valid_to IS NULL`` befuellt). ``None``, wenn aktuell keiner.
    current_owner_id: int | None = None
    current_owner_name: str | None = None
    # Aktueller Lieferant — gleiches Muster wie current_owner_*.
    current_supplier_id: int | None = None
    current_supplier_name: str | None = None
    # Aktueller Mieter — gleiches Muster; ``None``, wenn keine offene Periode.
    current_mieter_id: int | None = None
    current_mieter_name: str | None = None
    physical_meters: list[PhysicalMeterRead]


class ReplaceMeterRequest(BaseModel):
    final_readings: dict[str, DecimalStr]
    removed_at: date
    new_serial_number: str = Field(min_length=1, max_length=64)
    installed_at: date
    initial_readings: dict[str, DecimalStr] = Field(default_factory=dict)


class MeasuringPointWithStateRead(APIModel):
    """Eine Messstelle gebuendelt mit ihrem aktuellen Register-Stand.

    Datenquelle der Stammdaten-Detailseiten (Eigentuemer/Lieferant/Mieter):
    pro aktuell zugeordneter MP einmal die Stammdaten (``measuring_point``) plus
    den aktuellen Bestand je aktivem Register (``registers``) — serverseitig
    gebuendelt, damit das Frontend nur einen Request je Detailseite braucht.
    """

    measuring_point: MeasuringPointRead
    registers: list[RegisterStateRead]
