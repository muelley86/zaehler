"""Rechnungsparser (Phase 4a) - ausschliesslich fiktive Rechnungstexte (oeffentliches Repo)."""

import re
from datetime import date
from decimal import Decimal

import pytest

from meters.billing.invoice_pdf import (
    MAX_PDF_BYTES,
    InvoiceParseError,
    extract_text,
    parse_invoice_text,
)

FUSS = """Musterstrom AG Vorstand: Max Beispiel Amtsgericht Musterstadt
Musterweg 1, 12345 Musterstadt USt.ID: DE000000000"""

KOPF = """Rechnungsnr.: TEST-100
Rechnungsdat.:10.09.2026
Ihre Monatsrechnung für den Zeitraum {von} - {bis} für Strom (31 Tage)
Abnahmestellen-ID AID-000001
Marktlokation 12345678901
Verbrauch 1.000,00 kWh vorh. Verbrauch¹ 900,00 kWh
Leistungsspitze 12,50 kW Jahreshöchstwert 20,00 kW
Rechnungsbetrag (netto) {netto} EUR
Rechnungsbetrag (brutto) 1,00 EUR"""

ABSCHNITT_E = """Ihre Monatsrechnung für AID-000001
Tarif: Mustertarif
Energiebeschaffung
Nettopreis
USt.% Menge kWh Nettobetrag EUR
ct/kWh
Energielieferung Standard 01.08.2026 - 31.08.2026 19 1.000,00 10,0000 {betrag_e}
Gesamtbetrag (netto) 19 {summe_e}"""

ABSCHNITT_S = (
    """Steuern, Abgaben und Entgelte
Nettopreis
USt.% Menge kWh Nettobetrag EUR
ct/kWh
NEV-Umlage 01.01.2026 - 31.08.2026 19 1.000,00 1,5590 15,59
Beschaffungsentgelte / -nebenkosten 01.08.2026 - 19 4,41
31.08.2026
Seite 1 von 2
"""
    + FUSS
    + """
Ihre Monatsrechnung für AID-000001
{extra}Gesamtbetrag (netto) 19 {summe_s}"""
)

ABSCHNITT_N = """Netzentgelte
USt.% Nettobetrag EUR
Wirkarbeit - Netznutzung 01.07.2026 - 31.08.2026 19 1.230,00
Gesamtbetrag (netto) 19 1.230,00
Seite 2 von 2"""

DETAIL = """Netznutzungsentgelte im Detail
Stromsteuer 01.08.2026 - 1.000 kWh 2,0500 Ct/kWh 20,50 €
Gesamtbetrag (netto) 19 99,99"""


def _text(
    netto: str = "1.350,00",
    betrag_e: str = "100,00",
    summe_e: str = "100,00",
    summe_s: str = "20,00",
    extra: str = "",
    von: str = "01.08.2026",
    bis: str = "31.08.2026",
) -> str:
    return "\n".join(
        (
            KOPF.format(netto=netto, von=von, bis=bis),
            FUSS,
            ABSCHNITT_E.format(betrag_e=betrag_e, summe_e=summe_e),
            ABSCHNITT_S.format(extra=extra, summe_s=summe_s),
            ABSCHNITT_N,
            DETAIL,
        )
    )


def test_kopf_wird_gelesen() -> None:
    kopf = parse_invoice_text(_text()).kopf
    assert kopf.nummer == "TEST-100"
    assert kopf.datum == date(2026, 9, 10)
    assert kopf.aid == "AID-000001"
    assert kopf.marktlokation == "12345678901"
    assert (kopf.von, kopf.bis) == (date(2026, 8, 1), date(2026, 8, 31))
    assert kopf.verbrauch_kwh == Decimal("1000.00")
    assert kopf.leistungsspitze_kw == Decimal("12.50")
    assert kopf.betrag_netto == Decimal("1350.00")


