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
    out: dict[str, Any] = resp.json()
    return out


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


def test_list_measuring_points_no_n_plus_one_for_owners(admin_client: TestClient) -> None:
    """Regressionstest: das MP-Listing darf nicht eine Query pro MP fuer das
    aktuelle Owner-Assignment absetzen. ``current_assignments_bulk`` loest
    das fuer alle Messstellen in einer einzigen Query."""
    from sqlalchemy import event

    from meters.db import engine

    a = _create_owner(admin_client, "Bulk-A")
    b = _create_owner(admin_client, "Bulk-B")
    _create_mp(admin_client, "Strom-Bulk-1", "SN-B-1", owner_id=a)
    _create_mp(admin_client, "Strom-Bulk-2", "SN-B-2", owner_id=b)
    _create_mp(admin_client, "Strom-Bulk-3", "SN-B-3", owner_id=a)
    _create_mp(admin_client, "Strom-Bulk-4", "SN-B-4")  # ohne Owner

    queries: list[str] = []

    def collect(_conn: object, _cursor: object, statement: str, *_a: object, **_kw: object) -> None:
        queries.append(statement)

    event.listen(engine, "before_cursor_execute", collect)
    try:
        resp = admin_client.get("/api/v1/measuring-points")
    finally:
        event.remove(engine, "before_cursor_execute", collect)
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 4
    owner_queries = [q for q in queries if "owner_assignment" in q.lower()]
    # Bulk-Loader => max. 1 SELECT auf owner_assignment fuer die ganze Liste.
    assert len(owner_queries) <= 1, (
        f"Erwartet <=1 owner_assignment-Query, gefunden {len(owner_queries)}: "
        + "\n".join(owner_queries)
    )


# ---------------------------------------------------------------------------
# Historien-Editor: POST/PATCH/DELETE /measuring-points/{id}/owners[/{aid}]
# ---------------------------------------------------------------------------


def _history(client: TestClient, mp_id: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = client.get(f"/api/v1/measuring-points/{mp_id}/owners").json()
    return out


def test_create_historical_period_with_gap(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "Hist-A")
    b = _create_owner(admin_client, "Hist-B")
    mp = _create_mp(admin_client, "Strom-Hist", "SN-H-1", owner_id=a, installed_at="2024-01-01")
    # Historische Periode VOR der offenen, mit Luecke (2023-06-01 bis 2024-01-01).
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/owners",
        json={"owner_id": b, "valid_from": "2022-01-01", "valid_to": "2023-06-01"},
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert created["owner_id"] == b
    assert created["owner_name"] == "Hist-B"
    assert created["valid_from"] == "2022-01-01"
    assert created["valid_to"] == "2023-06-01"
    history = _history(admin_client, mp["id"])
    assert len(history) == 2
    assert history[0]["owner_id"] == a  # offene Periode zuerst (desc)
    assert history[1]["owner_id"] == b


def test_create_second_open_period_rejected(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "Open-A")
    b = _create_owner(admin_client, "Open-B")
    mp = _create_mp(admin_client, "Strom-Open", "SN-O-1", owner_id=a, installed_at="2024-01-01")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/owners",
        json={"owner_id": b, "valid_from": "2026-01-01", "valid_to": None},
    )
    assert resp.status_code == 422


def test_create_overlapping_period_rejected(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "Ovl-A")
    b = _create_owner(admin_client, "Ovl-B")
    mp = _create_mp(admin_client, "Strom-Ovl", "SN-OV-1", owner_id=a, installed_at="2024-01-01")
    # Ueberlappt die offene Periode [2024-01-01, inf).
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/owners",
        json={"owner_id": b, "valid_from": "2024-06-01", "valid_to": "2024-07-01"},
    )
    assert resp.status_code == 422
    # Angrenzend (halboffen) ist erlaubt: [2023-01-01, 2024-01-01).
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/owners",
        json={"owner_id": b, "valid_from": "2023-01-01", "valid_to": "2024-01-01"},
    )
    assert resp.status_code == 201, resp.text
    # Ueberlappt die neue geschlossene Periode.
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/owners",
        json={"owner_id": a, "valid_from": "2023-06-01", "valid_to": "2023-12-01"},
    )
    assert resp.status_code == 422


def test_create_valid_to_not_after_valid_from_rejected(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "Rng-A")
    mp = _create_mp(admin_client, "Strom-Rng", "SN-RG-1")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/owners",
        json={"owner_id": a, "valid_from": "2024-01-01", "valid_to": "2024-01-01"},
    )
    assert resp.status_code == 422


def test_create_unknown_owner_or_mp_404(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "Unk-A")
    mp = _create_mp(admin_client, "Strom-Unk", "SN-UK-1")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/owners",
        json={"owner_id": 999999, "valid_from": "2024-01-01", "valid_to": None},
    )
    assert resp.status_code == 404
    resp = admin_client.post(
        "/api/v1/measuring-points/999999/owners",
        json={"owner_id": a, "valid_from": "2024-01-01", "valid_to": None},
    )
    assert resp.status_code == 404


def test_update_period_dates_and_owner(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "Upd-A")
    b = _create_owner(admin_client, "Upd-B")
    mp = _create_mp(admin_client, "Strom-Upd", "SN-UP-1", owner_id=a, installed_at="2024-03-01")
    aid = _history(admin_client, mp["id"])[0]["id"]
    # Rueckdatieren + Eigentuemer tauschen — vorher append-only unmoeglich.
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}/owners/{aid}",
        json={"owner_id": b, "valid_from": "2024-01-01", "valid_to": None},
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()
    assert updated["owner_id"] == b
    assert updated["valid_from"] == "2024-01-01"
    assert updated["valid_to"] is None
    mp_after = admin_client.get(f"/api/v1/measuring-points/{mp['id']}").json()
    assert mp_after["current_owner_name"] == "Upd-B"


