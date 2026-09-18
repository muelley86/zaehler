"""Kostenstelle mit Gueltigkeitszeitraum (Migration 0036).

Die Kostenstelle einer Messstelle ist periodisiert wie Eigentuemer/Mieter (halboffenes Intervall
``[valid_from, valid_to)``, hoechstens eine offene Periode). ``MeasuringPoint.kostenstelle`` in der
API ist der Wert der offenen Periode; die Abrechnung liest den Wert zum Stichtag.
"""

from __future__ import annotations

from datetime import date
from typing import Any, cast

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from meters.models import AuditAction, AuditLog
from meters.services.kostenstelle_assignment import kostenstellen_am


def _create(client: TestClient, kostenstelle: int | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "Strom Stall",
        "type": "electricity",
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": "K-1",
        "installed_at": "2024-01-01",
        "initial_values": {"1.8.0": "0"},
    }
    if kostenstelle is not None:
        payload["kostenstelle"] = kostenstelle
    resp = client.post("/api/v1/measuring-points", json=payload)
    assert resp.status_code == 201, resp.text
    return cast(dict[str, Any], resp.json())


def _history(client: TestClient, mp_id: int) -> list[dict[str, Any]]:
    resp = client.get(f"/api/v1/measuring-points/{mp_id}/kostenstellen")
    assert resp.status_code == 200, resp.text
    return cast(list[dict[str, Any]], resp.json())


def _perioden(client: TestClient, mp_id: int) -> list[tuple[int, str, str | None]]:
    return [(p["kostenstelle"], p["valid_from"], p["valid_to"]) for p in _history(client, mp_id)]


def test_anlegen_mit_kostenstelle_oeffnet_periode_ab_einbau(admin_client: TestClient) -> None:
    mp = _create(admin_client, kostenstelle=10111)
    assert mp["kostenstelle"] == 10111
    assert _perioden(admin_client, mp["id"]) == [(10111, "2024-01-01", None)]


def test_anlegen_ohne_kostenstelle_hat_keine_periode(admin_client: TestClient) -> None:
    mp = _create(admin_client)
    assert mp["kostenstelle"] is None
    assert _history(admin_client, mp["id"]) == []


def test_wechsel_schliesst_alte_periode(admin_client: TestClient) -> None:
    mp = _create(admin_client, kostenstelle=10111)
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-kostenstelle",
        json={"kostenstelle": 98860, "valid_from": "2026-09-01"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["kostenstelle"] == 98860
    assert _perioden(admin_client, mp["id"]) == [
        (98860, "2026-09-01", None),
        (10111, "2024-01-01", "2026-09-01"),
    ]


def test_wechsel_vor_beginn_der_offenen_periode_abgelehnt(admin_client: TestClient) -> None:
    mp = _create(admin_client, kostenstelle=10111)
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-kostenstelle",
        json={"kostenstelle": 98860, "valid_from": "2023-12-31"},
    )
    assert resp.status_code == 422, resp.text


def test_wechsel_wird_protokolliert(admin_client: TestClient, db: Session) -> None:
    mp = _create(admin_client, kostenstelle=10111)
    admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/change-kostenstelle",
        json={"kostenstelle": 98860, "valid_from": "2026-09-01"},
    )
    eintrag = (
        db.query(AuditLog)
        .filter(AuditLog.action == AuditAction.KOSTENSTELLE_CHANGED)
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert eintrag is not None
    assert eintrag.entity_id == mp["id"]
    assert eintrag.diff == {"from": 10111, "to": 98860, "valid_from": "2026-09-01"}


def test_patch_setzt_erste_kostenstelle_ab_einbau(admin_client: TestClient) -> None:
    """Nachtragen einer fehlenden Kostenstelle gilt rueckwirkend ab Einbau des ersten Zaehlers."""
    mp = _create(admin_client)
    resp = admin_client.patch(f"/api/v1/measuring-points/{mp['id']}", json={"kostenstelle": 10111})
    assert resp.status_code == 200, resp.text
    assert resp.json()["kostenstelle"] == 10111
    assert _perioden(admin_client, mp["id"]) == [(10111, "2024-01-01", None)]


def test_patch_mit_stichtag_wechselt(admin_client: TestClient) -> None:
    mp = _create(admin_client, kostenstelle=10111)
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}",
        json={"kostenstelle": 98860, "kostenstelle_valid_from": "2026-09-01"},
    )
    assert resp.status_code == 200, resp.text
    assert _perioden(admin_client, mp["id"]) == [
        (98860, "2026-09-01", None),
        (10111, "2024-01-01", "2026-09-01"),
    ]


