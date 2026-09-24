"""Abrechnen an Eigentuemer oder Mieter je Messstelle (Migration 0047).

Periodisiert wie die Kostenstelle (halboffenes Intervall, hoechstens eine offene Periode).
Ohne Periode gilt "Eigentuemer". "Mieter" macht den zum Stichtag aktuellen Mieter zum
Rechnungsempfaenger; ohne Mieter geht die Rechnung an den Eigentuemer (Befund ``mieter_fehlt``).
"""

from __future__ import annotations

from datetime import date
from typing import Any, cast

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.models import AuditAction, AuditLog, BillTo
from meters.services.bill_to_assignment import bill_to_am

MP = "/api/v1/measuring-points"
BC = "/api/v1/billing-circles"


def _ok(resp: Any, status: int = 200) -> Any:
    assert resp.status_code == status, resp.text
    return resp.json()


def _owner(client: TestClient, name: str) -> int:
    return int(_ok(client.post("/api/v1/owners", json={"name": name}), 201)["id"])


def _mieter(client: TestClient, name: str) -> int:
    return int(_ok(client.post("/api/v1/mieters", json={"last_name": name}), 201)["id"])


def _mp(client: TestClient, name: str, **extra: Any) -> int:
    body = {
        "name": name,
        "type": extra.pop("type", "electricity"),
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": f"SN-{name}",
        "installed_at": "2024-01-01",
        "initial_values": extra.pop("initial_values", {"1.8.0": "0"}),
        **extra,
    }
    return int(_ok(client.post(MP, json=body), 201)["id"])


def _perioden(client: TestClient, mp_id: int) -> list[tuple[str, str, str | None]]:
    history = cast(list[dict[str, Any]], _ok(client.get(f"{MP}/{mp_id}/bill-to")))
    return [(p["bill_to"], p["valid_from"], p["valid_to"]) for p in history]


def _wechsel(client: TestClient, mp_id: int, bill_to: str, ab: str) -> Any:
    return client.post(f"{MP}/{mp_id}/change-bill-to", json={"bill_to": bill_to, "valid_from": ab})


# --- Historie -----------------------------------------------------------------------------------


def test_ohne_periode_gilt_eigentuemer(admin_client: TestClient, db: Session) -> None:
    mp = _mp(admin_client, "Stall")
    assert _perioden(admin_client, mp) == []
    assert bill_to_am(db, [mp], date(2026, 8, 31)) == {}


def test_wechsel_schliesst_alte_periode(admin_client: TestClient, db: Session) -> None:
    mp = _mp(admin_client, "Wohnung")
    _ok(_wechsel(admin_client, mp, "mieter", "2026-01-01"))
    _ok(_wechsel(admin_client, mp, "owner", "2026-09-01"))
    assert _perioden(admin_client, mp) == [
        ("owner", "2026-09-01", None),
        ("mieter", "2026-01-01", "2026-09-01"),
    ]
    assert bill_to_am(db, [mp], date(2026, 8, 31)) == {mp: BillTo.MIETER}
    # Halboffenes Intervall: am Wechseltag gilt bereits der neue Wert.
    assert bill_to_am(db, [mp], date(2026, 9, 1)) == {mp: BillTo.OWNER}


def test_wechsel_am_selben_tag_korrigiert(admin_client: TestClient) -> None:
    mp = _mp(admin_client, "Wohnung")
    _ok(_wechsel(admin_client, mp, "mieter", "2026-01-01"))
    _ok(_wechsel(admin_client, mp, "owner", "2026-01-01"))
    assert _perioden(admin_client, mp) == [("owner", "2026-01-01", None)]


def test_wechsel_vor_beginn_der_offenen_periode_abgelehnt(admin_client: TestClient) -> None:
    mp = _mp(admin_client, "Wohnung")
    _ok(_wechsel(admin_client, mp, "mieter", "2026-01-01"))
    assert _wechsel(admin_client, mp, "owner", "2025-12-31").status_code == 422


def test_wechsel_wird_protokolliert(admin_client: TestClient, db: Session) -> None:
    mp = _mp(admin_client, "Wohnung")
    _ok(_wechsel(admin_client, mp, "mieter", "2026-01-01"))
    eintrag = db.scalars(
        select(AuditLog).where(AuditLog.action == AuditAction.BILL_TO_CHANGED)
    ).one()
    assert eintrag.entity_id == mp
    assert eintrag.diff == {"from": None, "to": "mieter", "valid_from": "2026-01-01"}


def test_historien_editor_crud_und_ueberlappung(admin_client: TestClient) -> None:
    mp = _mp(admin_client, "Wohnung")
    base = f"{MP}/{mp}/bill-to"
    alt = _ok(
        admin_client.post(
            base, json={"bill_to": "mieter", "valid_from": "2024-01-01", "valid_to": "2025-01-01"}
        ),
        201,
    )
    neu = _ok(admin_client.post(base, json={"bill_to": "owner", "valid_from": "2025-01-01"}), 201)
    ueberlapp = admin_client.post(
        base, json={"bill_to": "owner", "valid_from": "2024-06-01", "valid_to": "2024-07-01"}
    )
    assert ueberlapp.status_code == 422, ueberlapp.text
    _ok(
        admin_client.patch(
            f"{base}/{alt['id']}",
            json={"bill_to": "mieter", "valid_from": "2023-01-01", "valid_to": "2025-01-01"},
        )
    )
    assert admin_client.delete(f"{base}/{neu['id']}").status_code == 204
    assert _perioden(admin_client, mp) == [("mieter", "2023-01-01", "2025-01-01")]
    assert admin_client.delete(f"{MP}/99999/bill-to/{alt['id']}").status_code == 404


