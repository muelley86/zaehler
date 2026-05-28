from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from meters.db import SessionLocal
from meters.models import User, UserMeasuringPointAccess


def _create_main_loc(client: TestClient, name: str, note: str | None = None) -> int:
    resp = client.post("/api/v1/main-locations", json={"name": name, "note": note})
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _create_loc(
    client: TestClient,
    name: str,
    *,
    main_id: int | None = None,
    note: str | None = None,
) -> int:
    body: dict[str, Any] = {"name": name, "note": note}
    if main_id is not None:
        body["main_location_id"] = main_id
    resp = client.post("/api/v1/locations", json=body)
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _create_mp(
    client: TestClient,
    name: str,
    serial: str,
    *,
    location_id: int | None = None,
    contract_number: str | None = None,
    market_location: str | None = None,
) -> int:
    body: dict[str, Any] = {
        "name": name,
        "type": "electricity",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": serial,
        "installed_at": "2024-01-01",
        "initial_values": {"1.8.0": "0"},
    }
    if location_id is not None:
        body["location_id"] = location_id
    if contract_number is not None:
        body["contract_number"] = contract_number
    if market_location is not None:
        body["market_location"] = market_location
    resp = client.post("/api/v1/measuring-points", json=body)
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def test_short_query_returns_empty(admin_client: TestClient) -> None:
    assert admin_client.get("/api/v1/search?q=a").json() == []
    assert admin_client.get("/api/v1/search?q=").json() == []


def test_match_by_serial_number(admin_client: TestClient) -> None:
    _create_mp(admin_client, "Strom Keller", "1ZSP12345")
    hits = admin_client.get("/api/v1/search?q=12345").json()
    assert len(hits) == 1
    assert hits[0]["matched_via"] == "serial"
    assert hits[0]["matched_detail"] == "1ZSP12345"
    assert hits[0]["measuring_point_name"] == "Strom Keller"


def test_match_by_name(admin_client: TestClient) -> None:
    _create_mp(admin_client, "Wasser Garten", "W-001")
    hits = admin_client.get("/api/v1/search?q=garten").json()
    assert len(hits) == 1
    assert hits[0]["matched_via"] == "name"


def test_match_by_location_and_main_location(admin_client: TestClient) -> None:
    main_id = _create_main_loc(admin_client, "Hauptgebaeude")
    loc_id = _create_loc(admin_client, "Heizungskeller", main_id=main_id)
    _create_mp(admin_client, "Heizung", "H-1", location_id=loc_id)
    # Hauptstandort-Treffer
    hits_main = admin_client.get("/api/v1/search?q=hauptgeb").json()
    assert any(h["matched_via"] == "main_location" for h in hits_main)
    # Zaehlerstandort-Treffer
    hits_loc = admin_client.get("/api/v1/search?q=heizungs").json()
    assert any(h["matched_via"] == "location" for h in hits_loc)


def test_match_by_location_note_and_main_location_note(admin_client: TestClient) -> None:
    main_id = _create_main_loc(admin_client, "Anbau", note="Zwischenetage Nord")
    loc_id = _create_loc(admin_client, "Lager", main_id=main_id, note="Tor zur Garage")
    _create_mp(admin_client, "Wasser Lager", "W-LAGER", location_id=loc_id)
    hits = admin_client.get("/api/v1/search?q=garage").json()
    assert any(h["matched_via"] == "location_note" for h in hits)
    hits2 = admin_client.get("/api/v1/search?q=zwischenetage").json()
    assert any(h["matched_via"] == "main_location_note" for h in hits2)


def test_priority_serial_beats_name(admin_client: TestClient) -> None:
    # Serial enthaelt den Such-Begriff UND der Name auch — Serial gewinnt.
    _create_mp(admin_client, "Strom NUMMER", "NUMMER-99")
    hits = admin_client.get("/api/v1/search?q=nummer").json()
    assert hits[0]["matched_via"] == "serial"


def test_limit_parameter(admin_client: TestClient) -> None:
    for i in range(5):
        _create_mp(admin_client, f"Strom-{i}", f"SN-{i:04d}")
    hits = admin_client.get("/api/v1/search?q=strom&limit=2").json()
    assert len(hits) == 2


def test_distinct_results_no_dup(admin_client: TestClient) -> None:
    # MP mit mehreren PhysicalMetern (via replace-meter) — distinct sorgt dafuer,
    # dass keine doppelten Eintraege auftauchen.
    mp_id = _create_mp(admin_client, "Strom Duplikat", "OLD-DUP")
    admin_client.post(
        f"/api/v1/measuring-points/{mp_id}/replace-meter",
        json={
            "final_readings": {"1.8.0": "100"},
            "removed_at": "2024-06-01",
            "new_serial_number": "NEW-DUP",
            "installed_at": "2024-06-01",
            "initial_readings": {"1.8.0": "0"},
        },
    )
    hits = admin_client.get("/api/v1/search?q=dup").json()
    # MP-Name enthaelt "Dup" + zwei PhysicalMeter mit "DUP" → trotzdem nur EIN Hit.
    ids = [h["measuring_point_id"] for h in hits]
    assert ids.count(mp_id) == 1


