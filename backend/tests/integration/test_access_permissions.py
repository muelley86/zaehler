"""Integration-Tests für die Per-Recorder-MP-Zugriffsbeschränkung (Feature B).

Wir testen das Verhalten *aus Recorder-Sicht* end-to-end über die HTTP-API:
- Default ist "kein Zugriff" — Recorder ohne Eintrag sieht nichts.
- Mit explizitem Grant sieht er genau diese MPs (und nur die).
- Admin bleibt von allem unbeschränkt.

Die Verwaltungs-Endpoints (PUT /users/{id}/measuring-points) gehören zu
Schritt 4 und sind hier noch nicht verfügbar; wir setzen die Grants direkt
in der DB, um die Filter-Logik der Read-Endpoints isoliert zu prüfen.
"""

from __future__ import annotations

from typing import Any, cast

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from meters.models import MeasuringPoint, User, UserMeasuringPointAccess


def _grant(db: Session, *, user: User, mp_id: int, granted_by: User) -> None:
    """Direkt-Insert in die Access-Tabelle (Verwaltungs-Endpoints kommen erst
    in Schritt 4)."""
    db.add(
        UserMeasuringPointAccess(
            user_id=user.id,
            measuring_point_id=mp_id,
            granted_by_user_id=granted_by.id,
        )
    )
    db.commit()


def _create_water_mp(client: TestClient, *, name: str, serial: str) -> dict[str, Any]:
    payload = {
        "name": name,
        "type": "water",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": serial,
        "installed_at": "2024-01-01",
        "initial_values": {"water": "0.0"},
    }
    resp = client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


# ---------------------------------------------------------------------------
# Listen + Detail
# ---------------------------------------------------------------------------


def test_admin_sees_all_mps(admin_client: TestClient) -> None:
    _create_water_mp(admin_client, name="A", serial="SN-A")
    _create_water_mp(admin_client, name="B", serial="SN-B")
    resp = admin_client.get("/api/v1/measuring-points")
    assert resp.status_code == 200
    names = sorted(m["name"] for m in resp.json())
    assert names == ["A", "B"]