def test_fuer_alle_sparten(admin_client: TestClient) -> None:
    wasser = _mp(admin_client, "Wasser", type="water", initial_values={"water": "0"})
    _ok(_wechsel(admin_client, wasser, "mieter", "2026-01-01"))
    assert _perioden(admin_client, wasser) == [("mieter", "2026-01-01", None)]


def test_aenderungen_nur_admin(admin_client: TestClient, recorder_client: TestClient) -> None:
    mp = _mp(admin_client, "Wohnung")
    assert _wechsel(recorder_client, mp, "mieter", "2026-01-01").status_code in (403, 404)
    resp = recorder_client.post(
        f"{MP}/{mp}/bill-to", json={"bill_to": "mieter", "valid_from": "2026-01-01"}
    )
    assert resp.status_code in (403, 404), resp.text
    # Recorder ohne Zugriff auf die Messstelle sieht nicht einmal die Historie (404 statt 403).
    assert recorder_client.get(f"{MP}/{mp}/bill-to").status_code == 404


def test_unbekannter_wert_abgelehnt(admin_client: TestClient) -> None:
    mp = _mp(admin_client, "Wohnung")
    assert _wechsel(admin_client, mp, "lieferant", "2026-01-01").status_code == 422


# --- Wirkung in der Abrechnung ------------------------------------------------------------------


def _kreis(client: TestClient) -> int:
    body = {"code": "NORD", "name": "Nord", "rechnungsleger": "X", "abnahmestelle": "AID-1"}
    return int(_ok(client.post(BC, json=body), 201)["id"])


def _pos(client: TestClient, cid: int, label: str, mp: int) -> None:
    body = {"label": label, "kind": "meter", "measuring_point_id": mp, "valid_from": "2026-01-01"}
    _ok(client.post(f"{BC}/{cid}/positions", json=body), 201)


def _pruefung(client: TestClient, cid: int, stichtag: str) -> dict[str, Any]:
    return cast(dict[str, Any], _ok(client.get(f"{BC}/{cid}/check", params={"stichtag": stichtag})))


def test_mieter_wird_empfaenger(admin_client: TestClient) -> None:
    cid = _kreis(admin_client)
    agrar = _owner(admin_client, "Agrar KG")
    firma = _mieter(admin_client, "Beispiel GmbH")
    wohnung = _mp(admin_client, "Wohnung", owner_id=agrar, kostenstelle=1, mieter_id=firma)
    stall = _mp(admin_client, "Stall", owner_id=agrar, kostenstelle=2)
    _pos(admin_client, cid, "Wohnung", wohnung)
    _pos(admin_client, cid, "Stall", stall)
    _ok(_wechsel(admin_client, wohnung, "mieter", "2026-06-01"))

    zeilen = {z["label"]: z for z in _pruefung(admin_client, cid, "2026-08-31")["positions"]}
    assert (zeilen["Wohnung"]["owner_name"], zeilen["Wohnung"]["recipient_kind"]) == (
        "Beispiel GmbH",
        "mieter",
    )
    assert zeilen["Wohnung"]["owner_id"] is None
    assert (zeilen["Stall"]["owner_name"], zeilen["Stall"]["recipient_kind"]) == (
        "Agrar KG",
        "owner",
    )
    # Vor dem Wechsel rechnete die Wohnung noch an den Eigentuemer ab.
    frueher = {z["label"]: z for z in _pruefung(admin_client, cid, "2026-05-31")["positions"]}
    assert frueher["Wohnung"]["owner_name"] == "Agrar KG"

    positionen = {p["label"]: p for p in _ok(admin_client.get(f"{BC}/{cid}/positions"))}
    assert positionen["Wohnung"]["recipient_name"] == "Beispiel GmbH"
    assert positionen["Wohnung"]["recipient_kind"] == "mieter"
    assert positionen["Stall"]["recipient_kind"] == "owner"


def test_ohne_mieter_geht_rechnung_an_eigentuemer(admin_client: TestClient) -> None:
    cid = _kreis(admin_client)
    agrar = _owner(admin_client, "Agrar KG")
    wohnung = _mp(admin_client, "Leer", owner_id=agrar, kostenstelle=1)
    _pos(admin_client, cid, "Leer", wohnung)
    _ok(_wechsel(admin_client, wohnung, "mieter", "2026-01-01"))

    bericht = _pruefung(admin_client, cid, "2026-08-31")
    zeile = bericht["positions"][0]
    assert (zeile["owner_name"], zeile["recipient_kind"]) == ("Agrar KG", "owner")
    assert {(b["label"], b["code"]) for b in bericht["findings"]} == {("Leer", "mieter_fehlt")}


def test_gleichnamige_empfaenger_sind_mehrdeutig(admin_client: TestClient) -> None:
    cid = _kreis(admin_client)
    agrar = _owner(admin_client, "Agrar KG")
    a = _mp(admin_client, "A", owner_id=agrar, kostenstelle=1, mieter_id=_mieter(admin_client, "M"))
    b = _mp(admin_client, "B", owner_id=agrar, kostenstelle=2, mieter_id=_mieter(admin_client, "M"))
    _pos(admin_client, cid, "A", a)
    _pos(admin_client, cid, "B", b)
    for mp in (a, b):
        _ok(_wechsel(admin_client, mp, "mieter", "2026-01-01"))

    befunde = {
        (f["label"], f["code"]) for f in _pruefung(admin_client, cid, "2026-08-31")["findings"]
    }
    assert befunde == {("A", "empfaenger_mehrdeutig"), ("B", "empfaenger_mehrdeutig")}
