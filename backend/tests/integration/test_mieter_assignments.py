from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from meters.db import SessionLocal
from meters.models import AuditAction, AuditLog, MieterAssignment


def _create_mp(
    client: TestClient,
    name: str,
    serial: str,
    *,
    mieter_id: int | None = None,
    mieter_valid_from: str | None = None,
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
    if mieter_id is not None:
        body["mieter_id"] = mieter_id
    if mieter_valid_from is not None:
        body["mieter_valid_from"] = mieter_valid_from
    resp = client.post("/api/v1/measuring-points", json=body)
    assert resp.status_code == 201, resp.text
    out: dict[str, Any] = resp.json()
    return out


def _create_mieter(client: TestClient, name: str) -> int:
    # Nachname als Anzeigename — ohne Vorname ist display_name == last_name,
    # daher bleiben die current_mieter_name-Assertions ("<name>") gueltig.
    resp = client.post("/api/v1/mieters", json={"last_name": name})
    return int(resp.json()["id"])


def _history(client: TestClient, mp_id: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = client.get(f"/api/v1/measuring-points/{mp_id}/mieters").json()
    return out


def test_create_mp_with_mieter_creates_open_assignment(admin_client: TestClient) -> None:
    mieter_id = _create_mieter(admin_client, "Mieter-A")
    mp = _create_mp(admin_client, "Strom-Mieter-A", "SN-MA1", mieter_id=mieter_id)
    assert mp["current_mieter_id"] == mieter_id
    assert mp["current_mieter_name"] == "Mieter-A"
    history = _history(admin_client, mp["id"])
    assert len(history) == 1
    assert history[0]["mieter_id"] == mieter_id
    assert history[0]["valid_to"] is None


def test_create_mp_without_mieter_no_assignment(admin_client: TestClient) -> None:
    mp = _create_mp(admin_client, "Strom-NoMieter", "SN-NM-1")
    assert mp["current_mieter_id"] is None
    assert _history(admin_client, mp["id"]) == []


def test_change_mieter_closes_old_and_opens_new(admin_client: TestClient) -> None:
    a = _create_mieter(admin_client, "Mieter-A2")
    b = _create_mieter(admin_client, "Mieter-B2")
    mp = _create_mp(
        admin_client, "Strom-Wechsel", "SN-WE-1", mieter_id=a, installed_at="2024-01-01"
    )
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-mieter",
        json={"mieter_id": b, "valid_from": "2025-06-15"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["current_mieter_id"] == b
    history = _history(admin_client, mp["id"])
    assert len(history) == 2
    assert history[0]["mieter_id"] == b
    assert history[0]["valid_to"] is None
    assert history[1]["mieter_id"] == a
    assert history[1]["valid_from"] == "2024-01-01"
    assert history[1]["valid_to"] == "2025-06-15"


def test_change_mieter_valid_from_before_current_rejected(admin_client: TestClient) -> None:
    a = _create_mieter(admin_client, "Mieter-AB")
    b = _create_mieter(admin_client, "Mieter-BB")
    mp = _create_mp(admin_client, "Strom-Rueck", "SN-RR-1", mieter_id=a, installed_at="2024-06-01")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-mieter",
        json={"mieter_id": b, "valid_from": "2024-01-01"},
    )
    assert resp.status_code == 422


def test_mieter_delete_sets_assignment_mieter_id_to_null(admin_client: TestClient) -> None:
    a = _create_mieter(admin_client, "Mieter-Tobe-Deleted")
    mp = _create_mp(admin_client, "Strom-Mieter-Del", "SN-MD-1", mieter_id=a)
    resp = admin_client.delete(f"/api/v1/mieters/{a}")
    assert resp.status_code == 204
    history = _history(admin_client, mp["id"])
    assert len(history) == 1
    assert history[0]["mieter_id"] is None
    assert history[0]["mieter_name"] is None
    mp_after = admin_client.get(f"/api/v1/measuring-points/{mp['id']}").json()
    assert mp_after["current_mieter_id"] is None
    assert mp_after["current_mieter_name"] is None


def test_audit_log_for_mieter_change(admin_client: TestClient) -> None:
    a = _create_mieter(admin_client, "Mieter-Audit-A")
    b = _create_mieter(admin_client, "Mieter-Audit-B")
    mp = _create_mp(admin_client, "Strom-Audit", "SN-AU-1", mieter_id=a)
    admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-mieter",
        json={"mieter_id": b, "valid_from": "2025-01-01"},
    )
    with SessionLocal() as db:
        log = (
            db.query(AuditLog)
            .filter(AuditLog.action == AuditAction.MIETER_CHANGED)
            .order_by(AuditLog.id.desc())
            .first()
        )
        assert log is not None
        assert log.diff is not None
        assert log.diff["from"] == a
        assert log.diff["to"] == b
        assert log.diff["valid_from"] == "2025-01-01"


def test_list_measuring_points_no_n_plus_one_for_mieters(admin_client: TestClient) -> None:
    """Regressionstest: das MP-Listing darf nicht eine Query pro MP fuer das
    aktuelle Mieter-Assignment absetzen."""
    from sqlalchemy import event

    from meters.db import engine

    a = _create_mieter(admin_client, "Bulk-A")
    b = _create_mieter(admin_client, "Bulk-B")
    _create_mp(admin_client, "Strom-Bulk-1", "SN-B-1", mieter_id=a)
    _create_mp(admin_client, "Strom-Bulk-2", "SN-B-2", mieter_id=b)
    _create_mp(admin_client, "Strom-Bulk-3", "SN-B-3", mieter_id=a)
    _create_mp(admin_client, "Strom-Bulk-4", "SN-B-4")  # ohne Mieter

    queries: list[str] = []

    def collect(_conn: object, _cursor: object, statement: str, *_a: object, **_kw: object) -> None:
        queries.append(statement)

    event.listen(engine, "before_cursor_execute", collect)
    try:
        resp = admin_client.get("/api/v1/measuring-points")
    finally:
        event.remove(engine, "before_cursor_execute", collect)
    assert resp.status_code == 200
    assert len(resp.json()) >= 4
    mieter_queries = [q for q in queries if "mieter_assignment" in q.lower()]
    assert len(mieter_queries) <= 1, (
        f"Erwartet <=1 mieter_assignment-Query, gefunden {len(mieter_queries)}: "
        + "\n".join(mieter_queries)
    )


# ---------------------------------------------------------------------------
# Historien-Editor: POST/PATCH/DELETE /measuring-points/{id}/mieters[/{aid}]
# ---------------------------------------------------------------------------


def test_create_historical_period_with_gap(admin_client: TestClient) -> None:
    a = _create_mieter(admin_client, "Hist-A")
    b = _create_mieter(admin_client, "Hist-B")
    mp = _create_mp(admin_client, "Strom-Hist", "SN-H-1", mieter_id=a, installed_at="2024-01-01")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/mieters",
        json={"mieter_id": b, "valid_from": "2022-01-01", "valid_to": "2023-06-01"},
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert created["mieter_id"] == b
    assert created["mieter_name"] == "Hist-B"
    assert created["valid_from"] == "2022-01-01"
    assert created["valid_to"] == "2023-06-01"
    history = _history(admin_client, mp["id"])
    assert len(history) == 2
    assert history[0]["mieter_id"] == a  # offene Periode zuerst (desc)
    assert history[1]["mieter_id"] == b


def test_create_second_open_period_rejected(admin_client: TestClient) -> None:
    a = _create_mieter(admin_client, "Open-A")
    b = _create_mieter(admin_client, "Open-B")
    mp = _create_mp(admin_client, "Strom-Open", "SN-O-1", mieter_id=a, installed_at="2024-01-01")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/mieters",
        json={"mieter_id": b, "valid_from": "2026-01-01", "valid_to": None},
    )
    assert resp.status_code == 422


