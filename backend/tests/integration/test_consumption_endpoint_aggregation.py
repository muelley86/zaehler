"""Integrationstests für den consumption-Endpoint mit Granularität + Zeitraum.

Prüft, dass ``GET /measuring-points/{id}/consumption`` die Query-Parameter
``granularity`` und ``from_at``/``to_at`` auswertet (Aggregation + Filter).
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _setup_water_mp(admin_client: TestClient) -> tuple[int, int]:
    """Wasser-MP mit Startstand 100 am 2024-01-01. Liefert (mp_id, register_id)."""
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wasser Aggregation",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "W-AGG-1",
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


def test_monthly_granularity_aggregates(admin_client: TestClient) -> None:
    mp_id, register_id = _setup_water_mp(admin_client)
    # Roh-Deltas: 100→110 (10) @01-15, 110→130 (20) @01-25, 130→160 (30) @02-10
    _add(admin_client, register_id, "110.000", "2024-01-15T12:00:00")
    _add(admin_client, register_id, "130.000", "2024-01-25T12:00:00")
    _add(admin_client, register_id, "160.000", "2024-02-10T12:00:00")

    resp = admin_client.get(
        f"/api/v1/measuring-points/{mp_id}/consumption", params={"granularity": "month"}
    )
    assert resp.status_code == 200, resp.text
    points = resp.json()
    by_end = {p["period_end"]: p for p in points}
    # Januar summiert: 10 + 20 = 30, Bucket-Ende = 31.01.
    assert by_end["2024-01-31"]["consumption"] == "30.000"
    assert by_end["2024-01-31"]["period_start"] == "2024-01-01"
    # Februar: 30, Bucket-Ende = 29.02. (Schaltjahr)
    assert by_end["2024-02-29"]["consumption"] == "30.000"


def test_no_granularity_returns_raw_points(admin_client: TestClient) -> None:
    mp_id, register_id = _setup_water_mp(admin_client)
    _add(admin_client, register_id, "110.000", "2024-01-15T12:00:00")
    _add(admin_client, register_id, "130.000", "2024-01-25T12:00:00")

    resp = admin_client.get(f"/api/v1/measuring-points/{mp_id}/consumption")
    assert resp.status_code == 200, resp.text
    points = resp.json()
    # Roh: zwei Deltas (Initial→110, 110→130), nicht aggregiert.
    ends = sorted(p["period_end"] for p in points)
    assert ends == ["2024-01-15", "2024-01-25"]


def test_range_filter_limits_buckets(admin_client: TestClient) -> None:
    mp_id, register_id = _setup_water_mp(admin_client)
    _add(admin_client, register_id, "110.000", "2024-01-15T12:00:00")
    _add(admin_client, register_id, "160.000", "2024-02-10T12:00:00")

    resp = admin_client.get(
        f"/api/v1/measuring-points/{mp_id}/consumption",
        params={"granularity": "month", "from_at": "2024-02-01", "to_at": "2024-02-29"},
    )
    assert resp.status_code == 200, resp.text
    points = resp.json()
    ends = [p["period_end"] for p in points]
    # Nur der Februar-Bucket (Januar-Delta liegt außerhalb des Zeitraums).
    assert ends == ["2024-02-29"]


def test_period_end_uses_local_date(admin_client: TestClient) -> None:
    # 2024-12-31T23:30:00Z == 01.01.2025 00:30 Europe/Berlin → Periode am LOKALEN Tag.
    # Bewusst NICHT exakt Mitternacht (00:30), sonst würde die Periodengrenzen-
    # Normalisierung den Wert auf den 31.12. zurückschieben (eigener Test dafür).
    mp_id, register_id = _setup_water_mp(admin_client)
    _add(admin_client, register_id, "110.000", "2024-12-31T23:30:00Z")
    points = admin_client.get(f"/api/v1/measuring-points/{mp_id}/consumption").json()
    ends = [p["period_end"] for p in points]
    assert "2025-01-01" in ends
    assert "2024-12-31" not in ends
