from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from meters.db import SessionLocal
from meters.models import AuditAction, AuditLog, SupplierAssignment


def _create_mp(
    client: TestClient,
    name: str,
    serial: str,
    *,
    supplier_id: int | None = None,
    supplier_valid_from: str | None = None,
    owner_id: int | None = None,
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
    if supplier_id is not None:
        body["supplier_id"] = supplier_id
    if supplier_valid_from is not None:
        body["supplier_valid_from"] = supplier_valid_from
    if owner_id is not None:
        body["owner_id"] = owner_id
    resp = client.post("/api/v1/measuring-points", json=body)
    assert resp.status_code == 201, resp.text
    out: dict[str, Any] = resp.json()
    return out


def _create_supplier(client: TestClient, name: str) -> int:
    resp = client.post("/api/v1/suppliers", json={"name": name})
    return int(resp.json()["id"])


def test_create_mp_with_supplier_creates_open_assignment(admin_client: TestClient) -> None:
    supplier_id = _create_supplier(admin_client, "Lief-A")
    mp = _create_mp(admin_client, "Strom-Supplier-A", "SN-SA1", supplier_id=supplier_id)
    assert mp["current_supplier_id"] == supplier_id
    assert mp["current_supplier_name"] == "Lief-A"
    history = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/suppliers").json()
    assert len(history) == 1
    assert history[0]["supplier_id"] == supplier_id
    assert history[0]["valid_to"] is None


def test_create_mp_without_supplier_no_assignment(admin_client: TestClient) -> None:
    mp = _create_mp(admin_client, "Strom-NoSupplier", "SN-SNO-1")
    assert mp["current_supplier_id"] is None
    history = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/suppliers").json()
    assert history == []


def test_create_mp_with_owner_and_supplier(admin_client: TestClient) -> None:
    """Owner- und Supplier-Zuordnung sind unabhaengige Perioden-Modelle —
    beide gleichzeitig beim Anlegen gesetzt muessen beide offen sein und
    alle vier current_*-Felder im Read fuellen."""
    owner_resp = admin_client.post("/api/v1/owners", json={"name": "Eigt-Kombi"})
    owner_id = int(owner_resp.json()["id"])
    supplier_id = _create_supplier(admin_client, "Lief-Kombi")
    mp = _create_mp(
        admin_client,
        "Strom-Kombi",
        "SN-KO-1",
        supplier_id=supplier_id,
        owner_id=owner_id,
    )
    assert mp["current_owner_id"] == owner_id
    assert mp["current_owner_name"] == "Eigt-Kombi"
    assert mp["current_supplier_id"] == supplier_id
    assert mp["current_supplier_name"] == "Lief-Kombi"
    owners = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/owners").json()
    suppliers = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/suppliers").json()
    assert len(owners) == 1 and owners[0]["valid_to"] is None
    assert len(suppliers) == 1 and suppliers[0]["valid_to"] is None


def test_change_supplier_closes_old_and_opens_new(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "Lief-A2")
    b = _create_supplier(admin_client, "Lief-B2")
    mp = _create_mp(
        admin_client,
        "Strom-SWechsel",
        "SN-SWE-1",
        supplier_id=a,
        installed_at="2024-01-01",
    )
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-supplier",
        json={"supplier_id": b, "valid_from": "2025-06-15"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["current_supplier_id"] == b
    history = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/suppliers").json()
    assert len(history) == 2
    # Sortierung absteigend nach valid_from → neuer Lieferant zuerst.
    assert history[0]["supplier_id"] == b
    assert history[0]["valid_to"] is None
    assert history[1]["supplier_id"] == a
    assert history[1]["valid_from"] == "2024-01-01"
    assert history[1]["valid_to"] == "2025-06-15"


def test_change_supplier_first_time_no_previous(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "Lief-First")
    mp = _create_mp(admin_client, "Strom-SFirst", "SN-SF-1")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-supplier",
        json={"supplier_id": a, "valid_from": "2025-01-01"},
    )
    assert resp.status_code == 200
    history = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/suppliers").json()
    assert len(history) == 1


def test_change_supplier_valid_from_before_current_rejected(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "Lief-AB")
    b = _create_supplier(admin_client, "Lief-BB")
    mp = _create_mp(
        admin_client,
        "Strom-SRueck",
        "SN-SRR-1",
        supplier_id=a,
        installed_at="2024-06-01",
    )
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-supplier",
        json={"supplier_id": b, "valid_from": "2024-01-01"},
    )
    assert resp.status_code == 422


