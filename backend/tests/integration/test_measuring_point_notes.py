"""Notizen zu Messstellen: Anlegen, Lesen, Loeschen, Zugriff, Audit."""

from __future__ import annotations

from typing import Any, cast

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.db import SessionLocal
from meters.models import (
    AuditAction,
    AuditEntityType,
    AuditLog,
    MeasuringPoint,
    MeasuringPointNote,
    User,
    UserMeasuringPointAccess,
)


def _create_mp(client: TestClient, *, name: str = "Wasser", serial: str = "W-1") -> int:
    resp = client.post(
        "/api/v1/measuring-points",
        json={
            "name": name,
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": serial,
            "installed_at": "2024-01-01",
            "initial_values": {"water": "0"},
        },
    )
    assert resp.status_code == 201, resp.text
    return cast(int, resp.json()["id"])


def _grant(db: Session, *, user: User, mp_id: int, granted_by: User) -> None:
    db.add(
        UserMeasuringPointAccess(
            user_id=user.id, measuring_point_id=mp_id, granted_by_user_id=granted_by.id
        )
    )
    db.commit()


def _add_note(client: TestClient, mp_id: int, text: str) -> dict[str, Any]:
    resp = client.post(f"/api/v1/measuring-points/{mp_id}/notes", json={"text": text})
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def _last_log(action: AuditAction) -> AuditLog | None:
    with SessionLocal() as s:
        return s.scalar(
            select(AuditLog)
            .where(
                AuditLog.action == action,
                AuditLog.entity_type == AuditEntityType.MEASURING_POINT_NOTE,
            )
            .order_by(AuditLog.id.desc())
        )


def test_admin_creates_and_lists_notes(admin_client: TestClient, admin_user: User) -> None:
    mp_id = _create_mp(admin_client)
    first = _add_note(admin_client, mp_id, "  Zähler hinter dem Regal  ")
    second = _add_note(admin_client, mp_id, "Schlüssel beim Hausmeister")

    assert first["text"] == "Zähler hinter dem Regal"
    assert first["created_by_user_id"] == admin_user.id
    assert first["created_by_username"] == "admin"
    assert first["created_at"].endswith("Z")

    resp = admin_client.get(f"/api/v1/measuring-points/{mp_id}/notes")
    assert resp.status_code == 200
    assert [n["id"] for n in resp.json()] == [second["id"], first["id"]]

    log = _last_log(AuditAction.CREATE)
    assert log is not None
    assert log.entity_id == second["id"]
    assert log.user_id == admin_user.id
    assert log.diff == {"measuring_point_id": mp_id, "text": "Schlüssel beim Hausmeister"}


def test_note_length_and_blank_validation(admin_client: TestClient) -> None:
    mp_id = _create_mp(admin_client)
    url = f"/api/v1/measuring-points/{mp_id}/notes"
    assert admin_client.post(url, json={"text": "x" * 500}).status_code == 201
    assert admin_client.post(url, json={"text": "x" * 501}).status_code == 422
    assert admin_client.post(url, json={"text": ""}).status_code == 422
    assert admin_client.post(url, json={"text": "   \n "}).status_code == 422


def test_unknown_measuring_point_is_404(admin_client: TestClient) -> None:
    assert admin_client.get("/api/v1/measuring-points/9999/notes").status_code == 404
    resp = admin_client.post("/api/v1/measuring-points/9999/notes", json={"text": "x"})
    assert resp.status_code == 404


def test_recorder_without_access_gets_404(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    mp_id = _create_mp(admin_client)
    note = _add_note(admin_client, mp_id, "geheim")

    assert recorder_client.get(f"/api/v1/measuring-points/{mp_id}/notes").status_code == 404
    resp = recorder_client.post(f"/api/v1/measuring-points/{mp_id}/notes", json={"text": "x"})
    assert resp.status_code == 404
    resp = recorder_client.delete(f"/api/v1/measuring-point-notes/{note['id']}")
    assert resp.status_code == 404
    # Gleicher Titel wie fuer eine nicht existierende Notiz (kein Existenz-Orakel).
    missing = recorder_client.delete("/api/v1/measuring-point-notes/9999")
    assert resp.json()["title"] == missing.json()["title"]


def test_recorder_with_access_creates_and_deletes_own_note_only(
    admin_client: TestClient,
    recorder_client: TestClient,
    admin_user: User,
    recorder_user: User,
    db: Session,
) -> None:
    mp_id = _create_mp(admin_client)
    _grant(db, user=recorder_user, mp_id=mp_id, granted_by=admin_user)
    admin_note = _add_note(admin_client, mp_id, "vom Admin")
    own = _add_note(recorder_client, mp_id, "vom Recorder")
    assert own["created_by_username"] == "recorder"

    listed = recorder_client.get(f"/api/v1/measuring-points/{mp_id}/notes").json()
    assert {n["id"] for n in listed} == {admin_note["id"], own["id"]}

    resp = recorder_client.delete(f"/api/v1/measuring-point-notes/{admin_note['id']}")
    assert resp.status_code == 404
    resp = recorder_client.delete(f"/api/v1/measuring-point-notes/{own['id']}")
    assert resp.status_code == 204

    log = _last_log(AuditAction.DELETE)
    assert log is not None
    assert log.entity_id == own["id"]
    assert log.user_id == recorder_user.id
    assert log.diff is not None and log.diff["text"] == "vom Recorder"


def test_admin_deletes_any_note(
    admin_client: TestClient,
    recorder_client: TestClient,
    admin_user: User,
    recorder_user: User,
    db: Session,
) -> None:
    mp_id = _create_mp(admin_client)
    _grant(db, user=recorder_user, mp_id=mp_id, granted_by=admin_user)
    note = _add_note(recorder_client, mp_id, "vom Recorder")
    assert admin_client.delete(f"/api/v1/measuring-point-notes/{note['id']}").status_code == 204
    assert admin_client.get(f"/api/v1/measuring-points/{mp_id}/notes").json() == []


def test_notes_cascade_with_measuring_point(admin_client: TestClient, db: Session) -> None:
    mp_id = _create_mp(admin_client)
    _add_note(admin_client, mp_id, "weg damit")
    mp = db.get(MeasuringPoint, mp_id)
    assert mp is not None
    db.delete(mp)
    db.commit()
    assert db.scalar(select(MeasuringPointNote.id)) is None


def test_delete_user_with_notes_blocked(
    admin_client: TestClient,
    recorder_client: TestClient,
    admin_user: User,
    recorder_user: User,
    db: Session,
) -> None:
    mp_id = _create_mp(admin_client)
    _grant(db, user=recorder_user, mp_id=mp_id, granted_by=admin_user)
    _add_note(recorder_client, mp_id, "Notiz")
    resp = admin_client.delete(f"/api/v1/users/{recorder_user.id}")
    assert resp.status_code == 409
    assert resp.json()["references"]["notes"] == 1
