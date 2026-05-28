from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from meters.db import SessionLocal
from meters.models import AuditAction, AuditLog, OwnerAssignment


def _create_mp(
    client: TestClient,
    name: str,
    serial: str,
    *,
    owner_id: int | None = None,
    owner_valid_from: str | None = None,
    installed_at: str = "2024-01-01",
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": name,
        "type": "electricity",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": serial,
        "installed_at": installed_at,
        "initial_values": {"1.8.0": "0"},
    }
    if owner_id is not None:
        body["owner_id"] = owner_id
    if owner_valid_from is not None:
        body["owner_valid_from"] = owner_valid_from
    resp = client.post("/api/v1/measuring-points", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_owner(client: TestClient, name: str) -> int:
    resp = client.post("/api/v1/owners", json={"name": name})
    return int(resp.json()["id"])


def test_create_mp_with_owner_creates_open_assignment(admin_client: TestClient) -> None:
    owner_id = _create_owner(admin_client, "Eigt-A")
    mp = _create_mp(admin_client, "Strom-Owner-A", "SN-A1", owner_id=owner_id)
    assert mp["current_owner_id"] == owner_id
    assert mp["current_owner_name"] == "Eigt-A"
    history = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/owners").json()
    assert len(history) == 1
    assert history[0]["owner_id"] == owner_id
    assert history[0]["valid_to"] is None


def test_create_mp_without_owner_no_assignment(admin_client: TestClient) -> None:
    mp = _create_mp(admin_client, "Strom-NoOwner", "SN-NO-1")
    assert mp["current_owner_id"] is None
    history = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/owners").json()
    assert history == []


def test_change_owner_closes_old_and_opens_new(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "Eigt-A2")
    b = _create_owner(admin_client, "Eigt-B2")
    mp = _create_mp(
        admin_client,
        "Strom-Wechsel",
        "SN-WE-1",
        owner_id=a,
        installed_at="2024-01-01",
    )
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-owner",
        json={"owner_id": b, "valid_from": "2025-06-15"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["current_owner_id"] == b
    history = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/owners").json()
    assert len(history) == 2
    # Sortierung absteigend nach valid_from → neuer Owner zuerst.
    assert history[0]["owner_id"] == b
    assert history[0]["valid_to"] is None
    assert history[1]["owner_id"] == a
    assert history[1]["valid_from"] == "2024-01-01"
    assert history[1]["valid_to"] == "2025-06-15"


def test_change_owner_first_time_no_previous(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "Eigt-First")
    mp = _create_mp(admin_client, "Strom-First", "SN-F-1")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-owner",
        json={"owner_id": a, "valid_from": "2025-01-01"},
    )
    assert resp.status_code == 200
    history = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/owners").json()
    assert len(history) == 1


def test_change_owner_valid_from_before_current_rejected(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "Eigt-AB")
    b = _create_owner(admin_client, "Eigt-BB")
    mp = _create_mp(
        admin_client,
        "Strom-Rueck",
        "SN-RR-1",
        owner_id=a,
        installed_at="2024-06-01",
    )
    # Try to start B vor dem 2024-06-01.
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-owner",
        json={"owner_id": b, "valid_from": "2024-01-01"},
    )
    assert resp.status_code == 422


def test_owner_delete_sets_assignment_owner_id_to_null(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "Eigt-Tobe-Deleted")
    mp = _create_mp(admin_client, "Strom-Owner-Del", "SN-OD-1", owner_id=a)
    resp = admin_client.delete(f"/api/v1/owners/{a}")
    assert resp.status_code == 204
    history = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/owners").json()
    assert len(history) == 1
    assert history[0]["owner_id"] is None
    assert history[0]["owner_name"] is None
    # MP zeigt jetzt „kein Eigentuemer" — open assignment ist da, aber owner_id NULL
    mp_after = admin_client.get(f"/api/v1/measuring-points/{mp['id']}").json()
    assert mp_after["current_owner_id"] is None
    assert mp_after["current_owner_name"] is None


def test_audit_log_for_owner_change(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "Eigt-Audit-A")
    b = _create_owner(admin_client, "Eigt-Audit-B")
    mp = _create_mp(admin_client, "Strom-Audit", "SN-AU-1", owner_id=a)
    admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-owner",
        json={"owner_id": b, "valid_from": "2025-01-01"},
    )
    with SessionLocal() as db:
        log = (
            db.query(AuditLog)
            .filter(AuditLog.action == AuditAction.OWNER_CHANGED)
            .order_by(AuditLog.id.desc())
            .first()
        )
        assert log is not None
        assert log.diff is not None
        assert log.diff["from"] == a
        assert log.diff["to"] == b
        assert log.diff["valid_from"] == "2025-01-01"


def test_mp_delete_cascades_assignments(admin_client: TestClient) -> None:
    # MP-Delete via Endpoint ist durch das Readings-Existenz-Lock geschuetzt
    # (install_first_meter legt initial readings an). Wir testen die DB-Cascade
    # daher direkt: MP-Datensatz mit ORM loeschen, Assignments mussen weg.
    from meters.models import MeasuringPoint

    a = _create_owner(admin_client, "Eigt-Cascade")
    mp = _create_mp(admin_client, "Strom-Cascade", "SN-CA-1", owner_id=a)
    with SessionLocal() as db:
        mp_obj = db.get(MeasuringPoint, mp["id"])
        assert mp_obj is not None
        db.delete(mp_obj)
        db.commit()
        remaining = db.query(OwnerAssignment).filter_by(measuring_point_id=mp["id"]).all()
        assert remaining == []
