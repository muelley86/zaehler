"""Historie: Versionsvergleich, Verbrauchsverlauf und Vergleich frei gewaehlter Laeufe.

Der Versionsvergleich zeigt, was eine Korrekturversion bewirkt hat; der Verlauf zeigt die
festgeschriebenen Monate je Empfaenger und Position; der Lauf-Vergleich stellt zwei bis zwoelf
frei gewaehlte Laeufe eines Kreises nebeneinander (Kennzahlen, Empfaenger, Positionen, jeweils mit
Abweichung zum vorherigen Lauf der Auswahl). Nur fiktive Daten.
"""

from __future__ import annotations

from decimal import Decimal
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

from meters.models import BillingRun, BillingRunLine, User


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


# --- Vergleich frei gewaehlter Laeufe ------------------------------------------------------------

_SEPTEMBER = (("Stall", "180"), ("Pumpe", "300"), ("Generator", "200"))
_OKTOBER = (("Stall", "200"), ("Pumpe", "350"), ("Generator", "260"))


def _monat(
    client: TestClient,
    db: Session,
    user: User,
    cid: int,
    mps: dict[str, int],
    monat: str,
    tag: str,
    staende: tuple[tuple[str, str], ...],
    bezug: str,
    betrag: str,
) -> dict[str, Any]:
    """Staende zum Monatsende und Rechnung nachtragen, dann den Entwurf des Monats anlegen."""
    for label, wert in staende:
        _stand(db, user, mps[label], tag, wert)
    _invoice(db, cid, monat, bezug=bezug, betrag=betrag)
    return _ok(client.post(f"{BASE}/{cid}/runs", json={"monat": monat}), 201)


def _vergleich(client: TestClient, cid: int, *run_ids: int) -> Any:
    query = "&".join(f"lauf={i}" for i in run_ids)
    return client.get(f"{BASE}/{cid}/runs/vergleich?{query}")


def _dez(werte: list[dict[str, Any]], feld: str = "wert") -> list[Decimal | None]:
    return [None if w[feld] is None else Decimal(w[feld]) for w in werte]


def _nach_name(zeilen: list[dict[str, Any]], schluessel: str = "name") -> dict[str, dict[str, Any]]:
    return {z[schluessel]: z for z in zeilen}


