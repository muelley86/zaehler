"""Gemeinsame Validierungs-Helper fuer Stammdaten-Schemas (Owner, Supplier).

Owner und Supplier teilen denselben Feldsatz (Name, Adresse, Kontakt,
Steuer-IDs, Notiz) und damit dieselben Normalisierungen. Die Helper leben
hier zentral, damit die beiden Schema-Module nicht driften.
"""

from __future__ import annotations

POSTCODE_RE = r"^\d{5}$"
VAT_RE = r"^[A-Z]{2}[A-Z0-9]{2,18}$"
# Bewusst lockerer als RFC 5322 — wir wollen Tippfehler abfangen, nicht
# jede gueltige E-Mail blockieren.
EMAIL_RE = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


def strip_or_none(value: str | None) -> str | None:
    """Leerer / Whitespace-only String → None. Sonst getrimmt."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def strip_name(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("name darf nicht leer oder nur Whitespace sein")
    return stripped


def normalize_vat(value: str | None) -> str | None:
    """Auto-uppercase und strip; leerer String → None."""
    if value is None:
        return None
    stripped = value.strip().upper()
    return stripped or None
