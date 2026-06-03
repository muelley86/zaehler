from __future__ import annotations

from typing import Any, cast

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.models import MeasuringPoint, User, UserMeasuringPointAccess


def _grant_recorder_access_to_first_mp(db: Session, *, recorder: User, granted_by: User) -> None:
    """Per-Recorder MP-Zugriff (Feature B): Recorder bekommt explizit
    Zugriff auf alle vorhandenen MPs — analog zum gleichnamigen Helper
    in test_readings.py."""
    for mp_id in db.scalars(select(MeasuringPoint.id)):
        if db.get(UserMeasuringPointAccess, (recorder.id, mp_id)) is not None:
            continue
        db.add(
            UserMeasuringPointAccess(
                user_id=recorder.id,
                measuring_point_id=mp_id,
                granted_by_user_id=granted_by.id,
            )
        )
    db.commit()


def _create_oil(client: TestClient) -> dict[str, Any]:
    """Heizöl-Messstelle (heating + heating_source=oil) mit zwei Registern:
    Betriebsstunden (h) und Tankstand (L, mit Lieferungen)."""
    payload = {
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
    }
    resp = client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def _hours_register(mp: dict[str, Any]) -> dict[str, Any]:
    for meter in mp["physical_meters"]:
        for r in meter["registers"]:
            if not r["accepts_deliveries"] and r["unit"] == "h":
                return cast(dict[str, Any], r)
    raise AssertionError("Hours-Register not found")


def _tank_register(mp: dict[str, Any]) -> dict[str, Any]:
    for meter in mp["physical_meters"]:
        for r in meter["registers"]:
            if r["accepts_deliveries"]:
                return cast(dict[str, Any], r)
    raise AssertionError("Tank-Register not found")


