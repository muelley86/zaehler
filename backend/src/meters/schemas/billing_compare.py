"""Vergleich frei gewaehlter Abrechnungslaeufe eines Kreises (zwei Monate oder eine Reihe)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from meters.models import BillingRunStatus
from meters.schemas.common import DecimalStr

# eur_kwh = Preis je kWh; prozent = Kennzahl ist selbst ein Prozentwert (Abweichung in Punkten).
CompareUnit = Literal["eur", "kwh", "eur_kwh", "prozent"]


class BillingCompareRun(BaseModel):
    """Ein Lauf der Auswahl - die Spalte der Vergleichstabellen."""

    run_id: int
    monat: str
    version: int
    status: BillingRunStatus
    hat_ergebnis: bool


class BillingCompareValue(BaseModel):
    """Wert einer Zeile in einem Lauf samt Abweichung zum vorherigen Lauf der Auswahl.

    ``wert`` ist ``None``, wenn es die Zeile in diesem Lauf nicht gibt (oder der Lauf kein Ergebnis
    hat). ``delta`` fehlt beim ersten Lauf und immer dann, wenn einer der beiden Werte fehlt;
    ``delta_prozent`` zusaetzlich, wenn der Vorwert 0 ist.
    """

    wert: DecimalStr | None
    delta: DecimalStr | None
    delta_prozent: DecimalStr | None


class BillingCompareMetric(BaseModel):
    """Eine Kennzahl des Ergebnisses ueber alle Laeufe (``werte`` in Lauf-Reihenfolge)."""

    key: str
    einheit: CompareUnit
    werte: list[BillingCompareValue]


class BillingCompareRow(BaseModel):
    """Ein Empfaenger oder eine Position ueber alle Laeufe (``kwh``/``eur`` in Lauf-Reihenfolge)."""

    name: str
    internal_allocation: bool
    # Stammdaten-Merkmale, die sich innerhalb der Auswahl geaendert haben (nur Positionen).
    merkmale_geaendert: list[str]
    kwh: list[BillingCompareValue]
    eur: list[BillingCompareValue]


class BillingComparison(BaseModel):
    laeufe: list[BillingCompareRun]
    kennzahlen: list[BillingCompareMetric]
    empfaenger: list[BillingCompareRow]
    positionen: list[BillingCompareRow]
