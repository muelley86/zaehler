from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from meters.models import BillingRunStatus
from meters.schemas.common import DecimalStr


class BillingAttachmentHead(BaseModel):
    circle_code: str
    circle_name: str
    rechnungsleger: str
    abnahmestelle: str
    marktlokation: str | None
    monat: str
    monatsname: str
    version: int
    status: BillingRunStatus
    rechnung_nummer: str
    rechnung_datum: date
    zeitraum_von: date
    zeitraum_bis: date


class BillingAttachmentSummary(BaseModel):
    """Preisermittlung und Summen des Laufs (gleich fuer alle Empfaenger)."""

    einkaufspreis_ct: DecimalStr
    umlagepreis_ct: DecimalStr
    preis_ct: DecimalStr
    preis_eur: DecimalStr
    bezugsmenge: DecimalStr
    zaehlersumme: DecimalStr
    gesamtkosten: DecimalStr
    gesamt_eur: DecimalStr
    umsatzsteuer: DecimalStr


class BillingAttachmentLine(BaseModel):
    label: str
    kostenstelle: int | None
    serial_numbers: str
    transformer_factor: int | None
    stand_alt: DecimalStr | None
    stand_alt_art: str | None  # abgelesen | interpoliert | nur_davor | nur_danach | manuell
    stand_neu: DecimalStr | None
    stand_neu_art: str | None
    korrektur_kwh: DecimalStr | None
    kwh: DecimalStr | None
    eur: DecimalStr | None
    invoice_line: str | None


class BillingAttachmentKst(BaseModel):
    kst: str | None
    kwh: DecimalStr
    eur: DecimalStr


class BillingAttachmentPosition(BaseModel):
    name: str
    betrag: DecimalStr
    ct: DecimalStr


class BillingAttachmentSection(BaseModel):
    """Abschnitt der Lieferantenrechnung mit Zwischensumme."""

    name: str
    positionen: list[BillingAttachmentPosition]
    summe: DecimalStr
    ct: DecimalStr


class BillingAttachmentRecipient(BaseModel):
    owner_name: str
    internal_allocation: bool
    lines: list[BillingAttachmentLine]
    kostenstellen: list[BillingAttachmentKst]
    abschnitte: list[BillingAttachmentSection]
    kwh: DecimalStr
    eur: DecimalStr
    gesamt_ct: DecimalStr


class BillingAttachmentRead(BaseModel):
    head: BillingAttachmentHead
    summary: BillingAttachmentSummary
    empfaenger: list[BillingAttachmentRecipient]