def test_oil_measuring_point_creates_two_registers(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    hours = _hours_register(mp)
    tank = _tank_register(mp)
    assert hours["label"] == "Betriebsstunden"
    assert hours["unit"] == "h"
    assert hours["accepts_deliveries"] is False
    assert tank["label"] == "Tankstand"
    assert tank["unit"] == "L"
    assert tank["accepts_deliveries"] is True


def test_create_delivery_and_listing(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    tank_id = _tank_register(mp)["id"]

    create = admin_client.post(
        f"/api/v1/registers/{tank_id}/deliveries",
        json={
            "delivery_at": "2024-03-10T12:00:00",
            "amount": "1500.5",
            "note": "Lieferung Frühjahr",
        },
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["amount"] == "1500.5"

    listing = admin_client.get(f"/api/v1/registers/{tank_id}/deliveries")
    assert listing.status_code == 200
    assert len(listing.json()) == 1


def test_delivery_only_on_accepting_register(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    hours_id = _hours_register(mp)["id"]
    resp = admin_client.post(
        f"/api/v1/registers/{hours_id}/deliveries",
        json={"delivery_at": "2024-03-10T12:00:00", "amount": "1000"},
    )
    assert resp.status_code == 400


def test_delete_delivery(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    tank_id = _tank_register(mp)["id"]
    created = admin_client.post(
        f"/api/v1/registers/{tank_id}/deliveries",
        json={"delivery_at": "2024-03-10T12:00:00", "amount": "1000"},
    ).json()
    resp = admin_client.delete(f"/api/v1/deliveries/{created['id']}")
    assert resp.status_code == 204
    assert admin_client.get(f"/api/v1/registers/{tank_id}/deliveries").json() == []


def test_oil_consumption_with_deliveries(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    tank_id = _tank_register(mp)["id"]
    hours_id = _hours_register(mp)["id"]
    tank_obis = _tank_register(mp)["obis_code"]
    hours_obis = _hours_register(mp)["obis_code"]

    # Tankstand erfassen, dann Lieferung, dann wieder Tankstand
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": tank_id, "value": "2000", "reading_at": "2024-02-01T12:00:00"},
    )
    admin_client.post(
        f"/api/v1/registers/{tank_id}/deliveries",
        json={"delivery_at": "2024-02-15T12:00:00", "amount": "1500"},
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
        p for p in points if p["obis_code"] == tank_obis and p["period_end"] == "2024-03-01"
    )
    # Initial 2500 → 2000 (Verbrauch 500); 2000 + 1500 Lieferung → 2800 (Verbrauch 700).
    # Im Antwort-Endpunkt für period_end=2024-03-01 erwarten wir den 2. Schritt: 700.
    assert tank_consumption["consumption"] == "700"

    hours_consumption = next(
        p for p in points if p["obis_code"] == hours_obis and p["period_end"] == "2024-03-01"
    )
    assert hours_consumption["consumption"] == "230"


def test_recorder_can_record_delivery(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    mp = _create_oil(admin_client)
    _grant_recorder_access_to_first_mp(db, recorder=recorder_user, granted_by=admin_user)
    tank_id = _tank_register(mp)["id"]
    resp = recorder_client.post(
        f"/api/v1/registers/{tank_id}/deliveries",
        json={"delivery_at": "2024-04-01T12:00:00", "amount": "500"},
    )
    assert resp.status_code == 201


def test_global_deliveries_listing_with_filters(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    tank_id = _tank_register(mp)["id"]

    for d, amt in [("2024-02-15T12:00:00", "1500"), ("2024-04-15T12:00:00", "1200")]:
        admin_client.post(
            f"/api/v1/registers/{tank_id}/deliveries",
            json={"delivery_at": d, "amount": amt},
        )
    listing = admin_client.get("/api/v1/deliveries")
    assert listing.status_code == 200
    assert len(listing.json()) == 2

    filtered = admin_client.get("/api/v1/deliveries", params={"from_date": "2024-04-01"})
    assert len(filtered.json()) == 1
    assert filtered.json()[0]["delivery_at"] == "2024-04-15T12:00:00Z"

    by_mp = admin_client.get("/api/v1/deliveries", params={"measuring_point_id": mp["id"]})
    assert len(by_mp.json()) == 2


def test_state_includes_deliveries_after_last_reading(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    tank = _tank_register(mp)
    tank_id = tank["id"]
    tank_obis = tank["obis_code"]

    admin_client.post(
        "/api/v1/readings",
        json={"register_id": tank_id, "value": "2000", "reading_at": "2024-02-01T12:00:00"},
    )
    admin_client.post(
        f"/api/v1/registers/{tank_id}/deliveries",
        json={"delivery_at": "2024-02-15T12:00:00", "amount": "1500"},
    )

    resp = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/state")
    assert resp.status_code == 200, resp.text
    states = resp.json()
    state = next(s for s in states if s["obis_code"] == tank_obis)
    assert state["last_reading_value"] == "2000"
    assert state["refilled_since"] == "1500"
    assert state["current_value"] == "3500"


def test_state_after_new_reading_resets_refilled_since(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    tank = _tank_register(mp)
    tank_id = tank["id"]
    tank_obis = tank["obis_code"]

    admin_client.post(
        "/api/v1/readings",
        json={"register_id": tank_id, "value": "2000", "reading_at": "2024-02-01T12:00:00"},
    )
    admin_client.post(
        f"/api/v1/registers/{tank_id}/deliveries",
        json={"delivery_at": "2024-02-15T12:00:00", "amount": "1500"},
    )
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": tank_id, "value": "3200", "reading_at": "2024-03-01T12:00:00"},
    )

    resp = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/state")
    states = resp.json()
    state = next(s for s in states if s["obis_code"] == tank_obis)
    assert state["last_reading_value"] == "3200"
    assert state["refilled_since"] == "0"
    assert state["current_value"] == "3200"


def test_register_crud_add_then_remove(admin_client: TestClient) -> None:
    """Live-Editing: Register an aktivem Wärme-Zähler hinzufügen und löschen."""
    mp = _create_oil(admin_client)
    meter_id = mp["physical_meters"][0]["id"]

    add = admin_client.post(
        f"/api/v1/physical-meters/{meter_id}/registers",
        json={"label": "Wärmemengenzähler", "unit": "kWh", "initial_value": "0"},
    )
    assert add.status_code == 201, add.text
    new_id = add.json()["id"]
    assert add.json()["label"] == "Wärmemengenzähler"
    assert add.json()["unit"] == "kWh"

    delete = admin_client.delete(f"/api/v1/registers/{new_id}")
    assert delete.status_code == 204


def test_register_delete_blocked_by_readings(admin_client: TestClient) -> None:
    mp = _create_oil(admin_client)
    tank_id = _tank_register(mp)["id"]

    # Reading drauf, dann Delete versuchen → 409
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": tank_id, "value": "2000", "reading_at": "2024-02-01T12:00:00"},
    )
    resp = admin_client.delete(f"/api/v1/registers/{tank_id}")
    assert resp.status_code == 409


def test_heating_requires_registers(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Leer",
            "type": "heating",
            "heating_source": "oil",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "OIL-X",
            "installed_at": "2024-01-01",
            "initial_values": {},
            "registers": [],
        },
    )
    assert resp.status_code == 422


def test_heating_source_required_for_heating(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Leer",
            "type": "heating",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "X",
            "installed_at": "2024-01-01",
            "initial_values": {},
            "registers": [{"label": "X", "unit": "kWh"}],
        },
    )
    assert resp.status_code == 422


def test_invalid_heating_unit_rejected(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Bad",
            "type": "heating",
            "heating_source": "wood",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "W-1",
            "installed_at": "2024-01-01",
            "initial_values": {},
            "registers": [{"label": "Foo", "unit": "Liter"}],
        },
    )
    assert resp.status_code == 422


def test_replace_meter_inherits_custom_heating_registers(admin_client: TestClient) -> None:
    """Beim Tausch eines Heating-Meters muss der neue Meter die User-
    konfigurierte Register-Liste exakt übernehmen — auch nachträglich
    hinzugefügte Custom-Register."""
    mp = _create_oil(admin_client)
    mp_id = mp["id"]
    meter_id = mp["physical_meters"][0]["id"]

    # Drittes Custom-Register nachträglich anhängen
    add = admin_client.post(
        f"/api/v1/physical-meters/{meter_id}/registers",
        json={"label": "Wärmemenge", "unit": "kWh", "initial_value": "0"},
    )
    assert add.status_code == 201, add.text

    # Tausch
    obis_codes_before = sorted(
        r["obis_code"]
        for r in admin_client.get(f"/api/v1/measuring-points/{mp_id}").json()["physical_meters"][0][
            "registers"
        ]
    )
    final_readings = {code: "100" for code in obis_codes_before}
    initial_readings = {code: "0" for code in obis_codes_before}

    swap = admin_client.post(
        f"/api/v1/measuring-points/{mp_id}/replace-meter",
        json={
            "final_readings": final_readings,
            "removed_at": "2024-12-01",
            "new_serial_number": "OIL-NEU",
            "installed_at": "2024-12-01",
            "initial_readings": initial_readings,
        },
    )
    assert swap.status_code == 200, swap.text

    body = admin_client.get(f"/api/v1/measuring-points/{mp_id}").json()
    new_meter = next(m for m in body["physical_meters"] if m["serial_number"] == "OIL-NEU")
    new_labels = sorted(r["label"] for r in new_meter["registers"])
    assert new_labels == sorted(["Betriebsstunden", "Tankstand", "Wärmemenge"])
    new_units = {r["label"]: r["unit"] for r in new_meter["registers"]}
    assert new_units["Wärmemenge"] == "kWh"
    # accepts_deliveries muss am Tank-Register erhalten bleiben
    tank = next(r for r in new_meter["registers"] if r["label"] == "Tankstand")
    assert tank["accepts_deliveries"] is True


def test_bulk_delete_deliveries_admin(admin_client: TestClient) -> None:
    """Admin löscht mehrere Lieferungen auf einmal; Best-Effort-Summary."""
    mp = _create_oil(admin_client)
    tank_id = _tank_register(mp)["id"]
    ids = []
    for d, amt in [
        ("2024-02-15T12:00:00", "1500"),
        ("2024-04-15T12:00:00", "1200"),
        ("2024-06-15T12:00:00", "900"),
    ]:
        created = admin_client.post(
            f"/api/v1/registers/{tank_id}/deliveries",
            json={"delivery_at": d, "amount": amt},
        )
        ids.append(created.json()["id"])

    resp = admin_client.post("/api/v1/deliveries/bulk-delete", json={"ids": [*ids, 999999]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted"] == 3
    assert body["skipped"] == [{"id": 999999, "reason": "not_found"}]
    assert admin_client.get(f"/api/v1/registers/{tank_id}/deliveries").json() == []


def test_bulk_delete_deliveries_recorder_forbidden(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    """Lieferungen sind admin-only — Recorder bekommt 403, nichts wird gelöscht."""
    mp = _create_oil(admin_client)
    _grant_recorder_access_to_first_mp(db, recorder=recorder_user, granted_by=admin_user)
    tank_id = _tank_register(mp)["id"]
    created = admin_client.post(
        f"/api/v1/registers/{tank_id}/deliveries",
        json={"delivery_at": "2024-04-01T12:00:00", "amount": "500"},
    ).json()

    resp = recorder_client.post("/api/v1/deliveries/bulk-delete", json={"ids": [created["id"]]})
    assert resp.status_code == 403
    assert len(admin_client.get(f"/api/v1/registers/{tank_id}/deliveries").json()) == 1
