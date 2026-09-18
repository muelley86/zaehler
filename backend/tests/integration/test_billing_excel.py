"""Excel-Bruecke (Plan Phase 6): Lauf als Monats-JSON fuer den Generator der Stromabrechnung.

Das JSON ist Eingabe fuer ``generate.py --excel`` (Format ``docs/DATENFORMAT.md`` der
Stromabrechnung) und traegt im Block ``zaehlerapp`` die Ergebnisse der App fuer den centgenauen
Vergleich. Nur fiktive Werte (oeffentliches Repo), Aufbau wie ``test_billing_runs``.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

# Die Helfer des Lauf-Tests (Kreis mit Positionen, Staende, Rechnung) wiederverwenden.
from tests.integration.test_billing_runs import BASE, _ok, _setup, _zeile

from meters.models import BillingPositionKind, BillingRunLine, User
from meters.services.billing_excel import dumps, verbraucher_eintrag


def _export(client: TestClient, cid: int, rid: int) -> tuple[dict[str, Any], str]:
    resp = client.get(f"{BASE}/{cid}/runs/{rid}/monats-json")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("application/json")
    return json.loads(resp.text, parse_float=Decimal), resp.text


def test_lauf_als_monats_json(admin_client: TestClient, admin_user: User, db: Session) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    resp = admin_client.get(f"{BASE}/{cid}/runs/{run['id']}/monats-json")
    assert resp.headers["content-disposition"] == 'attachment; filename="2026-08_NORD.json"'
    daten, text = _export(admin_client, cid, run["id"])

    assert (daten["monat"], daten["jahr"]) == ("August", 2026)
    assert daten["rechnung"] == {
        "nummer": "TEST-2026-08",
        "datum": "2026-08-31",
        "aid": "AID-000001",
        "marktlokation": "12345678901",
        "von": "2026-08-01",
        "bis": "2026-08-31",
        "verbrauch_kwh": Decimal("1000"),
        "leistungsspitze_kw": Decimal("10"),
        "betrag_netto": Decimal("250.00"),
    }
    # Decimal exakt als JSON-Zahl, nie ueber float und nie als Text (der Generator liest Zahlen).
    assert '"betrag_netto": 250.00' in text
    # Zeitraum nur, wenn er vom Rechnungszeitraum abweicht (hier Platzhalter "x").
    assert daten["positionen"] == [
        {
            "name": "Energielieferung",
            "zeitraum": "x",
            "menge": Decimal("1000"),
            "preis_ct": Decimal("20.0000"),
            "betrag": Decimal("200.00"),
        },
        {"name": "Wirkarbeit - Netznutzung", "zeitraum": "x", "betrag": Decimal("50.00")},
    ]
    assert (daten["zusatzkosten"], daten["aufschlag_prozent"], daten["aufschlag_ct"]) == (0, 0, 0)
    assert daten["verbraucher"] == {
        "Stall": {
            "zaehlernummer": "TEST-Stall",
            "stand_alt": 100,
            "stand_neu": 150,
            "datum": "2026-08-31",
            "quelle": "Zähler",
        },
        "Pumpe": {
            "zaehlernummer": "TEST-Pumpe",
            "stand_alt": 0,
            "stand_neu": 200,
            "datum": "2026-08-31",
            "quelle": "Zähler",
        },
        "Generator": {
            "zaehlernummer": "TEST-Generator",
            "stand_alt": 0,
            "stand_neu": 100,
            "datum": "2026-08-31",
            "quelle": "Zähler",
        },
        "Rest": {},
    }
    # Der Wandlerfaktor kommt im Generator nur aus den Stammdaten (Feld "faktor" bricht ab).
    assert all("faktor" not in v for v in daten["verbraucher"].values())

    app = daten["zaehlerapp"]
    assert (app["kreis"], app["monat"], app["lauf_id"], app["version"], app["status"]) == (
        "NORD",
        "2026-08",
        run["id"],
        1,
        "entwurf",
    )
    e = app["ergebnis"]
    assert (e["preis_eur"], e["preis_ct"], e["gesamt_eur"], e["saldo_eur"]) == (
        Decimal("0.25"),
        Decimal("25.00"),
        Decimal("250.00"),
        Decimal("0.00"),
    )
    assert e["zaehlersumme"] == Decimal("1000")
    assert [(g["name"], g["intern"], g["kwh"], g["eur"]) for g in app["gruppen"]] == [
        ("Muster A KG", False, Decimal("900"), Decimal("225.00")),
        ("Muster Intern", True, Decimal("100"), Decimal("25.00")),
    ]
    assert app["gruppen"][0]["kostenstellen"][0] == {
        "kst": "10101",
        "kwh": Decimal("500"),
        "eur": Decimal("125.00"),
    }
    assert app["zeilen"]["Stall"] == {
        "empfaenger": "Muster A KG",
        "kst": "10101",
        "faktor": 10,
        "zaehlernummer": "TEST-Stall",
        "rest": False,
        "kwh": Decimal("500"),
        "eur": Decimal("125.00"),
        "pruefung": "OK",
    }
    assert app["zeilen"]["Rest"]["rest"] is True


def test_manuelle_werte_und_korrektur(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    pumpe = _zeile(run, "Pumpe")
    body = {"manual_stand_neu": "210", "manual_korrektur_kwh": "-5", "manual_note": "Foto"}
    _ok(admin_client.patch(f"{BASE}/{cid}/runs/{run['id']}/lines/{pumpe['id']}", json=body))
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{run['id']}/finalize"))

    daten, _ = _export(admin_client, cid, run["id"])
    assert daten["verbraucher"]["Pumpe"] == {
        "zaehlernummer": "TEST-Pumpe",
        "stand_alt": 0,
        "stand_neu": 210,
        "korrektur": -5,
        "datum": "2026-08-31",
        "quelle": "manuell",
        "bemerkung": "Foto",
    }
    assert daten["zaehlerapp"]["status"] == "festgeschrieben"
    assert daten["zaehlerapp"]["zeilen"]["Pumpe"]["kwh"] == Decimal("205")


def test_export_nur_im_eigenen_kreis(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    assert admin_client.get(f"{BASE}/{cid + 1}/runs/{run['id']}/monats-json").status_code == 404


def _zeile_ohne_db(**werte: Any) -> BillingRunLine:
    return BillingRunLine(
        sort_order=0, label="X", kind=BillingPositionKind.METER, **{"serial_numbers": "", **werte}
    )


def test_eintrag_kennzeichnet_interpolation_und_unvollstaendige_staende() -> None:
    zeile = _zeile_ohne_db(
        stand_alt=Decimal("10.5"),
        stand_alt_art="interpoliert",
        stand_alt_abstand=2,
        stand_neu=None,
        korrektur_kwh=Decimal("7"),
        korrektur_note="Zaehlertausch am 12.08.",
    )
    assert verbraucher_eintrag(zeile, "2026-08-31") == {
        "stand_alt": Decimal("10.5"),
        "korrektur": Decimal("7"),
        "quelle": "Zähler",
        "bemerkung": "Zaehlertausch am 12.08.; Stand alt interpoliert (2 Tage)",
    }
    rest = BillingRunLine(sort_order=1, label="R", kind=BillingPositionKind.REST, serial_numbers="")
    assert verbraucher_eintrag(rest, "2026-08-31") == {}
    # Formeltext wird fuer Excel zu reinem Text (Apostroph), sonst bricht der Generator ab.
    formel = _zeile_ohne_db(
        stand_alt=Decimal("1"),
        stand_neu=Decimal("2"),
        manual_korrektur_kwh=Decimal("3"),
        manual_note="=SUMME(A1)",
        serial_numbers="=X",
    )
    eintrag = verbraucher_eintrag(formel, "2026-08-31")
    assert (eintrag["bemerkung"], eintrag["zaehlernummer"]) == ("'=SUMME(A1)", "'=X")
    # Ohne Werte keine Quelle: der Generator meldet "keine Angabe", die Mappe bleibt leer.
    leer = _zeile_ohne_db(serial_numbers="Z-1")
    assert verbraucher_eintrag(leer, "2026-08-31") == {"zaehlernummer": "Z-1"}


def test_dumps_schreibt_decimal_exakt() -> None:
    text = dumps({"a": Decimal("0.10"), "b": [Decimal("-1E+2"), 3, None, True], "c": {}, "t": "ä"})
    assert json.loads(text, parse_float=Decimal) == {
        "a": Decimal("0.10"),
        "b": [-100, 3, None, True],
        "c": {},
        "t": "ä",
    }
    assert "0.10" in text
    assert "ä" in text
