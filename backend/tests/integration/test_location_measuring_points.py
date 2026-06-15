"""Reverse-Lookup: Messstellen (mit Stand) je Zaehlerstandort / Hauptstandort.

Deckt ``GET /api/v1/locations/{id}/measuring-points`` und
``GET /api/v1/main-locations/{id}/measuring-points`` ab — die Datenquelle der
Standort-Detailseiten.

- Zaehlerstandort (``Location``): MPs direkt ueber ``MeasuringPoint.location_id``.
- Hauptstandort (``MainLocation``): aggregiert MPs ueber **alle** untergeordneten
  Zaehlerstandorte (``Location.main_location_id``). MPs ohne / mit fremdem
  Hauptstandort erscheinen nicht.

Jede MP kommt gebuendelt mit ihrem aktuellen Register-Stand; Recorder sehen via
``restrict_mp_query`` nur ihre zugaenglichen MPs.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from meters.models import User, UserMeasuringPointAccess


def _create_location(client: TestClient, name: str, *, main_location_id: int | None = None) -> int:
    body: dict[str, Any] = {"name": name}
    if main_location_id is not None:
        body["main_location_id"] = main_location_id
    resp = client.post("/api/v1/locations", json=body)
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _create_main_location(client: TestClient, name: str) -> int:
    resp = client.post("/api/v1/main-locations", json={"name": name})
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _create_mp(
    client: TestClient,
    *,
    name: str,
    serial: str,
    location_id: int | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": name,
        "type": "water",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": serial,
        "installed_at": "2024-01-01",
        "initial_values": {"water": "0"},
    }
    if location_id is not None:
        body["location_id"] = location_id
    resp = client.post("/api/v1/measuring-points", json=body)
    assert resp.status_code == 201, resp.text
    out: dict[str, Any] = resp.json()
    return out


def _add_reading(client: TestClient, register_id: int, value: str) -> None:
    resp = client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": value, "reading_at": "2025-01-01T12:00:00"},
    )
    assert resp.status_code < 300, resp.text


def _grant(db: Session, *, user: User, mp_id: int, granted_by: User) -> None:
    db.add(
        UserMeasuringPointAccess(
            user_id=user.id,
            measuring_point_id=mp_id,
            granted_by_user_id=granted_by.id,
        )
    )
    db.commit()


# ---------------------------------------------------------------------------
# Zaehlerstandort (Location)
# ---------------------------------------------------------------------------


def test_location_measuring_points_with_state(admin_client: TestClient) -> None:
    loc_id = _create_location(admin_client, "Keller")
    mp = _create_mp(admin_client, name="Wasser-Keller", serial="SN-LOC-1", location_id=loc_id)
    register_id = mp["physical_meters"][0]["registers"][0]["id"]
    _add_reading(admin_client, register_id, "123.5")

    resp = admin_client.get(f"/api/v1/locations/{loc_id}/measuring-points")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert [item["measuring_point"]["id"] for item in data] == [mp["id"]]
    registers = data[0]["registers"]
    assert len(registers) == 1
    assert Decimal(registers[0]["current_value"]) == Decimal("123.5")


def test_location_excludes_other_locations(admin_client: TestClient) -> None:
    loc_a = _create_location(admin_client, "Standort-A")
    loc_b = _create_location(admin_client, "Standort-B")
    mp_a = _create_mp(admin_client, name="MP-A", serial="SN-A", location_id=loc_a)
    _create_mp(admin_client, name="MP-B", serial="SN-B", location_id=loc_b)

    resp = admin_client.get(f"/api/v1/locations/{loc_a}/measuring-points")
    assert resp.status_code == 200, resp.text
    assert [item["measuring_point"]["id"] for item in resp.json()] == [mp_a["id"]]


def test_location_empty(admin_client: TestClient) -> None:
    loc_id = _create_location(admin_client, "Leerer-Standort")
    resp = admin_client.get(f"/api/v1/locations/{loc_id}/measuring-points")
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


def test_location_404(admin_client: TestClient) -> None:
    assert admin_client.get("/api/v1/locations/999999/measuring-points").status_code == 404


# ---------------------------------------------------------------------------
# Hauptstandort (MainLocation) — aggregiert ueber untergeordnete Standorte
# ---------------------------------------------------------------------------


def test_main_location_aggregates_children(admin_client: TestClient) -> None:
    main_id = _create_main_location(admin_client, "Hauptgebaeude")
    other_main = _create_main_location(admin_client, "Werkstatt")
    loc1 = _create_location(admin_client, "HG-Keller", main_location_id=main_id)
    loc2 = _create_location(admin_client, "HG-Dach", main_location_id=main_id)
    loc_other = _create_location(admin_client, "WS-Keller", main_location_id=other_main)
    loc_orphan = _create_location(admin_client, "Ohne-Haupt")

    mp1 = _create_mp(admin_client, name="HG-MP1", serial="SN-HG-1", location_id=loc1)
    mp2 = _create_mp(admin_client, name="HG-MP2", serial="SN-HG-2", location_id=loc2)
    # Diese duerfen NICHT im Hauptgebaeude-Ergebnis auftauchen:
    _create_mp(admin_client, name="WS-MP", serial="SN-WS-1", location_id=loc_other)
    _create_mp(admin_client, name="Orphan-MP", serial="SN-ORP-1", location_id=loc_orphan)
    _create_mp(admin_client, name="NoLoc-MP", serial="SN-NOLOC-1")

    resp = admin_client.get(f"/api/v1/main-locations/{main_id}/measuring-points")
    assert resp.status_code == 200, resp.text
    ids = sorted(item["measuring_point"]["id"] for item in resp.json())
    assert ids == sorted([mp1["id"], mp2["id"]])


def test_main_location_empty(admin_client: TestClient) -> None:
    main_id = _create_main_location(admin_client, "Leeres-Hauptgebaeude")
    resp = admin_client.get(f"/api/v1/main-locations/{main_id}/measuring-points")
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


def test_main_location_404(admin_client: TestClient) -> None:
    assert admin_client.get("/api/v1/main-locations/999999/measuring-points").status_code == 404


# ---------------------------------------------------------------------------
# Recorder-Zugriff (restrict_mp_query)
# ---------------------------------------------------------------------------


def test_recorder_only_sees_accessible_location_measuring_points(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    loc_id = _create_location(admin_client, "Access-Standort")
    mp_a = _create_mp(admin_client, name="LW-A", serial="SN-LACC-A", location_id=loc_id)
    _create_mp(admin_client, name="LW-B", serial="SN-LACC-B", location_id=loc_id)
    _grant(db, user=recorder_user, mp_id=mp_a["id"], granted_by=admin_user)

    resp = recorder_client.get(f"/api/v1/locations/{loc_id}/measuring-points")
    assert resp.status_code == 200, resp.text
    ids = [item["measuring_point"]["id"] for item in resp.json()]
    assert ids == [mp_a["id"]]
