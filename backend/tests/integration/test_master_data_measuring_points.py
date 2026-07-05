"""Reverse-Lookup: aktuell zugeordnete Messstellen (mit Stand) je Stammdatensatz.

Deckt ``GET /api/v1/{owners,suppliers,mieters}/{id}/measuring-points`` ab — die
Datenquelle der Stammdaten-Detailseiten. Geliefert werden ausschliesslich MPs mit
**offenem** Assignment (``valid_to IS NULL``); historische Zuordnungen erscheinen
nicht. Jede MP kommt gebuendelt mit ihrem aktuellen Register-Stand.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from meters.models import User, UserMeasuringPointAccess


def _create_owner(client: TestClient, name: str) -> int:
    resp = client.post("/api/v1/owners", json={"name": name})
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _create_supplier(client: TestClient, name: str) -> int:
    resp = client.post("/api/v1/suppliers", json={"name": name})
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _create_mieter(client: TestClient, name: str) -> int:
    resp = client.post("/api/v1/mieters", json={"last_name": name})
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _create_mp(
    client: TestClient,
    *,
    name: str,
    serial: str,
    assign_kwarg: str | None = None,
    assign_id: int | None = None,
    installed_at: str = "2024-01-01",
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": name,
        "type": "water",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": serial,
        "installed_at": installed_at,
        "initial_values": {"water": "0"},
    }
    if assign_kwarg is not None:
        body[assign_kwarg] = assign_id
    resp = client.post("/api/v1/measuring-points", json=body)
    assert resp.status_code == 201, resp.text
    out: dict[str, Any] = resp.json()
    return out


def _add_reading(client: TestClient, register_id: int, value: str) -> None:
    resp = client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": value, "reading_at": "2025-01-01T12:00:00"},
    )
    assert resp.status_code < 300, resp.text


def _grant(db: Session, *, user: User, mp_id: int, granted_by: User) -> None:
    db.add(
        UserMeasuringPointAccess(
            user_id=user.id,
            measuring_point_id=mp_id,
            granted_by_user_id=granted_by.id,
        )
    )
    db.commit()


def _count_owner_mp_queries(client: TestClient, owner_id: int) -> int:
    """Zaehlt die DB-Queries eines GET /owners/{id}/measuring-points-Requests."""
    from sqlalchemy import event

    from meters.db import engine

    queries: list[str] = []

    def collect(_c: object, _cur: object, statement: str, *_a: object, **_kw: object) -> None:
        queries.append(statement)

    event.listen(engine, "before_cursor_execute", collect)
    try:
        resp = client.get(f"/api/v1/owners/{owner_id}/measuring-points")
    finally:
        event.remove(engine, "before_cursor_execute", collect)
    assert resp.status_code == 200, resp.text
    return len(queries)


def test_detail_page_measuring_points_no_n_plus_one(admin_client: TestClient) -> None:
    """P-1: GET /owners/{id}/measuring-points darf NICHT mit der MP-Anzahl skalieren.

    measuring_points_with_state nutzt Bulk-Assignment-Dicts + Bulk-State
    (state_for_measuring_points). Bei N+1 braeuchte der 6-MP-Fall deutlich mehr
    Queries als der 2-MP-Fall (~1+6N).
    """
    owner_small = _create_owner(admin_client, "Perf-Small")
    for i in range(2):
        mp = _create_mp(
            admin_client,
            name=f"Perf-S-{i}",
            serial=f"SN-PS-{i}",
            assign_kwarg="owner_id",
            assign_id=owner_small,
        )
        _add_reading(admin_client, mp["physical_meters"][0]["registers"][0]["id"], f"{10 + i}")

    owner_large = _create_owner(admin_client, "Perf-Large")
    for i in range(6):
        mp = _create_mp(
            admin_client,
            name=f"Perf-L-{i}",
            serial=f"SN-PL-{i}",
            assign_kwarg="owner_id",
            assign_id=owner_large,
        )
        _add_reading(admin_client, mp["physical_meters"][0]["registers"][0]["id"], f"{10 + i}")

    q_small = _count_owner_mp_queries(admin_client, owner_small)  # 2 MPs
    q_large = _count_owner_mp_queries(admin_client, owner_large)  # 6 MPs
    assert q_large <= q_small, (
        f"N+1: 2 MPs -> {q_small} Queries, 6 MPs -> {q_large} Queries "
        "(measuring_points_with_state skaliert mit der MP-Anzahl)"
    )


# (resource, creator, mp_kwarg, change_path, change_key)
PARAMS = [
    pytest.param("owners", _create_owner, "owner_id", "change-owner", "owner_id", id="owners"),
    pytest.param(
        "suppliers",
        _create_supplier,
        "supplier_id",
        "change-supplier",
        "supplier_id",
        id="suppliers",
    ),
    pytest.param(
        "mieters", _create_mieter, "mieter_id", "change-mieter", "mieter_id", id="mieters"
    ),
]


@pytest.mark.parametrize("resource,creator,mp_kwarg,change_path,change_key", PARAMS)
def test_current_assignment_with_state(
    admin_client: TestClient,
    resource: str,
    creator: Any,
    mp_kwarg: str,
    change_path: str,
    change_key: str,
) -> None:
    entity_id = creator(admin_client, f"{resource}-cur")
    mp = _create_mp(
        admin_client,
        name=f"{resource}-W1",
        serial=f"SN-{resource}-1",
        assign_kwarg=mp_kwarg,
        assign_id=entity_id,
    )
    register_id = mp["physical_meters"][0]["registers"][0]["id"]
    _add_reading(admin_client, register_id, "123.5")

    resp = admin_client.get(f"/api/v1/{resource}/{entity_id}/measuring-points")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert [item["measuring_point"]["id"] for item in data] == [mp["id"]]
    registers = data[0]["registers"]
    assert len(registers) == 1
    assert Decimal(registers[0]["current_value"]) == Decimal("123.5")


@pytest.mark.parametrize("resource,creator,mp_kwarg,change_path,change_key", PARAMS)
def test_excludes_historical_assignment(
    admin_client: TestClient,
    resource: str,
    creator: Any,
    mp_kwarg: str,
    change_path: str,
    change_key: str,
) -> None:
    old_id = creator(admin_client, f"{resource}-old")
    new_id = creator(admin_client, f"{resource}-new")
    mp = _create_mp(
        admin_client,
        name=f"{resource}-W2",
        serial=f"SN-{resource}-2",
        assign_kwarg=mp_kwarg,
        assign_id=old_id,
    )
    change = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/{change_path}",
        json={change_key: new_id, "valid_from": "2025-06-15"},
    )
    assert change.status_code == 200, change.text

    # Alter Inhaber: jetzt historisch → keine MP mehr.
    assert admin_client.get(f"/api/v1/{resource}/{old_id}/measuring-points").json() == []
    # Neuer Inhaber: aktuelle Zuordnung → MP erscheint.
    after = admin_client.get(f"/api/v1/{resource}/{new_id}/measuring-points").json()
    assert [item["measuring_point"]["id"] for item in after] == [mp["id"]]


@pytest.mark.parametrize("resource,creator,mp_kwarg,change_path,change_key", PARAMS)
def test_404_unknown_entity(
    admin_client: TestClient,
    resource: str,
    creator: Any,
    mp_kwarg: str,
    change_path: str,
    change_key: str,
) -> None:
    assert admin_client.get(f"/api/v1/{resource}/999999/measuring-points").status_code == 404


@pytest.mark.parametrize("resource,creator,mp_kwarg,change_path,change_key", PARAMS)
def test_empty_when_no_measuring_points(
    admin_client: TestClient,
    resource: str,
    creator: Any,
    mp_kwarg: str,
    change_path: str,
    change_key: str,
) -> None:
    entity_id = creator(admin_client, f"{resource}-empty")
    resp = admin_client.get(f"/api/v1/{resource}/{entity_id}/measuring-points")
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


def test_recorder_only_sees_accessible_measuring_points(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    owner_id = _create_owner(admin_client, "Eigt-Access")
    mp_a = _create_mp(
        admin_client, name="W-A", serial="SN-ACC-A", assign_kwarg="owner_id", assign_id=owner_id
    )
    _create_mp(
        admin_client, name="W-B", serial="SN-ACC-B", assign_kwarg="owner_id", assign_id=owner_id
    )
    _grant(db, user=recorder_user, mp_id=mp_a["id"], granted_by=admin_user)

    resp = recorder_client.get(f"/api/v1/owners/{owner_id}/measuring-points")
    assert resp.status_code == 200, resp.text
    ids = [item["measuring_point"]["id"] for item in resp.json()]
    assert ids == [mp_a["id"]]
