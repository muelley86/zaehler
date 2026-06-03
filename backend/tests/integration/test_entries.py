"""Tests für den gemischten, paginierten, serverseitig gefilterten Erfassungs-
Stream ``GET /entries`` (Readings + Lieferungen)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient


def _water_mp(admin_client: TestClient) -> int:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wasser Garten",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "W-0001",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "100.000"},
        },
    )
    assert resp.status_code == 201, resp.text
    return int(resp.json()["physical_meters"][0]["registers"][0]["id"])


def _oil_mp(admin_client: TestClient) -> dict[str, Any]:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Ölheizung Keller",
            "type": "heating",
            "heating_source": "oil",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "OIL-1",
            "installed_at": "2024-01-01",
            "initial_values": {},
            "registers": [
                {"label": "Betriebsstunden", "unit": "h", "initial_value": "0"},
                {
                    "label": "Tankstand",
                    "unit": "L",
                    "accepts_deliveries": True,
                    "initial_value": "2500",
                },
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    data: dict[str, Any] = resp.json()
    return data


def _tank_register_id(mp: dict[str, Any]) -> int:
    for meter in mp["physical_meters"]:
        for r in meter["registers"]:
            if r["accepts_deliveries"]:
                return int(r["id"])
    raise AssertionError("kein Tank-Register")


def _setup(admin_client: TestClient) -> dict[str, Any]:
    water_reg = _water_mp(admin_client)
    # Zwei weitere Wasser-Stände: eine normale Erfassung und eine Korrektur.
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": water_reg, "value": "150", "reading_at": "2025-01-01T12:00:00"},
    )
    admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": water_reg,
            "value": "160",
            "reading_at": "2025-02-01T12:00:00",
            "note": "Bestandskorrektur Zählertausch",
        },
    )
    oil = _oil_mp(admin_client)
    tank_reg = _tank_register_id(oil)
    admin_client.post(
        f"/api/v1/registers/{tank_reg}/deliveries",
        json={"delivery_at": "2024-06-01T12:00:00", "amount": "1500"},
    )
    return {"water_reg": water_reg, "oil_mp_id": oil["id"]}


def test_entries_mixed_sorted_with_total_and_previous(admin_client: TestClient) -> None:
    _setup(admin_client)
    resp = admin_client.get("/api/v1/entries")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # 5 Readings (Wasser 100/150/160, Öl Betriebsstunden 0, Tank 2500) + 1 Lieferung.
    assert body["total"] == 6
    assert len(body["items"]) == 6

    items = body["items"]
    # Neuester Eintrag zuerst: die Korrektur vom 2025-02-01.
    assert items[0]["kind"] == "correction"
    kinds = {i["kind"] for i in items}
    assert kinds == {"reading", "correction", "delivery"}

    # Vorwert (Delta-Basis): der 150-Stand hat als Vorgänger den Initialstand 100.
    r150 = next(i for i in items if i["reading"] and i["reading"]["value"] == "150")
    assert Decimal(r150["previous_value"]) == Decimal("100.000")
    # Der Initialstand selbst hat keinen Vorgänger.
    r100 = next(i for i in items if i["reading"] and i["reading"]["value"] == "100.000")
    assert r100["previous_value"] is None
    # Die Korrektur hat den 150-Stand als Vorgänger.
    corr = next(i for i in items if i["kind"] == "correction")
    assert Decimal(corr["previous_value"]) == Decimal("150")


def test_entries_filters(admin_client: TestClient) -> None:
    ctx = _setup(admin_client)

    # Zählerart=water → nur die drei Wasser-Stände.
    r = admin_client.get("/api/v1/entries", params={"meter_type": "water"}).json()
    assert r["total"] == 3
    assert all(i["reading"] is not None for i in r["items"])

    # Art=delivery → nur die Lieferung.
    r = admin_client.get("/api/v1/entries", params={"kind": "delivery"}).json()
    assert r["total"] == 1
    assert r["items"][0]["kind"] == "delivery"

    # Art=correction → nur die Bestandskorrektur.
    r = admin_client.get("/api/v1/entries", params={"kind": "correction"}).json()
    assert r["total"] == 1
    assert r["items"][0]["kind"] == "correction"

    # measuring_point_id=Öl → Betriebsstunden + Tank + Lieferung.
    r = admin_client.get("/api/v1/entries", params={"measuring_point_id": ctx["oil_mp_id"]}).json()
    assert r["total"] == 3
    assert "delivery" in {i["kind"] for i in r["items"]}

    # Suche nach MP-Name.
    r = admin_client.get("/api/v1/entries", params={"search": "garten"}).json()
    assert r["total"] == 3


def test_entries_pagination(admin_client: TestClient) -> None:
    _setup(admin_client)
    r = admin_client.get("/api/v1/entries", params={"limit": 2, "offset": 0}).json()
    assert r["total"] == 6
    assert len(r["items"]) == 2
    r2 = admin_client.get("/api/v1/entries", params={"limit": 2, "offset": 2}).json()
    assert r2["total"] == 6
    assert len(r2["items"]) == 2

    def _key(i: dict[str, Any]) -> tuple[bool, int]:
        obj = i["delivery"] if i["delivery"] is not None else i["reading"]
        return (i["delivery"] is not None, int(obj["id"]))

    keys1 = {_key(i) for i in r["items"]}
    keys2 = {_key(i) for i in r2["items"]}
    assert len(keys1) == 2
    # Keine Überschneidung zwischen Seite 1 und 2.
    assert keys1.isdisjoint(keys2)


def test_entries_recorder_without_access_sees_nothing(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    _setup(admin_client)
    r = recorder_client.get("/api/v1/entries").json()
    assert r["total"] == 0
    assert r["items"] == []
