"""GET /billing-circles/{id}/readings - Monatsend-Staende aus echten Ablesungen (Phase 4b).

Nur fiktive Werte (oeffentliches Repo).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, cast

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.models import PhysicalMeter, Reading, Register, User

BASE = "/api/v1/billing-circles"


def _ok(resp: Any, status: int = 200) -> dict[str, Any]:
    assert resp.status_code == status, resp.text
    return cast(dict[str, Any], resp.json())


def _mp(client: TestClient, name: str, factor: int | None = None) -> int:
    body: dict[str, Any] = {
        "name": name,
        "type": "electricity",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": f"TEST-{name}",
        "installed_at": "2024-01-01",
        "initial_values": {"1.8.0": "0"},
    }
    if factor is not None:
        body["transformer_factor"] = factor
    return int(_ok(client.post("/api/v1/measuring-points", json=body), 201)["id"])


def _stand(db: Session, user: User, mp_id: int, serial: str, tag: str, wert: str) -> None:
    reg = db.scalars(
        select(Register)
        .join(PhysicalMeter)
        .where(PhysicalMeter.measuring_point_id == mp_id, PhysicalMeter.serial_number == serial)
    ).one()
    db.add(
        Reading(
            register_id=reg.id,
            value=Decimal(wert),
            # 10:00 UTC liegt in Europe/Berlin am selben Kalendertag
            reading_at=datetime.fromisoformat(f"{tag}T10:00:00"),
            created_by_user_id=user.id,
        )
    )
    db.commit()


def _position(client: TestClient, cid: int, **body: Any) -> None:
    _ok(client.post(f"{BASE}/{cid}/positions", json={"valid_from": "2026-01-01", **body}), 201)


def test_monatsend_staende_je_position(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    kreis = {
        "code": "NORD",
        "name": "Musterhof",
        "rechnungsleger": "Musterhof GmbH",
        "abnahmestelle": "AID-000001",
    }
    cid = int(_ok(admin_client.post(BASE, json=kreis), 201)["id"])
    stall = _mp(admin_client, "Stall", factor=40)
    pumpe = _mp(admin_client, "Pumpe")
    owner = int(_ok(admin_client.post("/api/v1/owners", json={"name": "Muster KG"}), 201)["id"])
    _position(admin_client, cid, label="Stall", kind="meter", measuring_point_id=stall)
    _position(admin_client, cid, label="Pumpe", kind="meter", measuring_point_id=pumpe)
    _position(
        admin_client,
        cid,
        label="Rest",
        kind="rest",
        owner_id=owner,
        kostenstelle=10101,
        sort_order=9,
    )

    # Stall: abgelesen am 31.07., interpoliert zum 31.08. (30.08. 150, 01.09. 170 -> 160)
    _stand(db, admin_user, stall, "TEST-Stall", "2026-07-31", "100")
    _stand(db, admin_user, stall, "TEST-Stall", "2026-08-30", "150")
    _stand(db, admin_user, stall, "TEST-Stall", "2026-09-01", "170")
    # Pumpe: Zaehlertausch am 15.08.
    _stand(db, admin_user, pumpe, "TEST-Pumpe", "2026-07-31", "500")
    tausch = admin_client.post(
        f"/api/v1/measuring-points/{pumpe}/replace-meter",
        json={
            "final_readings": {"1.8.0": "560"},
            "removed_at": "2026-08-15",
            "new_serial_number": "TEST-Pumpe-2",
            "installed_at": "2026-08-15",
            "initial_readings": {"1.8.0": "0"},
        },
    )
    assert tausch.status_code == 200, tausch.text
    _stand(db, admin_user, pumpe, "TEST-Pumpe-2", "2026-08-31", "25")

    erg = _ok(admin_client.get(f"{BASE}/{cid}/readings", params={"monat": "2026-08"}))
    assert (erg["stichtag_alt"], erg["stichtag_neu"]) == ("2026-07-31", "2026-08-31")
    assert erg["max_abstand_tage"] == 3
    zeilen = {z["label"]: z for z in erg["positions"]}
    assert list(zeilen) == ["Pumpe", "Stall", "Rest"]

    s = zeilen["Stall"]
    assert s["transformer_factor"] == 40
    assert s["stand_alt"]["art"] == "abgelesen"
    assert (s["stand_neu"]["wert"], s["stand_neu"]["art"]) == ("160.000", "interpoliert")
    assert s["kwh"] == "2400.000"  # (160 - 100) x 40

    p = zeilen["Pumpe"]
    assert p["serial_numbers"] == "TEST-Pumpe / TEST-Pumpe-2"
    assert (p["stand_alt"]["wert"], p["stand_neu"]["wert"]) == ("0", "25")
    assert p["korrektur_kwh"] == "60"
    assert "TEST-Pumpe" in p["korrektur_note"]
    assert p["kwh"] == "85"

    assert zeilen["Rest"]["kind"] == "rest"
    assert zeilen["Rest"]["stand_alt"] is None
    assert [(f["label"], f["code"]) for f in erg["findings"]] == [("Pumpe", "zaehlertausch")]


def test_monat_ungueltig_und_nur_admin(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    for monat in ("2026-13", "0000-01", "2026-8", "x"):
        assert admin_client.get(f"{BASE}/1/readings", params={"monat": monat}).status_code == 422
    assert admin_client.get(f"{BASE}/999/readings", params={"monat": "2026-08"}).status_code == 404
    assert recorder_client.get(f"{BASE}/1/readings", params={"monat": "2026-08"}).status_code == 403