def test_update_to_overlap_rejected(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "UpdOvl-A")
    b = _create_owner(admin_client, "UpdOvl-B")
    mp = _create_mp(admin_client, "Strom-UpdOvl", "SN-UO-1", owner_id=a, installed_at="2024-01-01")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/owners",
        json={"owner_id": b, "valid_from": "2022-01-01", "valid_to": "2023-01-01"},
    )
    aid = resp.json()["id"]
    # Geschlossene Periode in die offene hineinschieben.
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}/owners/{aid}",
        json={"owner_id": b, "valid_from": "2023-06-01", "valid_to": "2024-06-01"},
    )
    assert resp.status_code == 422
    # Selbe Periode unveraendert speichern darf NICHT an sich selbst scheitern.
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}/owners/{aid}",
        json={"owner_id": b, "valid_from": "2022-01-01", "valid_to": "2023-01-01"},
    )
    assert resp.status_code == 200, resp.text


def test_update_open_while_other_open_rejected(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "Dual-A")
    b = _create_owner(admin_client, "Dual-B")
    mp = _create_mp(admin_client, "Strom-Dual", "SN-DU-1", owner_id=a, installed_at="2024-01-01")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/owners",
        json={"owner_id": b, "valid_from": "2022-01-01", "valid_to": "2023-01-01"},
    )
    aid = resp.json()["id"]
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}/owners/{aid}",
        json={"owner_id": b, "valid_from": "2022-01-01", "valid_to": None},
    )
    assert resp.status_code == 422


def test_update_assignment_of_other_mp_404(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "X-A")
    mp1 = _create_mp(admin_client, "Strom-X1", "SN-X-1", owner_id=a)
    mp2 = _create_mp(admin_client, "Strom-X2", "SN-X-2")
    aid = _history(admin_client, mp1["id"])[0]["id"]
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp2['id']}/owners/{aid}",
        json={"owner_id": a, "valid_from": "2024-01-01", "valid_to": None},
    )
    assert resp.status_code == 404
    resp = admin_client.delete(f"/api/v1/measuring-points/{mp2['id']}/owners/{aid}")
    assert resp.status_code == 404


def test_delete_closed_period(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "Del-A")
    b = _create_owner(admin_client, "Del-B")
    mp = _create_mp(admin_client, "Strom-Del", "SN-DL-1", owner_id=a, installed_at="2024-01-01")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/owners",
        json={"owner_id": b, "valid_from": "2022-01-01", "valid_to": "2023-01-01"},
    )
    aid = resp.json()["id"]
    resp = admin_client.delete(f"/api/v1/measuring-points/{mp['id']}/owners/{aid}")
    assert resp.status_code == 204
    history = _history(admin_client, mp["id"])
    assert aid not in [h["id"] for h in history]
    assert len(history) == 1


def test_delete_open_period_clears_current_owner(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "DelOpen-A")
    mp = _create_mp(admin_client, "Strom-DelOpen", "SN-DO-1", owner_id=a)
    aid = _history(admin_client, mp["id"])[0]["id"]
    resp = admin_client.delete(f"/api/v1/measuring-points/{mp['id']}/owners/{aid}")
    assert resp.status_code == 204
    mp_after = admin_client.get(f"/api/v1/measuring-points/{mp['id']}").json()
    assert mp_after["current_owner_id"] is None
    assert mp_after["current_owner_name"] is None


def test_audit_entries_for_history_editor(admin_client: TestClient) -> None:
    a = _create_owner(admin_client, "AudEd-A")
    b = _create_owner(admin_client, "AudEd-B")
    mp = _create_mp(admin_client, "Strom-AudEd", "SN-AE-1", owner_id=a, installed_at="2024-01-01")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/owners",
        json={"owner_id": b, "valid_from": "2022-01-01", "valid_to": "2023-01-01"},
    )
    aid = resp.json()["id"]
    admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}/owners/{aid}",
        json={"owner_id": b, "valid_from": "2022-02-01", "valid_to": "2023-01-01"},
    )
    admin_client.delete(f"/api/v1/measuring-points/{mp['id']}/owners/{aid}")
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

        created = latest(AuditAction.OWNER_ASSIGNMENT_CREATED)
        assert created.entity_id == mp["id"]
        assert created.diff is not None
        assert created.diff["owner_id"] == b
        assert created.diff["valid_from"] == "2022-01-01"

        updated = latest(AuditAction.OWNER_ASSIGNMENT_UPDATED)
        assert updated.diff is not None
        assert updated.diff["before"]["valid_from"] == "2022-01-01"
        assert updated.diff["after"]["valid_from"] == "2022-02-01"

        deleted = latest(AuditAction.OWNER_ASSIGNMENT_DELETED)
        assert deleted.diff is not None
        assert deleted.diff["before"]["owner_id"] == b


def test_history_editor_admin_only(admin_client: TestClient, recorder_client: TestClient) -> None:
    a = _create_owner(admin_client, "Perm-A")
    mp = _create_mp(admin_client, "Strom-Perm", "SN-PM-1", owner_id=a)
    aid = _history(admin_client, mp["id"])[0]["id"]
    body = {"owner_id": a, "valid_from": "2024-01-01", "valid_to": None}
    assert (
        recorder_client.post(f"/api/v1/measuring-points/{mp['id']}/owners", json=body).status_code
        == 403
    )
    assert (
        recorder_client.patch(
            f"/api/v1/measuring-points/{mp['id']}/owners/{aid}", json=body
        ).status_code
        == 403
    )
    assert (
        recorder_client.delete(f"/api/v1/measuring-points/{mp['id']}/owners/{aid}").status_code
        == 403
    )


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
