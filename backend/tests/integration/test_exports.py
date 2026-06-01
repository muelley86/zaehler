"""Tests für die CSV- und JSON-Export-Endpoints.

Schützen vor Refactor-Regressionen — z. B. ob neue Spalten in das CSV
aufgenommen oder Decimal-Werte versehentlich zu Floats konvertiert
werden.
"""

from __future__ import annotations

import csv
import io
from typing import Any, cast

from fastapi.testclient import TestClient


def _create_water_mp(client: TestClient) -> dict[str, Any]:
    payload = {
        "name": "Wasser-Export-MP",
        "type": "water",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": "EXP-W-1",
        "installed_at": "2024-01-01",
        "initial_values": {"water": "100.5"},
    }
    resp = client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def test_csv_export_has_expected_columns(admin_client: TestClient) -> None:
    """CSV-Export muss alle Stammdaten-Spalten und das Decimal-Format als
    String (nicht Float) enthalten."""
    mp = _create_water_mp(admin_client)
    register_id = mp["physical_meters"][0]["registers"][0]["id"]
    admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "123.456",
            "reading_at": "2024-06-01T08:00:00",
        },
    )

    resp = admin_client.get("/api/v1/export/readings.csv")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("text/csv")

    reader = csv.DictReader(io.StringIO(resp.text))
    rows = list(reader)
    expected_cols = {
        "id",
        "reading_at",
        "value",
        "unit",
        "obis_code",
        "register_id",
        "physical_meter_id",
        "serial_number",
        "measuring_point_id",
        "note",
        "created_at",
        "created_by",
    }
    assert reader.fieldnames is not None
    assert expected_cols <= set(reader.fieldnames), (
        f"CSV-Header unvollständig — fehlt: {expected_cols - set(reader.fieldnames)}"
    )

    # Mindestens unsere zwei Readings (Anfangsstand + manueller POST)
    assert len(rows) >= 2
    matching = [r for r in rows if r["value"] == "123.456"]
    assert len(matching) == 1, "POST-Reading 123.456 muss exakt einmal im CSV stehen"
    assert matching[0]["unit"] == "m³"
    # Datum im deutschen Format DD.MM.YYYY HH:MM (Anwender öffnen das CSV in
    # Excel/LibreOffice, dort wird ISO 8601 nicht erkannt).
    assert matching[0]["reading_at"] == "01.06.2024 08:00", (
        f"reading_at sollte DD.MM.YYYY HH:MM sein, war: {matching[0]['reading_at']!r}"
    )
    # created_at inkludiert Sekunden (Server-generierter Timestamp).
    import re

    assert re.match(r"^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$", matching[0]["created_at"]), (
        f"created_at sollte DD.MM.YYYY HH:MM:SS sein, war: {matching[0]['created_at']!r}"
    )


def test_json_dump_structure(admin_client: TestClient) -> None:
    """JSON-Dump enthält die volle Hierarchie: MeasuringPoints → Meter
    → Register → Readings (kein Subset, kein Datenverlust)."""
    mp = _create_water_mp(admin_client)
    register_id = mp["physical_meters"][0]["registers"][0]["id"]
    admin_client.post(
        "/api/v1/readings",
        json={
            "register_id": register_id,
            "value": "200",
            "reading_at": "2024-07-01T08:00:00",
        },
    )

    resp = admin_client.get("/api/v1/export/dump.json")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert "measuring_points" in data
    found = next(p for p in data["measuring_points"] if p["name"] == "Wasser-Export-MP")
    assert found["type"] == "water"
    assert len(found["physical_meters"]) == 1
    meter = found["physical_meters"][0]
    assert meter["serial_number"] == "EXP-W-1"
    register = meter["registers"][0]
    assert register["obis_code"] == "water"
    assert any(r["value"] == "200" for r in register["readings"]), (
        "POST-Reading 200 muss im Dump auftauchen"
    )


def test_json_dump_includes_kostenstelle(admin_client: TestClient) -> None:
    admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Export-Kostenstelle-MP",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "EXP-KST-1",
            "installed_at": "2024-01-01",
            "initial_values": {},
            "kostenstelle": 4711,
        },
    )
    data = admin_client.get("/api/v1/export/dump.json").json()
    found = next(p for p in data["measuring_points"] if p["name"] == "Export-Kostenstelle-MP")
    assert found["kostenstelle"] == 4711
