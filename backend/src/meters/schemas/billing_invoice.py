from __future__ import annotations

from datetime import date, datetime

from meters.schemas.common import APIModel, DecimalStr


class BillingInvoicePositionRead(APIModel):
    id: int
    sort_order: int
    name: str
    abschnitt: str
    zeitraum: str
    menge: DecimalStr | None
    preis_ct: DecimalStr | None
    betrag: DecimalStr
    kategorie: str | None


class BillingInvoiceRead(APIModel):
    id: int
    circle_id: int
    nummer: str
    datum: date
    aid: str
    marktlokation: str
    period_from: date
    period_to: date
    period_month: str  # JJJJ-MM, beim Import aus dem Zeitraum abgeleitet (kanonische Zuordnung)
    verbrauch_kwh: DecimalStr
    leistungsspitze_kw: DecimalStr
    betrag_netto: DecimalStr
    hinweise: list[str]
    pdf_sha256: str
    pdf_size: int
    pdf_filename: str
    uploaded_by: int | None
    created_at: datetime
    positions: list[BillingInvoicePositionRead]
