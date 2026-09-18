"""Uebernahme eines Monats-JSON (Excel-Weg) in einen Abrechnungsentwurf (Plan Phase 6)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from meters.schemas.common import DecimalStr

ExcelImportStatus = Literal[
    "gleich",  # Werte der Datei = Werte des Laufs
    "abweichend",  # wird bei der Uebernahme als manueller Wert gesetzt
    "unbekannt",  # Bezeichnung gibt es im Lauf nicht
    "nicht_uebernehmbar",  # z. B. nur kWh (Verbrauch manuell) oder Stand unvollstaendig
    "fehlt_in_datei",  # Zaehlerposition des Laufs ohne Eintrag in der Datei
    "rest",  # Restposition, wird immer gerechnet
]


class ExcelImportLine(BaseModel):
    label: str
    status: ExcelImportStatus
    hinweis: str | None = None
    app_stand_alt: DecimalStr | None = None
    app_stand_neu: DecimalStr | None = None
    app_korrektur: DecimalStr | None = None
    excel_stand_alt: DecimalStr | None = None
    excel_stand_neu: DecimalStr | None = None
    excel_korrektur: DecimalStr | None = None


ParameterFeld = Literal["zusatzkosten", "aufschlag_prozent", "aufschlag_ct"]


class ExcelImportParameter(BaseModel):
    feld: ParameterFeld
    app: DecimalStr
    excel: DecimalStr


class BillingExcelImportRead(BaseModel):
    uebernommen: bool
    zeilen: list[ExcelImportLine]
    parameter: list[ExcelImportParameter]
