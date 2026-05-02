from __future__ import annotations

from typing import Any, cast

from fastapi.testclient import TestClient


def _create_oil(client: TestClient) -> dict[str, Any]:
    payload = {
        "name": "Ölheizung Keller",
        "type": "oil",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": "OIL-1",
        "installed_at": "2024-01-01",
        "initial_values": {"oil.hours": "0", "oil.tank": "2500"},
    }
    resp = client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def _registers(mp: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for meter in mp["physical_meters"]:
        for r in meter["registers"]:
            out[r["obis_code"]] = r
    return out


def test_oil_measuring_point_creates_two_registers(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    regs = _registers(mp)
    assert set(regs.keys()) == {"oil.hours", "oil.tank"}
    assert regs["oil.hours"]["unit"] == "h"
    assert regs["oil.tank"]["unit"] == "L"
    assert regs["oil.hours"]["accepts_deliveries"] is False
    assert regs["oil.tank"]["accepts_deliveries"] is True


def test_create_delivery_and_listing(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    tank_id: int = _registers(mp)["oil.tank"]["id"]

    create = admin_client.post(
        f"/api/v1/registers/{tank_id}/deliveries",
        json={"delivery_date": "2024-03-10", "amount": "1500.5", "note": "Lieferung Frühjahr"},
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["amount"] == "1500.5"

    listing = admin_client.get(f"/api/v1/registers/{tank_id}/deliveries")
    assert listing.status_code == 200
    assert len(listing.json()) == 1


def test_delivery_only_on_accepting_register(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    hours_id: int = _registers(mp)["oil.hours"]["id"]
    resp = admin_client.post(
        f"/api/v1/registers/{hours_id}/deliveries",
        json={"delivery_date": "2024-03-10", "amount": "1000"},
    )
    assert resp.status_code == 400


def test_delete_delivery(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    tank_id: int = _registers(mp)["oil.tank"]["id"]
    created = admin_client.post(
        f"/api/v1/registers/{tank_id}/deliveries",
        json={"delivery_date": "2024-03-10", "amount": "1000"},
    ).json()
    resp = admin_client.delete(f"/api/v1/deliveries/{created['id']}")
    assert resp.status_code == 204
    assert admin_client.get(f"/api/v1/registers/{tank_id}/deliveries").json() == []


def test_oil_consumption_with_deliveries(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    tank_id: int = _registers(mp)["oil.tank"]["id"]
    hours_id: int = _registers(mp)["oil.hours"]["id"]

    # Tankstand erfassen, dann Lieferung, dann wieder Tankstand
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": tank_id, "value": "2000", "reading_at": "2024-02-01T12:00:00"},
    )
    admin_client.post(
        f"/api/v1/registers/{tank_id}/deliveries",
        json={"delivery_date": "2024-02-15", "amount": "1500"},
    )
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": tank_id, "value": "2800", "reading_at": "2024-03-01T12:00:00"},
    )

    # Betriebsstunden separat
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": hours_id, "value": "120", "reading_at": "2024-02-01T12:00:00"},
    )
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": hours_id, "value": "350", "reading_at": "2024-03-01T12:00:00"},
    )

    resp = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/consumption")
    assert resp.status_code == 200
    points = resp.json()
    tank_consumption = next(
        p for p in points if p["obis_code"] == "oil.tank" and p["period_end"] == "2024-03-01"
    )
    # Initial 2500 → 2000 (Verbrauch 500); 2000 + 1500 Lieferung → 2800 (Verbrauch 700).
    # Im Antwort-Endpunkt für period_end=2024-03-01 erwarten wir den 2. Schritt: 700.
    assert tank_consumption["consumption"] == "700"

    hours_consumption = next(
        p for p in points if p["obis_code"] == "oil.hours" and p["period_end"] == "2024-03-01"
    )
    assert hours_consumption["consumption"] == "230"


def test_recorder_can_record_delivery(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    mp = _create_oil(admin_client)
    tank_id: int = _registers(mp)["oil.tank"]["id"]
    resp = recorder_client.post(
        f"/api/v1/registers/{tank_id}/deliveries",
        json={"delivery_date": "2024-04-01", "amount": "500"},
    )
    assert resp.status_code == 201


def test_global_deliveries_listing_with_filters(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    tank_id: int = _registers(mp)["oil.tank"]["id"]

    for d, amt in [("2024-02-15", "1500"), ("2024-04-15", "1200")]:
        admin_client.post(
            f"/api/v1/registers/{tank_id}/deliveries",
            json={"delivery_date": d, "amount": amt},
        )
    listing = admin_client.get("/api/v1/deliveries")
    assert listing.status_code == 200
    assert len(listing.json()) == 2

    filtered = admin_client.get("/api/v1/deliveries", params={"from_date": "2024-04-01"})
    assert len(filtered.json()) == 1
    assert filtered.json()[0]["delivery_date"] == "2024-04-15"

    by_mp = admin_client.get("/api/v1/deliveries", params={"measuring_point_id": mp["id"]})
    assert len(by_mp.json()) == 2


def test_state_includes_deliveries_after_last_reading(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    tank_id: int = _registers(mp)["oil.tank"]["id"]

    admin_client.post(
        "/api/v1/readings",
        json={"register_id": tank_id, "value": "2000", "reading_at": "2024-02-01T12:00:00"},
    )
    admin_client.post(
        f"/api/v1/registers/{tank_id}/deliveries",
        json={"delivery_date": "2024-02-15", "amount": "1500"},
    )

    resp = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/state")
    assert resp.status_code == 200, resp.text
    states = resp.json()
    tank = next(s for s in states if s["obis_code"] == "oil.tank")
    assert tank["last_reading_value"] == "2000"
    assert tank["refilled_since"] == "1500"
    assert tank["current_value"] == "3500"


def test_state_after_new_reading_resets_refilled_since(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    tank_id: int = _registers(mp)["oil.tank"]["id"]

    admin_client.post(
        "/api/v1/readings",
        json={"register_id": tank_id, "value": "2000", "reading_at": "2024-02-01T12:00:00"},
    )
    admin_client.post(
        f"/api/v1/registers/{tank_id}/deliveries",
        json={"delivery_date": "2024-02-15", "amount": "1500"},
    )
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": tank_id, "value": "3200", "reading_at": "2024-03-01T12:00:00"},
    )

    resp = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/state")
    states = resp.json()
    tank = next(s for s in states if s["obis_code"] == "oil.tank")
    assert tank["last_reading_value"] == "3200"
    assert tank["refilled_since"] == "0"
    assert tank["current_value"] == "3200"
