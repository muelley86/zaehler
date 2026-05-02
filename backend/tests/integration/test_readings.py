from __future__ import annotations

from fastapi.testclient import TestClient


def _setup_water_mp(admin_client: TestClient) -> int:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wasser Garten",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "W-0001",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "100.000"},
        },
    )
    assert resp.status_code == 201, resp.text
    body: dict[str, object] = resp.json()
    register_id: int = body["physical_meters"][0]["registers"][0]["id"]  # type: ignore[index]
    return register_id


def test_create_reading(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    resp = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "123.456", "reading_at": "2025-01-01T12:00:00"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["value"] == "123.456"


def test_duplicate_date_returns_409_with_existing(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "120.0", "reading_at": "2025-01-01T12:00:00"},
    )
    resp = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "121.0", "reading_at": "2025-01-01T12:00:00"},
    )
    assert resp.status_code == 409
    body = resp.json()
    assert body["title"] == "Reading already exists at this timestamp"
    assert "existing" in body
    assert body["existing"]["value"] == "120.0"


def test_recorder_can_create_but_only_edit_within_window(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    register_id = _setup_water_mp(admin_client)
    create = recorder_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "150.0", "reading_at": "2025-02-01T12:00:00"},
    )
    assert create.status_code == 201, create.text
    rid = create.json()["id"]
    update = recorder_client.patch(f"/api/v1/readings/{rid}", json={"note": "korrigiert"})
    assert update.status_code == 200


def test_recorder_cannot_edit_others_reading(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    register_id = _setup_water_mp(admin_client)
    create = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "150.0", "reading_at": "2025-03-01T12:00:00"},
    )
    rid = create.json()["id"]
    update = recorder_client.patch(f"/api/v1/readings/{rid}", json={"note": "fremd"})
    assert update.status_code == 403


def test_filter_by_measuring_point_and_date(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    for d, v in [
        ("2025-01-15T12:00:00", "120"),
        ("2025-02-15T12:00:00", "140"),
        ("2025-03-15T12:00:00", "160"),
    ]:
        admin_client.post(
            "/api/v1/readings",
            json={"register_id": register_id, "value": v, "reading_at": d},
        )
    # Filter via from/to
    resp = admin_client.get(
        "/api/v1/readings",
        params={"from_at": "2025-02-01T00:00:00", "to_at": "2025-02-28T23:59:59"},
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["reading_at"].startswith("2025-02-15")


def test_multiple_readings_per_day(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    a = admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "150",
            "reading_at": "2025-04-01T08:00:00",
        },
    )
    b = admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "152",
            "reading_at": "2025-04-01T18:00:00",
        },
    )
    assert a.status_code == 201, a.text
    assert b.status_code == 201, b.text


def test_cumulative_value_must_not_decrease(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "200",
            "reading_at": "2025-05-01T12:00:00",
        },
    )
    # Niedrigerer Wert NACH einem höheren → Fehler
    resp = admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "180",
            "reading_at": "2025-05-15T12:00:00",
        },
    )
    assert resp.status_code == 400
    assert "previous" in resp.json()


def test_backdated_reading_must_fit_series(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "200",
            "reading_at": "2025-06-01T12:00:00",
        },
    )
    # Rückdatieren mit höherem Wert als der bereits vorhandene → Fehler
    resp = admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "250",
            "reading_at": "2025-05-15T12:00:00",
        },
    )
    assert resp.status_code == 400
    assert "next" in resp.json()
    # Rückdatieren mit Wert in der gültigen Bandbreite → OK
    ok = admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "150",
            "reading_at": "2025-05-15T12:00:00",
        },
    )
    assert ok.status_code == 201, ok.text


def test_filter_by_measuring_point(admin_client: TestClient) -> None:
    register_id = _setup_water_mp(admin_client)
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "200", "reading_at": "2025-04-01T12:00:00"},
    )
    # Hole MP-ID aus dem Register-Pfad
    points = admin_client.get("/api/v1/measuring-points").json()
    mp_id = points[0]["id"]
    resp = admin_client.get("/api/v1/readings", params={"measuring_point_id": mp_id})
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
