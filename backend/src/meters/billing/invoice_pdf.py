"""Monatsrechnung des Stromlieferanten (PDF) lesen - Plan Phase 4a.

Portierung von ``Stromabrechnung/tools/stromabrechnung/pdf_import.py`` (Parser-Teil). Gelesen werden
der Rechnungskopf und die Positionen der drei Abschnitte (``ABSCHNITTE``); der Detailanhang wird
ignoriert. Strenge Pruefungen statt stiller Verluste: jede Zeile eines Abschnitts muss lesbar sein,
Abschnittssummen und Rechnungsbetrag netto muessen centgenau aufgehen. Abweichungen, die die
Rechnung nicht unbrauchbar machen, landen als Hinweis.
"""

from __future__ import annotations

import io
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from meters.billing.calculation import (
    ABSCHNITTE,
    STANDARD_POSITIONEN,
    PositionsDefinition,
    round_half_up,
)

MAX_PDF_BYTES = 10 * 1024 * 1024  # Monatsrechnungen ca. 0,5 MB; groessere Dateien sind verdaechtig
MAX_SEITEN = 30
TOLERANZ_EUR = Decimal("0.01")

_ZAHL = r"-?\d{1,3}(?:\.\d{3})*,\d+"
_DATUM = r"\d{2}\.\d{2}\.\d{4}"
_KOPF: tuple[tuple[str, str, str], ...] = (
    ("nummer", "Rechnungsnr.", r"Rechnungsnr\.:\s*(\S+)"),
    ("datum", "Rechnungsdatum", rf"Rechnungsdat\.:\s*({_DATUM})"),
    ("aid", "Abnahmestellen-ID", r"Abnahmestellen-ID (AID-\d+)"),
    ("marktlokation", "Marktlokation", r"Marktlokation (\d+)"),
    ("von", "Zeitraum von", rf"Zeitraum ({_DATUM}) - {_DATUM}"),
    ("bis", "Zeitraum bis", rf"Zeitraum {_DATUM} - ({_DATUM})"),
    ("verbrauch_kwh", "Verbrauch", rf"^Verbrauch ({_ZAHL}) kWh"),
    ("leistungsspitze_kw", "Leistungsspitze", rf"^Leistungsspitze ({_ZAHL}) kW"),
    ("betrag_netto", "Rechnungsbetrag (netto)", rf"^Rechnungsbetrag \(netto\) ({_ZAHL}) EUR"),
)
_POSITION = re.compile(
    rf"^(?P<name>.+?) (?P<von>{_DATUM}) - (?:(?P<bis>{_DATUM}) )?\d{{1,2}} "
    rf"(?P<zahlen>{_ZAHL}(?: {_ZAHL})*)$"
)
_FOLGEDATUM = re.compile(rf"^({_DATUM})$")
_GESAMT = re.compile(rf"^Gesamtbetrag \(netto\) \d{{1,2}} ({_ZAHL})$")
_IGNORIERT = re.compile(r"^(Nettopreis|ct/kWh|USt\.%.*|Tarif: .*)$")
_SEITENENDE = re.compile(r"^Seite \d+ von \d+$")
_SEITENKOPF = "Ihre Monatsrechnung für"


class InvoiceParseError(ValueError):
    """Rechnung nicht (vollstaendig) lesbar oder Summen gehen nicht auf."""


@dataclass(frozen=True)
class RechnungsKopf:
    nummer: str
    datum: date
    aid: str
    marktlokation: str
    von: date
    bis: date
    verbrauch_kwh: Decimal
    leistungsspitze_kw: Decimal
    betrag_netto: Decimal


@dataclass(frozen=True)
class RechnungsZeile:
    name: str
    abschnitt: str
    zeitraum: str  # "TT.MM.JJJJ - TT.MM.JJJJ" wie im PDF
    betrag: Decimal
    menge: Decimal | None
    preis_ct: Decimal | None
    kategorie: str | None  # "Sonstige" fuer unbekannte Positionen (Reservezeilen), sonst None


@dataclass(frozen=True)
class GeleseneRechnung:
    kopf: RechnungsKopf
    zeilen: tuple[RechnungsZeile, ...]
    hinweise: tuple[str, ...]


