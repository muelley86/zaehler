"""Abrechnungskreise und ihre Positionen (Migration 0037).

Eine Position ist entweder eine Strom-Messstelle (``meter``; Empfaenger und Kostenstelle kommen
aus der Messstelle zum Stichtag) oder die Restmenge (``rest``; ohne Messstelle, traegt Empfaenger
und Kostenstelle selbst, hoechstens eine je Kreis). Abgerechnet wird nur, was als Position im
Kreis steht.
"""

from __future__ import annotations

from typing import Any, cast

from fastapi.testclient import TestClient

BASE = "/api/v1/billing-circles"


def _owner(client: TestClient, name: str, **extra: Any) -> int:
    resp = client.post("/api/v1/owners", json={"name": name, **extra})
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _mieter(client: TestClient, name: str) -> int:
    resp = client.post("/api/v1/mieters", json={"last_name": name})
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _mp(client: TestClient, name: str, mtype: str = "electricity", **extra: Any) -> int:
    initial = {"electricity": {"1.8.0": "0"}, "water": {"water": "0"}}[mtype]
    resp = client.post(
        "/api/v1/measuring-points",
        json={
            "name": name,
            "type": mtype,
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": f"SN-{name}",
            "installed_at": "2024-01-01",
            "initial_values": initial,
            **extra,
        },
    )
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _circle(client: TestClient, code: str = "NORD") -> int:
    resp = client.post(
        BASE,
        json={
            "code": code,
            "name": f"Betrieb {code}",
            "rechnungsleger": "Musterhof Holding GmbH",
            "abnahmestelle": "AID-000001",
            "marktlokation": "50000000001",
        },
    )
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _position(client: TestClient, circle_id: int, **body: Any) -> Any:
    payload = {"valid_from": "2026-08-01", **body}
    return client.post(f"{BASE}/{circle_id}/positions", json=payload)


def _meter_pos(client: TestClient, circle_id: int, label: str, **body: Any) -> dict[str, Any]:
    mp = body.pop("measuring_point_id", None) or _mp(client, label)
    return _ok(
        _position(client, circle_id, label=label, kind="meter", measuring_point_id=mp, **body)
    )


def _ok(resp: Any, status: int = 201) -> dict[str, Any]:
    assert resp.status_code == status, resp.text
    return cast(dict[str, Any], resp.json())


# --- Kreise -------------------------------------------------------------------------------------


