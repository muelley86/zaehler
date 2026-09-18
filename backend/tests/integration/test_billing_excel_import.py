"""Excel-Weg (Plan Phase 6): Monats-JSON der Stromabrechnung in einen Entwurf uebernehmen.

Die Datei entsteht hier aus dem eigenen Export (Rundreise) und wird dann wie eine von Hand
befuellte Excel-Mappe veraendert. Nur fiktive Werte (oeffentliches Repo).
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from tests.integration.test_billing_runs import BASE, _audit_lauf, _ok, _setup, _zeile

from meters.models import User


def _datei(client: TestClient, cid: int, rid: int) -> dict[str, Any]:
    resp = client.get(f"{BASE}/{cid}/runs/{rid}/monats-json")
    assert resp.status_code == 200, resp.text
    daten: dict[str, Any] = json.loads(resp.text, parse_float=Decimal)
    return daten


def _bytes(daten: dict[str, Any]) -> bytes:
    # Decimal exakt als JSON-Zahl (Marker, dann Anfuehrungszeichen weg) - wie die Excel-Seite.
    text = json.dumps(daten, default=lambda d: f"@@{d}@@", ensure_ascii=False)
    return text.replace('"@@', "").replace('@@"', "").encode("utf-8")


def _import(
    client: TestClient, cid: int, rid: int, inhalt: bytes, *, uebernehmen: bool = False
) -> Any:
    return client.post(
        f"{BASE}/{cid}/runs/{rid}/excel-import",
        params={"uebernehmen": str(uebernehmen).lower()},
        files={"file": ("2026-08_NORD.json", inhalt, "application/json")},
    )


def _status(bericht: dict[str, Any]) -> dict[str, str]:
    return {z["label"]: z["status"] for z in bericht["zeilen"]}


def _entwurf(client: TestClient, db: Session, user: User) -> tuple[int, int, dict[str, Any]]:
    cid, _ = _setup(client, db, user)
    run = _ok(client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    return cid, int(run["id"]), _datei(client, cid, run["id"])


def test_eigener_export_ist_ueberall_gleich(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, rid, datei = _entwurf(admin_client, db, admin_user)
    bericht = _ok(_import(admin_client, cid, rid, _bytes(datei), uebernehmen=True))
    assert _status(bericht) == {
        "Stall": "gleich",
        "Pumpe": "gleich",
        "Generator": "gleich",
        "Rest": "rest",
    }
    assert bericht["parameter"] == []
    run = _ok(admin_client.get(f"{BASE}/{cid}/runs/{rid}"))
    assert all(z["manual_note"] is None for z in run["lines"])


def test_vorschau_aendert_nichts_uebernahme_setzt_manuelle_werte(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, rid, datei = _entwurf(admin_client, db, admin_user)
    v = datei["verbraucher"]
    v["Pumpe"].update(stand_neu=Decimal("210"), korrektur=Decimal("-5"), bemerkung="Handablesung")
    v["Generator"] = {"kwh": 90}
    del v["Stall"]
    v["Fremd"] = {"stand_alt": 1, "stand_neu": 2}
    datei["aufschlag_ct"] = Decimal("1")

    vorschau = _ok(_import(admin_client, cid, rid, _bytes(datei)))
    assert vorschau["uebernommen"] is False
    assert _status(vorschau) == {
        "Stall": "fehlt_in_datei",
        "Pumpe": "abweichend",
        "Generator": "nicht_uebernehmbar",
        "Rest": "rest",
        "Fremd": "unbekannt",
    }
    pumpe = next(z for z in vorschau["zeilen"] if z["label"] == "Pumpe")
    assert (pumpe["app_stand_neu"], pumpe["excel_stand_neu"], pumpe["excel_korrektur"]) == (
        "200",
        "210",
        "-5",
    )
    assert vorschau["parameter"] == [{"feld": "aufschlag_ct", "app": "0", "excel": "1"}]
    unveraendert = _ok(admin_client.get(f"{BASE}/{cid}/runs/{rid}"))
    assert _zeile(unveraendert, "Pumpe")["manual_stand_neu"] is None
    assert unveraendert["aufschlag_ct"] == "0"

    _ok(_import(admin_client, cid, rid, _bytes(datei), uebernehmen=True))
    run = _ok(admin_client.get(f"{BASE}/{cid}/runs/{rid}"))
    p = _zeile(run, "Pumpe")
    assert (p["manual_stand_alt"], p["manual_stand_neu"], p["manual_korrektur_kwh"]) == (
        None,
        "210",
        "-5",
    )
    assert p["manual_note"] == "Excel-Monatsdatei: Handablesung"
    assert p["kwh"] == "205"
    assert _zeile(run, "Generator")["manual_note"] is None  # kwh nicht abbildbar
    assert run["aufschlag_ct"] == "1"
    assert run["result"]["preis_eur"] == "0.26"  # neu gerechnet


def test_datei_mit_app_wert_nimmt_manuellen_wert_zurueck(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, rid, datei = _entwurf(admin_client, db, admin_user)
    run = _ok(admin_client.get(f"{BASE}/{cid}/runs/{rid}"))
    url = f"{BASE}/{cid}/runs/{rid}/lines/{_zeile(run, 'Pumpe')['id']}"
    _ok(admin_client.patch(url, json={"manual_stand_neu": "300", "manual_note": "Tippfehler"}))
    bericht = _ok(_import(admin_client, cid, rid, _bytes(datei), uebernehmen=True))
    assert _status(bericht)["Pumpe"] == "abweichend"
    # Audit: ersetzter manueller Wert samt Begruendung bleibt nachvollziehbar.
    audit = _audit_lauf(admin_client, rid)
    assert audit[-1][1]["excel_import"]["zeilen"]["Pumpe"] == {
        "manual_stand_neu": {"from": "300", "to": None},
        "manual_note": {"from": "Tippfehler", "to": None},
    }
    pumpe = next(z for z in bericht["zeilen"] if z["label"] == "Pumpe")
    assert pumpe["hinweis"] == "Ersetzt den manuellen Wert (Begruendung: Tippfehler)."
    p = _zeile(_ok(admin_client.get(f"{BASE}/{cid}/runs/{rid}")), "Pumpe")
    assert (p["manual_stand_neu"], p["manual_note"]) == (None, None)


def test_datei_muss_zum_lauf_passen(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, rid, datei = _entwurf(admin_client, db, admin_user)
    for aenderung in (
        {"monat": "Juli"},
        {"jahr": 2025},
        {"rechnung": {**datei["rechnung"], "nummer": "ANDERS"}},
        {"rechnung": {**datei["rechnung"], "betrag_netto": Decimal("250.01")}},
    ):
        resp = _import(admin_client, cid, rid, _bytes({**datei, **aenderung}))
        assert resp.status_code == 422, aenderung


def test_ungueltige_dateien(admin_client: TestClient, admin_user: User, db: Session) -> None:
    cid, rid, datei = _entwurf(admin_client, db, admin_user)
    kaputt = {**datei, "verbraucher": {**datei["verbraucher"], "Pumpe": {"stand_neu": "viel"}}}
    negativ = {**datei, "verbraucher": {**datei["verbraucher"], "Pumpe": {"stand_neu": -1}}}
    for inhalt in (
        b"kein json",
        b"[1, 2]",
        b'{"monat": NaN}',
        "ä".encode("latin-1"),
        b"[" * 100_000 + b"]" * 100_000,  # zu tief verschachtelt
        _bytes(kaputt),
        _bytes(negativ),
    ):
        resp = _import(admin_client, cid, rid, inhalt)
        assert resp.status_code == 422, inhalt
        assert resp.headers["content-type"].startswith("application/problem+json")
    zu_gross = b" " * (1024 * 1024 + 1)
    assert _import(admin_client, cid, rid, zu_gross).status_code == 413


def test_nur_im_entwurf(admin_client: TestClient, admin_user: User, db: Session) -> None:
    cid, rid, datei = _entwurf(admin_client, db, admin_user)
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{rid}/finalize"))
    assert _import(admin_client, cid, rid, _bytes(datei)).status_code == 409
    assert _import(admin_client, cid + 1, rid, _bytes(datei)).status_code == 404
