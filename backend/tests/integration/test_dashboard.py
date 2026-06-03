"""Tests für den gebündelten Dashboard-Endpoint ``GET /dashboard``.

Prüft, dass Verbrauch, Ablesungen und Bestand aller zugänglichen Messstellen in
einer Antwort kommen (statt Fan-out) — und dass der Recorder-Zugriffsfilter
greift.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, cast

from fastapi.testclient import TestClient


def _create_water_mp(client: TestClient) -> dict[str, Any]:
    resp = client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Dashboard-Wasser",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "DASH-W-1",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "100"},
        },
    )
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def test_dashboard_bundles_consumption_readings_state(admin_client: TestClient) -> None:
    mp = _create_water_mp(admin_client)
    register_id = mp["physical_meters"][0]["registers"][0]["id"]
    for value, at in (("120", "2025-03-01T12:00:00"), ("150", "2025-09-01T12:00:00")):
        admin_client.post(
            "/api/v1/readings",
            json={"register_id": register_id, "value": value, "reading_at": at},
        )

    resp = admin_client.get(
        "/api/v1/dashboard",
        params={"granularity": "year", "from_at": "2025-01-01", "to_at": "2025-12-31"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    item = next(i for i in body["items"] if i["measuring_point_id"] == mp["id"])

    # Ablesungen gebündelt: die 150-Erfassung ist dabei.
    assert any(Decimal(r["value"]) == Decimal("150") for r in item["readings"])
    # Bestand gebündelt: aktueller Stand = 150.
    assert any(Decimal(s["current_value"]) == Decimal("150") for s in item["state"])
    # Verbrauch gebündelt: nicht leer (120 -> 150 liegt komplett in 2025).
    assert len(item["consumption"]) > 0


def test_dashboard_month_granularity_uses_cache(admin_client: TestClient) -> None:
    mp = _create_water_mp(admin_client)
    register_id = mp["physical_meters"][0]["registers"][0]["id"]
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "130", "reading_at": "2025-04-15T12:00:00"},
    )
    resp = admin_client.get("/api/v1/dashboard", params={"granularity": "month"})
    assert resp.status_code == 200, resp.text
    item = next(i for i in resp.json()["items"] if i["measuring_point_id"] == mp["id"])
    assert "consumption" in item and "readings" in item and "state" in item


def test_dashboard_recorder_without_access_sees_nothing(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    _create_water_mp(admin_client)
    body = recorder_client.get("/api/v1/dashboard").json()
    assert body["items"] == []
