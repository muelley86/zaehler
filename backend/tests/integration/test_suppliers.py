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
                AuditLog.entity_type == AuditEntityType.SUPPLIER,
            )
            .order_by(AuditLog.id.desc())
            .first()
        )


def test_create_and_list_suppliers(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/suppliers",
        json={
            "name": "Stadtwerke Beispielstadt",
            "address_street": "Werkstr. 1",
            "address_postcode": "12345",
            "address_city": "Beispielstadt",
            "email": "service@example.com",
            "phone": "+49 123 4567",
            "vat_id": "DE123456789",
            "tax_id": "1234567",
            "note": "Grundversorger",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Stadtwerke Beispielstadt"
    assert body["vat_id"] == "DE123456789"
    listing = admin_client.get("/api/v1/suppliers").json()
    assert any(s["name"] == "Stadtwerke Beispielstadt" for s in listing)


def test_create_supplier_audited(admin_client: TestClient) -> None:
    admin_client.post("/api/v1/suppliers", json={"name": "Audit-Lieferant"})
    log = _last_log(AuditAction.CREATE)
    assert log is not None
    assert log.entity_type == AuditEntityType.SUPPLIER


def test_update_supplier_diff(admin_client: TestClient) -> None:
    created = admin_client.post("/api/v1/suppliers", json={"name": "Lief-Edit"}).json()
    admin_client.patch(
        f"/api/v1/suppliers/{created['id']}",
        json={"email": "neu@example.com"},
    )
    log = _last_log(AuditAction.UPDATE)
    assert log is not None
    diff: dict[str, Any] = log.diff or {}
    assert diff["email"]["from"] is None
    assert diff["email"]["to"] == "neu@example.com"


def test_reject_duplicate_supplier_name(admin_client: TestClient) -> None:
    admin_client.post("/api/v1/suppliers", json={"name": "Regionalwerk"})
    dup = admin_client.post("/api/v1/suppliers", json={"name": "Regionalwerk"})
    assert dup.status_code == 409


def test_supplier_admin_only(admin_client: TestClient, recorder_client: TestClient) -> None:
    assert recorder_client.get("/api/v1/suppliers").status_code == 200
    assert recorder_client.post("/api/v1/suppliers", json={"name": "Verboten"}).status_code == 403


# ---------------------------------------------------------------------------
# Input-Validierung (PLZ, VAT-ID, Email)
# ---------------------------------------------------------------------------


def test_postcode_must_be_five_digits(admin_client: TestClient) -> None:
    valid = admin_client.post(
        "/api/v1/suppliers", json={"name": "Lief-PLZ-OK", "address_postcode": "12345"}
    )
    assert valid.status_code == 201

    invalid = admin_client.post(
        "/api/v1/suppliers", json={"name": "Lief-PLZ-BAD", "address_postcode": "abc"}
    )
    assert invalid.status_code == 422

    too_long = admin_client.post(
        "/api/v1/suppliers", json={"name": "Lief-PLZ-LONG", "address_postcode": "123456"}
    )
    assert too_long.status_code == 422


def test_vat_id_normalised_uppercase(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/suppliers", json={"name": "Lief-VAT", "vat_id": "de123456789"}
    )
    assert resp.status_code == 201
    assert resp.json()["vat_id"] == "DE123456789"


def test_vat_id_invalid_pattern(admin_client: TestClient) -> None:
    resp = admin_client.post("/api/v1/suppliers", json={"name": "Lief-VAT-BAD", "vat_id": "abc"})
    assert resp.status_code == 422


def test_email_invalid(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/suppliers", json={"name": "Lief-Email-BAD", "email": "kein-at"}
    )
    assert resp.status_code == 422

    ok = admin_client.post(
        "/api/v1/suppliers", json={"name": "Lief-Email-OK", "email": "max@example.com"}
    )
    assert ok.status_code == 201
