"""Integrationstests für den Auswertungen-Aggregations-Endpoint.

Testet ``GET /reports/aggregate`` (+ ``/aggregate.csv``) end-to-end über die
HTTP-API: Gruppierung je Dimension, Einheiten-/Typ-Trennung, NULL-Buckets,
Einspeise-Ausschluss, Gesamt vs. Monat, Recorder-Filter/partial und CSV.
"""

from __future__ import annotations

from typing import Any, cast

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from meters.models import User, UserMeasuringPointAccess


def _grant(db: Session, *, user: User, mp_id: int, granted_by: User) -> None:
    db.add(
        UserMeasuringPointAccess(
            user_id=user.id, measuring_point_id=mp_id, granted_by_user_id=granted_by.id
        )
    )
    db.commit()


def _create_mp(
    client: TestClient,
    *,
    name: str,
    serial: str,
    mtype: str = "water",
    initial: dict[str, str] | None = None,
    bidirectional: bool = False,
    **extra: Any,
) -> dict[str, Any]:
    if initial is None:
        initial = {"water": "0"} if mtype == "water" else {"1.8.0": "0"}
    payload: dict[str, Any] = {
        "name": name,
        "type": mtype,
        "is_bidirectional": bidirectional,
        "has_dual_tariff": False,
        "serial_number": serial,
        "installed_at": "2024-01-01",
        "initial_values": initial,
        **extra,
    }
    resp = client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def _registers(mp: dict[str, Any]) -> dict[str, int]:
    return {r["obis_code"]: r["id"] for r in mp["physical_meters"][0]["registers"]}


def _add(client: TestClient, register_id: int, value: str, at: str) -> None:
    resp = client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": value, "reading_at": at},
    )
    assert resp.status_code == 201, resp.text


def _agg(client: TestClient, **params: Any) -> dict[str, Any]:
    resp = client.get("/api/v1/reports/aggregate", params=params)
    assert resp.status_code == 200, resp.text
    return cast(dict[str, Any], resp.json())


def test_total_sum_by_kostenstelle(admin_client: TestClient) -> None:
    a = _create_mp(admin_client, name="A", serial="SN-A", kostenstelle=10001)
    b = _create_mp(admin_client, name="B", serial="SN-B", kostenstelle=10001)
    c = _create_mp(admin_client, name="C", serial="SN-C", kostenstelle=20002)
    _add(admin_client, _registers(a)["water"], "100", "2024-06-15T12:00:00Z")
    _add(admin_client, _registers(b)["water"], "50", "2024-06-15T12:00:00Z")
    _add(admin_client, _registers(c)["water"], "30", "2024-06-15T12:00:00Z")

    body = _agg(admin_client, dimension="kostenstelle", granularity="total")
    assert body["partial"] is False
    by_group = {r["group_label"]: r for r in body["rows"]}
    assert float(by_group["10001"]["consumption"]) == 150.0
    assert by_group["10001"]["unit"] == "m³"
    assert by_group["10001"]["period_start"] is None  # Gesamt-Modus
    assert float(by_group["20002"]["consumption"]) == 30.0


def test_units_are_not_mixed(admin_client: TestClient) -> None:
    # Eine Kostenstelle mit Strom (kWh) + Wasser (m³) -> zwei getrennte Zeilen.
    strom = _create_mp(
        admin_client, name="Strom", serial="E-1", mtype="electricity", kostenstelle=30003
    )
    wasser = _create_mp(admin_client, name="Wasser", serial="W-1", kostenstelle=30003)
    _add(admin_client, _registers(strom)["1.8.0"], "200", "2024-06-15T12:00:00Z")
    _add(admin_client, _registers(wasser)["water"], "40", "2024-06-15T12:00:00Z")

    body = _agg(admin_client, dimension="kostenstelle", granularity="total")
    rows = [r for r in body["rows"] if r["group_label"] == "30003"]
    units = {r["unit"]: float(r["consumption"]) for r in rows}
    assert units == {"kWh": 200.0, "m³": 40.0}


def test_null_kostenstelle_bucket(admin_client: TestClient) -> None:
    a = _create_mp(admin_client, name="A", serial="SN-A")  # keine Kostenstelle
    _add(admin_client, _registers(a)["water"], "10", "2024-06-15T12:00:00Z")
    body = _agg(admin_client, dimension="kostenstelle", granularity="total")
    row = next(r for r in body["rows"] if r["group_label"] == "ohne Kostenstelle")
    assert row["group_key"] is None
    assert float(row["consumption"]) == 10.0