def test_create_overlapping_period_rejected(admin_client: TestClient) -> None:
    a = _create_mieter(admin_client, "Ovl-A")
    b = _create_mieter(admin_client, "Ovl-B")
    mp = _create_mp(admin_client, "Strom-Ovl", "SN-OV-1", mieter_id=a, installed_at="2024-01-01")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/mieters",
        json={"mieter_id": b, "valid_from": "2024-06-01", "valid_to": "2024-07-01"},
    )
    assert resp.status_code == 422
    # Angrenzend (halboffen) ist erlaubt: [2023-01-01, 2024-01-01).
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/mieters",
        json={"mieter_id": b, "valid_from": "2023-01-01", "valid_to": "2024-01-01"},
    )
    assert resp.status_code == 201, resp.text


def test_create_valid_to_not_after_valid_from_rejected(admin_client: TestClient) -> None:
    a = _create_mieter(admin_client, "Rng-A")
    mp = _create_mp(admin_client, "Strom-Rng", "SN-RG-1")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/mieters",
        json={"mieter_id": a, "valid_from": "2024-01-01", "valid_to": "2024-01-01"},
    )
    assert resp.status_code == 422


def test_create_unknown_mieter_or_mp_404(admin_client: TestClient) -> None:
    a = _create_mieter(admin_client, "Unk-A")
    mp = _create_mp(admin_client, "Strom-Unk", "SN-UK-1")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/mieters",
        json={"mieter_id": 999999, "valid_from": "2024-01-01", "valid_to": None},
    )
    assert resp.status_code == 404
    resp = admin_client.post(
        "/api/v1/measuring-points/999999/mieters",
        json={"mieter_id": a, "valid_from": "2024-01-01", "valid_to": None},
    )
    assert resp.status_code == 404


