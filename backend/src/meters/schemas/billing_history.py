from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from meters.models import BillingRunStatus
from meters.schemas.common import DecimalStr, UtcDateTime

DiffStatus = Literal["gleich", "geaendert", "neu", "entfallen"]


class BillingRunDiffLine(BaseModel):
    """Eine Position im Vergleich zweier Versionen."""

    label: str
    status: DiffStatus
    felder: list[str]  # geaenderte Felder, z. B. ["stand_neu", "kwh", "eur"]
    kwh_alt: DecimalStr | None
    kwh_neu: DecimalStr | None
    eur_alt: DecimalStr | None
    eur_neu: DecimalStr | None
    kwh_delta: DecimalStr | None
    eur_delta: DecimalStr | None


class BillingRunDiffSide(BaseModel):
    """Kopfdaten einer der beiden Versionen."""

    run_id: int
    version: int
    status: BillingRunStatus
    begruendung: str | None
    finalized_at: UtcDateTime | None
    preis_eur: DecimalStr | None
    gesamt_eur: DecimalStr | None
    saldo_eur: DecimalStr | None


class BillingRunDiff(BaseModel):
    monat: str
    alt: BillingRunDiffSide
    neu: BillingRunDiffSide
    zeilen: list[BillingRunDiffLine]
    kwh_delta: DecimalStr
    eur_delta: DecimalStr


class BillingHistoryPoint(BaseModel):
    monat: str
    version: int
    kwh: DecimalStr
    eur: DecimalStr


class BillingHistoryRow(BaseModel):
    """Verlauf eines Empfaengers (oder einer Position) ueber die festgeschriebenen Monate."""

    name: str
    internal_allocation: bool
    punkte: list[BillingHistoryPoint]


class BillingHistory(BaseModel):
    monate: list[str]
    empfaenger: list[BillingHistoryRow]
    positionen: list[BillingHistoryRow]