def test_new_recorder_sees_no_mps_by_default(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    _create_water_mp(admin_client, name="A", serial="SN-A")
    _create_water_mp(admin_client, name="B", serial="SN-B")
    resp = recorder_client.get("/api/v1/measuring-points")
    assert resp.status_code == 200
    assert resp.json() == []


def test_recorder_sees_only_granted_mps(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    mp_a = _create_water_mp(admin_client, name="A", serial="SN-A")
    mp_b = _create_water_mp(admin_client, name="B", serial="SN-B")
    _create_water_mp(admin_client, name="C", serial="SN-C")
    _grant(db, user=recorder_user, mp_id=mp_a["id"], granted_by=admin_user)
    _grant(db, user=recorder_user, mp_id=mp_b["id"], granted_by=admin_user)

    resp = recorder_client.get("/api/v1/measuring-points")
    assert resp.status_code == 200
    names = sorted(m["name"] for m in resp.json())
    assert names == ["A", "B"]


def test_recorder_404_on_disallowed_mp_detail(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    resp = recorder_client.get(f"/api/v1/measuring-points/{mp['id']}")
    # 404 statt 403 — Recorder soll Existenz fremder MPs nicht ableiten
    # können.
    assert resp.status_code == 404


def test_recorder_can_get_granted_mp_detail(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    _grant(db, user=recorder_user, mp_id=mp["id"], granted_by=admin_user)
    resp = recorder_client.get(f"/api/v1/measuring-points/{mp['id']}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "A"


def test_recorder_404_on_state_disallowed(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    resp = recorder_client.get(f"/api/v1/measuring-points/{mp['id']}/state")
    assert resp.status_code == 404


def test_recorder_404_on_consumption_disallowed(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    resp = recorder_client.get(f"/api/v1/measuring-points/{mp['id']}/consumption")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Readings
# ---------------------------------------------------------------------------


def test_recorder_can_post_reading_to_granted_mp(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    register_id = mp["physical_meters"][0]["registers"][0]["id"]
    _grant(db, user=recorder_user, mp_id=mp["id"], granted_by=admin_user)

    resp = recorder_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "100.0",
            "reading_at": "2024-06-01T12:00:00Z",
        },
    )
    assert resp.status_code == 201, resp.text


def test_recorder_404_on_post_reading_to_disallowed_register(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    register_id = mp["physical_meters"][0]["registers"][0]["id"]

    resp = recorder_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "100.0",
            "reading_at": "2024-06-01T12:00:00Z",
        },
    )
    # Existenz nicht leaken: 404 statt 403.
    assert resp.status_code == 404


def test_recorder_readings_list_filtered_by_access(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    mp_a = _create_water_mp(admin_client, name="A", serial="SN-A")
    mp_b = _create_water_mp(admin_client, name="B", serial="SN-B")
    reg_a = mp_a["physical_meters"][0]["registers"][0]["id"]
    reg_b = mp_b["physical_meters"][0]["registers"][0]["id"]

    # Admin legt Readings auf beiden MPs an.
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": reg_a, "value": "10.0", "reading_at": "2024-06-01T12:00:00Z"},
    )
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": reg_b, "value": "20.0", "reading_at": "2024-06-01T12:00:00Z"},
    )

    # Recorder kriegt nur Zugriff auf MP A.
    _grant(db, user=recorder_user, mp_id=mp_a["id"], granted_by=admin_user)

    resp = recorder_client.get("/api/v1/readings")
    assert resp.status_code == 200
    register_ids = {r["register_id"] for r in resp.json()}
    assert register_ids == {reg_a}


def test_recorder_cannot_edit_reading_after_access_revoked(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    """Selbst-erstellte Readings dürfen ohne MP-Zugriff nicht mehr geändert
    werden, auch innerhalb der 24h-Frist."""
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    register_id = mp["physical_meters"][0]["registers"][0]["id"]
    _grant(db, user=recorder_user, mp_id=mp["id"], granted_by=admin_user)

    create = recorder_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "100.0", "reading_at": "2024-06-01T12:00:00Z"},
    )
    assert create.status_code == 201, create.text
    reading_id = create.json()["id"]

    # Admin entzieht den Zugriff (durch direkten DB-Eingriff — Endpoint kommt
    # in Schritt 4).
    db.query(UserMeasuringPointAccess).filter_by(
        user_id=recorder_user.id, measuring_point_id=mp["id"]
    ).delete()
    db.commit()

    resp = recorder_client.patch(
        f"/api/v1/readings/{reading_id}",
        json={"value": "150.0"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Exporte
# ---------------------------------------------------------------------------


def test_recorder_export_csv_filtered(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    mp_a = _create_water_mp(admin_client, name="A", serial="SN-A")
    mp_b = _create_water_mp(admin_client, name="B", serial="SN-B")
    reg_a = mp_a["physical_meters"][0]["registers"][0]["id"]
    reg_b = mp_b["physical_meters"][0]["registers"][0]["id"]
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": reg_a, "value": "10.0", "reading_at": "2024-06-01T12:00:00Z"},
    )
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": reg_b, "value": "20.0", "reading_at": "2024-06-01T12:00:00Z"},
    )
    _grant(db, user=recorder_user, mp_id=mp_a["id"], granted_by=admin_user)

    resp = recorder_client.get("/api/v1/export/readings.csv")
    assert resp.status_code == 200
    body = resp.text
    # CSV sollte nur den Eintrag von MP A enthalten
    assert f",{reg_a}," in body
    assert f",{reg_b}," not in body


def test_recorder_export_dump_json_returns_403(recorder_client: TestClient) -> None:
    """Side-effect-Change: dump.json war vorher für jeden eingeloggten User
    erreichbar. Mit Feature B wird er admin-only — ein Voll-Backup ist als
    Recorder-Artefakt sinnlos und semantisch missverständlich."""
    resp = recorder_client.get("/api/v1/export/dump.json")
    assert resp.status_code == 403


def test_admin_export_dump_json_still_works(admin_client: TestClient) -> None:
    resp = admin_client.get("/api/v1/export/dump.json")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")


# ---------------------------------------------------------------------------
# Verwaltungs-Endpoints (Schritt 4)
# ---------------------------------------------------------------------------


def test_admin_get_user_access_for_recorder(
    admin_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    mp_a = _create_water_mp(admin_client, name="A", serial="SN-A")
    _grant(db, user=recorder_user, mp_id=mp_a["id"], granted_by=admin_user)
    resp = admin_client.get(f"/api/v1/users/{recorder_user.id}/measuring-points")
    assert resp.status_code == 200
    assert resp.json() == {"user_id": recorder_user.id, "measuring_point_ids": [mp_a["id"]]}


def test_admin_get_user_access_for_admin_returns_all(
    admin_client: TestClient,
    admin_user: User,
) -> None:
    mp_a = _create_water_mp(admin_client, name="A", serial="SN-A")
    mp_b = _create_water_mp(admin_client, name="B", serial="SN-B")
    resp = admin_client.get(f"/api/v1/users/{admin_user.id}/measuring-points")
    assert resp.status_code == 200
    body = resp.json()
    assert sorted(body["measuring_point_ids"]) == sorted([mp_a["id"], mp_b["id"]])


def test_admin_put_user_access_replaces_grants(
    admin_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    mp_a = _create_water_mp(admin_client, name="A", serial="SN-A")
    mp_b = _create_water_mp(admin_client, name="B", serial="SN-B")
    mp_c = _create_water_mp(admin_client, name="C", serial="SN-C")
    # Vorher: Recorder hat A + B
    _grant(db, user=recorder_user, mp_id=mp_a["id"], granted_by=admin_user)
    _grant(db, user=recorder_user, mp_id=mp_b["id"], granted_by=admin_user)

    # Nachher: nur B + C → A wird entzogen, C neu vergeben
    resp = admin_client.put(
        f"/api/v1/users/{recorder_user.id}/measuring-points",
        json={"measuring_point_ids": [mp_b["id"], mp_c["id"]]},
    )
    assert resp.status_code == 200, resp.text
    assert sorted(resp.json()["measuring_point_ids"]) == sorted([mp_b["id"], mp_c["id"]])

    # Recorder-Sicht: nur B + C
    follow = admin_client.get(f"/api/v1/users/{recorder_user.id}/measuring-points")
    assert sorted(follow.json()["measuring_point_ids"]) == sorted([mp_b["id"], mp_c["id"]])


def test_admin_put_user_access_clears_all_when_empty(
    admin_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    _grant(db, user=recorder_user, mp_id=mp["id"], granted_by=admin_user)

    resp = admin_client.put(
        f"/api/v1/users/{recorder_user.id}/measuring-points",
        json={"measuring_point_ids": []},
    )
    assert resp.status_code == 200
    assert resp.json()["measuring_point_ids"] == []


def test_admin_put_user_access_rejects_admin_target(
    admin_client: TestClient,
    admin_user: User,
) -> None:
    resp = admin_client.put(
        f"/api/v1/users/{admin_user.id}/measuring-points",
        json={"measuring_point_ids": []},
    )
    assert resp.status_code == 422


def test_admin_put_user_access_rejects_unknown_mp(
    admin_client: TestClient,
    recorder_user: User,
) -> None:
    resp = admin_client.put(
        f"/api/v1/users/{recorder_user.id}/measuring-points",
        json={"measuring_point_ids": [99999]},
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body.get("unknown_ids") == [99999]


def test_admin_put_user_access_rejects_unknown_user(admin_client: TestClient) -> None:
    resp = admin_client.put(
        "/api/v1/users/99999/measuring-points",
        json={"measuring_point_ids": []},
    )
    assert resp.status_code == 404


def test_recorder_cannot_access_user_access_endpoints(
    recorder_client: TestClient, recorder_user: User
) -> None:
    """Auch das Lesen der eigenen Access-Liste ist Admin-only."""
    resp = recorder_client.get(f"/api/v1/users/{recorder_user.id}/measuring-points")
    assert resp.status_code == 403
    resp2 = recorder_client.put(
        f"/api/v1/users/{recorder_user.id}/measuring-points",
        json={"measuring_point_ids": []},
    )
    assert resp2.status_code == 403


def test_admin_put_audit_log_records_grant_and_revoke(
    admin_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    mp_a = _create_water_mp(admin_client, name="A", serial="SN-A")
    mp_b = _create_water_mp(admin_client, name="B", serial="SN-B")
    _grant(db, user=recorder_user, mp_id=mp_a["id"], granted_by=admin_user)

    # PUT: A entziehen (war drin), B vergeben (war nicht drin)
    admin_client.put(
        f"/api/v1/users/{recorder_user.id}/measuring-points",
        json={"measuring_point_ids": [mp_b["id"]]},
    )

    log = admin_client.get("/api/v1/audit-log").json()
    # Audit-Log enthält auch Einträge ohne strukturierten diff (z.B.
    # MP-Anlage hat ``diff=None``). Wir interessieren uns hier nur für die
    # access_granted/access_revoked-Einträge mit measuring_point_id-Diff.
    actions = [
        (e["action"], (e["diff"] or {}).get("measuring_point_id"))
        for e in log
        if e["action"] in ("access_granted", "access_revoked")
    ]
    assert ("access_granted", mp_b["id"]) in actions
    assert ("access_revoked", mp_a["id"]) in actions


def test_get_mp_users_lists_admins_and_grantees(
    admin_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    _grant(db, user=recorder_user, mp_id=mp["id"], granted_by=admin_user)

    resp = admin_client.get(f"/api/v1/measuring-points/{mp['id']}/users")
    assert resp.status_code == 200
    rows = resp.json()
    sources = {r["username"]: r["source"] for r in rows}
    assert sources.get("admin") == "admin"
    assert sources.get("recorder") == "grant"


def test_get_mp_users_404_for_unknown_mp(admin_client: TestClient) -> None:
    resp = admin_client.get("/api/v1/measuring-points/99999/users")
    assert resp.status_code == 404


def test_recorder_cannot_access_mp_users(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    mp = _create_water_mp(admin_client, name="A", serial="SN-A")
    resp = recorder_client.get(f"/api/v1/measuring-points/{mp['id']}/users")
    assert resp.status_code == 403