def test_total_equals_month_sum(admin_client: TestClient) -> None:
    a = _create_mp(admin_client, name="A", serial="SN-A", kostenstelle=40004)
    reg = _registers(a)["water"]
    _add(admin_client, reg, "10", "2024-01-15T12:00:00Z")
    _add(admin_client, reg, "30", "2024-02-15T12:00:00Z")
    _add(admin_client, reg, "60", "2024-03-15T12:00:00Z")

    total = _agg(admin_client, dimension="kostenstelle", granularity="total")
    total_val = next(r for r in total["rows"] if r["group_label"] == "40004")["consumption"]

    month = _agg(admin_client, dimension="kostenstelle", granularity="month")
    month_sum = sum(float(r["consumption"]) for r in month["rows"] if r["group_label"] == "40004")
    assert float(total_val) == month_sum == 60.0


def test_feed_in_is_excluded(admin_client: TestClient) -> None:
    mp = _create_mp(
        admin_client,
        name="PV",
        serial="E-PV",
        mtype="electricity",
        bidirectional=True,
        initial={"1.8.0": "0", "2.8.0": "0"},
        kostenstelle=50005,
    )
    regs = _registers(mp)
    _add(admin_client, regs["1.8.0"], "100", "2024-06-15T12:00:00Z")  # Bezug
    _add(admin_client, regs["2.8.0"], "30", "2024-06-15T12:00:00Z")  # Einspeisung

    body = _agg(admin_client, dimension="kostenstelle", granularity="total")
    rows = [r for r in body["rows"] if r["group_label"] == "50005"]
    # Nur Bezug zählt; Einspeisung (2.8.0) ist nicht enthalten -> genau eine Zeile, 100.
    assert len(rows) == 1
    assert float(rows[0]["consumption"]) == 100.0


def test_dimension_meter_type(admin_client: TestClient) -> None:
    strom = _create_mp(admin_client, name="S", serial="E-1", mtype="electricity")
    wasser = _create_mp(admin_client, name="W", serial="W-1")
    _add(admin_client, _registers(strom)["1.8.0"], "70", "2024-06-15T12:00:00Z")
    _add(admin_client, _registers(wasser)["water"], "20", "2024-06-15T12:00:00Z")
    body = _agg(admin_client, dimension="meter_type", granularity="total")
    by_label = {r["group_label"]: r for r in body["rows"]}
    assert float(by_label["Strom"]["consumption"]) == 70.0
    assert float(by_label["Wasser"]["consumption"]) == 20.0


def test_dimension_measuring_point(admin_client: TestClient) -> None:
    # Je Zähler eine Zeile: group_label = MP-Name, group_key = MP-ID, Summe im Zeitraum.
    a = _create_mp(admin_client, name="Halle Nord", serial="W-N")
    b = _create_mp(admin_client, name="Halle Süd", serial="W-S")
    _add(admin_client, _registers(a)["water"], "90", "2024-06-15T12:00:00Z")
    _add(admin_client, _registers(b)["water"], "40", "2024-06-15T12:00:00Z")

    body = _agg(admin_client, dimension="measuring_point", granularity="total")
    by_label = {r["group_label"]: r for r in body["rows"]}
    assert set(by_label) == {"Halle Nord", "Halle Süd"}
    assert by_label["Halle Nord"]["group_key"] == a["id"]
    assert float(by_label["Halle Nord"]["consumption"]) == 90.0
    assert float(by_label["Halle Süd"]["consumption"]) == 40.0


def test_dimension_owner(admin_client: TestClient) -> None:
    owner = admin_client.post("/api/v1/owners", json={"name": "Mustermann GmbH"})
    assert owner.status_code == 201, owner.text
    owner_id = owner.json()["id"]
    a = _create_mp(
        admin_client, name="A", serial="SN-A", owner_id=owner_id, owner_valid_from="2024-01-01"
    )
    _add(admin_client, _registers(a)["water"], "15", "2024-06-15T12:00:00Z")
    body = _agg(admin_client, dimension="owner", granularity="total")
    by_label = {r["group_label"]: r for r in body["rows"]}
    assert float(by_label["Mustermann GmbH"]["consumption"]) == 15.0
    assert by_label["Mustermann GmbH"]["group_key"] == owner_id


