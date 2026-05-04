"""Audit-Log-Vollständigkeit (Audit-Befund 5.5).

CLAUDE.md verlangt Audit-Einträge bei: Reading-Create/Update/Delete,
MeasuringPoint-Create/Delete, MeterReplaced, User-Anlage/Deaktivierung,
TOTP-Events. Diese Tests prüfen pro Operation, dass nach dem API-Call ein
entsprechender ``AuditLog``-Eintrag mit korrekter Action, Entity-Type und
``user_id`` existiert.
"""

from __future__ import annotations

from typing import Any, cast

from fastapi.testclient import TestClient

from meters.db import SessionLocal
from meters.models import AuditAction, AuditEntityType, AuditLog


def _last_log(action: AuditAction, entity_type: AuditEntityType) -> AuditLog | None:
    with SessionLocal() as db:
        return (
            db.query(AuditLog)
            .filter(AuditLog.action == action, AuditLog.entity_type == entity_type)
            .order_by(AuditLog.id.desc())
            .first()
        )


def _setup_water_mp(client: TestClient) -> dict[str, Any]:
    resp = client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wasser",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "W-1",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "100"},
        },
    )
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def test_reading_create_audited(admin_client: TestClient) -> None:
    mp = _setup_water_mp(admin_client)
    register_id: int = mp["physical_meters"][0]["registers"][0]["id"]
    resp = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "150", "reading_at": "2025-01-01T12:00:00"},
    )
    assert resp.status_code == 201
    log = _last_log(AuditAction.CREATE, AuditEntityType.READING)
    assert log is not None
    assert log.entity_id == resp.json()["id"]
    assert log.user_id is not None
    assert log.diff is not None
    assert log.diff["value"] == "150"


def test_reading_update_and_delete_audited(admin_client: TestClient) -> None:
    mp = _setup_water_mp(admin_client)
    register_id: int = mp["physical_meters"][0]["registers"][0]["id"]
    create = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "150", "reading_at": "2025-02-01T12:00:00"},
    )
    rid = create.json()["id"]

    admin_client.patch(f"/api/v1/readings/{rid}", json={"note": "manuell"})
    update_log = _last_log(AuditAction.UPDATE, AuditEntityType.READING)
    assert update_log is not None
    assert update_log.entity_id == rid
    assert update_log.diff is not None
    assert "note" in update_log.diff

    admin_client.delete(f"/api/v1/readings/{rid}")
    delete_log = _last_log(AuditAction.DELETE, AuditEntityType.READING)
    assert delete_log is not None
    assert delete_log.entity_id == rid


def test_measuring_point_create_audited(admin_client: TestClient) -> None:
    mp = _setup_water_mp(admin_client)
    create_log = _last_log(AuditAction.CREATE, AuditEntityType.MEASURING_POINT)
    assert create_log is not None
    assert create_log.entity_id == mp["id"]


def test_location_create_update_delete_audited(admin_client: TestClient) -> None:
    loc = admin_client.post(
        "/api/v1/locations",
        json={"name": "Keller"},
    ).json()
    create_log = _last_log(AuditAction.CREATE, AuditEntityType.LOCATION)
    assert create_log is not None
    assert create_log.entity_id == loc["id"]

    admin_client.patch(f"/api/v1/locations/{loc['id']}", json={"note": "Heizungsraum"})
    update_log = _last_log(AuditAction.UPDATE, AuditEntityType.LOCATION)
    assert update_log is not None

    admin_client.delete(f"/api/v1/locations/{loc['id']}")
    delete_log = _last_log(AuditAction.DELETE, AuditEntityType.LOCATION)
    assert delete_log is not None
    assert delete_log.entity_id == loc["id"]


def test_meter_replacement_audited(admin_client: TestClient) -> None:
    mp = _setup_water_mp(admin_client)
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/replace-meter",
        json={
            "final_readings": {"water": "200"},
            "removed_at": "2025-06-01",
            "new_serial_number": "W-2",
            "installed_at": "2025-06-01",
            "initial_readings": {"water": "0"},
        },
    )
    assert resp.status_code == 200, resp.text
    log = _last_log(AuditAction.METER_REPLACED, AuditEntityType.MEASURING_POINT)
    assert log is not None
    assert log.entity_id == mp["id"]


def test_login_and_login_failed_audited(client: TestClient, admin_user: object) -> None:
    del admin_user
    ok = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin-pass-12345"},
    )
    assert ok.status_code == 200
    login_log = _last_log(AuditAction.LOGIN, AuditEntityType.SESSION)
    assert login_log is not None
    assert login_log.user_id is not None

    fail = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "wrong-pw-1234"},
    )
    assert fail.status_code == 401
    fail_log = _last_log(AuditAction.LOGIN_FAILED, AuditEntityType.USER)
    assert fail_log is not None
    assert fail_log.diff is not None
    assert fail_log.diff.get("username") == "admin"


def test_totp_enable_audited(admin_client: TestClient) -> None:
    import pyotp

    setup = admin_client.post("/api/v1/auth/2fa/setup")
    secret = setup.json()["secret"]
    activated = admin_client.post(
        "/api/v1/auth/2fa/activate",
        json={"code": pyotp.TOTP(secret).now()},
    )
    assert activated.status_code == 200
    log = _last_log(AuditAction.TOTP_ENABLED, AuditEntityType.USER)
    assert log is not None
    assert log.user_id is not None