def extract_text(daten: bytes) -> str:
    """Text aller Seiten; Groessen- und Seitenlimit, jeder Lesefehler wird zu InvoiceParseError."""
    if len(daten) > MAX_PDF_BYTES:
        raise InvoiceParseError(f"PDF ist zu groß ({len(daten)} Bytes, erlaubt {MAX_PDF_BYTES}).")
    if not daten.startswith(b"%PDF-"):
        raise InvoiceParseError("Die Datei ist keine PDF.")
    import pdfplumber  # erst hier: nur der Rechnungsimport braucht die Bibliothek

    try:
        with pdfplumber.open(io.BytesIO(daten)) as pdf:
            if len(pdf.pages) > MAX_SEITEN:
                raise InvoiceParseError(f"PDF hat mehr als {MAX_SEITEN} Seiten.")
            return "\n".join(seite.extract_text() or "" for seite in pdf.pages)
    except InvoiceParseError:
        raise
    except Exception as exc:  # pdfminer wirft je nach Defekt unterschiedliche Typen
        raise InvoiceParseError("PDF ist defekt oder nicht lesbar.") from exc


def _zahl(text: str) -> Decimal:
    return Decimal(text.replace(".", "").replace(",", "."))


def _datum(text: str) -> date:
    return datetime.strptime(text, "%d.%m.%Y").date()


def _kopf(text: str) -> RechnungsKopf:
    werte: dict[str, str] = {}
    fehlend = []
    for schluessel, bezeichnung, muster in _KOPF:
        treffer = re.search(muster, text, re.MULTILINE)
        if treffer is None:
            fehlend.append(bezeichnung)
        else:
            werte[schluessel] = treffer.group(1)
    if fehlend:
        raise InvoiceParseError(f"Rechnungskopf unvollständig: {', '.join(fehlend)}")
    try:
        return RechnungsKopf(
            nummer=werte["nummer"],
            datum=_datum(werte["datum"]),
            aid=werte["aid"],
            marktlokation=werte["marktlokation"],
            von=_datum(werte["von"]),
            bis=_datum(werte["bis"]),
            verbrauch_kwh=_zahl(werte["verbrauch_kwh"]),
            leistungsspitze_kw=_zahl(werte["leistungsspitze_kw"]),
            betrag_netto=_zahl(werte["betrag_netto"]),
        )
    except ValueError as exc:  # z. B. 31.02.2026
        raise InvoiceParseError("Rechnungskopf enthält ein ungültiges Datum.") from exc


def _positionsname(roh: str, positionen: Sequence[PositionsDefinition]) -> tuple[str, bool]:
    """PDF-Name -> Standardname (auch mit Zusatz, z. B. "Energielieferung Standard")."""
    for p in positionen:
        if roh == p.name or roh.startswith(p.name + " "):
            return p.name, True
    return roh, False


@dataclass
class _Roh:
    name: str
    abschnitt: str
    von: str
    bis: str | None
    bekannt: bool
    betrag: Decimal
    menge: Decimal | None = None
    preis_ct: Decimal | None = None


