from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, PlainSerializer

DecimalStr = Annotated[
    Decimal,
    PlainSerializer(lambda v: format(v, "f"), return_type=str, when_used="json"),
]


def format_decimal_de(value: Decimal) -> str:
    """Decimal als deutscher Dezimalstring: Komma statt Punkt, kein Tausender-
    Trennzeichen. Für CSV-Exporte (Excel/LibreOffice, DE-Locale).

    ``format(value, "f")`` erzeugt nie Tausender-Trennzeichen und nie
    wissenschaftliche Notation — es muss nur der Dezimalpunkt zum Komma werden.
    JSON-Dumps bleiben bewusst Punkt-Dezimal (Maschinen-Format, siehe
    :data:`DecimalStr`).
    """
    return format(value, "f").replace(".", ",")


def csv_guard_formula(value: str) -> str:
    """Schutz vor CSV-Formel-Injection in Excel/LibreOffice: Werte, die mit
    ``=`` ``+`` ``-`` ``@`` beginnen, werden mit einem Apostroph geprefixt, damit
    Tabellen sie als Text statt als Formel interpretieren. Spiegelt den Frontend-
    ``csvField``-Helper.

    **Nur auf freie Textfelder anwenden** — NICHT auf formatierte Zahlen
    (führendes Minus!) oder Datumswerte.
    """
    if value[:1] in {"=", "+", "-", "@"}:
        return "'" + value
    return value


def to_utc_iso(dt: datetime | None) -> str | None:
    """Naive UTC-``datetime`` → ISO-8601-String mit ``Z``. ``None`` → ``None``.

    Pendant zu ``UtcDateTime``-Serializer, aber als reine Funktion fuer
    Stellen, die nicht durch Pydantic laufen (Audit-Diffs, Plausibility-
    Antworten, CSV/JSON-Exports). Idempotent.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _serialize_utc(dt: datetime) -> str:
    """Serialisiere ``datetime`` als ISO-8601 mit explizitem ``Z``.

    SQLite kennt keine Zeitzonen; DB-Zeilen kommen daher als naive ``datetime``
    zurück, obwohl wir intern konsequent ``datetime.now(UTC)`` nutzen. Ohne
    ``Z`` interpretiert JavaScripts ``new Date(...)`` (per ES2017) einen ISO-
    String mit Zeitanteil als **lokale** Zeit — die Anzeige wäre damit um den
    UTC-Offset verschoben. Wir markieren die Ausgabe deshalb beim Serialisieren
    konsequent als UTC.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


UtcDateTime = Annotated[
    datetime,
    PlainSerializer(_serialize_utc, return_type=str, when_used="json"),
]


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ProblemDetails(BaseModel):
    """RFC 7807."""

    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
