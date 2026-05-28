from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient


def test_create_and_list_locations(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/locations", json={"name": "Keller", "note": "unter dem Treppen"}
    )
    assert resp.status_code == 201, resp.text
    listing = admin_client.get("/api/v1/locations")
    assert listing.status_code == 200
    rows: list[dict[str, Any]] = listing.json()
    keller = next(r for r in rows if r["name"] == "Keller")
    assert keller["latitude"] is None
    assert keller["longitude"] is None


def test_create_location_with_coordinates(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/locations",
        json={"name": "Zaehlerschrank", "latitude": 48.137154, "longitude": 11.575492},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["latitude"] == 48.137154
    assert body["longitude"] == 11.575492


def test_reject_out_of_range_coordinates(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/locations",
        json={"name": "Mond", "latitude": 91.0, "longitude": 0.0},
    )
    assert resp.status_code == 422
    resp = admin_client.post(
        "/api/v1/locations",
        json={"name": "AmRandDerErde", "latitude": 0.0, "longitude": 181.0},
    )
    assert resp.status_code == 422


def test_update_and_clear_coordinates(admin_client: TestClient) -> None:
    created = admin_client.post(
        "/api/v1/locations",
        json={"name": "Garten", "latitude": 50.0, "longitude": 10.0},
    ).json()
    loc_id = created["id"]
    moved = admin_client.patch(
        f"/api/v1/locations/{loc_id}",
        json={"latitude": 50.5, "longitude": 10.5},
    )
    assert moved.status_code == 200
    assert moved.json()["latitude"] == 50.5
    cleared = admin_client.patch(
        f"/api/v1/locations/{loc_id}",
        json={"clear_coordinates": True},
    )
    assert cleared.status_code == 200
    assert cleared.json()["latitude"] is None
    assert cleared.json()["longitude"] is None


def test_duplicate_location_name_409(admin_client: TestClient) -> None:
    admin_client.post("/api/v1/locations", json={"name": "Garage"})
    resp = admin_client.post("/api/v1/locations", json={"name": "Garage"})
    assert resp.status_code == 409


def test_recorder_cannot_create_location(recorder_client: TestClient) -> None:
    resp = recorder_client.post("/api/v1/locations", json={"name": "Dachboden"})
    assert resp.status_code == 403


def test_measuring_point_with_location(admin_client: TestClient) -> None:
    loc = admin_client.post("/api/v1/locations", json={"name": "Heizraum"}).json()
    mp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wasser HZ",
            "type": "water",
            "location_id": loc["id"],
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "W-HZ-1",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "10.0"},
        },
    ).json()
    assert mp["location_id"] == loc["id"]
    assert mp["location_name"] == "Heizraum"


def test_update_measuring_point_location_and_flags(admin_client: TestClient) -> None:
    loc1 = admin_client.post("/api/v1/locations", json={"name": "Halle"}).json()
    loc2 = admin_client.post("/api/v1/locations", json={"name": "Werkstatt"}).json()
    mp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Strom Halle",
            "type": "electricity",
            "location_id": loc1["id"],
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "S-1",
            "installed_at": "2024-01-01",
        },
    ).json()
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}",
        json={
            "name": "Strom Halle (umbenannt)",
            "location_id": loc2["id"],
            "has_dual_tariff": True,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Strom Halle (umbenannt)"
    assert body["location_id"] == loc2["id"]
    assert body["has_dual_tariff"] is True


def test_clear_location(admin_client: TestClient) -> None:
    loc = admin_client.post("/api/v1/locations", json={"name": "Schuppen"}).json()
    mp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "X",
            "type": "water",
            "location_id": loc["id"],
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "S-2",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "0"},
        },
    ).json()
    resp = admin_client.patch(f"/api/v1/measuring-points/{mp['id']}", json={"clear_location": True})
    assert resp.status_code == 200
    assert resp.json()["location_id"] is None


def test_update_physical_meter_serial(admin_client: TestClient) -> None:
    mp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "G",
            "type": "heating",
            "heating_source": "gas",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "TYPO-1",
            "installed_at": "2024-01-01",
            "initial_values": {},
            "registers": [{"label": "Verbrauch", "unit": "m³", "initial_value": 0}],
        },
    ).json()
    meter_id = mp["physical_meters"][0]["id"]
    resp = admin_client.patch(
        f"/api/v1/physical-meters/{meter_id}",
        json={"serial_number": "RICHTIG-1"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["serial_number"] == "RICHTIG-1"


def test_update_register_label(admin_client: TestClient) -> None:
    mp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "G2",
            "type": "heating",
            "heating_source": "gas",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "G-2",
            "installed_at": "2024-01-01",
            "initial_values": {},
            "registers": [{"label": "Verbrauch", "unit": "m³", "initial_value": 0}],
        },
    ).json()
    register_id = mp["physical_meters"][0]["registers"][0]["id"]
    resp = admin_client.patch(
        f"/api/v1/registers/{register_id}",
        json={"label": "Erdgas (kalibriert)"},
    )
    assert resp.status_code == 200
    assert resp.json()["label"] == "Erdgas (kalibriert)"


def test_location_with_address(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/locations",
        json={
            "name": "Wohnung-Hauptstr",
            "address_street": "Hauptstr. 12",
            "address_postcode": "12345",
            "address_city": "Berlin",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["address_street"] == "Hauptstr. 12"
    assert body["address_postcode"] == "12345"
    assert body["address_city"] == "Berlin"


def test_patch_address_update_and_clear(admin_client: TestClient) -> None:
    create = admin_client.post(
        "/api/v1/locations",
        json={"name": "Wohnung-Clear", "address_city": "Hamburg"},
    ).json()
    loc_id = create["id"]
    # Update
    upd = admin_client.patch(
        f"/api/v1/locations/{loc_id}",
        json={"address_city": "Bremen"},
    ).json()
    assert upd["address_city"] == "Bremen"
    # Clear via leerem String
    cleared = admin_client.patch(
        f"/api/v1/locations/{loc_id}",
        json={"address_city": ""},
    ).json()
    assert cleared["address_city"] is None


def test_location_postcode_must_be_five_digits(admin_client: TestClient) -> None:
    ok = admin_client.post(
        "/api/v1/locations", json={"name": "Loc-PLZ-OK", "address_postcode": "12345"}
    )
    assert ok.status_code == 201
    bad = admin_client.post(
        "/api/v1/locations", json={"name": "Loc-PLZ-BAD", "address_postcode": "abc"}
    )
    assert bad.status_code == 422
