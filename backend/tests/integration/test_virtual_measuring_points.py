"""Integrationstests fuer virtuelle (verrechnete) Messstellen.

Szenario aus der Anforderung: realer Verbrauch der Biogasanlage =
Netzbezug am Biogas-Trafo + Solar-Produktion - Solar-Einspeisung.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from meters.db import SessionLocal
from meters.models import AuditAction, AuditEntityType, AuditLog, User


def _create_mp(
    client: TestClient,
    name: str,
    serial: str,
    *,
    mp_type: str = "electricity",
    is_bidirectional: bool = False,
    installed_at: str = "2024-12-31",
) -> dict[str, Any]:
    initial: dict[str, str] = {"1.8.0": "0"} if mp_type == "electricity" else {"water": "0"}
    if is_bidirectional:
        initial["2.8.0"] = "0"
    body: dict[str, Any] = {
        "name": name,
        "type": mp_type,
        "is_bidirectional": is_bidirectional,
        "has_dual_tariff": False,
        "serial_number": serial,
        "installed_at": installed_at,
        "initial_values": initial,
    }
    resp = client.post("/api/v1/measuring-points", json=body)
    assert resp.status_code == 201, resp.text
    out: dict[str, Any] = resp.json()
    return out


def _register_id(mp: dict[str, Any], obis: str) -> int:
    for meter in mp["physical_meters"]:
        for reg in meter["registers"]:
            if reg["obis_code"] == obis:
                return int(reg["id"])
    raise AssertionError(f"Register {obis} nicht gefunden")


def _add_reading(client: TestClient, register_id: int, value: str, reading_at: str) -> None:
    resp = client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": value, "reading_at": reading_at},
    )
    assert resp.status_code == 201, resp.text


def _setup_biogas_scenario(client: TestClient) -> dict[str, Any]:
    """Drei Strom-MPs mit Januar-2025-Verbrauch:

    - Biogas-Trafo (Bezug):       0 -> 300  => Netzbezug 300 kWh
    - Solar-Erzeugung (Bezug):    0 -> 500  => Produktion 500 kWh
    - Solar-Trafo (bidirektional): 1.8.0 0 -> 10 (irrelevanter Bezug),
                                   2.8.0 0 -> 420 => Einspeisung 420 kWh

    Realverbrauch Biogasanlage Januar = 300 + 500 - 420 = 380 kWh.
    Alle Ablesungen liegen auf Monatsgrenzen (31.12. / 31.01.), damit die
    Interpolation nichts in Nachbarmonate verteilt.
    """
    biogas = _create_mp(client, "Biogas-Trafo", "SN-VB-1")
    solar_prod = _create_mp(client, "Solar-Erzeugung", "SN-VP-1")
    solar_trafo = _create_mp(client, "Solar-Trafo", "SN-VT-1", is_bidirectional=True)
    _add_reading(client, _register_id(biogas, "1.8.0"), "300", "2025-01-31T12:00:00")
    _add_reading(client, _register_id(solar_prod, "1.8.0"), "500", "2025-01-31T12:00:00")
    _add_reading(client, _register_id(solar_trafo, "1.8.0"), "10", "2025-01-31T12:00:00")
    _add_reading(client, _register_id(solar_trafo, "2.8.0"), "420", "2025-01-31T12:00:00")
    return {"biogas": biogas, "solar_prod": solar_prod, "solar_trafo": solar_trafo}


def _biogas_components(mps: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"measuring_point_id": mps["biogas"]["id"], "direction": "bezug", "sign": 1},
        {"measuring_point_id": mps["solar_prod"]["id"], "direction": "bezug", "sign": 1},
        {"measuring_point_id": mps["solar_trafo"]["id"], "direction": "einspeisung", "sign": -1},
    ]


def _create_vmp(
    client: TestClient,
    name: str,
    components: list[dict[str, Any]],
    *,
    mp_type: str = "electricity",
) -> dict[str, Any]:
    resp = client.post(
        "/api/v1/virtual-measuring-points",
        json={"name": name, "type": mp_type, "components": components},
    )
    assert resp.status_code == 201, resp.text
    out: dict[str, Any] = resp.json()
    return out


def _grant_access(db: Session, *, recorder: User, granted_by: User, mp_id: int) -> None:
    from meters.models import UserMeasuringPointAccess

    db.add(
        UserMeasuringPointAccess(
            user_id=recorder.id,
            measuring_point_id=mp_id,
            granted_by_user_id=granted_by.id,
        )
    )
    db.commit()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


def test_create_and_list_vmp(admin_client: TestClient) -> None:
    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(admin_client, "Biogasanlage real", _biogas_components(mps))
    assert vmp["name"] == "Biogasanlage real"
    assert vmp["type"] == "electricity"
    assert len(vmp["components"]) == 3
    assert vmp["components"][0]["measuring_point_name"] == "Biogas-Trafo"
    assert vmp["components"][2]["direction"] == "einspeisung"
    assert vmp["components"][2]["sign"] == -1
    listing = admin_client.get("/api/v1/virtual-measuring-points").json()
    assert [v["name"] for v in listing] == ["Biogasanlage real"]


def test_duplicate_name_409(admin_client: TestClient) -> None:
    mps = _setup_biogas_scenario(admin_client)
    _create_vmp(admin_client, "Doppelt", _biogas_components(mps))
    resp = admin_client.post(
        "/api/v1/virtual-measuring-points",
        json={"name": "Doppelt", "type": "electricity", "components": _biogas_components(mps)},
    )
    assert resp.status_code == 409


def test_validation_errors_422(admin_client: TestClient) -> None:
    mps = _setup_biogas_scenario(admin_client)
    water = _create_mp(admin_client, "Wasser-Haupt", "SN-VW-1", mp_type="water")

    def post(components: list[dict[str, Any]], mp_type: str = "electricity") -> int:
        resp = admin_client.post(
            "/api/v1/virtual-measuring-points",
            json={"name": "Kaputt", "type": mp_type, "components": components},
        )
        return resp.status_code

    # Leere Komponentenliste (Pydantic min_length=1).
    assert post([]) == 422
    # Typ-Mismatch: Wasser-MP in Strom-vmp.
    assert post([{"measuring_point_id": water["id"], "direction": "bezug", "sign": 1}]) == 422
    # Einspeisung ausserhalb Strom.
    assert (
        post(
            [{"measuring_point_id": water["id"], "direction": "einspeisung", "sign": 1}],
            mp_type="water",
        )
        == 422
    )
    # Duplikat (mp, direction).
    dup = {"measuring_point_id": mps["biogas"]["id"], "direction": "bezug", "sign": 1}
    assert post([dup, {**dup, "sign": -1}]) == 422
    # Unbekannte MP-ID -> 404.
    assert (
        admin_client.post(
            "/api/v1/virtual-measuring-points",
            json={
                "name": "Kaputt",
                "type": "electricity",
                "components": [{"measuring_point_id": 999999, "direction": "bezug", "sign": 1}],
            },
        ).status_code
        == 404
    )
    # Ungueltiges Vorzeichen (Pydantic Literal).
    assert (
        post([{"measuring_point_id": mps["biogas"]["id"], "direction": "bezug", "sign": 2}]) == 422
    )


def test_patch_replaces_components(admin_client: TestClient) -> None:
    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(admin_client, "Patch-Test", _biogas_components(mps))
    resp = admin_client.patch(
        f"/api/v1/virtual-measuring-points/{vmp['id']}",
        json={
            "name": "Patch-Test neu",
            "components": [
                {"measuring_point_id": mps["biogas"]["id"], "direction": "bezug", "sign": 1}
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()
    assert updated["name"] == "Patch-Test neu"
    assert len(updated["components"]) == 1


def test_delete_vmp(admin_client: TestClient) -> None:
    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(admin_client, "Del-Test", _biogas_components(mps))
    resp = admin_client.delete(f"/api/v1/virtual-measuring-points/{vmp['id']}")
    assert resp.status_code == 204
    assert admin_client.get("/api/v1/virtual-measuring-points").json() == []


def test_mp_delete_removes_only_component(admin_client: TestClient) -> None:
    """Loeschen einer Komponenten-MP cascadet nur die Komponenten-Zeile."""
    from meters.models import MeasuringPoint, VirtualMeasuringPoint

    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(admin_client, "Cascade-Test", _biogas_components(mps))
    with SessionLocal() as db:
        mp_obj = db.get(MeasuringPoint, mps["solar_prod"]["id"])
        assert mp_obj is not None
        db.delete(mp_obj)
        db.commit()
        vmp_obj = db.get(VirtualMeasuringPoint, vmp["id"])
        assert vmp_obj is not None
        assert len(vmp_obj.components) == 2


def test_mutations_admin_only(admin_client: TestClient, recorder_client: TestClient) -> None:
    mps = _setup_biogas_scenario(admin_client)
    body = {
        "name": "Verboten",
        "type": "electricity",
        "components": _biogas_components(mps),
    }
    assert recorder_client.post("/api/v1/virtual-measuring-points", json=body).status_code == 403
    vmp = _create_vmp(admin_client, "Admin-Only", _biogas_components(mps))
    assert (
        recorder_client.patch(
            f"/api/v1/virtual-measuring-points/{vmp['id']}", json={"name": "x"}
        ).status_code
        == 403
    )
    assert (
        recorder_client.delete(f"/api/v1/virtual-measuring-points/{vmp['id']}").status_code == 403
    )


# ---------------------------------------------------------------------------
# Sichtbarkeit fuer Recorder
# ---------------------------------------------------------------------------


def test_recorder_visibility_requires_all_components(
    admin_client: TestClient,
    recorder_client: TestClient,
    recorder_user: User,
    admin_user: User,
) -> None:
    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(admin_client, "Sichtbarkeit", _biogas_components(mps))

    # Ohne Zugriff: Liste leer, Detail + Consumption 404 (kein Existenz-Leak).
    assert recorder_client.get("/api/v1/virtual-measuring-points").json() == []
    assert recorder_client.get(f"/api/v1/virtual-measuring-points/{vmp['id']}").status_code == 404
    assert (
        recorder_client.get(f"/api/v1/virtual-measuring-points/{vmp['id']}/consumption").status_code
        == 404
    )

    # Teilzugriff (nur 2 von 3 Komponenten): weiterhin unsichtbar.
    with SessionLocal() as db:
        _grant_access(db, recorder=recorder_user, granted_by=admin_user, mp_id=mps["biogas"]["id"])
        _grant_access(
            db, recorder=recorder_user, granted_by=admin_user, mp_id=mps["solar_prod"]["id"]
        )
    assert recorder_client.get("/api/v1/virtual-measuring-points").json() == []

    # Vollzugriff: sichtbar.
    with SessionLocal() as db:
        _grant_access(
            db, recorder=recorder_user, granted_by=admin_user, mp_id=mps["solar_trafo"]["id"]
        )
    listing = recorder_client.get("/api/v1/virtual-measuring-points").json()
    assert [v["name"] for v in listing] == ["Sichtbarkeit"]
    assert recorder_client.get(f"/api/v1/virtual-measuring-points/{vmp['id']}").status_code == 200


# ---------------------------------------------------------------------------
# Verbrauchsberechnung
# ---------------------------------------------------------------------------


def test_consumption_biogas_example(admin_client: TestClient) -> None:
    """Kernrechnung: +Bezug Biogas +Produktion -Einspeisung = 300+500-420 = 380."""
    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(admin_client, "Biogasanlage real", _biogas_components(mps))
    points = admin_client.get(
        f"/api/v1/virtual-measuring-points/{vmp['id']}/consumption?granularity=month"
    ).json()
    assert len(points) == 1
    p = points[0]
    assert p["period_start"] == "2025-01-01"
    assert p["period_end"] == "2025-01-31"
    assert Decimal(p["consumption"]) == Decimal("380")
    assert p["unit"] == "kWh"
    # Der irrelevante Bezug (10 kWh) des Solar-Trafos darf NICHT einfliessen
    # (Richtungsfilter) — 380 statt 390 belegt das bereits.


def test_consumption_negative_result(admin_client: TestClient) -> None:
    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(
        admin_client,
        "Netto negativ",
        [
            {"measuring_point_id": mps["biogas"]["id"], "direction": "bezug", "sign": 1},
            {"measuring_point_id": mps["solar_prod"]["id"], "direction": "bezug", "sign": -1},
        ],
    )
    points = admin_client.get(
        f"/api/v1/virtual-measuring-points/{vmp['id']}/consumption?granularity=month"
    ).json()
    assert len(points) == 1
    assert Decimal(points[0]["consumption"]) == Decimal("-200")


def test_consumption_default_granularity_is_day(admin_client: TestClient) -> None:
    """Ohne granularity wird auf 'day' zurueckgefallen (Rohintervalle
    verschiedener Zaehler sind nicht deckungsgleich)."""
    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(admin_client, "Tagesfallback", _biogas_components(mps))
    points = admin_client.get(f"/api/v1/virtual-measuring-points/{vmp['id']}/consumption").json()
    # 31 Tagesbuckets im Januar; Summe == Monatswert.
    assert len(points) == 31
    assert points[0]["period_start"] == points[0]["period_end"] == "2025-01-01"
    total = sum(Decimal(p["consumption"]) for p in points)
    assert total == Decimal("380")


def test_consumption_month_matches_day_sum_with_offset_readings(
    admin_client: TestClient,
) -> None:
    """Versetzte Ablesedaten: Intervall ueber die Monatsgrenze wird taggenau
    interpoliert; Monats- und Tages-Pfad ergeben dieselbe Summe."""
    a = _create_mp(admin_client, "Offset-A", "SN-OA-1")
    b = _create_mp(admin_client, "Offset-B", "SN-OB-1")
    # A: 31.12. -> 31.01. (300 kWh, komplett Januar)
    _add_reading(admin_client, _register_id(a, "1.8.0"), "300", "2025-01-31T12:00:00")
    # B: 31.12. -> 15.02. (460 kWh ueber 46 Tage: 31 Tage Januar, 15 Tage Februar)
    _add_reading(admin_client, _register_id(b, "1.8.0"), "460", "2025-02-15T12:00:00")
    vmp = _create_vmp(
        admin_client,
        "Offset-Summe",
        [
            {"measuring_point_id": a["id"], "direction": "bezug", "sign": 1},
            {"measuring_point_id": b["id"], "direction": "bezug", "sign": 1},
        ],
    )
    month_points = admin_client.get(
        f"/api/v1/virtual-measuring-points/{vmp['id']}/consumption?granularity=month"
    ).json()
    by_month = {p["period_start"]: Decimal(p["consumption"]) for p in month_points}
    # Januar: 300 (A) + 460*31/46 = 310 (B) = 610; Februar: 460*15/46 = 150.
    assert by_month["2025-01-01"] == Decimal("610")
    assert by_month["2025-02-01"] == Decimal("150")
    day_points = admin_client.get(
        f"/api/v1/virtual-measuring-points/{vmp['id']}/consumption?granularity=day"
    ).json()
    # Summe ueber ~77 nicht-terminierende Teilbetraege rundet im Decimal-
    # Kontext (28 Stellen) minimal — auf Mikro-Genauigkeit vergleichen.
    total = sum(Decimal(p["consumption"]) for p in day_points)
    assert abs(total - Decimal("760")) < Decimal("0.000001")


# ---------------------------------------------------------------------------
# Breakdown (Audit-Aufschluesselung je Komponente)
# ---------------------------------------------------------------------------


def test_breakdown_listet_komponenten_mit_vorzeichen_und_netto(admin_client: TestClient) -> None:
    """Je Komponente Rohwert + Beitrag, Netto je Einheit: 300+500-420 = 380."""
    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(admin_client, "Breakdown-vmp", _biogas_components(mps))
    data = admin_client.get(f"/api/v1/virtual-measuring-points/{vmp['id']}/breakdown").json()
    assert data["virtual_measuring_point_id"] == vmp["id"]
    assert data["from_date"] is None
    assert data["to_date"] is None
    comps = data["components"]
    assert [(c["measuring_point_name"], c["direction"], c["sign"]) for c in comps] == [
        ("Biogas-Trafo", "bezug", 1),
        ("Solar-Erzeugung", "bezug", 1),
        ("Solar-Trafo", "einspeisung", -1),
    ]
    assert [Decimal(c["consumption"]) for c in comps] == [
        Decimal("300"),
        Decimal("500"),
        Decimal("420"),
    ]
    # contribution = sign * consumption — was tatsaechlich addiert wurde.
    assert Decimal(comps[2]["contribution"]) == Decimal("-420")
    assert all(c["unit"] == "kWh" for c in comps)
    assert len(data["totals"]) == 1
    assert data["totals"][0]["unit"] == "kWh"
    assert Decimal(data["totals"][0]["net"]) == Decimal("380")
    # Der irrelevante Bezug (10 kWh) des Solar-Trafos bleibt aussen vor
    # (Richtungsfilter) — sonst stuende dort 430 statt 420.


def test_breakdown_clippt_zeitraum(admin_client: TestClient) -> None:
    """from_at/to_at clippen taggenau — Werte entsprechen dem Datumsbereich."""
    a = _create_mp(admin_client, "Clip-A", "SN-CA-1")
    b = _create_mp(admin_client, "Clip-B", "SN-CB-1")
    # Januar 2025: A 310 kWh (10/Tag), B 62 kWh (2/Tag).
    _add_reading(admin_client, _register_id(a, "1.8.0"), "310", "2025-01-31T12:00:00")
    _add_reading(admin_client, _register_id(b, "1.8.0"), "62", "2025-01-31T12:00:00")
    vmp = _create_vmp(
        admin_client,
        "Clip-vmp",
        [
            {"measuring_point_id": a["id"], "direction": "bezug", "sign": 1},
            {"measuring_point_id": b["id"], "direction": "bezug", "sign": -1},
        ],
    )
    data = admin_client.get(
        f"/api/v1/virtual-measuring-points/{vmp['id']}/breakdown"
        "?from_at=2025-01-01&to_at=2025-01-10"
    ).json()
    assert data["from_date"] == "2025-01-01"
    assert data["to_date"] == "2025-01-10"
    by_name = {c["measuring_point_name"]: c for c in data["components"]}
    assert Decimal(by_name["Clip-A"]["consumption"]) == Decimal("100")
    assert Decimal(by_name["Clip-B"]["consumption"]) == Decimal("20")
    assert Decimal(by_name["Clip-B"]["contribution"]) == Decimal("-20")
    assert Decimal(data["totals"][0]["net"]) == Decimal("80")


def test_breakdown_komponente_ohne_daten_erscheint_mit_null(admin_client: TestClient) -> None:
    """Zeitraum vor allen Ablesungen: alle Komponenten als 0-Zeile sichtbar."""
    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(admin_client, "Null-vmp", _biogas_components(mps))
    data = admin_client.get(
        f"/api/v1/virtual-measuring-points/{vmp['id']}/breakdown"
        "?from_at=2024-01-01&to_at=2024-06-30"
    ).json()
    assert len(data["components"]) == 3
    assert all(Decimal(c["consumption"]) == Decimal("0") for c in data["components"])
    assert all(c["unit"] == "kWh" for c in data["components"])
    assert Decimal(data["totals"][0]["net"]) == Decimal("0")


def test_breakdown_recorder_braucht_vollzugriff(
    admin_client: TestClient,
    recorder_client: TestClient,
    recorder_user: User,
    admin_user: User,
) -> None:
    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(admin_client, "Breakdown-Sicht", _biogas_components(mps))
    url = f"/api/v1/virtual-measuring-points/{vmp['id']}/breakdown"
    # Ohne bzw. mit Teilzugriff: 404 (kein Existenz-Leak).
    assert recorder_client.get(url).status_code == 404
    with SessionLocal() as db:
        _grant_access(db, recorder=recorder_user, granted_by=admin_user, mp_id=mps["biogas"]["id"])
        _grant_access(
            db, recorder=recorder_user, granted_by=admin_user, mp_id=mps["solar_prod"]["id"]
        )
    assert recorder_client.get(url).status_code == 404
    # Vollzugriff: 200 inkl. Werte.
    with SessionLocal() as db:
        _grant_access(
            db, recorder=recorder_user, granted_by=admin_user, mp_id=mps["solar_trafo"]["id"]
        )
    resp = recorder_client.get(url)
    assert resp.status_code == 200
    assert Decimal(resp.json()["totals"][0]["net"]) == Decimal("380")


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


def test_audit_entries(admin_client: TestClient) -> None:
    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(admin_client, "Audit-vmp", _biogas_components(mps))
    admin_client.patch(
        f"/api/v1/virtual-measuring-points/{vmp['id']}", json={"name": "Audit-vmp 2"}
    )
    admin_client.delete(f"/api/v1/virtual-measuring-points/{vmp['id']}")
    with SessionLocal() as db:
        logs = (
            db.query(AuditLog)
            .filter(AuditLog.entity_type == AuditEntityType.VIRTUAL_MEASURING_POINT)
            .order_by(AuditLog.id)
            .all()
        )
        actions = [log.action for log in logs]
        assert actions == [AuditAction.CREATE, AuditAction.UPDATE, AuditAction.DELETE]
        assert logs[0].diff is not None
        assert len(logs[0].diff["components"]) == 3
        assert logs[1].diff is not None
        assert logs[1].diff["name"] == {"from": "Audit-vmp", "to": "Audit-vmp 2"}


# ---------------------------------------------------------------------------
# Dashboard- und Reports-Integration
# ---------------------------------------------------------------------------


def test_dashboard_includes_virtual_items(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(admin_client, "Dash-vmp", _biogas_components(mps))
    data = admin_client.get("/api/v1/dashboard?granularity=month").json()
    assert len(data["virtual_items"]) == 1
    item = data["virtual_items"][0]
    assert item["id"] == vmp["id"]
    assert item["name"] == "Dash-vmp"
    assert item["type"] == "electricity"
    assert Decimal(item["consumption"][0]["consumption"]) == Decimal("380")
    # Recorder ohne Komponenten-Zugriff sieht keine virtuellen Items.
    rec = recorder_client.get("/api/v1/dashboard?granularity=month").json()
    assert rec["virtual_items"] == []


def test_reports_include_virtual_rows(admin_client: TestClient) -> None:
    mps = _setup_biogas_scenario(admin_client)
    _create_vmp(admin_client, "Report-vmp", _biogas_components(mps))
    data = admin_client.get(
        "/api/v1/reports/aggregate?dimension=measuring_point&granularity=total"
    ).json()
    virtual_rows = [r for r in data["rows"] if r["is_virtual"]]
    assert len(virtual_rows) == 1
    row = virtual_rows[0]
    assert row["group_label"] == "Report-vmp"
    assert row["direction"] == "bezug"
    assert Decimal(row["consumption"]) == Decimal("380")
    # Echte Zeilen sind nicht virtuell markiert.
    assert all(not r["is_virtual"] for r in data["rows"] if r["group_label"] == "Biogas-Trafo")

    # Mit kategorialem Filter (location) verschwinden virtuelle Zeilen.
    filtered = admin_client.get(
        "/api/v1/reports/aggregate?dimension=measuring_point&granularity=total&location_id=999"
    ).json()
    assert [r for r in filtered["rows"] if r["is_virtual"]] == []

    # meter_type-Filter wird respektiert.
    typed = admin_client.get(
        "/api/v1/reports/aggregate?dimension=measuring_point&granularity=total"
        "&meter_type=electricity"
    ).json()
    assert [r for r in typed["rows"] if r["is_virtual"]] != []
    water_only = admin_client.get(
        "/api/v1/reports/aggregate?dimension=measuring_point&granularity=total&meter_type=water"
    ).json()
    assert [r for r in water_only["rows"] if r["is_virtual"]] == []

    # Andere Dimensionen enthalten keine virtuellen Zeilen.
    by_owner = admin_client.get(
        "/api/v1/reports/aggregate?dimension=owner&granularity=total"
    ).json()
    assert [r for r in by_owner["rows"] if r["is_virtual"]] == []


def test_reports_csv_marks_virtual_group_id(admin_client: TestClient) -> None:
    mps = _setup_biogas_scenario(admin_client)
    vmp = _create_vmp(admin_client, "CSV-vmp", _biogas_components(mps))
    resp = admin_client.get(
        "/api/v1/reports/aggregate.csv?dimension=measuring_point&granularity=total"
    )
    assert resp.status_code == 200
    assert f"V{vmp['id']}" in resp.text
