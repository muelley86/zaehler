from __future__ import annotations

from typing import Any, cast

from fastapi.testclient import TestClient


def _create_electricity(client: TestClient) -> dict[str, Any]:
    payload = {
        "name": "Hauptzähler Strom Keller",
        "type": "electricity",
        "is_bidirectional": True,
        "has_dual_tariff": False,
        "serial_number": "SN-0001",
        "installed_at": "2024-01-01",
        "initial_values": {"1.8.0": "12345.6", "2.8.0": "0.0"},
    }
    resp = client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def test_create_measuring_point_creates_registers(admin_client: TestClient) -> None:
    mp = _create_electricity(admin_client)
    meters: list[dict[str, Any]] = mp["physical_meters"]
    assert len(meters) == 1
    obis_codes = sorted(r["obis_code"] for r in meters[0]["registers"])
    assert obis_codes == ["1.8.0", "2.8.0"]


def test_recorder_cannot_create_measuring_point(recorder_client: TestClient) -> None:
    resp = recorder_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "x",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "x",
            "installed_at": "2024-01-01",
        },
    )
    assert resp.status_code == 403


def test_delete_empty_measuring_point(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wegwerf",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "DEL-1",
            "installed_at": "2024-01-01",
            "initial_values": {},
        },
    )
    mp_id = resp.json()["id"]
    delete = admin_client.delete(f"/api/v1/measuring-points/{mp_id}")
    assert delete.status_code == 204


def test_delete_measuring_point_with_readings_409(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Mit Anfangsstand",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "KEEP-1",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "100.0"},
        },
    )
    mp_id = resp.json()["id"]
    delete = admin_client.delete(f"/api/v1/measuring-points/{mp_id}")
    assert delete.status_code == 409
    body = delete.json()
    assert body["reading_count"] >= 1


def test_replace_meter_marks_old_inactive_and_creates_new(admin_client: TestClient) -> None:
    mp = _create_electricity(admin_client)
    mp_id = mp["id"]

    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp_id}/replace-meter",
        json={
            "final_readings": {"1.8.0": "12999.9", "2.8.0": "100.0"},
            "removed_at": "2025-06-30",
            "new_serial_number": "SN-0002",
            "installed_at": "2025-06-30",
            "initial_readings": {"1.8.0": "0.0", "2.8.0": "0.0"},
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    meters = body["physical_meters"]
    assert len(meters) == 2
    old = next(m for m in meters if m["serial_number"] == "SN-0001")
    new = next(m for m in meters if m["serial_number"] == "SN-0002")
    assert old["removed_at"] == "2025-06-30"
    assert new["removed_at"] is None
    assert all(not r["is_active"] for r in old["registers"])
    assert all(r["is_active"] for r in new["registers"])
