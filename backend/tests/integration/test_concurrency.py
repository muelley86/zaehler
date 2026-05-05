"""Concurrency-Tests: parallele Schreiber auf dieselben Resourcen.

Diese Tests prüfen, dass die DB-seitigen UNIQUE-Constraints unter parallelen
Requests halten — nicht nur die App-Logik. SQLite läuft hier im WAL-Modus
(siehe ``meters.db.__init__._set_sqlite_pragmas``), also sind echte parallele
Schreibvorgänge möglich.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any, cast

from fastapi.testclient import TestClient

from meters.core.security import hash_password
from meters.db import SessionLocal
from meters.main import app
from meters.models import User, UserRole


def _make_admin_client() -> TestClient:
    """Eigener TestClient + frisch eingeloggter Admin pro Thread.

    TestClient ist nicht reentrant — jeder Thread bekommt seinen eigenen.
    """
    with SessionLocal() as db:
        existing = db.query(User).filter_by(username="conc-admin").first()
        if existing is None:
            db.add(
                User(
                    username="conc-admin",
                    email=None,
                    password_hash=hash_password("conc-pass-12345"),
                    role=UserRole.ADMIN,
                    is_active=True,
                    force_password_change=False,
                )
            )
            db.commit()
    client = TestClient(app)
    client.__enter__()
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "conc-admin", "password": "conc-pass-12345"},
    )
    assert resp.status_code == 200, resp.text
    return client


def _close(client: TestClient) -> None:
    client.__exit__(None, None, None)


def _create_water_mp(client: TestClient) -> dict[str, Any]:
    payload = {
        "name": "Wasserzähler-Concurrency",
        "type": "water",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": "W-CONC-1",
        "installed_at": "2024-01-01",
        "initial_values": {"water": "100.0"},
    }
    resp = client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def test_parallel_readings_same_register_and_at_collide() -> None:
    """Zwei Threads schreiben gleichzeitig (register_id, reading_at).
    UNIQUE-Constraint auf Reading muss greifen: einer 201, einer 409."""
    client = _make_admin_client()
    try:
        mp = _create_water_mp(client)
        register_id = mp["physical_meters"][0]["registers"][0]["id"]
    finally:
        _close(client)

    def worker(value: str) -> int:
        c = _make_admin_client()
        try:
            r = c.post(
                "/api/v1/readings",
                json={
                    "register_id": register_id,
                    "value": value,
                    "reading_at": "2024-06-01T08:00:00",
                },
            )
            return r.status_code
        finally:
            _close(c)

    with ThreadPoolExecutor(max_workers=2) as ex:
        statuses = sorted(ex.map(worker, ["120.0", "121.0"]))

    # Genau einer gewinnt (201), einer kollidiert (409). 500 wäre ein
    # Hinweis, dass die Constraint-Verletzung nicht sauber gemappt wird.
    assert statuses == [201, 409], f"Unerwartet: {statuses}"


def test_parallel_replace_meter_only_one_succeeds() -> None:
    """Zwei Threads tauschen gleichzeitig den Zähler derselben MP.
    Partial-Unique-Index auf physical_meter (uq_physical_meter_active_per_mp)
    verhindert, dass am Ende zwei aktive Meter existieren."""
    client = _make_admin_client()
    try:
        mp = _create_water_mp(client)
        mp_id = mp["id"]
    finally:
        _close(client)

    def worker(serial: str) -> int:
        c = _make_admin_client()
        try:
            r = c.post(
                f"/api/v1/measuring-points/{mp_id}/replace-meter",
                json={
                    "final_readings": {"water": "200.0"},
                    "removed_at": "2024-07-01",
                    "new_serial_number": serial,
                    "installed_at": "2024-07-01",
                    "initial_readings": {"water": "0.0"},
                },
            )
            return r.status_code
        finally:
            _close(c)

    with ThreadPoolExecutor(max_workers=2) as ex:
        statuses = sorted(ex.map(worker, ["W-CONC-2", "W-CONC-3"]))

    # Erwartung: einer 200, einer 4xx oder 5xx. In jedem Fall darf am Ende
    # nur ein aktiver Meter existieren — das prüfen wir explizit.
    assert 200 in statuses, f"Mindestens einer muss durchlaufen: {statuses}"

    check = _make_admin_client()
    try:
        body = check.get(f"/api/v1/measuring-points/{mp_id}").json()
        active_meters = [m for m in body["physical_meters"] if m["removed_at"] is None]
        assert len(active_meters) == 1, (
            f"Nach parallelen replace_meter darf nur ein Meter aktiv sein, "
            f"gefunden: {len(active_meters)}"
        )
    finally:
        _close(check)
