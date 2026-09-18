"""Wandlerfaktor je Zaehlergeraet (PhysicalMeter).

Der Faktor gehoert zur Einbausituation (Wandler) und wechselt praktisch nur mit dem
Geraet. Er haengt deshalb am PhysicalMeter; der Verbrauch jeder Ablesung wird mit dem
Faktor des Geraets gerechnet, an dem sie haengt. So
bleiben fruehere Monate richtig, wenn ein neuer Zaehler einen anderen Faktor hat. ``MeasuringPoint``
zeigt weiterhin den Faktor des aktiven Geraets (API-kompatibel).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, cast

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.models import MonthlyConsumption, PhysicalMeter, Register


def _create(client: TestClient, factor: int | None = 50) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "Strom Wandler",
        "type": "electricity",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": "W-1",
        "installed_at": "2024-01-01",
        "initial_values": {"1.8.0": "100"},
    }
    if factor is not None:
        payload["transformer_factor"] = factor
    resp = client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def _reading(client: TestClient, register_id: int, value: str, at: str) -> None:
    resp = client.post(
        "/api/v1/readings", json={"register_id": register_id, "value": value, "reading_at": at}
    )
    assert resp.status_code == 201, resp.text


def _replace(client: TestClient, mp_id: int, **extra: Any) -> dict[str, Any]:
    resp = client.post(
        f"/api/v1/measuring-points/{mp_id}/replace-meter",
        json={
            "final_readings": {"1.8.0": "120"},
            "removed_at": "2024-03-01",
            "new_serial_number": "W-2",
            "installed_at": "2024-03-01",
            "initial_readings": {"1.8.0": "0"},
            **extra,
        },
    )
    assert resp.status_code == 200, resp.text
    return cast(dict[str, Any], resp.json())


def _meter(mp: dict[str, Any], serial: str) -> dict[str, Any]:
    return next(m for m in mp["physical_meters"] if m["serial_number"] == serial)


def _monthly_total(db: Session, mp_id: int) -> Decimal:
    db.expire_all()
    rows = db.scalars(
        select(MonthlyConsumption.consumption)
        .join(Register, MonthlyConsumption.register_id == Register.id)
        .join(PhysicalMeter, Register.physical_meter_id == PhysicalMeter.id)
        .where(PhysicalMeter.measuring_point_id == mp_id)
    )
    return sum(rows, start=Decimal("0"))


def test_faktor_wird_beim_anlegen_am_ersten_zaehler_gespeichert(admin_client: TestClient) -> None:
    mp = _create(admin_client, 50)
    assert mp["transformer_factor"] == 50
    assert mp["physical_meters"][0]["transformer_factor"] == 50


def test_zaehlertausch_ohne_angabe_uebernimmt_den_faktor(admin_client: TestClient) -> None:
    mp = _replace(admin_client, _create(admin_client, 50)["id"])
    assert _meter(mp, "W-2")["transformer_factor"] == 50 and mp["transformer_factor"] == 50


def test_zaehlertausch_mit_neuem_oder_ohne_faktor(admin_client: TestClient) -> None:
    mp = _replace(admin_client, _create(admin_client, 50)["id"], new_transformer_factor=80)
    assert _meter(mp, "W-1")["transformer_factor"] == 50
    assert _meter(mp, "W-2")["transformer_factor"] == 80 and mp["transformer_factor"] == 80
    ohne = _replace(admin_client, _create(admin_client, 50)["id"], new_transformer_factor=None)
    assert _meter(ohne, "W-2")["transformer_factor"] is None and ohne["transformer_factor"] is None


def test_zaehlertausch_lehnt_ungueltigen_faktor_ab(admin_client: TestClient) -> None:
    mp_id = _create(admin_client, 50)["id"]
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp_id}/replace-meter",
        json={
            "final_readings": {"1.8.0": "120"},
            "removed_at": "2024-03-01",
            "new_serial_number": "W-2",
            "installed_at": "2024-03-01",
            "initial_readings": {"1.8.0": "0"},
            "new_transformer_factor": 0,
        },
    )
    assert resp.status_code == 422


def test_verbrauch_und_monats_cache_nutzen_den_faktor_des_jeweiligen_zaehlers(
    admin_client: TestClient, db: Session
) -> None:
    mp = _create(admin_client, 50)
    alt = mp["physical_meters"][0]["registers"][0]["id"]
    _reading(admin_client, alt, "110", "2024-02-01T12:00:00")
    mp = _replace(admin_client, mp["id"], new_transformer_factor=80)
    neu = _meter(mp, "W-2")["registers"][0]["id"]
    _reading(admin_client, neu, "5", "2024-04-01T12:00:00")

    # (110-100)*50 + (120-110)*50 + (5-0)*80 = 1400
    assert _monthly_total(db, mp["id"]) == Decimal("1400")
    resp = admin_client.get(
        f"/api/v1/measuring-points/{mp['id']}/consumption", params={"granularity": "day"}
    )
    assert resp.status_code == 200, resp.text
    tage = sum((Decimal(p["consumption"]) for p in resp.json()), Decimal("0"))  # taggenau
    assert tage.quantize(Decimal("0.001")) == Decimal("1400.000")


def test_faktor_am_zaehler_korrigieren_rechnet_den_cache_neu(
    admin_client: TestClient, db: Session
) -> None:
    mp = _create(admin_client, 50)
    alt = mp["physical_meters"][0]
    _reading(admin_client, alt["registers"][0]["id"], "110", "2024-02-01T12:00:00")
    mp = _replace(admin_client, mp["id"], new_transformer_factor=80)
    _reading(admin_client, _meter(mp, "W-2")["registers"][0]["id"], "5", "2024-04-01T12:00:00")

    resp = admin_client.patch(
        f"/api/v1/physical-meters/{alt['id']}", json={"transformer_factor": 60}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["transformer_factor"] == 60
    assert _monthly_total(db, mp["id"]) == Decimal("1600")  # 20*60 + 5*80

    resp = admin_client.patch(
        f"/api/v1/physical-meters/{alt['id']}", json={"clear_transformer_factor": True}
    )
    assert resp.json()["transformer_factor"] is None
    assert _monthly_total(db, mp["id"]) == Decimal("420")  # 20*1 + 5*80


def test_faktor_der_messstelle_aendern_betrifft_nur_den_aktiven_zaehler(
    admin_client: TestClient,
) -> None:
    mp = _replace(admin_client, _create(admin_client, 50)["id"], new_transformer_factor=80)
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}", json={"transformer_factor": 90}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["transformer_factor"] == 90
    assert (
        _meter(body, "W-1")["transformer_factor"] == 50
        and _meter(body, "W-2")["transformer_factor"] == 90
    )


def test_faktor_am_zaehler_nur_fuer_strom(admin_client: TestClient) -> None:
    resp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wasser",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "WA-1",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "1"},
        },
    )
    meter_id = resp.json()["physical_meters"][0]["id"]
    patch = admin_client.patch(
        f"/api/v1/physical-meters/{meter_id}", json={"transformer_factor": 5}
    )
    assert patch.status_code == 400


def test_zaehlertausch_lehnt_faktor_fuer_nicht_strom_ab(admin_client: TestClient) -> None:
    mp = admin_client.post(
        "/api/v1/measuring-points",
        json={
            "name": "Wasser",
            "type": "water",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": "WA-1",
            "installed_at": "2024-01-01",
            "initial_values": {"water": "1"},
        },
    ).json()
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/replace-meter",
        json={
            "final_readings": {"water": "5"},
            "removed_at": "2024-03-01",
            "new_serial_number": "WA-2",
            "installed_at": "2024-03-01",
            "initial_readings": {"water": "0"},
            "new_transformer_factor": 50,
        },
    )
    assert resp.status_code == 400, resp.text


def test_faktor_der_messstelle_ohne_aktiven_zaehler_ist_konflikt(admin_client: TestClient) -> None:
    mp = _create(admin_client)
    meter_id = mp["physical_meters"][0]["id"]
    ausbau = admin_client.patch(
        f"/api/v1/physical-meters/{meter_id}", json={"removed_at": "2024-06-30"}
    )
    assert ausbau.status_code == 200, ausbau.text
    for body in ({"transformer_factor": 80}, {"clear_transformer_factor": True}):
        resp = admin_client.patch(f"/api/v1/measuring-points/{mp['id']}", json=body)
        assert resp.status_code == 409, resp.text
