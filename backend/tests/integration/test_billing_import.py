"""Import der Stammdaten (Stromabrechnung, ``export_app``) in Abrechnungskreise (Plan-Schritt 2d).

Vorschau (``apply=false``) fuehrt den Import vollstaendig aus und rollt zurueck; Uebernahme
(``apply=true``) schreibt. Messstellen werden nur ueber die Zaehlernummer des aktiven Zaehlers
gefunden, Eigentuemer ueber den normalisierten Namen. Abweichungen werden gemeldet, nicht geaendert.
"""

from __future__ import annotations

from typing import Any, cast

from fastapi.testclient import TestClient

URL = "/api/v1/billing-circles/import"
GRUPPE_A = "Musterhof Agrar GmbH & Co. KG"


def _owner(client: TestClient, name: str) -> int:
    resp = client.post("/api/v1/owners", json={"name": name})
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _mp(client: TestClient, name: str, serial: str, **extra: Any) -> int:
    resp = client.post(
        "/api/v1/measuring-points",
        json={
            "name": name,
            "type": "electricity",
            "is_bidirectional": False,
            "has_dual_tariff": False,
            "serial_number": serial,
            "installed_at": "2024-01-01",
            "initial_values": {"1.8.0": "0"},
            **extra,
        },
    )
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _pos(label: str, serial: str | None, **extra: Any) -> dict[str, Any]:
    return {
        "label": label,
        "sort_order": 10,
        "kind": "meter",
        "serial_number": serial,
        "owner_name": GRUPPE_A,
        "internal_allocation": False,
        "kostenstelle": 10105,
        "transformer_factor": 1,
        "parent_label": None,
        "note": None,
        **extra,
    }


def _payload(*positions: dict[str, Any], code: str = "NORD") -> dict[str, Any]:
    return {
        "format": "stromabrechnung-stammdaten",
        "version": 1,
        "erzeugt": "2026-09-17",
        "valid_from": "2026-08-01",
        "circles": [
            {
                "code": code,
                "name": "Musterhof",
                "rechnungsleger": "Musterhof Holding GmbH",
                "abnahmestelle": "AID-000001",
                "marktlokation": "12345678901",
                "positions": list(positions),
            }
        ],
    }


def _run(client: TestClient, payload: dict[str, Any], apply: bool) -> dict[str, Any]:
    resp = client.post(URL, params={"apply": str(apply).lower()}, json=payload)
    assert resp.status_code == 200, resp.text
    return cast(dict[str, Any], resp.json())


def _levels(report: dict[str, Any], level: str) -> list[str]:
    return [f"{e['label']}: {e['message']}" for e in report["entries"] if e["level"] == level]


def _positions(client: TestClient) -> list[dict[str, Any]]:
    kreis = client.get("/api/v1/billing-circles").json()[0]
    return cast(
        list[dict[str, Any]],
        client.get(f"/api/v1/billing-circles/{kreis['id']}/positions").json(),
    )


def test_vorschau_aendert_nichts_uebernahme_schreibt(admin_client: TestClient) -> None:
    owner = _owner(admin_client, "Musterhof Agrar GmbH & Co KG")  # ohne Punkt
    anlage = _mp(admin_client, "NORD - Anlage West", "TEST0000001")
    bhkw_owner = _owner(admin_client, "Musterhof Service GmbH")
    generator = _mp(admin_client, "NORD - Generator", "TEST 0000 0002")
    payload = _payload(
        _pos("Anlage West", "TEST0000001", note="abzüglich Generator"),
        _pos(
            "Generator NORD",
            "TEST00000002",
            sort_order=20,
            owner_name="Musterhof Service GmbH",
            internal_allocation=True,
            kostenstelle=10109,
            parent_label="Anlage West",
        ),
    )

    vorschau = _run(admin_client, payload, apply=False)
    assert vorschau["applied"] is False
    assert vorschau["counts"]["fehler"] == 0, vorschau
    assert vorschau["counts"]["aktion"] >= 6
    assert admin_client.get("/api/v1/billing-circles").json() == []

    ergebnis = _run(admin_client, payload, apply=True)
    assert ergebnis["applied"] is True
    assert _levels(ergebnis, "aktion") == _levels(vorschau, "aktion")

    kreise = admin_client.get("/api/v1/billing-circles").json()
    assert [(k["code"], k["marktlokation"]) for k in kreise] == [("NORD", "12345678901")]
    nach_label = {p["label"]: p for p in _positions(admin_client)}
    assert nach_label["Anlage West"]["measuring_point_id"] == anlage
    assert nach_label["Anlage West"]["note"] == "abzüglich Generator"
    assert nach_label["Generator NORD"]["parent_position_id"] == nach_label["Anlage West"]["id"]
    assert nach_label["Generator NORD"]["valid_from"] == "2026-08-01"

    mp = admin_client.get(f"/api/v1/measuring-points/{generator}").json()
    assert mp["current_owner_id"] == bhkw_owner
    assert mp["kostenstelle"] == 10109
    biogas_mp = admin_client.get(f"/api/v1/measuring-points/{anlage}").json()
    assert biogas_mp["current_owner_id"] == owner
    assert admin_client.get(f"/api/v1/owners/{bhkw_owner}").json()["internal_allocation"] is True

    bericht = admin_client.get(
        f"/api/v1/billing-circles/{kreise[0]['id']}/check", params={"stichtag": "2026-08-31"}
    ).json()
    assert bericht["findings"] == []