def test_update_period_dates_and_mieter(admin_client: TestClient) -> None:
    a = _create_mieter(admin_client, "Upd-A")
    b = _create_mieter(admin_client, "Upd-B")
    mp = _create_mp(admin_client, "Strom-Upd", "SN-UP-1", mieter_id=a, installed_at="2024-03-01")
    aid = _history(admin_client, mp["id"])[0]["id"]
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}/mieters/{aid}",
        json={"mieter_id": b, "valid_from": "2024-01-01", "valid_to": None},
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()
    assert updated["mieter_id"] == b
    assert updated["valid_from"] == "2024-01-01"
    assert updated["valid_to"] is None
    mp_after = admin_client.get(f"/api/v1/measuring-points/{mp['id']}").json()
    assert mp_after["current_mieter_name"] == "Upd-B"


def test_update_assignment_of_other_mp_404(admin_client: TestClient) -> None:
    a = _create_mieter(admin_client, "X-A")
    mp1 = _create_mp(admin_client, "Strom-X1", "SN-X-1", mieter_id=a)
    mp2 = _create_mp(admin_client, "Strom-X2", "SN-X-2")
    aid = _history(admin_client, mp1["id"])[0]["id"]
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp2['id']}/mieters/{aid}",
        json={"mieter_id": a, "valid_from": "2024-01-01", "valid_to": None},
    )
    assert resp.status_code == 404
    resp = admin_client.delete(f"/api/v1/measuring-points/{mp2['id']}/mieters/{aid}")
    assert resp.status_code == 404


def test_delete_open_period_clears_current_mieter(admin_client: TestClient) -> None:
    a = _create_mieter(admin_client, "DelOpen-A")
    mp = _create_mp(admin_client, "Strom-DelOpen", "SN-DO-1", mieter_id=a)
    aid = _history(admin_client, mp["id"])[0]["id"]
    resp = admin_client.delete(f"/api/v1/measuring-points/{mp['id']}/mieters/{aid}")
    assert resp.status_code == 204
    mp_after = admin_client.get(f"/api/v1/measuring-points/{mp['id']}").json()
    assert mp_after["current_mieter_id"] is None
    assert mp_after["current_mieter_name"] is None


def test_audit_entries_for_history_editor(admin_client: TestClient) -> None:
    a = _create_mieter(admin_client, "AudEd-A")
    b = _create_mieter(admin_client, "AudEd-B")
    mp = _create_mp(admin_client, "Strom-AudEd", "SN-AE-1", mieter_id=a, installed_at="2024-01-01")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/mieters",
        json={"mieter_id": b, "valid_from": "2022-01-01", "valid_to": "2023-01-01"},
    )
    aid = resp.json()["id"]
    admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}/mieters/{aid}",
        json={"mieter_id": b, "valid_from": "2022-02-01", "valid_to": "2023-01-01"},
    )
    admin_client.delete(f"/api/v1/measuring-points/{mp['id']}/mieters/{aid}")
    with SessionLocal() as db:

        def latest(action: AuditAction) -> AuditLog:
            log = (
                db.query(AuditLog)
                .filter(AuditLog.action == action)
                .order_by(AuditLog.id.desc())
                .first()
            )
            assert log is not None, f"Kein AuditLog fuer {action}"
            return log

        created = latest(AuditAction.MIETER_ASSIGNMENT_CREATED)
        assert created.entity_id == mp["id"]
        assert created.diff is not None
        assert created.diff["mieter_id"] == b
        assert created.diff["valid_from"] == "2022-01-01"

        updated = latest(AuditAction.MIETER_ASSIGNMENT_UPDATED)
        assert updated.diff is not None
        assert updated.diff["before"]["valid_from"] == "2022-01-01"
        assert updated.diff["after"]["valid_from"] == "2022-02-01"

        deleted = latest(AuditAction.MIETER_ASSIGNMENT_DELETED)
        assert deleted.diff is not None
        assert deleted.diff["before"]["mieter_id"] == b


def test_history_editor_admin_only(admin_client: TestClient, recorder_client: TestClient) -> None:
    a = _create_mieter(admin_client, "Perm-A")
    mp = _create_mp(admin_client, "Strom-Perm", "SN-PM-1", mieter_id=a)
    aid = _history(admin_client, mp["id"])[0]["id"]
    body = {"mieter_id": a, "valid_from": "2024-01-01", "valid_to": None}
    assert (
        recorder_client.post(f"/api/v1/measuring-points/{mp['id']}/mieters", json=body).status_code
        == 403
    )
    assert (
        recorder_client.patch(
            f"/api/v1/measuring-points/{mp['id']}/mieters/{aid}", json=body
        ).status_code
        == 403
    )
    assert (
        recorder_client.delete(f"/api/v1/measuring-points/{mp['id']}/mieters/{aid}").status_code
        == 403
    )


def test_mp_delete_cascades_assignments(admin_client: TestClient) -> None:
    from meters.models import MeasuringPoint

    a = _create_mieter(admin_client, "Mieter-Cascade")
    mp = _create_mp(admin_client, "Strom-Cascade", "SN-CA-1", mieter_id=a)
    with SessionLocal() as db:
        mp_obj = db.get(MeasuringPoint, mp["id"])
        assert mp_obj is not None
        db.delete(mp_obj)
        db.commit()
        remaining = db.query(MieterAssignment).filter_by(measuring_point_id=mp["id"]).all()
        assert remaining == []
