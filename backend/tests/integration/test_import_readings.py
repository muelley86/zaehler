"""Integrationstests für den Zählerstand-Import (xlsx/csv).

Layout: je Zeile eine Messstelle (erste Spalte = Name), je Spalte ein Monat
(Überschrift = Datum), Zellen = Zählerstände. Deckt preview (Parsen +
Auto-Match), commit (Anlegen + idempotentes Überspringen), CSV, Mehr-Register
und admin-only ab.
"""

from __future__ import annotations

import io
from datetime import date
from typing import Any, cast

from fastapi.testclient import TestClient
from openpyxl import Workbook


def _create_mp(
    client: TestClient,
    *,
    name: str,
    serial: str,
    mtype: str = "water",
    initial: dict[str, str] | None = None,
    bidirectional: bool = False,
) -> dict[str, Any]:
    if initial is None:
        initial = {"water": "0"} if mtype == "water" else {"1.8.0": "0"}
    payload: dict[str, Any] = {
        "name": name,
        "type": mtype,
        "is_bidirectional": bidirectional,
        "has_dual_tariff": False,
        "serial_number": serial,
        "installed_at": "2023-12-01",
        "initial_values": initial,
    }
    resp = client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def _registers(mp: dict[str, Any]) -> dict[str, int]:
    return {r["obis_code"]: r["id"] for r in mp["physical_meters"][0]["registers"]}