def test_zweiter_import_ist_idempotent(admin_client: TestClient) -> None:
    _owner(admin_client, GRUPPE_A)
    _mp(admin_client, "Anlage West", "TEST0000001")
    payload = _payload(_pos("Anlage West", "TEST0000001"))
    _run(admin_client, payload, apply=True)
    zweiter = _run(admin_client, payload, apply=True)
    assert _levels(zweiter, "aktion") == []
    assert zweiter["counts"]["fehler"] == 0


def test_geaenderte_stammdaten_aktualisieren_position(admin_client: TestClient) -> None:
    _owner(admin_client, GRUPPE_A)
    _mp(admin_client, "Anlage West", "TEST0000001")
    _run(admin_client, _payload(_pos("Anlage West", "TEST0000001")), apply=True)
    geaendert = _payload(_pos("Anlage West", "TEST0000001", note="neu", sort_order=5))
    ergebnis = _run(admin_client, geaendert, apply=True)
    assert any("aktualisiert" in a for a in _levels(ergebnis, "aktion"))
    pos = _positions(admin_client)[0]
    assert (pos["note"], pos["sort_order"]) == ("neu", 5)


def test_fehler_verhindern_nur_die_betroffene_position(admin_client: TestClient) -> None:
    _owner(admin_client, GRUPPE_A)
    _mp(admin_client, "Anlage West", "TEST0000001")
    payload = _payload(
        _pos("Anlage West", "TEST0000001"),
        _pos("Pumpe", None),
        _pos("Unbekannt", "999999"),
        _pos("Fremder", "TEST0000001", owner_name="Gibt es nicht GmbH"),
    )
    ergebnis = _run(admin_client, payload, apply=True)
    fehler = _levels(ergebnis, "fehler")
    assert any(f.startswith("Pumpe:") and "Zählernummer" in f for f in fehler)
    assert any(f.startswith("Unbekannt:") and "999999" in f for f in fehler)
    assert any(f.startswith("Fremder:") and "Gibt es nicht GmbH" in f for f in fehler)
    assert [p["label"] for p in _positions(admin_client)] == ["Anlage West"]


def test_abweichungen_werden_gemeldet_nicht_geaendert(admin_client: TestClient) -> None:
    _owner(admin_client, GRUPPE_A)
    andere = _owner(admin_client, "Andere GmbH")
    mp = _mp(admin_client, "Anlage West", "TEST0000001", owner_id=andere, kostenstelle=11111)
    payload = _payload(_pos("Anlage West", "TEST0000001", transformer_factor=80))
    hinweise = _levels(_run(admin_client, payload, apply=True), "hinweis")
    assert any("Andere GmbH" in h for h in hinweise)
    assert any("11111" in h for h in hinweise)
    assert any("Wandlerfaktor" in h for h in hinweise)
    daten = admin_client.get(f"/api/v1/measuring-points/{mp}").json()
    assert (daten["current_owner_id"], daten["kostenstelle"]) == (andere, 11111)


def test_restposition(admin_client: TestClient) -> None:
    gruppe_c = "Musterhof Nord GmbH & Co. KG"
    owner = _owner(admin_client, gruppe_c)
    rest = _pos("Rest", None, kind="rest", owner_name=gruppe_c, kostenstelle=10101)
    ergebnis = _run(admin_client, _payload(rest, code="SUED"), apply=True)
    assert ergebnis["counts"]["fehler"] == 0, ergebnis
    pos = _positions(admin_client)[0]
    assert (pos["kind"], pos["owner_id"], pos["kostenstelle"]) == ("rest", owner, 10101)


def test_position_nicht_mehr_in_stammdaten_wird_gemeldet(admin_client: TestClient) -> None:
    _owner(admin_client, GRUPPE_A)
    _mp(admin_client, "Anlage West", "TEST0000001")
    _mp(admin_client, "Alt", "ALT-1")
    beide = _payload(_pos("Anlage West", "TEST0000001"), _pos("Alt", "ALT-1"))
    _run(admin_client, beide, apply=True)
    ergebnis = _run(admin_client, _payload(_pos("Anlage West", "TEST0000001")), apply=True)
    assert any(h.startswith("Alt:") for h in _levels(ergebnis, "hinweis"))


def test_falsches_format_und_nur_admin(
    admin_client: TestClient, recorder_client: TestClient
) -> None:
    falsch = _payload()
    falsch["format"] = "irgendwas"
    assert admin_client.post(URL, json=falsch).status_code == 422
    assert recorder_client.post(URL, json=_payload()).status_code == 403


def test_bestehender_kreis_wird_nicht_ueberschrieben(admin_client: TestClient) -> None:
    _owner(admin_client, GRUPPE_A)
    _mp(admin_client, "Anlage West", "TEST0000001")
    _run(admin_client, _payload(_pos("Anlage West", "TEST0000001")), apply=True)
    anders = _payload(_pos("Anlage West", "TEST0000001"))
    anders["circles"][0]["rechnungsleger"] = "Falscher Rechnungsleger"
    ergebnis = _run(admin_client, anders, apply=True)
    assert any("Falscher Rechnungsleger" in h for h in _levels(ergebnis, "hinweis"))
    kreis = admin_client.get("/api/v1/billing-circles").json()[0]
    assert kreis["rechnungsleger"] == "Musterhof Holding GmbH"


def test_uebernahme_wird_protokolliert(admin_client: TestClient) -> None:
    _run(admin_client, _payload(), apply=True)
    eintraege = admin_client.get("/api/v1/audit-log").json()
    assert any(e["action"] == "billing_import" for e in eintraege)


def test_zu_grosse_datei(admin_client: TestClient) -> None:
    gross = _payload()
    gross["circles"][0]["name"] = "x" * 1_100_000
    resp = admin_client.post(URL, json=gross)
    assert resp.status_code == 413, resp.text