def test_patch_gleicher_wert_aendert_nichts(admin_client: TestClient) -> None:
    mp = _create(admin_client, kostenstelle=10111)
    resp = admin_client.patch(f"/api/v1/measuring-points/{mp['id']}", json={"kostenstelle": 10111})
    assert resp.status_code == 200, resp.text
    assert _perioden(admin_client, mp["id"]) == [(10111, "2024-01-01", None)]


def test_patch_clear_beendet_offene_periode(admin_client: TestClient) -> None:
    mp = _create(admin_client, kostenstelle=10111)
    resp = admin_client.patch(
        f"/api/v1/measuring-points/{mp['id']}",
        json={"clear_kostenstelle": True, "kostenstelle_valid_from": "2026-01-01"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["kostenstelle"] is None
    assert _perioden(admin_client, mp["id"]) == [(10111, "2024-01-01", "2026-01-01")]


def test_historien_editor_crud_und_ueberlappung(admin_client: TestClient) -> None:
    mp = _create(admin_client)
    base = f"/api/v1/measuring-points/{mp['id']}/kostenstellen"
    alt = admin_client.post(
        base, json={"kostenstelle": 11111, "valid_from": "2024-01-01", "valid_to": "2025-01-01"}
    )
    assert alt.status_code == 201, alt.text
    neu = admin_client.post(base, json={"kostenstelle": 22222, "valid_from": "2025-01-01"})
    assert neu.status_code == 201, neu.text
    ueberlapp = admin_client.post(
        base, json={"kostenstelle": 33333, "valid_from": "2024-06-01", "valid_to": "2024-07-01"}
    )
    assert ueberlapp.status_code == 422, ueberlapp.text

    korrektur = admin_client.patch(
        f"{base}/{alt.json()['id']}",
        json={"kostenstelle": 11112, "valid_from": "2024-01-01", "valid_to": "2025-01-01"},
    )
    assert korrektur.status_code == 200, korrektur.text
    assert admin_client.get(f"/api/v1/measuring-points/{mp['id']}").json()["kostenstelle"] == 22222

    geloescht = admin_client.delete(f"{base}/{neu.json()['id']}")
    assert geloescht.status_code == 204, geloescht.text
    assert _perioden(admin_client, mp["id"]) == [(11112, "2024-01-01", "2025-01-01")]
    assert admin_client.get(f"/api/v1/measuring-points/{mp['id']}").json()["kostenstelle"] is None


def test_historien_editor_nur_admin(admin_client: TestClient, recorder_client: TestClient) -> None:
    mp = _create(admin_client, kostenstelle=10111)
    resp = recorder_client.post(
        f"/api/v1/measuring-points/{mp['id']}/kostenstellen",
        json={"kostenstelle": 1, "valid_from": "2020-01-01", "valid_to": "2021-01-01"},
    )
    assert resp.status_code in (403, 404), resp.text


def test_kostenstelle_ausserhalb_des_bereichs_abgelehnt(admin_client: TestClient) -> None:
    mp = _create(admin_client)
    resp = admin_client.post(
        f"/api/v1/measuring-points/{mp['id']}/kostenstellen",
        json={"kostenstelle": 100000, "valid_from": "2024-01-01"},
    )
    assert resp.status_code == 422, resp.text


def test_kostenstellen_am_stichtag(admin_client: TestClient, db: Session) -> None:
    a = _create(admin_client, kostenstelle=10111)
    admin_client.post(
        f"/api/v1/measuring-points/{a['id']}/change-kostenstelle",
        json={"kostenstelle": 98860, "valid_from": "2026-09-01"},
    )
    b = _create(admin_client)
    ids = [a["id"], b["id"]]
    assert kostenstellen_am(db, ids, date(2026, 8, 31)) == {a["id"]: 10111}
    # Halboffenes Intervall: am Wechseltag gilt bereits die neue Kostenstelle.
    assert kostenstellen_am(db, ids, date(2026, 9, 1)) == {a["id"]: 98860}
    assert kostenstellen_am(db, ids, date(2023, 12, 31)) == {}