def _xlsx(header: list[Any], rows: list[list[Any]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.append(header)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _upload(client: TestClient, filename: str, content: bytes) -> Any:
    return client.post(
        "/api/v1/imports/readings/preview",
        files={"file": (filename, content, "application/octet-stream")},
    )


def test_preview_xlsx_matches_names_and_parses(admin_client: TestClient) -> None:
    a = _create_mp(admin_client, name="Hauptzähler Wasser", serial="W-1")
    _create_mp(admin_client, name="Garten Wasser", serial="W-2")

    content = _xlsx(
        ["Messstelle", date(2024, 1, 31), date(2024, 2, 29)],
        [
            ["Hauptzähler Wasser", 100, 150],
            ["garten wasser", 10, 12],  # andere Schreibweise -> casefold-Match
            ["Unbekannt", 5, 6],  # kein Match
        ],
    )
    resp = _upload(admin_client, "stände.xlsx", content)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["reading_dates"] == ["2024-01-31", "2024-02-29"]
    by_name = {r["raw_name"]: r for r in body["rows"]}
    assert by_name["Hauptzähler Wasser"]["matched_mp_id"] == a["id"]
    assert by_name["garten wasser"]["matched_mp_id"] is not None
    assert by_name["Unbekannt"]["matched_mp_id"] is None
    cells = by_name["Hauptzähler Wasser"]["cells"]
    assert [c["value"] for c in cells] == ["100", "150"]
    assert [c["reading_date"] for c in cells] == ["2024-01-31", "2024-02-29"]


def test_commit_creates_then_skips_on_reimport(admin_client: TestClient) -> None:
    mp = _create_mp(admin_client, name="Strom Haupt", serial="E-1", mtype="electricity")
    reg = _registers(mp)["1.8.0"]
    rows = {
        "rows": [
            {
                "register_id": reg,
                "cells": [
                    {"reading_date": "2024-01-31", "value": "1000"},
                    {"reading_date": "2024-02-29", "value": "1080"},
                ],
            }
        ],
        "source_filename": "import.xlsx",
    }
    r1 = admin_client.post("/api/v1/imports/readings/commit", json=rows)
    assert r1.status_code == 200, r1.text
    assert r1.json() == {"created": 2, "skipped_existing": 0, "failed": []}

    # Readings sind wirklich angelegt (neben dem Anfangsstand 0 vom MP-Anlegen).
    listing = admin_client.get("/api/v1/readings", params={"register_id": reg})
    values = {float(x["value"]) for x in listing.json()}
    assert {1000.0, 1080.0} <= values

    # Re-Import derselben Datei -> alles übersprungen.
    r2 = admin_client.post("/api/v1/imports/readings/commit", json=rows)
    assert r2.status_code == 200, r2.text
    assert r2.json() == {"created": 0, "skipped_existing": 2, "failed": []}


def test_preview_csv_semicolon_and_comma_decimal(admin_client: TestClient) -> None:
    _create_mp(admin_client, name="Gas Keller", serial="G-1", mtype="electricity")
    csv_text = "Messstelle;31.01.2024;29.02.2024\nGas Keller;1.234,5;1.250,0\n"
    resp = _upload(admin_client, "stände.csv", csv_text.encode("utf-8"))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["reading_dates"] == ["2024-01-31", "2024-02-29"]
    cells = body["rows"][0]["cells"]
    assert [c["value"] for c in cells] == ["1234.5", "1250.0"]


def test_multi_register_mp_commit_into_chosen_register(admin_client: TestClient) -> None:
    mp = _create_mp(
        admin_client,
        name="PV Strom",
        serial="E-PV",
        mtype="electricity",
        bidirectional=True,
        initial={"1.8.0": "0", "2.8.0": "0"},
    )
    regs = _registers(mp)
    assert "1.8.0" in regs and "2.8.0" in regs  # Mehr-Register-MP
    resp = admin_client.post(
        "/api/v1/imports/readings/commit",
        json={
            "rows": [
                {
                    "register_id": regs["1.8.0"],
                    "cells": [{"reading_date": "2024-03-31", "value": "500"}],
                }
            ]
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["created"] == 1
    # Wert landete im gewählten Register (1.8.0), nicht im Einspeise-Register.
    bezug = {
        float(x["value"])
        for x in admin_client.get("/api/v1/readings", params={"register_id": regs["1.8.0"]}).json()
    }
    feed = {
        float(x["value"])
        for x in admin_client.get("/api/v1/readings", params={"register_id": regs["2.8.0"]}).json()
    }
    assert 500.0 in bezug
    assert 500.0 not in feed


def test_preview_flags_unparseable_cell(admin_client: TestClient) -> None:
    _create_mp(admin_client, name="Wasser X", serial="W-X")
    content = _xlsx(
        ["Messstelle", date(2024, 1, 31)],
        [["Wasser X", "kaputt"]],
    )
    resp = _upload(admin_client, "x.xlsx", content)
    assert resp.status_code == 200, resp.text
    cell = resp.json()["rows"][0]["cells"][0]
    assert cell["value"] is None
    assert cell["error"]


def test_commit_reports_invalid_register_without_aborting(admin_client: TestClient) -> None:
    mp = _create_mp(admin_client, name="Wasser Y", serial="W-Y")
    good = _registers(mp)["water"]
    resp = admin_client.post(
        "/api/v1/imports/readings/commit",
        json={
            "rows": [
                {"register_id": good, "cells": [{"reading_date": "2024-01-31", "value": "42"}]},
                {"register_id": 999999, "cells": [{"reading_date": "2024-01-31", "value": "7"}]},
            ]
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["created"] == 1
    assert len(body["failed"]) == 1
    assert body["failed"][0]["register_id"] == 999999


def test_reading_at_is_local_end_of_day() -> None:
    # Historische Monatswerte landen am Tagesende (23:59:59 lokal), nicht 12:00.
    from datetime import UTC, date
    from zoneinfo import ZoneInfo

    from meters.core.config import settings
    from meters.services.consumption import _local_date
    from meters.services.import_readings import _reading_at

    dt = _reading_at(date(2024, 1, 31))  # naive UTC
    local = dt.replace(tzinfo=UTC).astimezone(ZoneInfo(settings.timezone))
    assert (local.hour, local.minute, local.second) == (23, 59, 59)
    assert _local_date(dt) == date(2024, 1, 31)  # Datum bleibt stabil


def test_import_is_admin_only(recorder_client: TestClient) -> None:
    content = _xlsx(["Messstelle", date(2024, 1, 31)], [["X", 1]])
    assert _upload(recorder_client, "x.xlsx", content).status_code == 403
    commit = recorder_client.post(
        "/api/v1/imports/readings/commit",
        json={
            "rows": [{"register_id": 1, "cells": [{"reading_date": "2024-01-31", "value": "1"}]}]
        },
    )
    assert commit.status_code == 403