def test_kreis_anlegen_lesen_aendern_loeschen(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    assert [c["code"] for c in admin_client.get(BASE).json()] == ["NORD"]
    patched = _ok(admin_client.patch(f"{BASE}/{cid}", json={"name": "Musterhof"}), 200)
    assert patched["name"] == "Musterhof"
    assert patched["abnahmestelle"] == "AID-000001"
    assert admin_client.delete(f"{BASE}/{cid}").status_code == 204
    assert admin_client.get(f"{BASE}/{cid}").status_code == 404


def test_kreis_kuerzel_eindeutig(admin_client: TestClient) -> None:
    _circle(admin_client, "SUED")
    resp = admin_client.post(
        BASE, json={"code": "SUED", "name": "x", "rechnungsleger": "y", "abnahmestelle": "z"}
    )
    assert resp.status_code == 409, resp.text


def test_kreis_mit_positionen_nicht_loeschbar(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    _meter_pos(admin_client, cid, "Anlage West")
    assert admin_client.delete(f"{BASE}/{cid}").status_code == 409


def test_nur_admin(recorder_client: TestClient) -> None:
    assert recorder_client.get(BASE).status_code == 403


# --- Positionen ---------------------------------------------------------------------------------


def test_zaehlerposition_braucht_strom_messstelle(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    ohne = _position(admin_client, cid, label="A", kind="meter")
    assert ohne.status_code == 422, ohne.text
    wasser_mp = _mp(admin_client, "W", "water")
    wasser = _position(admin_client, cid, label="B", kind="meter", measuring_point_id=wasser_mp)
    assert wasser.status_code == 422, wasser.text
    fehlt = _position(admin_client, cid, label="C", kind="meter", measuring_point_id=99999)
    assert fehlt.status_code == 422, fehlt.text
    mit_rest_feldern = _position(
        admin_client,
        cid,
        label="D",
        kind="meter",
        measuring_point_id=_mp(admin_client, "D"),
        kostenstelle=10111,
    )
    assert mit_rest_feldern.status_code == 422, mit_rest_feldern.text


def test_restposition_traegt_empfaenger_und_kostenstelle(admin_client: TestClient) -> None:
    cid = _circle(admin_client, "SUED")
    owner = _owner(admin_client, "Musterhof Nord GmbH & Co. KG")
    pos = _ok(
        _position(admin_client, cid, label="Rest", kind="rest", owner_id=owner, kostenstelle=10101)
    )
    assert pos["kind"] == "rest"
    assert pos["owner_name"] == "Musterhof Nord GmbH & Co. KG"
    ohne_kst = _position(admin_client, cid, label="Rest 2", kind="rest", owner_id=owner)
    assert ohne_kst.status_code == 422, ohne_kst.text
    mit_mp = _position(
        admin_client,
        cid,
        label="Rest 3",
        kind="rest",
        owner_id=owner,
        kostenstelle=1,
        measuring_point_id=_mp(admin_client, "X"),
    )
    assert mit_mp.status_code == 422, mit_mp.text


def test_hoechstens_eine_restposition_je_kreis(admin_client: TestClient) -> None:
    cid = _circle(admin_client, "SUED")
    owner = _owner(admin_client, "Nord KG")
    _ok(_position(admin_client, cid, label="Rest", kind="rest", owner_id=owner, kostenstelle=1))
    zweite = _position(
        admin_client, cid, label="Rest 2", kind="rest", owner_id=owner, kostenstelle=2
    )
    assert zweite.status_code == 422, zweite.text


def test_messstelle_nur_einmal_gleichzeitig(admin_client: TestClient) -> None:
    nord, sued = _circle(admin_client, "NORD"), _circle(admin_client, "SUED")
    mp = _mp(admin_client, "Anlage West")
    _meter_pos(admin_client, nord, "Anlage West", measuring_point_id=mp, valid_to="2026-10-01")
    doppelt = _position(
        admin_client, sued, label="Anlage West", kind="meter", measuring_point_id=mp
    )
    assert doppelt.status_code == 422, doppelt.text
    danach = _position(
        admin_client,
        sued,
        label="Anlage West",
        kind="meter",
        measuring_point_id=mp,
        valid_from="2026-10-01",
    )
    assert danach.status_code == 201, danach.text


def test_bezeichnung_eindeutig_im_kreis(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    _meter_pos(admin_client, cid, "Kuhstall")
    doppelt = _position(
        admin_client,
        cid,
        label="Kuhstall",
        kind="meter",
        measuring_point_id=_mp(admin_client, "K2"),
    )
    assert doppelt.status_code == 422, doppelt.text


def test_unterzaehler(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    anlage = _meter_pos(admin_client, cid, "Anlage West")
    generator = _meter_pos(admin_client, cid, "Generator NORD", parent_position_id=anlage["id"])
    assert generator["parent_position_id"] == anlage["id"]
    kette = _position(
        admin_client,
        cid,
        label="Kette",
        kind="meter",
        measuring_point_id=_mp(admin_client, "Kette"),
        parent_position_id=generator["id"],
    )
    assert kette.status_code == 422, kette.text
    selbst = admin_client.patch(
        f"{BASE}/{cid}/positions/{anlage['id']}", json={"parent_position_id": anlage["id"]}
    )
    assert selbst.status_code == 422, selbst.text
    anderer_kreis = _circle(admin_client, "SUED")
    fremd = _position(
        admin_client,
        anderer_kreis,
        label="Fremd",
        kind="meter",
        measuring_point_id=_mp(admin_client, "Fremd"),
        parent_position_id=anlage["id"],
    )
    assert fremd.status_code == 422, fremd.text
    assert admin_client.delete(f"{BASE}/{cid}/positions/{anlage['id']}").status_code == 409
    assert admin_client.delete(f"{BASE}/{cid}/positions/{generator['id']}").status_code == 204
    assert admin_client.delete(f"{BASE}/{cid}/positions/{anlage['id']}").status_code == 204


def test_position_aendern_und_zeitraum(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    pos = _meter_pos(admin_client, cid, "Werkstatt")
    geaendert = _ok(
        admin_client.patch(
            f"{BASE}/{cid}/positions/{pos['id']}",
            json={
                "invoice_line": "Strom (gewerblich) Wirtschaftshaus 22",
                "valid_to": "2026-12-01",
            },
        ),
        200,
    )
    assert geaendert["invoice_line"] == "Strom (gewerblich) Wirtschaftshaus 22"
    assert geaendert["valid_to"] == "2026-12-01"
    falsch = admin_client.patch(
        f"{BASE}/{cid}/positions/{pos['id']}", json={"valid_to": "2026-01-01"}
    )
    assert falsch.status_code == 422, falsch.text
    aktiv = admin_client.get(f"{BASE}/{cid}/positions", params={"stichtag": "2026-12-31"}).json()
    assert aktiv == []
    alle = admin_client.get(f"{BASE}/{cid}/positions").json()
    assert [p["label"] for p in alle] == ["Werkstatt"]


def test_position_eines_anderen_kreises_ist_404(admin_client: TestClient) -> None:
    nord, sued = _circle(admin_client, "NORD"), _circle(admin_client, "SUED")
    pos = _meter_pos(admin_client, nord, "A")
    patch = admin_client.patch(f"{BASE}/{sued}/positions/{pos['id']}", json={"note": "x"})
    assert patch.status_code == 404
    assert admin_client.delete(f"{BASE}/{sued}/positions/{pos['id']}").status_code == 404


def test_messstelle_mit_position_nicht_loeschbar(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    mp = _mp(admin_client, "Stall")
    _meter_pos(admin_client, cid, "Stall", measuring_point_id=mp)
    resp = admin_client.delete(f"/api/v1/measuring-points/{mp}")
    assert resp.status_code == 409, resp.text


def test_position_wird_protokolliert(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    pos = _meter_pos(admin_client, cid, "Stall")
    eintraege = admin_client.get("/api/v1/audit-log")
    assert eintraege.status_code == 200, eintraege.text
    assert any(
        e["action"] == "create"
        and e["entity_type"] == "billing_position"
        and e["entity_id"] == pos["id"]
        for e in eintraege.json()
    )


# --- Pruefbericht -------------------------------------------------------------------------------


def test_pruefbericht_zum_stichtag(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    gruppe_a = _owner(admin_client, "Agrar KG")
    intern_owner = _owner(admin_client, "Intern", internal_allocation=True)
    vit = _mieter(admin_client, "Beispielmieter")
    stall = _mp(admin_client, "Stall", owner_id=gruppe_a, kostenstelle=10102)
    wohnung = _mp(admin_client, "Wohnung", owner_id=gruppe_a, kostenstelle=10111, mieter_id=vit)
    generator = _mp(admin_client, "Generator", owner_id=intern_owner, kostenstelle=10110)
    ohne = _mp(admin_client, "Ohne")
    _meter_pos(admin_client, cid, "Stall", measuring_point_id=stall)
    _meter_pos(admin_client, cid, "Wohnung", measuring_point_id=wohnung)
    _meter_pos(admin_client, cid, "Generator", measuring_point_id=generator)
    _meter_pos(
        admin_client,
        cid,
        "Wirtschaftshaus",
        measuring_point_id=ohne,
        invoice_line="Strom (gewerblich) Wirtschaftshaus 22",
    )
    bericht = _ok(admin_client.get(f"{BASE}/{cid}/check", params={"stichtag": "2026-08-31"}), 200)
    zeilen = {z["label"]: z for z in bericht["positions"]}
    assert zeilen["Stall"]["owner_name"] == "Agrar KG"
    assert zeilen["Stall"]["kostenstelle"] == 10102
    assert zeilen["Stall"]["invoice_line"] == "Strom (gewerblich) Kostenstelle 10102"
    assert zeilen["Wohnung"]["invoice_line"] == "Strom (gewerblich) Beispielmieter"
    assert zeilen["Generator"]["internal_allocation"] is True
    assert zeilen["Wirtschaftshaus"]["invoice_line"] == "Strom (gewerblich) Wirtschaftshaus 22"
    befunde = {(b["label"], b["code"]) for b in bericht["findings"]}
    assert befunde == {
        ("Wirtschaftshaus", "ohne_eigentuemer"),
        ("Wirtschaftshaus", "ohne_kostenstelle"),
    }


def test_pruefbericht_vor_einbau_meldet_fehlenden_zaehler(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    owner = _owner(admin_client, "Agrar KG")
    mp = _mp(admin_client, "Neu", owner_id=owner, kostenstelle=1)
    _meter_pos(admin_client, cid, "Neu", measuring_point_id=mp, valid_from="2023-01-01")
    bericht = _ok(admin_client.get(f"{BASE}/{cid}/check", params={"stichtag": "2023-06-30"}), 200)
    assert "ohne_zaehler" in {b["code"] for b in bericht["findings"]}


# --- Eigentuemer ------------------------------------------------------------------------------


def test_eigentuemer_interne_umlage(admin_client: TestClient) -> None:
    oid = _owner(admin_client, "Musterhof Service GmbH")
    assert admin_client.get(f"/api/v1/owners/{oid}").json()["internal_allocation"] is False
    resp = admin_client.patch(f"/api/v1/owners/{oid}", json={"internal_allocation": True})
    assert resp.status_code == 200, resp.text
    assert resp.json()["internal_allocation"] is True


def test_artwechsel_leert_unpassende_felder(admin_client: TestClient) -> None:
    cid = _circle(admin_client, "SUED")
    owner = _owner(admin_client, "Nord KG")
    pos = _meter_pos(admin_client, cid, "Rest")
    resp = admin_client.patch(
        f"{BASE}/{cid}/positions/{pos['id']}",
        json={"kind": "rest", "owner_id": owner, "kostenstelle": 10101},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["measuring_point_id"] is None
    assert resp.json()["kind"] == "rest"


# --- Reihenfolge --------------------------------------------------------------------------------


def _positionen(client: TestClient, cid: int) -> list[dict[str, Any]]:
    resp = client.get(f"{BASE}/{cid}/positions")
    assert resp.status_code == 200, resp.text
    return cast(list[dict[str, Any]], resp.json())


def test_positionsliste_nennt_heutigen_empfaenger(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    agrar = _owner(admin_client, "Agrar KG")
    intern = _owner(admin_client, "Service GmbH", internal_allocation=True)
    stall = _mp(admin_client, "Stall", owner_id=agrar)
    bhkw = _mp(admin_client, "BHKW", owner_id=intern)
    _meter_pos(admin_client, cid, "Stall", measuring_point_id=stall)
    _meter_pos(admin_client, cid, "BHKW", measuring_point_id=bhkw)
    _meter_pos(admin_client, cid, "Ohne")
    _ok(_position(admin_client, cid, label="Rest", kind="rest", owner_id=agrar, kostenstelle=1))
    zeilen = {p["label"]: p for p in _positionen(admin_client, cid)}
    assert zeilen["Stall"]["recipient_name"] == "Agrar KG"
    assert zeilen["Stall"]["recipient_internal"] is False
    assert zeilen["BHKW"]["recipient_name"] == "Service GmbH"
    assert zeilen["BHKW"]["recipient_internal"] is True
    assert zeilen["Ohne"]["recipient_name"] is None
    assert zeilen["Rest"]["recipient_name"] == "Agrar KG"


def test_neue_position_ohne_reihenfolge_kommt_ans_ende(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    assert _meter_pos(admin_client, cid, "Erste")["sort_order"] == 10
    _meter_pos(admin_client, cid, "Mitte", sort_order=55)
    assert _meter_pos(admin_client, cid, "Letzte")["sort_order"] == 65
    assert [p["label"] for p in _positionen(admin_client, cid)] == ["Erste", "Mitte", "Letzte"]


def test_reihenfolge_setzen(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    a = _meter_pos(admin_client, cid, "A")
    b = _meter_pos(admin_client, cid, "B")
    c = _meter_pos(admin_client, cid, "C", valid_to="2026-09-01")  # abgelaufen, zaehlt mit
    resp = admin_client.put(
        f"{BASE}/{cid}/positions/order", json={"position_ids": [c["id"], a["id"], b["id"]]}
    )
    assert resp.status_code == 200, resp.text
    assert [(p["label"], p["sort_order"]) for p in resp.json()] == [
        ("C", 10),
        ("A", 20),
        ("B", 30),
    ]
    assert [p["label"] for p in _positionen(admin_client, cid)] == ["C", "A", "B"]
    eintraege = admin_client.get("/api/v1/audit-log").json()
    assert any(
        e["entity_type"] == "billing_circle"
        and e["entity_id"] == cid
        and e["diff"]["reihenfolge"]["to"] == ["C", "A", "B"]
        for e in eintraege
    )


def test_reihenfolge_muss_alle_positionen_genau_einmal_nennen(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    fremd = _meter_pos(admin_client, _circle(admin_client, "SUED"), "Fremd")
    a = _meter_pos(admin_client, cid, "A")
    b = _meter_pos(admin_client, cid, "B")
    url = f"{BASE}/{cid}/positions/order"
    for ids in ([a["id"]], [a["id"], a["id"]], [a["id"], b["id"], fremd["id"]]):
        assert admin_client.put(url, json={"position_ids": ids}).status_code == 422
    assert [p["sort_order"] for p in _positionen(admin_client, cid)] == [10, 20]


def test_reihenfolge_nur_mit_abrechnungsrecht(recorder_client: TestClient) -> None:
    resp = recorder_client.put(f"{BASE}/1/positions/order", json={"position_ids": [1]})
    assert resp.status_code == 403