def test_supplier_delete_sets_assignment_supplier_id_to_null(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "Lief-Tobe-Deleted")
    mp = _create_mp(admin_client, "Strom-Supplier-Del", "SN-SOD-1", supplier_id=a)
    resp = admin_client.delete(f"/api/v1/suppliers/{a}")
    assert resp.status_code == 204
    history = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/suppliers").json()
    assert len(history) == 1
    assert history[0]["supplier_id"] is None
    assert history[0]["supplier_name"] is None
    # MP zeigt jetzt „kein Lieferant" — open assignment ist da, aber supplier_id NULL
    mp_after = admin_client.get(f"/api/v1/measuring-points/{mp['id']}").json()
    assert mp_after["current_supplier_id"] is None
    assert mp_after["current_supplier_name"] is None


def test_audit_log_for_supplier_change(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "Lief-Audit-A")
    b = _create_supplier(admin_client, "Lief-Audit-B")
    mp = _create_mp(admin_client, "Strom-SAudit", "SN-SAU-1", supplier_id=a)
    admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-supplier",
        json={"supplier_id": b, "valid_from": "2025-01-01"},
    )
    with SessionLocal() as db:
        log = (
            db.query(AuditLog)
            .filter(AuditLog.action == AuditAction.SUPPLIER_CHANGED)
            .order_by(AuditLog.id.desc())
            .first()
        )
        assert log is not None
        assert log.diff is not None
        assert log.diff["from"] == a
        assert log.diff["to"] == b
        assert log.diff["valid_from"] == "2025-01-01"


def test_list_measuring_points_no_n_plus_one_for_suppliers(admin_client: TestClient) -> None:
    """Regressionstest: das MP-Listing darf nicht eine Query pro MP fuer das
    aktuelle Supplier-Assignment absetzen. ``current_assignments_bulk`` loest
    das fuer alle Messstellen in einer einzigen Query."""
    from sqlalchemy import event

    from meters.db import engine

    a = _create_supplier(admin_client, "SBulk-A")
    b = _create_supplier(admin_client, "SBulk-B")
    _create_mp(admin_client, "Strom-SBulk-1", "SN-SB-1", supplier_id=a)
    _create_mp(admin_client, "Strom-SBulk-2", "SN-SB-2", supplier_id=b)
    _create_mp(admin_client, "Strom-SBulk-3", "SN-SB-3", supplier_id=a)
    _create_mp(admin_client, "Strom-SBulk-4", "SN-SB-4")  # ohne Lieferant

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
    supplier_queries = [q for q in queries if "supplier_assignment" in q.lower()]
    # Bulk-Loader => max. 1 SELECT auf supplier_assignment fuer die ganze Liste.
    assert len(supplier_queries) <= 1, (
        f"Erwartet <=1 supplier_assignment-Query, gefunden {len(supplier_queries)}: "
        + "\n".join(supplier_queries)
    )


# ---------------------------------------------------------------------------
# Historien-Editor: POST/PATCH/DELETE /measuring-points/{id}/suppliers[/{aid}]
# ---------------------------------------------------------------------------


def _history(client: TestClient, mp_id: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = client.get(f"/api/v1/measuring-points/{mp_id}/suppliers").json()
    return out


def test_create_historical_period_with_gap(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "SHist-A")
    b = _create_supplier(admin_client, "SHist-B")
    mp = _create_mp(
        admin_client, "Strom-SHist", "SN-SH-1", supplier_id=a, installed_at="2024-01-01"
    )
    # Historische Periode VOR der offenen, mit Luecke (2023-06-01 bis 2024-01-01).
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/suppliers",
        json={"supplier_id": b, "valid_from": "2022-01-01", "valid_to": "2023-06-01"},
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert created["supplier_id"] == b
    assert created["supplier_name"] == "SHist-B"
    assert created["valid_from"] == "2022-01-01"
    assert created["valid_to"] == "2023-06-01"
    history = _history(admin_client, mp["id"])
    assert len(history) == 2
    assert history[0]["supplier_id"] == a  # offene Periode zuerst (desc)
    assert history[1]["supplier_id"] == b


def test_create_second_open_period_rejected(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "SOpen-A")
    b = _create_supplier(admin_client, "SOpen-B")
    mp = _create_mp(
        admin_client, "Strom-SOpen", "SN-SO-1", supplier_id=a, installed_at="2024-01-01"
    )
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/suppliers",
        json={"supplier_id": b, "valid_from": "2026-01-01", "valid_to": None},
    )
    assert resp.status_code == 422