def test_lauf_vergleich_stellt_zwei_monate_gegenueber(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    # Arrange: August (Bezug 1000 kWh, 250 EUR) und September (Bezug 800 kWh, 240 EUR).
    cid, mps = _setup(admin_client, db, admin_user)
    august = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    september = _monat(
        admin_client, db, admin_user, cid, mps, "2026-09", "2026-09-30", _SEPTEMBER, "800", "240.00"
    )

    # Act: bewusst in umgekehrter Reihenfolge angefragt.
    body = _ok(_vergleich(admin_client, cid, september["id"], august["id"]))

    # Assert: chronologisch sortiert, Abweichung jeweils zum vorherigen Lauf.
    assert [(lauf["run_id"], lauf["monat"], lauf["version"]) for lauf in body["laeufe"]] == [
        (august["id"], "2026-08", 1),
        (september["id"], "2026-09", 1),
    ]
    kennzahlen = _nach_name(body["kennzahlen"], "key")
    assert list(kennzahlen) == [
        "preis",
        "bezugsmenge",
        "zaehlersumme",
        "gesamtkosten",
        "weiterberechnet",
        "differenz_eur",
        "differenz_prozent",
        "differenz_kwh",
        "differenz_kwh_prozent",
    ]
    preis = kennzahlen["preis"]
    assert preis["einheit"] == "eur_kwh"
    assert _dez(preis["werte"]) == [Decimal("0.25"), Decimal("0.30")]
    assert _dez(preis["werte"], "delta") == [None, Decimal("0.05")]
    assert _dez(preis["werte"], "delta_prozent") == [None, Decimal("20.00")]
    assert _dez(kennzahlen["bezugsmenge"]["werte"]) == [Decimal("1000"), Decimal("800")]
    assert _dez(kennzahlen["gesamtkosten"]["werte"], "delta") == [None, Decimal("-10.00")]

    stall = _nach_name(body["positionen"])["Stall"]
    assert _dez(stall["kwh"]) == [Decimal("500"), Decimal("300")]
    assert _dez(stall["kwh"], "delta") == [None, Decimal("-200")]
    assert _dez(stall["kwh"], "delta_prozent") == [None, Decimal("-40.00")]
    assert _dez(stall["eur"]) == [Decimal("125.00"), Decimal("90.00")]
    assert _dez(stall["eur"], "delta") == [None, Decimal("-35.00")]
    assert _dez(stall["eur"], "delta_prozent") == [None, Decimal("-28.00")]
    assert [p["name"] for p in body["positionen"]] == ["Stall", "Pumpe", "Generator", "Rest"]

    empfaenger = _nach_name(body["empfaenger"])
    assert _dez(empfaenger["Muster A KG"]["eur"]) == [Decimal("225.00"), Decimal("210.00")]
    assert _dez(empfaenger["Muster A KG"]["kwh"], "delta") == [None, Decimal("-200")]
    assert empfaenger["Muster Intern"]["internal_allocation"] is True
    assert empfaenger["Muster A KG"]["internal_allocation"] is False


def test_lauf_vergleich_als_reihe_mit_position_die_erst_spaeter_dazukommt(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    # Arrange: drei Monate; die Werkstatt wird erst im Oktober abgerechnet.
    cid, mps = _setup(admin_client, db, admin_user)
    august = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    september = _monat(
        admin_client, db, admin_user, cid, mps, "2026-09", "2026-09-30", _SEPTEMBER, "800", "240.00"
    )
    owner = _zeile(august, "Rest")["owner_id"]
    werkstatt = _mp(admin_client, "Werkstatt", owner_id=owner, kostenstelle=10106)
    _position(
        admin_client,
        cid,
        label="Werkstatt",
        kind="meter",
        measuring_point_id=werkstatt,
        sort_order=4,
        valid_from="2026-10-01",
    )
    _stand(db, admin_user, werkstatt, "2026-09-30", "0")
    _stand(db, admin_user, werkstatt, "2026-10-31", "40")
    oktober = _monat(
        admin_client, db, admin_user, cid, mps, "2026-10", "2026-10-31", _OKTOBER, "500", "150.00"
    )

    # Act
    body = _ok(_vergleich(admin_client, cid, august["id"], september["id"], oktober["id"]))

    # Assert
    assert [lauf["monat"] for lauf in body["laeufe"]] == ["2026-08", "2026-09", "2026-10"]
    positionen = _nach_name(body["positionen"])
    assert _dez(positionen["Werkstatt"]["kwh"]) == [None, None, Decimal("40")]
    # Ohne Wert im Vorlauf gibt es keine Abweichung (nicht "+40 gegen nichts").
    assert _dez(positionen["Werkstatt"]["kwh"], "delta") == [None, None, None]
    assert _dez(positionen["Stall"]["kwh"]) == [Decimal("500"), Decimal("300"), Decimal("200")]
    assert _dez(positionen["Stall"]["kwh"], "delta") == [None, Decimal("-200"), Decimal("-100")]
    # Reihenfolge wie im juengsten Lauf.
    assert [p["name"] for p in body["positionen"]] == [
        "Stall",
        "Pumpe",
        "Generator",
        "Werkstatt",
        "Rest",
    ]


def test_lauf_vergleich_nennt_geaenderte_merkmale_aber_keine_staende(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    # Arrange: im September laeuft die Pumpe auf einer anderen Kostenstelle.
    cid, mps = _setup(admin_client, db, admin_user)
    august = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    september = _monat(
        admin_client, db, admin_user, cid, mps, "2026-09", "2026-09-30", _SEPTEMBER, "800", "240.00"
    )
    zeile = db.get(BillingRunLine, _zeile(september, "Pumpe")["id"])
    assert zeile is not None
    zeile.kostenstelle = 10199
    db.commit()

    # Act
    positionen = _nach_name(
        _ok(_vergleich(admin_client, cid, august["id"], september["id"]))["positionen"]
    )

    # Assert: Staende aendern sich jeden Monat und gelten nicht als Merkmal.
    assert positionen["Pumpe"]["merkmale_geaendert"] == ["kostenstelle"]
    assert positionen["Stall"]["merkmale_geaendert"] == []


def test_lauf_vergleich_mit_lauf_ohne_ergebnis(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    # Arrange: ein Entwurf, der (noch) kein Ergebnis hat.
    cid, mps = _setup(admin_client, db, admin_user)
    august = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    september = _monat(
        admin_client, db, admin_user, cid, mps, "2026-09", "2026-09-30", _SEPTEMBER, "800", "240.00"
    )
    lauf = db.get(BillingRun, september["id"])
    assert lauf is not None
    lauf.result = None
    db.commit()

    # Act
    kennzahlen = _nach_name(
        _ok(_vergleich(admin_client, cid, august["id"], september["id"]))["kennzahlen"], "key"
    )

    # Assert: der Lauf bleibt in der Auswahl, zeigt aber keine Kennzahlen und keine Abweichung.
    assert _dez(kennzahlen["preis"]["werte"]) == [Decimal("0.25"), None]
    assert _dez(kennzahlen["preis"]["werte"], "delta") == [None, None]
    assert _dez(kennzahlen["weiterberechnet"]["werte"]) == [Decimal("250.00"), None]


def test_lauf_vergleich_prozent_ohne_basis_bleibt_leer(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    # Arrange: die Pumpe steht im August still (0 kWh) und laeuft im September.
    cid, mps = _setup(admin_client, db, admin_user)
    august = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    zeile = _zeile(august, "Pumpe")
    _ok(
        admin_client.patch(
            f"{BASE}/{cid}/runs/{august['id']}/lines/{zeile['id']}",
            json={"manual_stand_neu": "0", "manual_note": "Pumpe stand still"},
        )
    )
    september = _monat(
        admin_client, db, admin_user, cid, mps, "2026-09", "2026-09-30", _SEPTEMBER, "800", "240.00"
    )

    # Act
    pumpe = _nach_name(
        _ok(_vergleich(admin_client, cid, august["id"], september["id"]))["positionen"]
    )["Pumpe"]

    # Assert
    assert _dez(pumpe["kwh"]) == [Decimal("0"), Decimal("100")]
    assert _dez(pumpe["kwh"], "delta") == [None, Decimal("100")]
    assert _dez(pumpe["kwh"], "delta_prozent") == [None, None]


def test_lauf_vergleich_lehnt_unpassende_auswahl_ab(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, mps = _setup(admin_client, db, admin_user)
    august = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    september = _monat(
        admin_client, db, admin_user, cid, mps, "2026-09", "2026-09-30", _SEPTEMBER, "800", "240.00"
    )
    sued = {
        "code": "SUED",
        "name": "Musterhof Sued",
        "rechnungsleger": "Musterhof GmbH",
        "abnahmestelle": "AID-000002",
    }
    zweiter = int(_ok(admin_client.post(BASE, json=sued), 201)["id"])

    # Zu wenige, zu viele, doppelte oder gar keine Laeufe.
    assert _vergleich(admin_client, cid, august["id"]).status_code == 422
    assert _vergleich(admin_client, cid, *range(1, 14)).status_code == 422
    assert _vergleich(admin_client, cid, august["id"], august["id"]).status_code == 422
    assert admin_client.get(f"{BASE}/{cid}/runs/vergleich").status_code == 422
    # Unbekannter Lauf und Laeufe eines anderen Kreises: 404, nicht "gibt es, gehoert woanders hin".
    assert _vergleich(admin_client, cid, august["id"], 999999).status_code == 404
    assert _vergleich(admin_client, zweiter, august["id"], september["id"]).status_code == 404
    assert _vergleich(admin_client, 999999, august["id"], september["id"]).status_code == 404
