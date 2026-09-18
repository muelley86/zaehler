from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from meters.schemas.common import DecimalStr


class BillingTransferRow(BaseModel):
    """Eine Zeile des Agrarmonitor-Formulars."""

    datum: date
    menge: DecimalStr
    beschreibung: str
    preis_eur: DecimalStr
    umsatzsteuer: DecimalStr
    betrag: DecimalStr  # Menge x Preis, wie Agrarmonitor rechnet
    betrag_lauf: DecimalStr  # Summe der Zaehlerbetraege des Laufs (Rechnungsanhang)
    positionen: list[str]


class BillingTransferState(BaseModel):
    id: int
    belegnummer: str | None
    note: str | None
    transferred_at: datetime
    transferred_by: int | None


class BillingTransferRead(BaseModel):
    owner_name: str
    internal_allocation: bool
    rows: list[BillingTransferRow]
    netto: DecimalStr
    brutto: DecimalStr
    netto_lauf: DecimalStr
    differenz: DecimalStr  # netto - netto_lauf (Rundung je Rechnungszeile statt je Zaehler)
    transfer: BillingTransferState | None


class BillingTransferView(BaseModel):
    run_id: int
    monat: str
    monatsname: str
    stichtag: date
    kopfsatz: str
    preis_eur: DecimalStr
    umsatzsteuer: DecimalStr
    empfaenger: list[BillingTransferRead]


class BillingTransferCreate(BaseModel):
    owner_name: str = Field(min_length=1, max_length=200)
    belegnummer: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=500)