def test_recorder_partial_and_filtered(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    a = _create_mp(admin_client, name="A", serial="SN-A", kostenstelle=60006)
    b = _create_mp(admin_client, name="B", serial="SN-B", kostenstelle=60006)
    _add(admin_client, _registers(a)["water"], "100", "2024-06-15T12:00:00Z")
    _add(admin_client, _registers(b)["water"], "100", "2024-06-15T12:00:00Z")
    _grant(db, user=recorder_user, mp_id=a["id"], granted_by=admin_user)  # nur A

    body = _agg(recorder_client, dimension="kostenstelle", granularity="total")
    assert body["partial"] is True
    row = next(r for r in body["rows"] if r["group_label"] == "60006")
    # Recorder sieht nur A -> Summe 100, nicht 200.
    assert float(row["consumption"]) == 100.0


def test_recorder_without_access_sees_empty(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    a = _create_mp(admin_client, name="A", serial="SN-A", kostenstelle=70007)
    _add(admin_client, _registers(a)["water"], "100", "2024-06-15T12:00:00Z")
    body = _agg(recorder_client, dimension="kostenstelle", granularity="total")
    assert body["partial"] is True
    assert body["rows"] == []


def test_invalid_dimension_422(admin_client: TestClient) -> None:
    resp = admin_client.get(
        "/api/v1/reports/aggregate", params={"dimension": "nonsense", "granularity": "total"}
    )
    assert resp.status_code == 422


def test_csv_export(admin_client: TestClient) -> None:
    a = _create_mp(admin_client, name="A", serial="SN-A", kostenstelle=80008)
    _add(admin_client, _registers(a)["water"], "42", "2024-06-15T12:00:00Z")
    resp = admin_client.get(
        "/api/v1/reports/aggregate.csv",
        params={"dimension": "kostenstelle", "granularity": "total"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("text/csv")
    text = resp.text
    # Deutsches Excel-CSV: Semikolon-Delimiter + UTF-8-BOM.
    assert text.startswith("﻿")
    assert "Dimension;Gruppe;Zählerart;Einheit" in text
    # Zeile: Kostenstelle;80008;Wasser;m³;;;42  (Gesamt-Modus -> keine Perioden)
    assert "Kostenstelle;80008;Wasser;m³;;;" in text
    data_line = next(line for line in text.splitlines() if line.startswith("Kostenstelle;80008"))
    assert float(data_line.rsplit(";", 1)[1]) == 42.0


def test_csv_export_dimension_measuring_point(admin_client: TestClient) -> None:
    # Regression: Dimension "Messstelle" hatte kein CSV-Label -> KeyError -> 500.
    a = _create_mp(admin_client, name="Halle Nord", serial="W-N")
    _add(admin_client, _registers(a)["water"], "42", "2024-06-15T12:00:00Z")
    resp = admin_client.get(
        "/api/v1/reports/aggregate.csv",
        params={"dimension": "measuring_point", "granularity": "total"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("text/csv")
    assert "Messstelle;Halle Nord;Wasser;m³;;;" in resp.text


def test_csv_export_german_number_and_date_format(admin_client: TestClient) -> None:
    # Deutsches Excel-Format: ; -Trennung, Komma-Dezimal, Perioden als TT.MM.JJJJ.
    a = _create_mp(admin_client, name="A", serial="SN-A", kostenstelle=90009)
    reg = _registers(a)["water"]
    _add(admin_client, reg, "10", "2024-01-15T12:00:00Z")
    _add(admin_client, reg, "12.5", "2024-02-15T12:00:00Z")  # Verbrauch 2,5

    resp = admin_client.get(
        "/api/v1/reports/aggregate.csv",
        params={"dimension": "kostenstelle", "granularity": "month"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.text.startswith("﻿")
    # Zwei Monats-Buckets: Januar (10) und Februar (2,5). Den Februar-Bucket
    # gezielt prüfen: Komma-Dezimal + Periode_bis als TT.MM.JJJJ (29.02.2024).
    feb = next(
        line
        for line in resp.text.splitlines()
        if line.startswith("Kostenstelle;90009") and line.endswith(";2,5")
    )
    cols = feb.split(";")
    assert cols[-1] == "2,5"  # Komma-Dezimal, kein Punkt
    assert cols[5] == "29.02.2024", cols


def test_csv_export_escapes_formula_injection(admin_client: TestClient) -> None:
    # MP-Name, der mit "=" beginnt, darf in Excel nicht als Formel laufen ->
    # group_label wird mit Apostroph entschärft.
    a = _create_mp(admin_client, name="=Tricky", serial="W-T")
    _add(admin_client, _registers(a)["water"], "5", "2024-06-15T12:00:00Z")
    resp = admin_client.get(
        "/api/v1/reports/aggregate.csv",
        params={"dimension": "measuring_point", "granularity": "total"},
    )
    assert resp.status_code == 200, resp.text
    assert "Messstelle;'=Tricky;Wasser;m³;;;" in resp.text


def test_all_dimensions_have_csv_label() -> None:
    # Wächter: jede ReportDimension braucht ein CSV-Label, sonst 500 beim Export.
    from meters.api.v1.reports import _DIMENSION_LABELS
    from meters.models import ReportDimension

    assert set(_DIMENSION_LABELS) == set(ReportDimension)
