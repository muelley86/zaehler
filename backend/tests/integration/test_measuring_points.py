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


def test_create_electricity_with_transformer_factor(admin_client: TestClient) -> None:
    payload = {
        "name": "PV-Hauptzähler",
        "type": "electricity",
        "is_bidirectional": True,
        "has_dual_tariff": False,
        "transformer_factor": 50,
        "serial_number": "WANDLER-1",
        "installed_at": "2024-01-01",
        "initial_values": {"1.8.0": "0", "2.8.0": "0"},
    }
    resp = admin_client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["transformer_factor"] == 50

    get = admin_client.get(f"/api/v1/measuring-points/{body['id']}")
    assert get.json()["transformer_factor"] == 50


def test_transformer_factor_rejected_for_gas(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Gas mit Faktor",
            "type": "gas",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "transformer_factor": 10,
            "serial_number": "G-1",
            "installed_at": "2024-01-01",
            "initial_values": {},
        },
    )
    assert resp.status_code == 422


def test_transformer_factor_must_be_positive(admin_client: TestClient) -> None:
    for invalid in (0, -5):
        resp = admin_client.post(
            "/api/v1/measuring-points",
            json={
                "name": f"Strom {invalid}",
                "type": "electricity",
                "is_bidirectional": False,
                "has_dual_tariff": False,
                "transformer_factor": invalid,
                "serial_number": f"E-{invalid}",
                "installed_at": "2024-01-01",
                "initial_values": {"1.8.0": "0"},
            },
        )
        assert resp.status_code == 422, resp.text


def test_patch_transformer_factor_updates_value(admin_client: TestClient) -> None:
    mp = _create_electricity(admin_client)
    mp_id = mp["id"]
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp_id}",
        json={"transformer_factor": 100},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["transformer_factor"] == 100


def test_patch_clear_transformer_factor_sets_null(admin_client: TestClient) -> None:
    mp = _create_electricity(admin_client)
    mp_id = mp["id"]
    admin_client.patch(f"/api/v1/measuring-points/{mp_id}", json={"transformer_factor": 40})
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp_id}",
        json={"clear_transformer_factor": True},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["transformer_factor"] is None


def test_patch_transformer_factor_rejected_for_non_electricity(admin_client: TestClient) -> None:
    create = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wasserzähler",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "W-FAC",
            "installed_at": "2024-01-01",
            "initial_values": {},
        },
    )
    mp_id = create.json()["id"]
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp_id}",
        json={"transformer_factor": 20},
    )
    assert resp.status_code == 422


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


def test_replace_meter_rolls_back_on_incomplete_finals(admin_client: TestClient) -> None:
    """Atomarität: bei unvollständigen final_readings darf der alte Meter
    nicht halb-deaktiviert sein, und es darf kein neuer Meter angelegt werden."""
    mp = _create_electricity(admin_client)
    mp_id = mp["id"]
    old_meter = mp["physical_meters"][0]
    old_register_ids = {r["id"] for r in old_meter["registers"]}

    # Strom (bidirektional, kein Doppeltarif) hat zwei Register: 1.8.0 + 2.8.0.
    # Wir liefern nur eines der beiden Endstände → Service muss 400 werfen
    # (siehe meter_replacement._validate_finals).
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp_id}/replace-meter",
        json={
            "final_readings": {"1.8.0": "12999.9"},
            "removed_at": "2025-06-30",
            "new_serial_number": "SN-FAIL",
            "installed_at": "2025-06-30",
            "initial_readings": {"1.8.0": "0.0", "2.8.0": "0.0"},
        },
    )
    assert resp.status_code == 400, resp.text

    # Nach dem Fehler muss alles wie vorher sein:
    after = admin_client.get(f"/api/v1/measuring-points/{mp_id}").json()
    assert len(after["physical_meters"]) == 1, "Kein neuer Meter erlaubt"
    only_meter = after["physical_meters"][0]
    assert only_meter["removed_at"] is None, "Alter Meter darf nicht deaktiviert sein"
    assert all(r["is_active"] for r in only_meter["registers"]), (
        "Alle Register müssen weiter aktiv sein"
    )
    assert {r["id"] for r in only_meter["registers"]} == old_register_ids
