"""Zugriff auf das Abrechnungsmodul: Admin oder Benutzer mit dem Merkmal ``can_billing``.

Die kaufmaennische Abteilung soll abrechnen duerfen, ohne Vollzugriff auf die Verwaltung; ein
Erfasser ohne das Merkmal sieht das Modul nicht.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from meters.models import User

BASE = "/api/v1/billing-circles"


def test_recorder_ohne_merkmal_wird_abgewiesen(recorder_client: TestClient) -> None:
    """Alle drei Router des Moduls bleiben ohne das Merkmal verschlossen."""
    for pfad in (
        BASE,
        f"{BASE}/overview",
        f"{BASE}/unassigned-meters",
        f"{BASE}/1",
        f"{BASE}/1/positions",
        f"{BASE}/1/check",
        f"{BASE}/1/readings?monat=2026-08",
        f"{BASE}/1/invoices",
        f"{BASE}/1/runs",
    ):
        assert recorder_client.get(pfad).status_code == 403, pfad


def test_stammdaten_import_bleibt_admin_vorbehalten(
    recorder_client: TestClient, recorder_user: User, db: Session
) -> None:
    """Der Import legt Eigentuemer- und Kostenstellen-Zuordnungen beliebiger Messstellen an.

    Das ist Stammdatenpflege, nicht Abrechnung - das Merkmal darf diese Seitentuer nicht oeffnen.
    """
    recorder_user.can_billing = True
    db.commit()

    payload = {
        "format": "stromabrechnung-stammdaten",
        "version": 1,
        "valid_from": "2026-08-01",
        "circles": [],
    }
    assert recorder_client.post(f"{BASE}/import", json=payload).status_code == 403


def test_recorder_mit_merkmal_darf_abrechnen(
    recorder_client: TestClient, recorder_user: User, db: Session
) -> None:
    recorder_user.can_billing = True
    db.commit()

    assert recorder_client.get(BASE).status_code == 200
    assert recorder_client.get(f"{BASE}/overview").status_code == 200
    # Schreiben gehoert ebenfalls zum Modul.
    kreis = {
        "code": "NORD",
        "name": "Musterhof",
        "rechnungsleger": "Musterhof GmbH",
        "abnahmestelle": "AID-000001",
    }
    assert recorder_client.post(BASE, json=kreis).status_code == 201


def test_recorder_mit_merkmal_bleibt_ausserhalb_der_verwaltung(
    recorder_client: TestClient, recorder_user: User, db: Session
) -> None:
    """Das Merkmal oeffnet nur das Abrechnungsmodul, nicht die Benutzer- oder Systemverwaltung."""
    recorder_user.can_billing = True
    db.commit()

    assert recorder_client.get("/api/v1/users").status_code == 403


def test_admin_setzt_das_merkmal(
    admin_client: TestClient, recorder_client: TestClient, recorder_user: User
) -> None:
    assert recorder_client.get(BASE).status_code == 403

    resp = admin_client.patch(f"/api/v1/users/{recorder_user.id}", json={"can_billing": True})
    assert resp.status_code == 200, resp.text
    assert resp.json()["can_billing"] is True

    assert recorder_client.get(BASE).status_code == 200


def test_merkmal_steht_in_der_eigenen_kennung(recorder_client: TestClient) -> None:
    me = recorder_client.get("/api/v1/auth/me").json()
    assert me["can_billing"] is False
