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
                AuditLog.entity_type == AuditEntityType.OWNER,
            )
            .order_by(AuditLog.id.desc())
            .first()
        )


def test_create_and_list_owners(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/owners",
        json={
            "name": "Max Mustermann",
            "address_street": "Hauptstr. 1",
            "address_postcode": "12345",
            "address_city": "Beispielstadt",
            "email": "max@example.com",
            "phone": "+49 123 4567",
            "vat_id": "DE123456789",
            "tax_id": "1234567",
            "note": "VIP-Mieter",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Max Mustermann"
    assert body["vat_id"] == "DE123456789"
    listing = admin_client.get("/api/v1/owners").json()
    assert any(o["name"] == "Max Mustermann" for o in listing)


def test_create_owner_audited(admin_client: TestClient) -> None:
    admin_client.post("/api/v1/owners", json={"name": "Audit-Eigentuemer"})
    log = _last_log(AuditAction.CREATE)
    assert log is not None
    assert log.entity_type == AuditEntityType.OWNER


def test_update_owner_diff(admin_client: TestClient) -> None:
    created = admin_client.post("/api/v1/owners", json={"name": "Eigt-Edit"}).json()
    admin_client.patch(
        f"/api/v1/owners/{created['id']}",
        json={"email": "neu@example.com"},
    )
    log = _last_log(AuditAction.UPDATE)
    assert log is not None
    diff: dict[str, Any] = log.diff or {}
    assert diff["email"]["from"] is None
    assert diff["email"]["to"] == "neu@example.com"


def test_reject_duplicate_owner_name(admin_client: TestClient) -> None:
    admin_client.post("/api/v1/owners", json={"name": "Lager"})
    dup = admin_client.post("/api/v1/owners", json={"name": "Lager"})
    assert dup.status_code == 409


def test_owner_admin_only(admin_client: TestClient, recorder_client: TestClient) -> None:
    assert recorder_client.get("/api/v1/owners").status_code == 200
    assert recorder_client.post("/api/v1/owners", json={"name": "Verboten"}).status_code == 403
