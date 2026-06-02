"""Tests für die materialisierte Monats-Statistik (``monthly_consumption``).

Kernzusage: ``recompute_register`` erzeugt exakt dieselben Monatswerte wie die
On-the-fly-Aggregation des consumption-Endpoints (gemeinsame Interpolations-
Logik), und ist idempotent.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.models import MonthlyConsumption
from meters.services.monthly_consumption import recompute_all, recompute_register


def _setup(admin_client: TestClient) -> tuple[int, int]:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wasser MC",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "W-MC-1",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "100.000"},
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    return body["id"], body["physical_meters"][0]["registers"][0]["id"]


def _add(admin_client: TestClient, register_id: int, value: str, at: str) -> None:
    resp = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": value, "reading_at": at},
    )
    assert resp.status_code == 201, resp.text


def _table(db: Session, register_id: int) -> dict[date, Decimal]:
    db.expire_all()
    return {
        r.period_end: r.consumption
        for r in db.scalars(
            select(MonthlyConsumption).where(MonthlyConsumption.register_id == register_id)
        )
    }


def test_recompute_matches_endpoint(admin_client: TestClient, db: Session) -> None:
    mp_id, reg_id = _setup(admin_client)
    # Cross-Month: 100->110 @01-15, 110->160 @02-10 (zweites Delta überspannt Grenze).
    _add(admin_client, reg_id, "110.000", "2024-01-15T12:00:00")
    _add(admin_client, reg_id, "160.000", "2024-02-10T12:00:00")

    recompute_register(db, reg_id)
    db.commit()

    endpoint = {
        date.fromisoformat(p["period_end"]): Decimal(p["consumption"])
        for p in admin_client.get(
            f"/api/v1/measuring-points/{mp_id}/consumption", params={"granularity": "month"}
        ).json()
    }
    assert _table(db, reg_id) == endpoint
    assert endpoint  # nicht leer


def test_recompute_is_idempotent(admin_client: TestClient, db: Session) -> None:
    _, reg_id = _setup(admin_client)
    _add(admin_client, reg_id, "110.000", "2024-01-15T12:00:00")
    _add(admin_client, reg_id, "160.000", "2024-02-10T12:00:00")

    recompute_register(db, reg_id)
    db.commit()
    first = _table(db, reg_id)
    recompute_register(db, reg_id)
    db.commit()
    second = _table(db, reg_id)
    assert first == second  # kein Duplikat, kein Drift


def test_recompute_reflects_deleted_reading(admin_client: TestClient, db: Session) -> None:
    _, reg_id = _setup(admin_client)
    _add(admin_client, reg_id, "110.000", "2024-01-15T12:00:00")
    r2 = admin_client.post(
        "/api/v1/readings",
        json={"register_id": reg_id, "value": "160.000", "reading_at": "2024-02-10T12:00:00"},
    ).json()
    recompute_register(db, reg_id)
    db.commit()
    assert date(2024, 2, 29) in _table(db, reg_id)  # Februar-Bucket existiert

    admin_client.delete(f"/api/v1/readings/{r2['id']}")
    recompute_register(db, reg_id)
    db.commit()
    # Ohne das Februar-Reading bleibt nur noch der Januar-Verbrauch.
    table = _table(db, reg_id)
    assert date(2024, 2, 29) not in table


def test_recompute_all_returns_register_count(admin_client: TestClient, db: Session) -> None:
    _setup(admin_client)
    n = recompute_all(db)
    db.commit()
    assert n >= 1


# --- Cache-Invalidierung über den Session-Hook (B2b) ------------------------
# Diese Tests rufen KEIN recompute_register explizit auf — die Tabelle muss
# allein durch den zentralen after_commit-Hook aktuell sein.


def test_hook_keeps_table_in_sync_on_reading_create(admin_client: TestClient, db: Session) -> None:
    mp_id, reg_id = _setup(admin_client)
    _add(admin_client, reg_id, "110.000", "2024-01-15T12:00:00")
    _add(admin_client, reg_id, "160.000", "2024-02-10T12:00:00")

    endpoint = {
        date.fromisoformat(p["period_end"]): Decimal(p["consumption"])
        for p in admin_client.get(
            f"/api/v1/measuring-points/{mp_id}/consumption", params={"granularity": "month"}
        ).json()
    }
    assert _table(db, reg_id) == endpoint  # Hook hat die Tabelle gefüllt
    assert endpoint


def test_consumption_endpoint_reads_from_table(admin_client: TestClient, db: Session) -> None:
    # Beweist B2c: der Monats-Endpoint liest die Tabelle (nicht on-the-fly).
    # Wir verfälschen die materialisierte Zeile -> der Endpoint muss sie liefern.
    mp_id, reg_id = _setup(admin_client)
    _add(admin_client, reg_id, "110.000", "2024-01-31T12:00:00")  # Hook füllt Januar
    db.expire_all()
    row = db.scalar(select(MonthlyConsumption).where(MonthlyConsumption.register_id == reg_id))
    assert row is not None
    row.consumption = Decimal("999")
    db.commit()  # kein Recompute (nur MonthlyConsumption geändert)

    points = admin_client.get(
        f"/api/v1/measuring-points/{mp_id}/consumption", params={"granularity": "month"}
    ).json()
    assert Decimal("999") in {Decimal(p["consumption"]) for p in points}


def test_hook_updates_table_on_reading_delete(admin_client: TestClient, db: Session) -> None:
    _, reg_id = _setup(admin_client)
    _add(admin_client, reg_id, "110.000", "2024-01-15T12:00:00")
    r2 = admin_client.post(
        "/api/v1/readings",
        json={"register_id": reg_id, "value": "160.000", "reading_at": "2024-02-10T12:00:00"},
    ).json()
    assert date(2024, 2, 29) in _table(db, reg_id)  # Hook hat Februar-Bucket angelegt

    admin_client.delete(f"/api/v1/readings/{r2['id']}")
    assert date(2024, 2, 29) not in _table(db, reg_id)  # Hook hat ihn wieder entfernt
