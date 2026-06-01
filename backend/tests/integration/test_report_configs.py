"""Integrationstests für die geteilten Auswertungs-Konfigurationen (CRUD).

Lesen: jeder eingeloggte User. Schreiben (POST/PATCH/DELETE): nur Admin.
Plus Validierung (period_kind), Name-Eindeutigkeit, Filter-Roundtrip, Audit.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.models import AuditAction, AuditEntityType, AuditLog


def _create(client: TestClient, **overrides: Any) -> Any:
    payload: dict[str, Any] = {
        "name": "Strom je Kostenstelle",
        "dimension": "kostenstelle",
        "granularity": "month",
        "period_kind": "current_year",
        "filters": {"meter_types": ["electricity"]},
    }
    payload.update(overrides)
    return client.post("/api/v1/report-configs", json=payload)


def test_create_and_list(admin_client: TestClient, db: Session) -> None:
    resp = _create(admin_client)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Strom je Kostenstelle"
    assert body["dimension"] == "kostenstelle"
    assert body["filters"]["meter_types"] == ["electricity"]
    assert body["filters"]["owner_ids"] == []

    listed = admin_client.get("/api/v1/report-configs")
    assert listed.status_code == 200
    assert [c["name"] for c in listed.json()] == ["Strom je Kostenstelle"]

    # Audit-Eintrag CREATE / report_config.
    log = db.scalar(
        select(AuditLog).where(
            AuditLog.action == AuditAction.CREATE,
            AuditLog.entity_type == AuditEntityType.REPORT_CONFIG,
        )
    )
    assert log is not None
    assert log.entity_id == body["id"]


def test_get_404(admin_client: TestClient) -> None:
    assert admin_client.get("/api/v1/report-configs/999").status_code == 404


def test_fixed_period_roundtrip(admin_client: TestClient) -> None:
    resp = _create(
        admin_client,
        name="Wasser fest",
        dimension="owner",
        granularity="total",
        period_kind="fixed",
        from_date="2024-01-01",
        to_date="2024-12-31",
        filters={},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["period_kind"] == "fixed"
    assert body["from_date"] == "2024-01-01"
    assert body["to_date"] == "2024-12-31"


def test_fixed_without_dates_422(admin_client: TestClient) -> None:
    resp = _create(admin_client, name="X", period_kind="fixed")
    assert resp.status_code == 422


def test_relative_with_dates_422(admin_client: TestClient) -> None:
    resp = _create(admin_client, name="X", period_kind="current_year", from_date="2024-01-01")
    assert resp.status_code == 422


def test_duplicate_name_409(admin_client: TestClient) -> None:
    assert _create(admin_client).status_code == 201
    assert _create(admin_client).status_code == 409


def test_update_and_audit(admin_client: TestClient, db: Session) -> None:
    created = _create(admin_client).json()
    resp = admin_client.patch(
        f"/api/v1/report-configs/{created['id']}",
        json={"name": "Umbenannt", "granularity": "year"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Umbenannt"
    assert resp.json()["granularity"] == "year"
    log = db.scalar(
        select(AuditLog).where(
            AuditLog.action == AuditAction.UPDATE,
            AuditLog.entity_type == AuditEntityType.REPORT_CONFIG,
        )
    )
    assert log is not None and log.diff is not None and "name" in log.diff


def test_update_period_as_unit(admin_client: TestClient) -> None:
    created = _create(admin_client).json()  # current_year, keine festen Daten
    resp = admin_client.patch(
        f"/api/v1/report-configs/{created['id']}",
        json={"period_kind": "fixed", "from_date": "2023-01-01", "to_date": "2023-12-31"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["period_kind"] == "fixed"
    assert resp.json()["from_date"] == "2023-01-01"


def test_delete(admin_client: TestClient, db: Session) -> None:
    created = _create(admin_client).json()
    assert admin_client.delete(f"/api/v1/report-configs/{created['id']}").status_code == 204
    assert admin_client.get(f"/api/v1/report-configs/{created['id']}").status_code == 404
    log = db.scalar(
        select(AuditLog).where(
            AuditLog.action == AuditAction.DELETE,
            AuditLog.entity_type == AuditEntityType.REPORT_CONFIG,
        )
    )
    assert log is not None


def test_recorder_can_read_not_write(admin_client: TestClient, recorder_client: TestClient) -> None:
    created = _create(admin_client).json()
    # Lesen erlaubt.
    assert recorder_client.get("/api/v1/report-configs").status_code == 200
    assert recorder_client.get(f"/api/v1/report-configs/{created['id']}").status_code == 200
    # Schreiben verboten (403).
    assert _create(recorder_client, name="Recorder-Versuch").status_code == 403
    assert (
        recorder_client.patch(
            f"/api/v1/report-configs/{created['id']}", json={"name": "Hack"}
        ).status_code
        == 403
    )
    assert recorder_client.delete(f"/api/v1/report-configs/{created['id']}").status_code == 403
