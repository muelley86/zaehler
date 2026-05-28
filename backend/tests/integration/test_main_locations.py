from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from meters.db import SessionLocal
from meters.models import AuditAction, AuditEntityType, AuditLog


def _last_log(action: AuditAction) -> AuditLog | None:
    with SessionLocal() as db:
        return (
            db.query(AuditLog)
            .filter(
                AuditLog.action == action,
                AuditLog.entity_type == AuditEntityType.MAIN_LOCATION,
            )
            .order_by(AuditLog.id.desc())
            .first()
        )


def test_create_list_get_main_location(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/main-locations",
        json={"name": "Hauptgebaeude", "note": "Wohnhaus + Anbau"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Hauptgebaeude"
    assert body["note"] == "Wohnhaus + Anbau"
    listing = admin_client.get("/api/v1/main-locations").json()
    assert any(row["name"] == "Hauptgebaeude" for row in listing)
    detail = admin_client.get(f"/api/v1/main-locations/{body['id']}").json()
    assert detail["id"] == body["id"]


def test_create_main_location_audited(admin_client: TestClient) -> None:
    admin_client.post("/api/v1/main-locations", json={"name": "Werkstatt"})
    log = _last_log(AuditAction.CREATE)
    assert log is not None
    assert log.entity_type == AuditEntityType.MAIN_LOCATION


def test_update_main_location_audit_diff(admin_client: TestClient) -> None:
    created = admin_client.post(
        "/api/v1/main-locations", json={"name": "Anbau"}
    ).json()
    admin_client.patch(
        f"/api/v1/main-locations/{created['id']}",
        json={"name": "Anbau-Sued", "note": "neuer Trakt"},
    )
    log = _last_log(AuditAction.UPDATE)
    assert log is not None
    diff: dict[str, Any] = log.diff or {}
    assert diff["name"]["from"] == "Anbau"
    assert diff["name"]["to"] == "Anbau-Sued"


def test_delete_main_location_sets_location_to_null(admin_client: TestClient) -> None:
    main = admin_client.post(
        "/api/v1/main-locations", json={"name": "Nebenhaus"}
    ).json()
    loc = admin_client.post(
        "/api/v1/locations",
        json={"name": "Keller-Nebenhaus", "main_location_id": main["id"]},
    ).json()
    assert loc["main_location_id"] == main["id"]
    resp = admin_client.delete(f"/api/v1/main-locations/{main['id']}")
    assert resp.status_code == 204
    after = admin_client.get(f"/api/v1/locations/{loc['id']}").json()
    assert after["main_location_id"] is None
    assert after["main_location_name"] is None


def test_reject_duplicate_name(admin_client: TestClient) -> None:
    admin_client.post("/api/v1/main-locations", json={"name": "Lager"})
    dup = admin_client.post("/api/v1/main-locations", json={"name": "Lager"})
    assert dup.status_code == 409


def test_assign_and_clear_main_location_on_location(admin_client: TestClient) -> None:
    main = admin_client.post(
        "/api/v1/main-locations", json={"name": "Hof"}
    ).json()
    loc = admin_client.post(
        "/api/v1/locations", json={"name": "Garage", "main_location_id": main["id"]}
    ).json()
    assert loc["main_location_name"] == "Hof"
    cleared = admin_client.patch(
        f"/api/v1/locations/{loc['id']}", json={"clear_main_location": True}
    ).json()
    assert cleared["main_location_id"] is None


def test_assign_invalid_main_location_fails(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/locations",
        json={"name": "Garage-2", "main_location_id": 99999},
    )
    assert resp.status_code == 404


def test_main_location_admin_only(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    # Recorder darf lesen
    assert recorder_client.get("/api/v1/main-locations").status_code == 200
    # ... aber nicht schreiben
    assert (
        recorder_client.post(
            "/api/v1/main-locations", json={"name": "Verboten"}
        ).status_code
        == 403
    )


def test_measuring_point_exposes_main_location(admin_client: TestClient) -> None:
    main = admin_client.post(
        "/api/v1/main-locations", json={"name": "Hauptgebaeude-MP-Test"}
    ).json()
    loc = admin_client.post(
        "/api/v1/locations",
        json={"name": "Keller-MP-Test", "main_location_id": main["id"]},
    ).json()
    mp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Strom-Test",
            "type": "electricity",
            "location_id": loc["id"],
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "MP-MAIN-1",
            "installed_at": "2024-01-01",
            "initial_values": {"1.8.0": "0"},
        },
    )
    assert mp.status_code == 201, mp.text
    body = mp.json()
    assert body["main_location_id"] == main["id"]
    assert body["main_location_name"] == "Hauptgebaeude-MP-Test"