def test_match_by_contract_number(admin_client: TestClient) -> None:
    _create_mp(
        admin_client,
        "Strom-Vertrag",
        "SN-CN-1",
        contract_number="VC-987654",
    )
    hits = admin_client.get("/api/v1/search?q=987654").json()
    assert len(hits) == 1
    assert hits[0]["matched_via"] == "contract_number"
    assert hits[0]["matched_detail"] == "VC-987654"


def test_match_by_market_location(admin_client: TestClient) -> None:
    _create_mp(
        admin_client,
        "Strom-MaLo",
        "SN-ML-1",
        market_location="DE12345678901",
    )
    hits = admin_client.get("/api/v1/search?q=12345678901").json()
    assert len(hits) == 1
    assert hits[0]["matched_via"] == "market_location"
    assert hits[0]["matched_detail"] == "DE12345678901"


def test_priority_contract_beats_name(admin_client: TestClient) -> None:
    # Name UND contract_number enthalten "PRIO" — contract gewinnt (Prio 2 < 4).
    _create_mp(
        admin_client,
        "Strom-PRIO-Name",
        "SN-PR-1",
        contract_number="PRIO-CONTRACT",
    )
    hits = admin_client.get("/api/v1/search?q=prio").json()
    assert hits[0]["matched_via"] == "contract_number"


def _create_owner_with_name(client: TestClient, name: str, note: str | None = None) -> int:
    resp = client.post("/api/v1/owners", json={"name": name, "note": note})
    return int(resp.json()["id"])


def test_match_by_current_owner_name(admin_client: TestClient) -> None:
    owner_id = _create_owner_with_name(admin_client, "Mueller GmbH")
    _create_mp(admin_client, "Strom-Mueller", "SN-MUE-1")
    admin_client.post(
        "/api/v1/measuring-points/1/change-owner",
        json={"owner_id": owner_id, "valid_from": "2025-01-01"},
    )
    hits = admin_client.get("/api/v1/search?q=mueller").json()
    assert any(h["matched_via"] == "owner" for h in hits)


def test_match_by_historical_owner_name(admin_client: TestClient) -> None:
    a = _create_owner_with_name(admin_client, "Hist-Owner-Schmidt")
    b = _create_owner_with_name(admin_client, "Aktuell-Owner-Becker")
    mp_id = _create_mp(admin_client, "Strom-Hist", "SN-HIS-1")
    # Erst Schmidt anlegen, dann Becker — Schmidt ist historisch.
    admin_client.post(
        f"/api/v1/measuring-points/{mp_id}/change-owner",
        json={"owner_id": a, "valid_from": "2024-01-01"},
    )
    admin_client.post(
        f"/api/v1/measuring-points/{mp_id}/change-owner",
        json={"owner_id": b, "valid_from": "2025-06-01"},
    )
    hits = admin_client.get("/api/v1/search?q=schmidt").json()
    assert any(h["matched_via"] == "owner" and h["measuring_point_id"] == mp_id for h in hits)


def test_match_by_owner_note(admin_client: TestClient) -> None:
    owner_id = _create_owner_with_name(admin_client, "Owner-Note-X", note="VIP-Klient")
    mp_id = _create_mp(admin_client, "Strom-NoteSearch", "SN-ON-1")
    admin_client.post(
        f"/api/v1/measuring-points/{mp_id}/change-owner",
        json={"owner_id": owner_id, "valid_from": "2024-01-01"},
    )
    hits = admin_client.get("/api/v1/search?q=vip").json()
    assert any(h["matched_via"] == "owner_note" for h in hits)


def test_priority_owner_beats_name(admin_client: TestClient) -> None:
    owner_id = _create_owner_with_name(admin_client, "PRIO-OWNER-NAME")
    mp_id = _create_mp(admin_client, "Strom-PRIO-Doppel", "SN-PD-1")
    admin_client.post(
        f"/api/v1/measuring-points/{mp_id}/change-owner",
        json={"owner_id": owner_id, "valid_from": "2024-01-01"},
    )
    hits = admin_client.get("/api/v1/search?q=prio").json()
    # MP-Name UND Owner-Name enthalten „PRIO" → Owner gewinnt (Prio 4 < 5).
    assert hits[0]["matched_via"] == "owner"


def test_recorder_only_sees_own_mps(
    admin_client: TestClient,
    recorder_client: TestClient,
) -> None:
    # Admin legt zwei MPs an.
    mp_a = _create_mp(admin_client, "Strom-Recorder-Test-A", "REC-A-1")
    mp_b = _create_mp(admin_client, "Strom-Recorder-Test-B", "REC-B-1")
    # Recorder bekommt Zugriff nur auf A — direkt in der DB, weil das die
    # Test-Konvention hier ist (kein bequemer Frontend-Pfad fuer Access).
    with SessionLocal() as db:
        recorder = db.query(User).filter_by(username="recorder").one()
        admin = db.query(User).filter_by(username="admin").one()
        db.add(
            UserMeasuringPointAccess(
                user_id=recorder.id,
                measuring_point_id=mp_a,
                granted_by_user_id=admin.id,
            )
        )
        db.commit()
    hits = recorder_client.get("/api/v1/search?q=recorder").json()
    ids = {h["measuring_point_id"] for h in hits}
    assert mp_a in ids
    assert mp_b not in ids
