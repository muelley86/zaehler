"""DTOs für den Zählerstand-Import (historische Stände aus Excel/CSV).

Ablauf: ``preview`` parst die hochgeladene Datei und liefert je Zeile den
Roh-Messstellennamen + Auto-Match + geparste Zellen; ``commit`` bekommt das
vom Admin aufgelöste Mapping (Register je Zeile) und legt die Readings an.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field

from meters.schemas.common import DecimalStr

# --- Preview (Antwort auf den Datei-Upload) -------------------------------


class ImportCell(BaseModel):
    """Eine Zelle = Wert einer Messstelle (Zeile) in einem Monat (Spalte)."""

    reading_date: date
    raw: str
    value: DecimalStr | None = None
    error: str | None = None


class ImportRow(BaseModel):
    index: int
    raw_name: str
    matched_mp_id: int | None = None
    cells: list[ImportCell]


class ImportPreviewResponse(BaseModel):
    # Spaltenüberschriften, die als Datum erkannt wurden (Reihenfolge = Spalten).
    reading_dates: list[date]
    rows: list[ImportRow]
    # Spaltenüberschriften, die NICHT als Datum interpretierbar waren -> ignoriert.
    ignored_columns: list[str] = Field(default_factory=list)


# --- Commit (aufgelöstes Mapping -> Readings anlegen) ---------------------


class ImportCommitCell(BaseModel):
    reading_date: date
    value: Decimal


class ImportCommitRow(BaseModel):
    register_id: int
    cells: list[ImportCommitCell] = Field(min_length=1)


class ImportCommitRequest(BaseModel):
    rows: list[ImportCommitRow] = Field(min_length=1)
    source_filename: str | None = Field(default=None, max_length=255)


class ImportFailure(BaseModel):
    register_id: int
    reading_date: date
    reason: str


class ImportCommitResponse(BaseModel):
    created: int
    skipped_existing: int
    failed: list[ImportFailure] = Field(default_factory=list)
