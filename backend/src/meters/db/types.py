"""Eigene SQLAlchemy-Typen.

``DecimalText`` umgeht die SQLite-NUMERIC-Affinity-Falle, die Decimals als
REAL (float) speichern und damit Roundtrip-Fehler erzeugen würde. Alle
Decimal-Spalten der App nutzen daher TEXT-Storage.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import String
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator


class DecimalText(TypeDecorator[Decimal]):
    """Speichert ``Decimal`` als TEXT, um SQLite-NUMERIC-Affinity-Konvertierungen
    nach REAL (Float-Roundtrip) sicher zu vermeiden."""

    impl = String
    cache_ok = True

    def __init__(self, length: int = 32) -> None:
        super().__init__(length=length)

    def process_bind_param(self, value: Any, dialect: Dialect) -> str | None:
        del dialect
        if value is None:
            return None
        if not isinstance(value, Decimal):
            value = Decimal(str(value))
        return format(value, "f")

    def process_result_value(self, value: Any, dialect: Dialect) -> Decimal | None:
        del dialect
        if value is None:
            return None
        return Decimal(value)
