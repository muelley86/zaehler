"""Tests fuer den gebuendelten Dashboard-Endpoint ``GET /dashboard``.

Der Endpoint liefert alles, was das Dashboard braucht, in EINER Antwort:
Stammdaten-Minimum, aktive Register, letzte Erfassung, Verbrauchsreihe und
die Perioden-Totals (aktueller Zeitraum vs. Vorperiode).

Basis-Szenario der meisten Tests (Wasser, ``installed_at=2024-12-31`` mit
Anfangsstand 100 um 00:00:01 lokal):

    131 @ 2025-01-31  ->  Januar  31
    151 @ 2025-02-28  ->  Februar 20
    213 @ 2025-03-31  ->  Maerz   62

Die Ablesungen liegen auf Monatsgrenzen, die Monatswerte sind also exakt und
von Hand nachrechenbar.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, cast

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.models import MonthlyConsumption, User, UserMeasuringPointAccess
from meters.services.consumption import aggregate_consumption, consumption_for_measuring_point

_BASE_READINGS = (
    ("131", "2025-01-31T12:00:00"),
    ("151", "2025-02-28T12:00:00"),
    ("213", "2025-03-31T12:00:00"),
)


def _create_water_mp(
    client: TestClient,
    *,
    name: str,
    serial: str,
    installed_at: str = "2024-12-31",
    location_id: int | None = None,
    owner_id: int | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": name,
        "type": "water",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": serial,
        "installed_at": installed_at,
        "initial_values": {"water": "100"},
    }
    if location_id is not None:
        payload["location_id"] = location_id
    if owner_id is not None:
        payload["owner_id"] = owner_id
    payload.update(extra or {})
    resp = client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def _register_id(mp: dict[str, Any]) -> int:
    return int(mp["physical_meters"][0]["registers"][0]["id"])


def _add(client: TestClient, register_id: int, value: str, at: str) -> None:
    resp = client.post(
        "/api/v1/readings",
        json={"register_id": register_id, "value": value, "reading_at": at},
    )
    assert resp.status_code == 201, resp.text


def _base_mp(client: TestClient, *, name: str = "Wasser-Dash", serial: str = "SN-D-1") -> int:
    """Basis-Szenario (s. Modul-Docstring). Gibt die MP-Id zurueck."""
    mp = _create_water_mp(client, name=name, serial=serial)
    register_id = _register_id(mp)
    for value, at in _BASE_READINGS:
        _add(client, register_id, value, at)
    return int(mp["id"])


def _item(body: dict[str, Any], mp_id: int) -> dict[str, Any]:
    return cast(dict[str, Any], next(i for i in body["items"] if i["id"] == mp_id))


def _totals(item: dict[str, Any]) -> dict[str, Any]:
    """Die einzige Totals-Zeile eines Wasser-Items."""
    assert len(item["totals"]) == 1, item["totals"]
    return cast(dict[str, Any], item["totals"][0])


def _dashboard(client: TestClient, **params: str) -> dict[str, Any]:
    resp = client.get("/api/v1/dashboard", params=params)
    assert resp.status_code == 200, resp.text
    return cast(dict[str, Any], resp.json())


# ---------------------------------------------------------------------------
# Form der Antwort
# ---------------------------------------------------------------------------


def test_dashboard_item_shape_and_master_data(admin_client: TestClient) -> None:
    main_loc_id = admin_client.post("/api/v1/main-locations", json={"name": "Hof"}).json()["id"]
    loc_id = admin_client.post(
        "/api/v1/locations", json={"name": "Keller", "main_location_id": main_loc_id}
    ).json()["id"]
    owner_id = admin_client.post("/api/v1/owners", json={"name": "Meier"}).json()["id"]
    mp = _create_water_mp(
        admin_client,
        name="Wasser-Stamm",
        serial="SN-STAMM-1",
        location_id=loc_id,
        owner_id=owner_id,
        extra={"kostenstelle": 4711, "installation_location": "1. Stock"},
    )
    _add(admin_client, _register_id(mp), "131", "2025-01-31T12:00:00")

    body = _dashboard(admin_client, granularity="month")
    item = _item(body, mp["id"])

    assert item["name"] == "Wasser-Stamm"
    assert item["type"] == "water"
    assert item["location_id"] == loc_id
    assert item["location_name"] == "Keller"
    assert item["main_location_id"] == main_loc_id
    assert item["main_location_name"] == "Hof"
    assert item["current_owner_id"] == owner_id
    assert item["current_owner_name"] == "Meier"
    assert item["kostenstelle"] == 4711
    assert item["installation_location"] == "1. Stock"
    assert item["heating_source"] is None
    label = mp["physical_meters"][0]["registers"][0]["label"]
    assert item["registers"] == [{"obis_code": "water", "label": label, "unit": "m³"}]
    # readings/state sind bewusst entfallen (kein Konsument, teurer Fan-out).
    assert "readings" not in item and "state" not in item
    assert body["granularity"] == "month"
    assert body["from_date"] is None and body["to_date"] is None
    assert body["partial"] is False


def test_last_reading_at_is_max_over_active_registers(admin_client: TestClient) -> None:
    mp_id = _base_mp(admin_client)
    item = _item(_dashboard(admin_client, granularity="month"), mp_id)
    assert item["last_reading_at"] == "2025-03-31T12:00:00Z"


def test_items_sorted_by_name(admin_client: TestClient) -> None:
    _create_water_mp(admin_client, name="Zeta", serial="SN-Z")
    _create_water_mp(admin_client, name="Alpha", serial="SN-A")
    body = _dashboard(admin_client)
    assert [i["name"] for i in body["items"]] == ["Alpha", "Zeta"]


def test_rejects_inverted_range_422(admin_client: TestClient) -> None:
    resp = admin_client.get(
        "/api/v1/dashboard", params={"from_at": "2025-03-31", "to_at": "2025-03-01"}
    )
    assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# Totals
# ---------------------------------------------------------------------------


def test_totals_month_aligned_current_vs_previous_hand_computed(admin_client: TestClient) -> None:
    mp_id = _base_mp(admin_client)
    params = {"from_at": "2025-03-01", "to_at": "2025-03-31"}

    body = _dashboard(admin_client, granularity="month", **params)
    assert body["previous_from_date"] == "2025-02-01"
    assert body["previous_to_date"] == "2025-02-28"
    total = _totals(_item(body, mp_id))
    assert total["obis_code"] == "water"
    assert total["unit"] == "m³"
    assert total["direction"] == "bezug"
    assert Decimal(total["current"]) == Decimal("62")
    assert Decimal(total["previous"]) == Decimal("20")

    # Granularitaetsunabhaengig: der Tages-Pfad rechnet auf den Roh-Intervallen
    # und muss trotzdem exakt dieselben Totals liefern.
    day_total = _totals(_item(_dashboard(admin_client, granularity="day", **params), mp_id))
    assert Decimal(day_total["current"]) == Decimal("62")
    assert Decimal(day_total["previous"]) == Decimal("20")


def test_totals_non_aligned_range_prorated(admin_client: TestClient) -> None:
    mp_id = _base_mp(admin_client)
    body = _dashboard(admin_client, granularity="month", from_at="2025-02-15", to_at="2025-03-14")
    assert body["previous_from_date"] == "2025-01-18"
    assert body["previous_to_date"] == "2025-02-14"

    total = _totals(_item(body, mp_id))
    # current  = 14 Tage Februar-Anteil (20/28 je Tag) + 14 Tage Maerz (62/31 = 2)
    assert Decimal(total["current"]) == Decimal("38")
    # previous = 14 Tage Januar (31/31 = 1) + 14 Tage Februar-Anteil (20/28)
    assert Decimal(total["previous"]) == Decimal("24")


def test_totals_previous_none_without_coverage(admin_client: TestClient) -> None:
    mp_id = _base_mp(admin_client)
    empty_mp = _create_water_mp(admin_client, name="Wasser-Leer", serial="SN-LEER-1")

    body = _dashboard(admin_client, granularity="month", from_at="2025-01-01", to_at="2025-01-31")

    total = _totals(_item(body, mp_id))
    assert Decimal(total["current"]) == Decimal("31")
    # Dezember 2024 hat nur den Anfangsstand, also kein Intervall -> None (nicht "0").
    assert total["previous"] is None
    # Eine Messstelle ohne zweite Ablesung hat in keiner Periode einen Wert und
    # damit auch keinen (obis_code, unit)-Key.
    assert _item(body, empty_mp["id"])["totals"] == []


def test_totals_without_range_all_time_and_null_previous(admin_client: TestClient) -> None:
    mp_id = _base_mp(admin_client)
    body = _dashboard(admin_client)
    assert body["previous_from_date"] is None and body["previous_to_date"] is None
    total = _totals(_item(body, mp_id))
    assert Decimal(total["current"]) == Decimal("113")
    assert total["previous"] is None


# ---------------------------------------------------------------------------
# Quellenwahl (Monats-Cache vs. on-the-fly)
# ---------------------------------------------------------------------------


def test_month_and_year_granularity_read_monthly_cache(
    admin_client: TestClient, db: Session
) -> None:
    mp_id = _base_mp(admin_client)
    # Nur die Monatszeile faelschen (der Session-Hook laeuft dabei nicht) —
    # wer aus dem Cache liest, spiegelt den falschen Wert.
    db.expire_all()
    row = db.scalar(select(MonthlyConsumption).where(MonthlyConsumption.period_end == "2025-03-31"))
    assert row is not None
    row.consumption = Decimal("999")
    db.commit()

    for granularity in ("month", "year"):
        total = _totals(_item(_dashboard(admin_client, granularity=granularity), mp_id))
        assert Decimal(total["current"]) == Decimal("1050"), granularity
    # Woche rechnet on-the-fly aus den Roh-Readings und bleibt korrekt.
    week_total = _totals(_item(_dashboard(admin_client, granularity="week"), mp_id))
    assert Decimal(week_total["current"]) == Decimal("113")


def test_year_series_matches_on_the_fly_aggregation(admin_client: TestClient, db: Session) -> None:
    mp_id = _base_mp(admin_client)
    item = _item(_dashboard(admin_client, granularity="year"), mp_id)

    expected = aggregate_consumption(
        consumption_for_measuring_point(db, measuring_point_id=mp_id),
        granularity="year",
        from_date=None,
        to_date=None,
    )
    assert [
        (p["period_start"], p["period_end"], Decimal(p["consumption"])) for p in item["consumption"]
    ] == [(p.period_start.isoformat(), p.period_end.isoformat(), p.consumption) for p in expected]


# ---------------------------------------------------------------------------
# Berechtigungen
# ---------------------------------------------------------------------------


def _grant(db: Session, *, user: User, mp_id: int, granted_by: User) -> None:
    db.add(
        UserMeasuringPointAccess(
            user_id=user.id, measuring_point_id=mp_id, granted_by_user_id=granted_by.id
        )
    )
    db.commit()


def test_recorder_sees_only_granted_items_and_partial_flag(
    admin_client: TestClient,
    recorder_client: TestClient,
    db: Session,
    admin_user: User,
    recorder_user: User,
) -> None:
    granted = _create_water_mp(admin_client, name="Wasser-A", serial="SN-PA-1")
    _create_water_mp(admin_client, name="Wasser-B", serial="SN-PB-1")

    denied = _dashboard(recorder_client)
    assert denied["items"] == []
    assert denied["partial"] is True

    _grant(db, user=recorder_user, mp_id=granted["id"], granted_by=admin_user)
    body = _dashboard(recorder_client)
    assert [i["name"] for i in body["items"]] == ["Wasser-A"]
    assert body["partial"] is True

    admin_body = _dashboard(admin_client)
    assert [i["name"] for i in admin_body["items"]] == ["Wasser-A", "Wasser-B"]
    assert admin_body["partial"] is False


# ---------------------------------------------------------------------------
# Virtuelle Messstellen
# ---------------------------------------------------------------------------


def _create_electricity_mp(client: TestClient, name: str, serial: str) -> dict[str, Any]:
    resp = client.post(
        "/api/v1/measuring-points",
        json={
            "name": name,
            "type": "electricity",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": serial,
            "installed_at": "2024-12-31",
            "initial_values": {"1.8.0": "0"},
        },
    )
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def test_virtual_items_have_totals(admin_client: TestClient) -> None:
    plus = _create_electricity_mp(admin_client, "Strom-Plus", "SN-VP")
    minus = _create_electricity_mp(admin_client, "Strom-Minus", "SN-VM")
    for mp, jan, feb in ((plus, "300", "500"), (minus, "100", "150")):
        register_id = _register_id(mp)
        _add(admin_client, register_id, jan, "2025-01-31T12:00:00")
        _add(admin_client, register_id, feb, "2025-02-28T12:00:00")
    resp = admin_client.post(
        "/api/v1/virtual-measuring-points",
        json={
            "name": "Netto",
            "type": "electricity",
            "components": [
                {"measuring_point_id": plus["id"], "direction": "bezug", "sign": 1},
                {"measuring_point_id": minus["id"], "direction": "bezug", "sign": -1},
            ],
        },
    )
    assert resp.status_code == 201, resp.text

    body = _dashboard(admin_client, granularity="month", from_at="2025-02-01", to_at="2025-02-28")
    # Februar: (500-300) - (150-100) = 150; Januar: 300 - 100 = 200.
    assert body["virtual_items"][0]["totals"] == [
        {
            "obis_code": "virtual",
            "unit": "kWh",
            "direction": "bezug",
            "current": "150",
            "previous": "200",
        }
    ]
