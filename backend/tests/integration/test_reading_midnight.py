"""Integrationstests: 00:00-Erfassungen werden beim Anlegen auf den Vortag
23:59:59 (lokal) normalisiert und so der vorhergehenden Periode zugeordnet.

Läuft deterministisch über den METERS_TIMEZONE-Default (Europe/Berlin).
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _water_mp(admin_client: TestClient) -> tuple[int, int]:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wasser Mitternacht",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "W-MN-1",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "0"},
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    return body["id"], body["physical_meters"][0]["registers"][0]["id"]


def test_midnight_reading_is_stored_on_previous_day(admin_client: TestClient) -> None:
    _, register_id = _water_mp(admin_client)
    # Frontend sendet UTC: lokal Berlin 2025-03-01 00:00 (Winter) == 2025-02-28T23:00:00Z.
    resp = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "100", "reading_at": "2025-02-28T23:00:00Z"},
    )
    assert resp.status_code == 201, resp.text
    # Gespeichert/zurückgegeben: Vortag 23:59:59 lokal == 2025-02-28 22:59:59Z.
    assert resp.json()["reading_at"] == "2025-02-28T22:59:59Z"


def test_midnight_reading_counts_to_previous_period(admin_client: TestClient) -> None:
    mp_id, register_id = _water_mp(admin_client)
    admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "100", "reading_at": "2025-02-28T23:00:00Z"},
    )
    resp = admin_client.get(
        f"/api/v1/measuring-points/{mp_id}/consumption", params={"granularity": "month"}
    )
    assert resp.status_code == 200, resp.text
    ends = [p["period_end"] for p in resp.json()]
    # Der Verbrauch endet im Februar 2025, nicht im März.
    assert any(e.startswith("2025-02") for e in ends)
    assert not any(e.startswith("2025-03") for e in ends)


def test_non_midnight_reading_unchanged(admin_client: TestClient) -> None:
    _, register_id = _water_mp(admin_client)
    resp = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "50", "reading_at": "2025-03-01T11:00:00Z"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["reading_at"] == "2025-03-01T11:00:00Z"


def test_duplicate_after_shift_conflicts(admin_client: TestClient) -> None:
    _, register_id = _water_mp(admin_client)
    first = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "100", "reading_at": "2025-02-28T23:00:00Z"},
    )
    assert first.status_code == 201, first.text
    # Zweite Erfassung an derselben lokalen Mitternacht -> kollidiert auf dem
    # verschobenen Zeitstempel.
    second = admin_client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": "100", "reading_at": "2025-02-28T23:00:00Z"},
    )
    assert second.status_code == 409, second.text
