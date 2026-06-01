"""Aus einem reinen Datum erzeugte Erfassungs-Zeitstempel (Erst-/Tausch-Stand)
müssen die lokale Wanduhrzeit (00:00 bzw. 23:59 Europe/Berlin) treffen — als
UTC gespeichert. Sonst zeigt das Frontend (Browser-Lokalzeit) den Offset.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _create(client: TestClient, *, serial: str, installed_at: str) -> int:
    resp = client.post(
        "/api/v1/measuring-points",
        json={
            "name": f"TZ {serial}",
            "type": "electricity",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": serial,
            "installed_at": installed_at,
            "initial_values": {"1.8.0": "100"},
        },
    )
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _reading(client: TestClient, mp_id: int, note: str) -> dict[str, object]:
    rows = client.get(f"/api/v1/readings?measuring_point_id={mp_id}").json()
    return next(r for r in rows if r["note"] == note)


def test_initial_reading_local_midnight_winter(admin_client: TestClient) -> None:
    mp_id = _create(admin_client, serial="TZ-W", installed_at="2025-01-01")
    # Europe/Berlin im Januar = UTC+1 → lokale 00:00:01 = 2024-12-31T23:00:01Z.
    assert _reading(admin_client, mp_id, "Anfangsstand")["reading_at"] == "2024-12-31T23:00:01Z"


def test_initial_reading_local_midnight_summer(admin_client: TestClient) -> None:
    mp_id = _create(admin_client, serial="TZ-S", installed_at="2025-07-01")
    # Europe/Berlin im Juli = UTC+2 (DST) → lokale 00:00:01 = 2025-06-30T22:00:01Z.
    assert _reading(admin_client, mp_id, "Anfangsstand")["reading_at"] == "2025-06-30T22:00:01Z"


def test_final_reading_local_end_of_day(admin_client: TestClient) -> None:
    mp_id = _create(admin_client, serial="TZ-R1", installed_at="2025-01-01")
    rep = admin_client.post(
        f"/api/v1/measuring-points/{mp_id}/replace-meter",
        json={
            "final_readings": {"1.8.0": "150"},
            "removed_at": "2025-01-15",
            "new_serial_number": "TZ-R2",
            "installed_at": "2025-01-15",
            "initial_readings": {"1.8.0": "0"},
        },
    )
    assert rep.status_code == 200, rep.text
    # 23:59 lokal (CET +1) am 15.01. = 22:59Z am 15.01. — bleibt der 15., nicht der 16.
    assert (
        _reading(admin_client, mp_id, "Endstand vor Tausch")["reading_at"] == "2025-01-15T22:59:00Z"
    )
