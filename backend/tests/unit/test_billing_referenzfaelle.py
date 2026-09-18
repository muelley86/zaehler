"""Abnahme Rechenkern (Plan Phase 3): Ergebnisse identisch zur Stromabrechnung (``model.py``).

- ``tests/fixtures/billing/synthetisch_*.json`` (im Repo, CI): Struktur der echten
  Abrechnungskreise, Zufallswerte, pseudonymisierte Kostenstellen; Erwartung aus dem
  Referenzmodell.
- Echte Monate (nur lokal, nie ins oeffentliche Repo): Ordner ``BILLING_REFERENZ_DIR`` bzw.
  ``../Stromabrechnung/tools/referenz_lokal`` neben diesem Repo; zusaetzlich Excel-Gegenprobe.
  Fehlt der Ordner, werden diese Faelle uebersprungen.
Beide erzeugt mit ``Stromabrechnung/tools/referenzfall_zaehlerapp.py``. Verglichen wird die Text-
darstellung der Decimals - also auch Stellenzahl und Rundung.
"""

from __future__ import annotations

import json
import os
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest

from meters.billing.calculation import (
    Ablesung,
    Abzug,
    Ergebnis,
    Gruppe,
    Kreis,
    Monatsdaten,
    Rechnungsposition,
    Verbraucher,
    berechne,
    pruefe_eingaben,
    validiere,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "billing"
_STANDARD_LOKAL = (
    Path(__file__).resolve().parents[4] / "Stromabrechnung" / "tools" / "referenz_lokal"
)
LOKAL = Path(os.environ.get("BILLING_REFERENZ_DIR", _STANDARD_LOKAL))
SYNTHETISCH = sorted(FIXTURES.glob("synthetisch_*.json"))
ECHT = sorted(LOKAL.glob("*.json")) if LOKAL.is_dir() else []


def _d(wert: str | None) -> Decimal | None:
    return None if wert is None else Decimal(wert)


def _lade(pfad: Path) -> dict[str, Any]:
    daten: dict[str, Any] = json.loads(pfad.read_text(encoding="utf-8"))
    return daten


def _kreis(roh: dict[str, Any]) -> Kreis:
    return Kreis(
        gruppen=tuple(Gruppe(g["name"], g["intern"]) for g in roh["gruppen"]),
        verbraucher=tuple(
            Verbraucher(v["name"], v["gruppe"], v["kst"], Decimal(v["faktor"]), v["rest"])
            for v in roh["verbraucher"]
        ),
        abzuege=tuple(Abzug(a["haupt"], a["unter"]) for a in roh["abzuege"]),
    )


def _monatsdaten(roh: dict[str, Any]) -> Monatsdaten:
    return Monatsdaten(
        bezugsmenge=Decimal(roh["bezugsmenge"]),
        rechnungsbetrag=Decimal(roh["rechnungsbetrag"]),
        positionen=tuple(
            Rechnungsposition(
                p["name"], Decimal(p["betrag"]), _d(p["menge"]), _d(p["preis_ct"]), p["kategorie"]
            )
            for p in roh["positionen"]
        ),
        verbraucher={
            name: Ablesung(_d(e["stand_alt"]), _d(e["stand_neu"]), _d(e["kwh"]), _d(e["korrektur"]))
            for name, e in roh["verbraucher"].items()
        },
        zusatzkosten=Decimal(roh["zusatzkosten"]),
        aufschlag_prozent=Decimal(roh["aufschlag_prozent"]),
        aufschlag_ct=Decimal(roh["aufschlag_ct"]),
    )


def _s(wert: Decimal | None) -> str | None:
    return None if wert is None else str(wert)


def _als_json(erg: Ergebnis) -> dict[str, Any]:
    """Ergebnis in derselben Form wie der Block ``erwartet`` der Fixture."""
    return {
        "positionen_summe": _s(erg.positionen_summe),
        "positionen_kontrolle": _s(erg.positionen_kontrolle),
        "kategorien": {k: _s(v) for k, v in erg.kategorien.items()},
        "bezugsmenge": _s(erg.bezugsmenge),
        "gesamtkosten": _s(erg.gesamtkosten),
        "zaehlersumme": _s(erg.zaehlersumme),
        "nicht_gemessen_kwh": _s(erg.nicht_gemessen_kwh),
        "einkaufspreis_ct": _s(erg.einkaufspreis_ct),
        "umlagepreis_ct": _s(erg.umlagepreis_ct),
        "implizite_umlage": _s(erg.implizite_umlage),
        "preis_ct": _s(erg.preis_ct),
        "preis_eur": _s(erg.preis_eur),
        "gesamt_eur": _s(erg.gesamt_eur),
        "saldo_eur": _s(erg.saldo_eur),
        "fehleranzahl": erg.fehleranzahl,
        "zeilen": {
            n: {"kwh": _s(z.kwh), "eur": _s(z.eur), "pruefung": z.pruefung}
            for n, z in erg.zeilen.items()
        },
        "gruppen": {
            n: {
                "kwh": _s(g.kwh),
                "eur": _s(g.eur),
                "zusammensetzung": {
                    "betraege": [_s(b) for b in g.zusammensetzung.betraege],
                    "sonstige": _s(g.zusammensetzung.sonstige),
                    "zwischensummen": [_s(b) for b in g.zusammensetzung.zwischensummen],
                    "energie_ct": _s(g.zusammensetzung.energie_ct),
                    "gesamt": _s(g.zusammensetzung.gesamt),
                    "cts": [_s(b) for b in g.zusammensetzung.cts],
                    "zwischen_cts": [_s(b) for b in g.zusammensetzung.zwischen_cts],
                    "sonstige_ct": _s(g.zusammensetzung.sonstige_ct),
                    "gesamt_ct": _s(g.zusammensetzung.gesamt_ct),
                },
                "kostenstellen": [[k.kst, _s(k.kwh), _s(k.eur)] for k in g.kostenstellen],
            }
            for n, g in erg.gruppen.items()
        },
    }


def _pruefe_gegen_referenz(pfad: Path) -> Ergebnis:
    fixture = _lade(pfad)
    kreis, daten = _kreis(fixture["kreis"]), _monatsdaten(fixture["monatsdaten"])
    validiere(kreis)
    pruefe_eingaben(kreis, daten)
    erg = berechne(kreis, daten)
    ist, soll = _als_json(erg), fixture["erwartet"]
    assert ist["zeilen"] == soll["zeilen"]
    assert ist["gruppen"] == soll["gruppen"]
    assert ist == soll
    return erg


def test_synthetische_faelle_sind_vorhanden() -> None:
    assert [p.name for p in SYNTHETISCH] == ["synthetisch_NORD.json", "synthetisch_SUED.json"]


@pytest.mark.parametrize("pfad", SYNTHETISCH, ids=lambda p: p.stem)
def test_synthetisch_wie_stromabrechnung(pfad: Path) -> None:
    _pruefe_gegen_referenz(pfad)


@pytest.mark.skipif(not ECHT, reason=f"keine lokalen Referenzfaelle in {LOKAL}")
@pytest.mark.parametrize("pfad", ECHT, ids=lambda p: p.stem)
def test_echte_monate_wie_stromabrechnung_und_excel(pfad: Path) -> None:
    erg = _pruefe_gegen_referenz(pfad)
    excel = _lade(pfad)["excel"]
    assert str(erg.preis_eur) == excel["preis_eur"]
    assert str(erg.gesamtkosten) == excel["gesamtkosten"]
    assert str(erg.gesamt_eur) == excel["gesamt_eur"]
    assert str(erg.saldo_eur) == excel["saldo_eur"]
    for gruppe, eur in excel["gruppen_eur"].items():
        assert str(erg.gruppen[gruppe].eur) == eur, gruppe
