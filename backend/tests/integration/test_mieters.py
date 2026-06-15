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
                AuditLog.entity_type == AuditEntityType.MIETER,
            )
            .order_by(AuditLog.id.desc())
            .first()
        )


def test_create_and_list_mieters(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/mieters",
        json={
            "first_name": "Erika",
            "last_name": "Mustermann",
            "address_street": "Mietweg 2",
            "address_postcode": "12345",
            "address_city": "Beispielstadt",
            "email": "erika@example.com",
            "phone": "+49 123 4567",
            "note": "Wohnung 4b",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["first_name"] == "Erika"
    assert body["last_name"] == "Mustermann"
    # Anzeige „Nachname, Vorname".
    assert body["display_name"] == "Mustermann, Erika"
    assert body["address_city"] == "Beispielstadt"
    # Mieter tragen keine Steuer-IDs.
    assert "vat_id" not in body
    assert "tax_id" not in body
    listing = admin_client.get("/api/v1/mieters").json()
    assert any(m["display_name"] == "Mustermann, Erika" for m in listing)


def test_display_name_without_first_name(admin_client: TestClient) -> None:
    body = admin_client.post("/api/v1/mieters", json={"last_name": "Solo"}).json()
    assert body["first_name"] is None
    assert body["display_name"] == "Solo"


def test_create_mieter_audited(admin_client: TestClient) -> None:
    admin_client.post("/api/v1/mieters", json={"last_name": "Audit-Mieter"})
    log = _last_log(AuditAction.CREATE)
    assert log is not None
    assert log.entity_type == AuditEntityType.MIETER


def test_update_mieter_diff(admin_client: TestClient) -> None:
    created = admin_client.post("/api/v1/mieters", json={"last_name": "Mieter-Edit"}).json()
    admin_client.patch(
        f"/api/v1/mieters/{created['id']}",
        json={"email": "neu@example.com"},
    )
    log = _last_log(AuditAction.UPDATE)
    assert log is not None
    diff: dict[str, Any] = log.diff or {}
    assert diff["email"]["from"] is None
    assert diff["email"]["to"] == "neu@example.com"


def test_duplicate_mieter_name_allowed(admin_client: TestClient) -> None:
    # Mieter sind Personen — Namensgleichheit ist erlaubt (kein UNIQUE).
    a = admin_client.post("/api/v1/mieters", json={"first_name": "Thomas", "last_name": "Mueller"})
    b = admin_client.post("/api/v1/mieters", json={"first_name": "Thomas", "last_name": "Mueller"})
    assert a.status_code == 201
    assert b.status_code == 201
    assert a.json()["id"] != b.json()["id"]


def test_delete_mieter(admin_client: TestClient) -> None:
    created = admin_client.post("/api/v1/mieters", json={"last_name": "Mieter-Del"}).json()
    resp = admin_client.delete(f"/api/v1/mieters/{created['id']}")
    assert resp.status_code == 204
    log = _last_log(AuditAction.DELETE)
    assert log is not None


def test_mieter_admin_only(admin_client: TestClient, recorder_client: TestClient) -> None:
    assert recorder_client.get("/api/v1/mieters").status_code == 200
    assert (
        recorder_client.post("/api/v1/mieters", json={"last_name": "Verboten"}).status_code == 403
    )


# ---------------------------------------------------------------------------
# Input-Validierung (PLZ, Email, Nachname)
# ---------------------------------------------------------------------------


def test_postcode_must_be_five_digits(admin_client: TestClient) -> None:
    valid = admin_client.post(
        "/api/v1/mieters", json={"last_name": "PLZ-OK", "address_postcode": "12345"}
    )
    assert valid.status_code == 201

    invalid = admin_client.post(
        "/api/v1/mieters", json={"last_name": "PLZ-BAD", "address_postcode": "abc"}
    )
    assert invalid.status_code == 422

    too_long = admin_client.post(
        "/api/v1/mieters", json={"last_name": "PLZ-LONG", "address_postcode": "123456"}
    )
    assert too_long.status_code == 422


def test_email_invalid(admin_client: TestClient) -> None:
    bad = admin_client.post("/api/v1/mieters", json={"last_name": "Email-BAD", "email": "kein-at"})
    assert bad.status_code == 422

    ok = admin_client.post(
        "/api/v1/mieters", json={"last_name": "Email-OK", "email": "erika@example.com"}
    )
    assert ok.status_code == 201


def test_blank_last_name_rejected(admin_client: TestClient) -> None:
    resp = admin_client.post("/api/v1/mieters", json={"last_name": "   "})
    assert resp.status_code == 422
    # last_name fehlt komplett → ebenfalls 422.
    assert (
        admin_client.post("/api/v1/mieters", json={"first_name": "Nur-Vorname"}).status_code == 422
    )


def test_get_unknown_mieter_404(admin_client: TestClient) -> None:
    assert admin_client.get("/api/v1/mieters/999999").status_code == 404