def test_create_overlapping_period_rejected(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "SOvl-A")
    b = _create_supplier(admin_client, "SOvl-B")
    mp = _create_mp(
        admin_client, "Strom-SOvl", "SN-SOV-1", supplier_id=a, installed_at="2024-01-01"
    )
    # Ueberlappt die offene Periode [2024-01-01, inf).
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/suppliers",
        json={"supplier_id": b, "valid_from": "2024-06-01", "valid_to": "2024-07-01"},
    )
    assert resp.status_code == 422
    # Angrenzend (halboffen) ist erlaubt: [2023-01-01, 2024-01-01).
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/suppliers",
        json={"supplier_id": b, "valid_from": "2023-01-01", "valid_to": "2024-01-01"},
    )
    assert resp.status_code == 201, resp.text
    # Ueberlappt die neue geschlossene Periode.
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/suppliers",
        json={"supplier_id": a, "valid_from": "2023-06-01", "valid_to": "2023-12-01"},
    )
    assert resp.status_code == 422


def test_create_valid_to_not_after_valid_from_rejected(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "SRng-A")
    mp = _create_mp(admin_client, "Strom-SRng", "SN-SRG-1")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/suppliers",
        json={"supplier_id": a, "valid_from": "2024-01-01", "valid_to": "2024-01-01"},
    )
    assert resp.status_code == 422


def test_create_unknown_supplier_or_mp_404(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "SUnk-A")
    mp = _create_mp(admin_client, "Strom-SUnk", "SN-SUK-1")
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/suppliers",
        json={"supplier_id": 999999, "valid_from": "2024-01-01", "valid_to": None},
    )
    assert resp.status_code == 404
    resp = admin_client.post(
        "/api/v1/measuring-points/999999/suppliers",
        json={"supplier_id": a, "valid_from": "2024-01-01", "valid_to": None},
    )
    assert resp.status_code == 404


def test_update_period_dates_and_supplier(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "SUpd-A")
    b = _create_supplier(admin_client, "SUpd-B")
    mp = _create_mp(
        admin_client, "Strom-SUpd", "SN-SUP-1", supplier_id=a, installed_at="2024-03-01"
    )
    aid = _history(admin_client, mp["id"])[0]["id"]
    # Rueckdatieren + Lieferant tauschen — vorher append-only unmoeglich.
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}/suppliers/{aid}",
        json={"supplier_id": b, "valid_from": "2024-01-01", "valid_to": None},
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()
    assert updated["supplier_id"] == b
    assert updated["valid_from"] == "2024-01-01"
    assert updated["valid_to"] is None
    mp_after = admin_client.get(f"/api/v1/measuring-points/{mp['id']}").json()
    assert mp_after["current_supplier_name"] == "SUpd-B"


def test_update_to_overlap_rejected(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "SUpdOvl-A")
    b = _create_supplier(admin_client, "SUpdOvl-B")
    mp = _create_mp(
        admin_client, "Strom-SUpdOvl", "SN-SUO-1", supplier_id=a, installed_at="2024-01-01"
    )
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/suppliers",
        json={"supplier_id": b, "valid_from": "2022-01-01", "valid_to": "2023-01-01"},
    )
    aid = resp.json()["id"]
    # Geschlossene Periode in die offene hineinschieben.
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}/suppliers/{aid}",
        json={"supplier_id": b, "valid_from": "2023-06-01", "valid_to": "2024-06-01"},
    )
    assert resp.status_code == 422
    # Selbe Periode unveraendert speichern darf NICHT an sich selbst scheitern.
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}/suppliers/{aid}",
        json={"supplier_id": b, "valid_from": "2022-01-01", "valid_to": "2023-01-01"},
    )
    assert resp.status_code == 200, resp.text


def test_update_open_while_other_open_rejected(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "SDual-A")
    b = _create_supplier(admin_client, "SDual-B")
    mp = _create_mp(
        admin_client, "Strom-SDual", "SN-SDU-1", supplier_id=a, installed_at="2024-01-01"
    )
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/suppliers",
        json={"supplier_id": b, "valid_from": "2022-01-01", "valid_to": "2023-01-01"},
    )
    aid = resp.json()["id"]
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}/suppliers/{aid}",
        json={"supplier_id": b, "valid_from": "2022-01-01", "valid_to": None},
    )
    assert resp.status_code == 422


def test_update_assignment_of_other_mp_404(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "SX-A")
    mp1 = _create_mp(admin_client, "Strom-SX1", "SN-SX-1", supplier_id=a)
    mp2 = _create_mp(admin_client, "Strom-SX2", "SN-SX-2")
    aid = _history(admin_client, mp1["id"])[0]["id"]
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp2['id']}/suppliers/{aid}",
        json={"supplier_id": a, "valid_from": "2024-01-01", "valid_to": None},
    )
    assert resp.status_code == 404
    resp = admin_client.delete(f"/api/v1/measuring-points/{mp2['id']}/suppliers/{aid}")
    assert resp.status_code == 404


