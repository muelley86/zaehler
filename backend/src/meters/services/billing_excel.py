"""Excel-Bruecke (Plan Phase 6): Abrechnungslauf als Monats-JSON fuer den Excel-Generator.

Das Ergebnis ist die Eingabedatei ``tools/data/JJJJ-MM_<Kreis>.json`` des Projekts
Stromabrechnung (Format ``docs/DATENFORMAT.md`` dort): ``generate.py --excel`` erzeugt daraus die
Monatsmappe wie bisher. Regeln des Formats, die hier gelten:

- Zahlen als JSON-Zahlen (der Generator liest mit ``parse_float=Decimal``, Text bliebe Text) -
  deshalb ein eigener Serialisierer, der ``Decimal`` exakt schreibt, nie ueber ``float``.
- je Verbraucher Staende, Korrektur, Zaehlernummer, Datum, Quelle, Bemerkung; der Wandlerfaktor
  kommt im Generator nur aus den Stammdaten (ein Feld ``faktor`` bricht ab), Restzeile = ``{}``.
- ``zeitraum`` einer Rechnungsposition nur bei Abweichung vom Rechnungszeitraum,
  ``kategorie`` nur bei Reservepositionen.

Unbekannte Schluessel ignoriert der Generator. Der Block ``zaehlerapp`` traegt deshalb die
Ergebnisse und Stammdaten der App (Empfaenger, KST, Faktor, kWh, EUR je Zeile), gegen die das
Vergleichswerkzeug der Stromabrechnung (``vergleich_app``) centgenau prueft. Es wird nichts neu
gerechnet - alle Werte stammen aus dem Lauf.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from meters.models import BillingCircle, BillingInvoice, BillingPositionKind, BillingRun
from meters.models.billing_run import BillingRunLine
from meters.services.billing_readings import monatsgrenzen
from meters.services.billing_transfer import MONATE

FORMAT = "zaehlerapp-lauf/1"
_ERGEBNIS = (
    "bezugsmenge",
    "gesamtkosten",
    "zaehlersumme",
    "nicht_gemessen_kwh",
    "einkaufspreis_ct",
    "umlagepreis_ct",
    "preis_ct",
    "preis_eur",
    "gesamt_eur",
    "saldo_eur",
)
_KREIS_IM_DATEINAMEN = re.compile(r"[A-Z]{1,16}")


def dumps(wert: Any, tiefe: int = 0) -> str:
    """JSON mit Einrueckung; ``Decimal`` als exakte Zahl, Text ohne ASCII-Escapes."""
    if isinstance(wert, Decimal):
        if not wert.is_finite():
            raise ValueError(f"Kein endlicher Zahlenwert: {wert}")
        return format(wert, "f")
    if isinstance(wert, dict | list) and wert:
        innen = "  " * (tiefe + 1)
        if isinstance(wert, dict):
            teile = [
                f"{innen}{json.dumps(str(k), ensure_ascii=False)}: {dumps(v, tiefe + 1)}"
                for k, v in wert.items()
            ]
            klammern = "{}"
        else:
            teile = [f"{innen}{dumps(v, tiefe + 1)}" for v in wert]
            klammern = "[]"
        return f"{klammern[0]}\n" + ",\n".join(teile) + f"\n{'  ' * tiefe}{klammern[1]}"
    return json.dumps(wert, ensure_ascii=False)


def als_text(wert: str) -> str:
    """Freitext fuer Excel-Zellen: fuehrendes "=" wuerde openpyxl als Formel speichern (der
    Generator bricht dann ab) - ein Apostroph davor macht es in Excel zu reinem Text."""
    return f"'{wert}" if wert.startswith("=") else wert


def _zahl(text: Any) -> Decimal | None:
    return Decimal(str(text)) if text is not None else None


def dateiname(circle: BillingCircle, run: BillingRun) -> str:
    """``JJJJ-MM_<Kreis>.json`` wie im Datenordner des Generators; sonst neutraler Name."""
    if _KREIS_IM_DATEINAMEN.fullmatch(circle.code):
        return f"{run.monat}_{circle.code}.json"
    return f"{run.monat}_kreis-{circle.id}.json"


def verbraucher_eintrag(zeile: BillingRunLine, monatsende: str) -> dict[str, Any]:
    """Eingaben einer Zeile im Format des Generators; Restzeile = ``{}``."""
    if zeile.kind is BillingPositionKind.REST:
        return {}
    eintrag: dict[str, Any] = {}
    if zeile.serial_numbers:
        eintrag["zaehlernummer"] = als_text(zeile.serial_numbers)
    alt, neu = zeile.effektiv_stand_alt, zeile.effektiv_stand_neu
    korrektur = zeile.effektiv_korrektur
    if alt is not None:
        eintrag["stand_alt"] = alt
    if neu is not None:
        eintrag["stand_neu"] = neu
    if korrektur is not None and korrektur != 0:
        eintrag["korrektur"] = korrektur
    if neu is not None:
        eintrag["datum"] = monatsende
    manuell = (
        zeile.manual_stand_alt is not None
        or zeile.manual_stand_neu is not None
        or zeile.manual_korrektur_kwh is not None
    )
    if eintrag.keys() & {"stand_alt", "stand_neu", "korrektur"}:
        eintrag["quelle"] = "manuell" if manuell else "Zähler"
    bemerkungen = [zeile.manual_note] if manuell else []
    if zeile.manual_korrektur_kwh is None:
        bemerkungen.append(zeile.korrektur_note)
    for name, wert, art, abstand in (
        ("alt", zeile.manual_stand_alt, zeile.stand_alt_art, zeile.stand_alt_abstand),
        ("neu", zeile.manual_stand_neu, zeile.stand_neu_art, zeile.stand_neu_abstand),
    ):
        if wert is None and art == "interpoliert":
            bemerkungen.append(f"Stand {name} interpoliert ({abstand or 0} Tage)")
    bemerkung = "; ".join(b for b in bemerkungen if b)
    if bemerkung:
        eintrag["bemerkung"] = als_text(bemerkung)
    return eintrag


def _rechnung(invoice: BillingInvoice) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    kopf = {
        "nummer": invoice.nummer,
        "datum": invoice.datum.isoformat(),
        "aid": invoice.aid,
        "marktlokation": invoice.marktlokation,
        "von": invoice.period_from.isoformat(),
        "bis": invoice.period_to.isoformat(),
        "verbrauch_kwh": invoice.verbrauch_kwh,
        "leistungsspitze_kw": invoice.leistungsspitze_kw,
        "betrag_netto": invoice.betrag_netto,
    }
    standard = (
        f"{invoice.period_from:%d.%m.%Y} - {invoice.period_to:%d.%m.%Y}"  # wie der PDF-Parser
    )
    positionen: list[dict[str, Any]] = []
    for p in invoice.positions:
        eintrag: dict[str, Any] = {"name": p.name}
        if p.zeitraum != standard:
            eintrag["zeitraum"] = p.zeitraum
        if p.menge is not None:
            eintrag["menge"] = p.menge
        if p.preis_ct is not None:
            eintrag["preis_ct"] = p.preis_ct
        if p.kategorie:
            eintrag["kategorie"] = p.kategorie
        eintrag["betrag"] = p.betrag
        positionen.append(eintrag)
    return kopf, positionen


def _app_block(circle: BillingCircle, run: BillingRun) -> dict[str, Any]:
    result = run.result
    zeilen = {
        z.label: {
            "empfaenger": z.owner_name,
            "kst": str(z.kostenstelle) if z.kostenstelle is not None else None,
            "faktor": z.transformer_factor,
            "zaehlernummer": z.serial_numbers or None,
            "rest": z.kind is BillingPositionKind.REST,
            "kwh": z.kwh,
            "eur": z.eur,
            "pruefung": z.pruefung,
        }
        for z in run.lines
    }
    gruppen = [
        {
            "name": g["name"],
            "intern": g["intern"],
            "kwh": _zahl(g["kwh"]),
            "eur": _zahl(g["eur"]),
            "kostenstellen": [
                {"kst": k["kst"], "kwh": _zahl(k["kwh"]), "eur": _zahl(k["eur"])}
                for k in g["kostenstellen"]
            ],
        }
        for g in (result or {}).get("gruppen", [])
    ]
    return {
        "format": FORMAT,
        "kreis": circle.code,
        "monat": run.monat,
        "lauf_id": run.id,
        "version": run.version,
        "status": run.status.value,
        "exportiert_am": datetime.now(UTC).isoformat(timespec="seconds"),
        "ergebnis": {k: _zahl(result.get(k)) for k in _ERGEBNIS} if result else None,
        "gruppen": gruppen,
        "zeilen": zeilen,
    }


def monats_json(circle: BillingCircle, run: BillingRun, invoice: BillingInvoice) -> dict[str, Any]:
    """Monats-JSON des Generators plus Block ``zaehlerapp`` (siehe Moduldoku)."""
    jahr, mon = (int(t) for t in run.monat.split("-"))
    _, letzter = monatsgrenzen(run.monat)
    kopf, positionen = _rechnung(invoice)
    return {
        "monat": MONATE[mon - 1],
        "jahr": jahr,
        "rechnung": kopf,
        "positionen": positionen,
        "zusatzkosten": run.zusatzkosten,
        "aufschlag_prozent": run.aufschlag_prozent,
        "aufschlag_ct": run.aufschlag_ct,
        "verbraucher": {
            z.label: verbraucher_eintrag(z, letzter.isoformat())
            for z in sorted(run.lines, key=lambda z: z.sort_order)
        },
        "zaehlerapp": _app_block(circle, run),
    }
