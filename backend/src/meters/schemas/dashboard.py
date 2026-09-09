"""DTOs fuer den gebuendelten Dashboard-Endpoint.

Liefert alles, was das Dashboard darstellt, in **einer** Antwort: das
Stammdaten-Minimum je Messstelle, ihre aktiven Register, den Zeitpunkt der
letzten Erfassung, die Verbrauchsreihe und die Perioden-Totals
(aktueller Zeitraum vs. Vorperiode).

Bewusst NICHT enthalten: Ablesungen und Register-Bestand. Beides hatte keinen
Konsumenten mehr und machte die Antwort um ein Vielfaches groesser; wer die
Details braucht, holt sie ueber die Einzel-Endpoints.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import Field

from meters.models import HeatingSource, MeterType
from meters.schemas.common import APIModel, DecimalStr, UtcDateTime
from meters.schemas.reading import ConsumptionPoint


class DashboardRegister(APIModel):
    """Ein aktives Register des aktuell eingebauten Zaehlers — nur die Felder,
    die das Dashboard fuer Beschriftung und Einheit braucht."""

    obis_code: str
    label: str
    unit: str


class DashboardTotal(APIModel):
    """Verbrauch im gewaehlten Zeitraum und in der Vorperiode.

    ``obis_code`` ist ``"virtual"`` bei verrechneten Messstellen (kein
    Quell-Register). ``current``/``previous`` sind ``None``, wenn kein Intervall
    die jeweilige Periode abdeckt — bewusst unterschieden von ``"0"``.
    """

    obis_code: str
    unit: str
    direction: Literal["bezug", "einspeisung"]
    current: DecimalStr | None
    previous: DecimalStr | None


class DashboardMeasuringPoint(APIModel):
    id: int
    name: str
    type: MeterType
    heating_source: HeatingSource | None
    location_id: int | None
    location_name: str | None
    main_location_id: int | None
    main_location_name: str | None
    current_owner_id: int | None
    current_owner_name: str | None
    kostenstelle: int | None
    installation_location: str | None
    registers: list[DashboardRegister]
    # Maximum ueber die aktiven Register; ``None``, solange nichts erfasst ist.
    last_reading_at: UtcDateTime | None
    consumption: list[ConsumptionPoint]
    totals: list[DashboardTotal]


class DashboardVirtualMeasuringPoint(APIModel):
    """Verrechnete Messstelle im Dashboard: Netto-Verbrauchsreihe und -Totals
    (beide koennen negativ sein). Stammdaten nur Standort/Hauptstandort —
    Eigentuemer/Kostenstelle gibt es bei abgeleiteten Werten nicht."""

    id: int
    name: str
    type: MeterType
    location_id: int | None
    location_name: str | None
    main_location_id: int | None
    main_location_name: str | None
    consumption: list[ConsumptionPoint]
    totals: list[DashboardTotal]


class DashboardResponse(APIModel):
    granularity: Literal["day", "week", "month", "year"] | None
    from_date: date | None
    to_date: date | None
    # Vorperiode; ``None``, wenn der Zeitraum nach einer Seite offen ist.
    previous_from_date: date | None
    previous_to_date: date | None
    # True fuer Nicht-Admins: der Recorder sieht nur die ihm zugewiesenen
    # Messstellen, die Summen sind also unvollstaendig (wie /reports/aggregate).
    partial: bool
    items: list[DashboardMeasuringPoint]
    virtual_items: list[DashboardVirtualMeasuringPoint] = Field(default_factory=list)