def test_positionen_mit_standardnamen_und_folgedatum() -> None:
    gelesen = parse_invoice_text(_text())
    zeilen = {z.name: z for z in gelesen.zeilen}
    assert list(zeilen) == [
        "Energielieferung",
        "NEV-Umlage",
        "Beschaffungsentgelte / -nebenkosten",
        "Wirkarbeit - Netznutzung",
    ]
    energie = zeilen["Energielieferung"]
    assert (energie.menge, energie.preis_ct, energie.betrag) == (
        Decimal("1000.00"),
        Decimal("10.0000"),
        Decimal("100.00"),
    )
    assert energie.abschnitt == "Energiebeschaffung"
    beschaffung = zeilen["Beschaffungsentgelte / -nebenkosten"]
    assert beschaffung.zeitraum == "01.08.2026 - 31.08.2026"
    assert beschaffung.menge is None
    assert beschaffung.preis_ct is None
    assert all(z.kategorie is None for z in gelesen.zeilen)
    assert gelesen.hinweise == ()


def test_unbekannte_position_wird_reservezeile_mit_hinweis() -> None:
    extra = "Sonderentgelt Muster 01.08.2026 - 31.08.2026 19 5,00\n"
    gelesen = parse_invoice_text(_text(netto="1.355,00", summe_s="25,00", extra=extra))
    sonder = next(z for z in gelesen.zeilen if z.name == "Sonderentgelt Muster")
    assert sonder.kategorie == "Sonstige"
    assert any("Sonderentgelt Muster" in h for h in gelesen.hinweise)


def test_menge_mal_preis_abweichung_ist_hinweis() -> None:
    gelesen = parse_invoice_text(_text(netto="1.350,05", betrag_e="100,05", summe_e="100,05"))
    assert any("Menge x Preis" in h for h in gelesen.hinweise)


def test_position_im_falschen_abschnitt_ist_hinweis() -> None:
    extra = "Messstellenbetrieb 01.08.2026 - 31.08.2026 19 5,00\n"
    gelesen = parse_invoice_text(_text(netto="1.355,00", summe_s="25,00", extra=extra))
    assert any("Messstellenbetrieb: steht im PDF unter" in h for h in gelesen.hinweise)


def test_mehrmonatiger_zeitraum_ist_hinweis() -> None:
    gelesen = parse_invoice_text(_text(bis="30.09.2026"))
    assert any("mehr als einen Monat" in h for h in gelesen.hinweise)


@pytest.mark.parametrize(
    ("text", "meldung"),
    [
        (_text(summe_e="99,00"), "Abschnitt 'Energiebeschaffung'"),
        (_text(netto="1.000,00"), "Rechnungsbetrag netto"),
        (_text().replace("Rechnungsnr.: TEST-100", ""), "Rechnungsnr."),
        (_text().replace("Netzentgelte\n", ""), "Abschnitte nicht gefunden"),
        (_text(extra="Völlig unbekannte Zeile\n"), "Unbekannte Zeile"),
        (_text().replace("\n31.08.2026\nSeite", "\nSeite"), "Ende des Zeitraums fehlt"),
        (_text(von="31.02.2026"), "ungültiges Datum"),
        (_text(von="01.09.2026"), "endet vor seinem Beginn"),
    ],
)
def test_fehler(text: str, meldung: str) -> None:
    with pytest.raises(InvoiceParseError, match=re.escape(meldung)):
        parse_invoice_text(text)


def test_doppelte_position_ist_fehler() -> None:
    extra = "NEV-Umlage 01.01.2026 - 31.08.2026 19 5,00\n"
    with pytest.raises(InvoiceParseError, match="mehrfach"):
        parse_invoice_text(_text(netto="1.355,00", summe_s="25,00", extra=extra))


def test_extract_text_lehnt_nicht_pdf_und_uebergroesse_ab() -> None:
    with pytest.raises(InvoiceParseError, match="keine PDF"):
        extract_text(b"GIF89a")
    with pytest.raises(InvoiceParseError, match="zu groß"):
        extract_text(b"%PDF-" + b"0" * MAX_PDF_BYTES)


def test_extract_text_defekte_pdf() -> None:
    with pytest.raises(InvoiceParseError, match="defekt"):
        extract_text(b"%PDF-1.4\nkaputt")