def test_delete_closed_period(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "SDel-A")
    b = _create_supplier(admin_client, "SDel-B")
    mp = _create_mp(
        admin_client, "Strom-SDel", "SN-SDL-1", supplier_id=a, installed_at="2024-01-01"
    )
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/suppliers",
        json={"supplier_id": b, "valid_from": "2022-01-01", "valid_to": "2023-01-01"},
    )
    aid = resp.json()["id"]
    resp = admin_client.delete(f"/api/v1/measuring-points/{mp['id']}/suppliers/{aid}")
    assert resp.status_code == 204
    history = _history(admin_client, mp["id"])
    assert aid not in [h["id"] for h in history]
    assert len(history) == 1


def test_delete_open_period_clears_current_supplier(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "SDelOpen-A")
    mp = _create_mp(admin_client, "Strom-SDelOpen", "SN-SDO-1", supplier_id=a)
    aid = _history(admin_client, mp["id"])[0]["id"]
    resp = admin_client.delete(f"/api/v1/measuring-points/{mp['id']}/suppliers/{aid}")
    assert resp.status_code == 204
    mp_after = admin_client.get(f"/api/v1/measuring-points/{mp['id']}").json()
    assert mp_after["current_supplier_id"] is None
    assert mp_after["current_supplier_name"] is None


def test_audit_entries_for_history_editor(admin_client: TestClient) -> None:
    a = _create_supplier(admin_client, "SAudEd-A")
    b = _create_supplier(admin_client, "SAudEd-B")
    mp = _create_mp(
        admin_client, "Strom-SAudEd", "SN-SAE-1", supplier_id=a, installed_at="2024-01-01"
    )
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/suppliers",
        json={"supplier_id": b, "valid_from": "2022-01-01", "valid_to": "2023-01-01"},
    )
    aid = resp.json()["id"]
    admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}/suppliers/{aid}",
        json={"supplier_id": b, "valid_from": "2022-02-01", "valid_to": "2023-01-01"},
    )
    admin_client.delete(f"/api/v1/measuring-points/{mp['id']}/suppliers/{aid}")
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

        created = latest(AuditAction.SUPPLIER_ASSIGNMENT_CREATED)
        assert created.entity_id == mp["id"]
        assert created.diff is not None
        assert created.diff["supplier_id"] == b
        assert created.diff["valid_from"] == "2022-01-01"

        updated = latest(AuditAction.SUPPLIER_ASSIGNMENT_UPDATED)
        assert updated.diff is not None
        assert updated.diff["before"]["valid_from"] == "2022-01-01"
        assert updated.diff["after"]["valid_from"] == "2022-02-01"

        deleted = latest(AuditAction.SUPPLIER_ASSIGNMENT_DELETED)
        assert deleted.diff is not None
        assert deleted.diff["before"]["supplier_id"] == b


def test_history_editor_admin_only(admin_client: TestClient, recorder_client: TestClient) -> None:
    a = _create_supplier(admin_client, "SPerm-A")
    mp = _create_mp(admin_client, "Strom-SPerm", "SN-SPM-1", supplier_id=a)
    aid = _history(admin_client, mp["id"])[0]["id"]
    body = {"supplier_id": a, "valid_from": "2024-01-01", "valid_to": None}
    assert (
        recorder_client.post(
            f"/api/v1/measuring-points/{mp['id']}/suppliers", json=body
        ).status_code
        == 403
    )
    assert (
        recorder_client.patch(
            f"/api/v1/measuring-points/{mp['id']}/suppliers/{aid}", json=body
        ).status_code
        == 403
    )
    assert (
        recorder_client.delete(f"/api/v1/measuring-points/{mp['id']}/suppliers/{aid}").status_code
        == 403
    )


def test_mp_delete_cascades_assignments(admin_client: TestClient) -> None:
    # MP-Delete via Endpoint ist durch das Readings-Existenz-Lock geschuetzt
    # (install_first_meter legt initial readings an). Wir testen die DB-Cascade
    # daher direkt: MP-Datensatz mit ORM loeschen, Assignments muessen weg.
    from meters.models import MeasuringPoint

    a = _create_supplier(admin_client, "Lief-Cascade")
    mp = _create_mp(admin_client, "Strom-SCascade", "SN-SCA-1", supplier_id=a)
    with SessionLocal() as db:
        mp_obj = db.get(MeasuringPoint, mp["id"])
        assert mp_obj is not None
        db.delete(mp_obj)
        db.commit()
        remaining = db.query(SupplierAssignment).filter_by(measuring_point_id=mp["id"]).all()
        assert remaining == []