class _Leser:
    """Zustandsautomat ueber die Textzeilen: Abschnittstitel -> Positionen -> Gesamtbetrag."""

    def __init__(self, positionen: Sequence[PositionsDefinition]) -> None:
        self.positionen = positionen
        self.abschnitt: str | None = None
        self.summe = Decimal("0")
        self.geschlossen: list[str] = []
        self.fuss = False  # zwischen "Seite x von y" und dem Kopf der naechsten Seite
        self.zeilen: list[_Roh] = []
        self.offen: _Roh | None = None  # Position, deren "bis"-Datum in der Folgezeile steht

    def zeile(self, zeile: str) -> None:
        if _SEITENENDE.match(zeile):
            self.fuss = True
        elif zeile.startswith(_SEITENKOPF):
            self.fuss = False
        elif self.fuss or len(self.geschlossen) == len(ABSCHNITTE):
            return  # Seitenfuss bzw. alles nach den drei Abschnitten
        elif zeile in ABSCHNITTE and zeile not in self.geschlossen:
            self._pruefe_offen()
            self.abschnitt, self.summe = zeile, Decimal("0")
        elif self.abschnitt is not None:
            self._im_abschnitt(self.abschnitt, zeile)

    def _im_abschnitt(self, abschnitt: str, zeile: str) -> None:
        folge = _FOLGEDATUM.match(zeile)
        if self.offen is not None and folge:
            self.offen.bis, self.offen = folge.group(1), None
            return
        self._pruefe_offen()
        gesamt, position = _GESAMT.match(zeile), _POSITION.match(zeile)
        if gesamt:
            self._schliesse(abschnitt, _zahl(gesamt.group(1)))
        elif position:
            self._position(abschnitt, position)
        elif not _IGNORIERT.match(zeile):
            raise InvoiceParseError(f"Unbekannte Zeile im Abschnitt {abschnitt!r}: {zeile!r}")

    def _position(self, abschnitt: str, m: re.Match[str]) -> None:
        zahlen = [_zahl(z) for z in m.group("zahlen").split()]
        if len(zahlen) not in (1, 3):
            raise InvoiceParseError(
                f"Position {m.group('name')!r}: {len(zahlen)} Zahlen statt 1 oder 3"
            )
        name, bekannt = _positionsname(m.group("name"), self.positionen)
        roh = _Roh(name, abschnitt, m.group("von"), m.group("bis"), bekannt, zahlen[-1])
        if len(zahlen) == 3:
            roh.menge, roh.preis_ct = zahlen[0], zahlen[1]
        self.summe += roh.betrag
        self.zeilen.append(roh)
        self.offen = roh if roh.bis is None else None

    def _pruefe_offen(self) -> None:
        if self.offen is not None:
            raise InvoiceParseError(f"Position {self.offen.name!r}: Ende des Zeitraums fehlt")

    def _schliesse(self, abschnitt: str, gesamt: Decimal) -> None:
        if self.summe != gesamt:
            raise InvoiceParseError(
                f"Abschnitt {abschnitt!r}: Summe der Positionen {self.summe} "
                f"≠ Gesamtbetrag {gesamt}"
            )
        self.geschlossen.append(abschnitt)
        self.abschnitt = None

    def ende(self) -> list[_Roh]:
        self._pruefe_offen()
        fehlend = [a for a in ABSCHNITTE if a not in self.geschlossen]
        if fehlend:
            raise InvoiceParseError(
                f"Abschnitte nicht gefunden oder ohne Gesamtbetrag: {', '.join(fehlend)}"
            )
        return self.zeilen


def _hinweise(zeilen: list[_Roh], positionen: Sequence[PositionsDefinition]) -> list[str]:
    abschnitt_von = {p.name: p.abschnitt for p in positionen}
    hinweise = []
    for z in zeilen:
        if (
            z.menge is not None
            and z.preis_ct is not None
            and abs(round_half_up(z.menge * z.preis_ct / 100, 2) - z.betrag) > TOLERANZ_EUR
        ):
            hinweise.append(
                f"{z.name}: Menge x Preis ≠ Betrag ({z.menge} x {z.preis_ct} ct ≠ {z.betrag})"
            )
        if not z.bekannt:
            hinweise.append(f"{z.name}: unbekannte Position -> Reservezeile (Kategorie Sonstige)")
        elif abschnitt_von[z.name] != z.abschnitt:
            hinweise.append(f"{z.name}: steht im PDF unter {z.abschnitt!r}")
    return hinweise


def parse_invoice_text(
    text: str, positionen: Sequence[PositionsDefinition] = STANDARD_POSITIONEN
) -> GeleseneRechnung:
    kopf = _kopf(text)
    leser = _Leser(positionen)
    for zeile in text.splitlines():
        leser.zeile(zeile.strip())
    roh = leser.ende()
    summe = sum((z.betrag for z in roh), Decimal("0"))
    if summe != kopf.betrag_netto:
        raise InvoiceParseError(
            f"Summe der Positionen {summe} ≠ Rechnungsbetrag netto {kopf.betrag_netto}"
        )
    if len({z.name for z in roh}) != len(roh):
        raise InvoiceParseError("Eine Position steht mehrfach in der Rechnung.")
    if kopf.bis < kopf.von:
        raise InvoiceParseError("Rechnungszeitraum endet vor seinem Beginn.")
    hinweise = _hinweise(roh, positionen)
    if (kopf.von.year, kopf.von.month) != (kopf.bis.year, kopf.bis.month):
        hinweise.append("Rechnungszeitraum umfasst mehr als einen Monat; Monat laut Beginn")
    zeilen = tuple(
        RechnungsZeile(
            name=z.name,
            abschnitt=z.abschnitt,
            zeitraum=f"{z.von} - {z.bis}",
            betrag=z.betrag,
            menge=z.menge,
            preis_ct=z.preis_ct,
            kategorie=None if z.bekannt else "Sonstige",
        )
        for z in roh
    )
    return GeleseneRechnung(kopf=kopf, zeilen=zeilen, hinweise=tuple(hinweise))


def read_invoice_pdf(daten: bytes) -> GeleseneRechnung:
    return parse_invoice_text(extract_text(daten))
