"""Historie: Versionsvergleich und Verbrauchsverlauf (Plan Phase 5).

Der Vergleich zeigt, was eine Korrekturversion bewirkt hat; der Verlauf zeigt die
festgeschriebenen Monate je Empfaenger und Position. Nur fiktive Daten.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

# Die Helfer des Lauf-Tests (Kreis mit Positionen, Staende, Rechnung) wiederverwenden.
from tests.integration.test_billing_runs import (
    BASE,
    _invoice,
    _mp,
    _ok,
    _position,
    _setup,
    _stand,
    _zeile,
)

from meters.models import User


def _zeilen(diff: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {z["label"]: z for z in diff["zeilen"]}


def test_vergleich_zeigt_was_die_neue_version_aendert(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    v1 = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{v1['id']}/finalize"))

    body = {"monat": "2026-08", "begruendung": "Zaehler falsch abgelesen"}
    v2 = _ok(admin_client.post(f"{BASE}/{cid}/runs", json=body), 201)
    zeile = _zeile(v2, "Stall")
    _ok(
        admin_client.patch(
            f"{BASE}/{cid}/runs/{v2['id']}/lines/{zeile['id']}",
            json={"manual_stand_neu": "170", "manual_note": "Foto vom Zaehler"},
        )
    )

    diff = _ok(admin_client.get(f"{BASE}/{cid}/runs/{v2['id']}/vergleich"))
    assert diff["monat"] == "2026-08"
    assert (diff["alt"]["version"], diff["neu"]["version"]) == (1, 2)
    assert diff["neu"]["begruendung"] == "Zaehler falsch abgelesen"

    zeilen = _zeilen(diff)
    assert zeilen["Stall"]["status"] == "geaendert"
    assert "stand_neu" in zeilen["Stall"]["felder"] and "kwh" in zeilen["Stall"]["felder"]
    # 20 Zaehlereinheiten mehr bei Wandlerfaktor 10 -> 200 kWh mehr.
    assert zeilen["Stall"]["kwh_delta"] == "200"
    assert zeilen["Pumpe"]["status"] == "gleich" and zeilen["Pumpe"]["felder"] == []


def test_vergleich_meldet_neue_zeilen(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    v1 = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{v1['id']}/finalize"))

    owner = _zeile(v1, "Rest")["owner_id"]
    neu_mp = _mp(admin_client, "Werkstatt", owner_id=owner, kostenstelle=10106)
    _position(
        admin_client, cid, label="Werkstatt", kind="meter", measuring_point_id=neu_mp, sort_order=4
    )
    _stand(db, admin_user, neu_mp, "2026-07-31", "0")
    _stand(db, admin_user, neu_mp, "2026-08-31", "30")

    body = {"monat": "2026-08", "begruendung": "Zaehler nachgetragen"}
    v2 = _ok(admin_client.post(f"{BASE}/{cid}/runs", json=body), 201)

    zeilen = _zeilen(_ok(admin_client.get(f"{BASE}/{cid}/runs/{v2['id']}/vergleich")))
    assert zeilen["Werkstatt"]["status"] == "neu"
    assert zeilen["Werkstatt"]["kwh_alt"] is None and zeilen["Werkstatt"]["kwh_neu"] == "30"


def test_vergleich_ohne_vorversion_und_fremder_lauf(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)

    assert admin_client.get(f"{BASE}/{cid}/runs/{run['id']}/vergleich").status_code == 404
    assert (
        admin_client.get(f"{BASE}/{cid}/runs/{run['id']}/vergleich?mit=999999").status_code == 404
    )


def test_vergleich_mit_ausdruecklicher_version_in_beide_richtungen(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    """``mit`` darf auch die neuere Version nennen.

    Die Richtung wird dann gedreht, das Ergebnis bleibt gleich.
    """
    cid, _ = _setup(admin_client, db, admin_user)
    v1 = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{v1['id']}/finalize"))
    body = {"monat": "2026-08", "begruendung": "Korrektur"}
    v2 = _ok(admin_client.post(f"{BASE}/{cid}/runs", json=body), 201)

    vorwaerts = _ok(admin_client.get(f"{BASE}/{cid}/runs/{v2['id']}/vergleich?mit={v1['id']}"))
    rueckwaerts = _ok(admin_client.get(f"{BASE}/{cid}/runs/{v1['id']}/vergleich?mit={v2['id']}"))
    for diff in (vorwaerts, rueckwaerts):
        assert (diff["alt"]["version"], diff["neu"]["version"]) == (1, 2)
    assert vorwaerts == rueckwaerts


def test_vergleich_lehnt_fremden_kreis_und_fremden_monat_ab(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    august = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)

    # Anderer Monat desselben Kreises: vergleichbar waere nur derselbe Monat.
    _invoice(db, cid, "2026-07")
    db.commit()
    juli = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-07"}), 201)
    fremder_monat = admin_client.get(f"{BASE}/{cid}/runs/{august['id']}/vergleich?mit={juli['id']}")
    assert fremder_monat.status_code == 400

    # Lauf eines anderen Kreises.
    zweiter = int(
        _ok(
            admin_client.post(
                BASE,
                json={
                    "code": "SUED",
                    "name": "Musterhof Sued",
                    "rechnungsleger": "Musterhof GmbH",
                    "abnahmestelle": "AID-000002",
                },
            ),
            201,
        )["id"]
    )
    fremder_kreis = admin_client.get(
        f"{BASE}/{zweiter}/runs/{august['id']}/vergleich?mit={august['id']}"
    )
    assert fremder_kreis.status_code == 404


def test_verlauf_zeigt_festgeschriebene_monate(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)

    # Ein Entwurf zaehlt noch nicht zum Verlauf.
    leer = _ok(admin_client.get(f"{BASE}/{cid}/verlauf?von=2026-07&bis=2026-08"))
    assert leer["monate"] == [] and leer["empfaenger"] == []

    _ok(admin_client.post(f"{BASE}/{cid}/runs/{run['id']}/finalize"))
    verlauf = _ok(admin_client.get(f"{BASE}/{cid}/verlauf?von=2026-07&bis=2026-08"))
    assert verlauf["monate"] == ["2026-08"]

    empfaenger = {e["name"]: e for e in verlauf["empfaenger"]}
    assert empfaenger["Muster A KG"]["punkte"][0]["eur"] == "225.00"
    assert empfaenger["Muster Intern"]["internal_allocation"] is True
    positionen = {p["name"]: p for p in verlauf["positionen"]}
    assert positionen["Stall"]["punkte"][0]["kwh"] == "500"
