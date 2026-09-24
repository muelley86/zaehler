"""Abrechnungslauf (Migration 0039, Plan Phase 4c): Entwurf, Berechnung, manuelle Werte,
Festschreiben, Versionen. Nur fiktive, handrechenbare Werte (oeffentliches Repo).

Kreis NORD, Rechnung August: 1.000 kWh, 250,00 EUR -> Umlagepreis 25 ct -> 0,25 EUR/kWh.
Stall (Faktor 10) 100 -> 150 = 500 kWh, Pumpe 0 -> 200 = 200 kWh, Generator (intern) 0 -> 100 =
100 kWh, Rest = 1.000 - 800 = 200 kWh; Zaehlersumme 1.000, Saldo 0.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime
from decimal import Decimal
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.core.problem import ProblemError
from meters.models import (
    BillingInvoice,
    BillingInvoicePosition,
    BillingRun,
    PhysicalMeter,
    Reading,
    Register,
    User,
)
from meters.services.billing_run import finalize_run

BASE = "/api/v1/billing-circles"


def _ok(resp: Any, status: int = 200) -> dict[str, Any]:
    assert resp.status_code == status, resp.text
    return cast(dict[str, Any], resp.json())


def _invoice(
    db: Session, cid: int, monat: str, bezug: str = "1000", betrag: str = "250.00"
) -> None:
    jahr, mon = (int(t) for t in monat.split("-"))
    letzter = calendar.monthrange(jahr, mon)[1]
    db.add(
        BillingInvoice(
            circle_id=cid,
            nummer=f"TEST-{monat}",
            datum=date(jahr, mon, letzter),
            aid="AID-000001",
            marktlokation="12345678901",
            period_from=date(jahr, mon, 1),
            period_to=date(jahr, mon, letzter),
            period_month=monat,
            verbrauch_kwh=Decimal(bezug),
            leistungsspitze_kw=Decimal("10"),
            betrag_netto=Decimal(betrag),
            hinweise=[],
            pdf_sha256=monat.ljust(64, "0"),
            pdf_size=1,
            pdf_filename="rechnung.pdf",
            positions=[
                BillingInvoicePosition(
                    sort_order=0,
                    name="Energielieferung",
                    abschnitt="Energiebeschaffung",
                    zeitraum="x",
                    menge=Decimal(bezug),
                    preis_ct=Decimal("20.0000"),
                    betrag=Decimal("200.00"),
                ),
                BillingInvoicePosition(
                    sort_order=1,
                    name="Wirkarbeit - Netznutzung",
                    abschnitt="Netzentgelte",
                    zeitraum="x",
                    betrag=Decimal(betrag) - Decimal("200.00"),
                ),
            ],
        )
    )
    db.commit()


def _mp(client: TestClient, name: str, **extra: Any) -> int:
    body = {
        "name": name,
        "type": extra.pop("type", "electricity"),
        "is_bidirectional": False,
        "has_dual_tariff": False,
        "serial_number": f"TEST-{name}",
        "installed_at": "2024-01-01",
        "initial_values": {"1.8.0": "0"},
        **extra,
    }
    return int(_ok(client.post("/api/v1/measuring-points", json=body), 201)["id"])


def _stand(db: Session, user: User, mp_id: int, tag: str, wert: str) -> None:
    reg = db.scalars(
        select(Register).join(PhysicalMeter).where(PhysicalMeter.measuring_point_id == mp_id)
    ).one()
    db.add(
        Reading(
            register_id=reg.id,
            value=Decimal(wert),
            reading_at=datetime.fromisoformat(f"{tag}T10:00:00"),
            created_by_user_id=user.id,
        )
    )
    db.commit()


def _position(client: TestClient, cid: int, **body: Any) -> None:
    _ok(client.post(f"{BASE}/{cid}/positions", json={"valid_from": "2026-01-01", **body}), 201)


def _setup(client: TestClient, db: Session, user: User) -> tuple[int, dict[str, int]]:
    kreis = {
        "code": "NORD",
        "name": "Musterhof",
        "rechnungsleger": "Musterhof GmbH",
        "abnahmestelle": "AID-000001",
    }
    cid = int(_ok(client.post(BASE, json=kreis), 201)["id"])
    extern = int(_ok(client.post("/api/v1/owners", json={"name": "Muster A KG"}), 201)["id"])
    intern_body = {"name": "Muster Intern", "internal_allocation": True}
    intern = int(_ok(client.post("/api/v1/owners", json=intern_body), 201)["id"])
    mps = {
        "Stall": _mp(client, "Stall", owner_id=extern, kostenstelle=10101, transformer_factor=10),
        "Pumpe": _mp(client, "Pumpe", owner_id=extern, kostenstelle=10102),
        "Generator": _mp(client, "Generator", owner_id=intern, kostenstelle=10103),
    }
    for i, (label, mp) in enumerate(mps.items()):
        _position(client, cid, label=label, kind="meter", measuring_point_id=mp, sort_order=i)
    _position(
        client, cid, label="Rest", kind="rest", owner_id=extern, kostenstelle=10104, sort_order=9
    )
    staende = (("Stall", "100", "150"), ("Pumpe", "0", "200"), ("Generator", "0", "100"))
    for label, alt, neu in staende:
        _stand(db, user, mps[label], "2026-07-31", alt)
        _stand(db, user, mps[label], "2026-08-31", neu)
    _invoice(db, cid, "2026-08")
    return cid, mps


def _codes(run: dict[str, Any]) -> list[tuple[str, str, bool]]:
    return [(b["label"], b["code"], b["blocking"]) for b in run["befunde"]]


def _zeile(run: dict[str, Any], label: str) -> dict[str, Any]:
    return next(z for z in run["lines"] if z["label"] == label)


def test_entwurf_berechnen_und_festschreiben(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    assert (run["status"], run["version"]) == ("entwurf", 1)
    assert [z["label"] for z in run["lines"]] == ["Stall", "Pumpe", "Generator", "Rest"]
    stall = _zeile(run, "Stall")
    assert (stall["stand_alt"], stall["stand_neu"], stall["transformer_factor"]) == (
        "100",
        "150",
        10,
    )
    assert (stall["kwh"], stall["eur"], stall["pruefung"]) == ("500", "125.00", "OK")
    assert _zeile(run, "Rest")["kwh"] == "200"
    r = run["result"]
    assert (r["preis_eur"], r["gesamt_eur"], r["saldo_eur"]) == ("0.25", "250.00", "0.00")
    assert r["zaehlersumme"] == "1000"
    assert [(g["name"], g["intern"], g["eur"]) for g in r["gruppen"]] == [
        ("Muster A KG", False, "225.00"),
        ("Muster Intern", True, "25.00"),
    ]
    assert run["blocking_count"] == 0
    assert _codes(run) == [("Vormonat", "kein_vorlauf", False)]

    rid = run["id"]
    teurer = _ok(admin_client.patch(f"{BASE}/{cid}/runs/{rid}", json={"aufschlag_ct": "1"}))
    assert teurer["result"]["preis_eur"] == "0.26"
    zurueck = _ok(admin_client.patch(f"{BASE}/{cid}/runs/{rid}", json={"aufschlag_ct": "0"}))
    assert zurueck["result"]["preis_eur"] == "0.25"

    fest = _ok(admin_client.post(f"{BASE}/{cid}/runs/{rid}/finalize"))
    assert fest["status"] == "festgeschrieben"
    assert fest["finalized_at"] is not None
    liste = admin_client.get(f"{BASE}/{cid}/runs").json()
    assert liste[0]["gesamt_eur"] == "250.00"


def test_manuelle_werte_brauchen_begruendung(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    pumpe = _zeile(run, "Pumpe")
    url = f"{BASE}/{cid}/runs/{run['id']}/lines/{pumpe['id']}"
    assert admin_client.patch(url, json={"manual_stand_neu": "300"}).status_code == 422
    neu = _ok(admin_client.patch(url, json={"manual_stand_neu": "300", "manual_note": "Foto"}))
    assert _zeile(neu, "Pumpe")["kwh"] == "300"
    assert _zeile(neu, "Rest")["kwh"] == "100"
    assert ("Pumpe", "manuell", False) in _codes(neu)
    # Aktualisieren aus der App behaelt den manuellen Wert
    frisch = _ok(admin_client.post(f"{BASE}/{cid}/runs/{run['id']}/refresh"))
    assert _zeile(frisch, "Pumpe")["manual_stand_neu"] == "300"
    assert _zeile(frisch, "Pumpe")["kwh"] == "300"
    # Entfernen: Begruendung wird mit geleert
    url = f"{BASE}/{cid}/runs/{run['id']}/lines/{_zeile(frisch, 'Pumpe')['id']}"
    ohne = _ok(admin_client.patch(url, json={"manual_stand_neu": None}))
    assert (_zeile(ohne, "Pumpe")["kwh"], _zeile(ohne, "Pumpe")["manual_note"]) == ("200", None)


def test_festgeschrieben_ist_unveraenderlich_und_neue_version_ersetzt(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    assert admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}).status_code == 409
    rid = run["id"]
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{rid}/finalize"))
    line = run["lines"][0]["id"]
    for resp in (
        admin_client.patch(f"{BASE}/{cid}/runs/{rid}", json={"aufschlag_ct": "1"}),
        admin_client.patch(
            f"{BASE}/{cid}/runs/{rid}/lines/{line}",
            json={"manual_korrektur_kwh": "1", "manual_note": "x"},
        ),
        admin_client.post(f"{BASE}/{cid}/runs/{rid}/refresh"),
        admin_client.post(f"{BASE}/{cid}/runs/{rid}/finalize"),
        admin_client.delete(f"{BASE}/{cid}/runs/{rid}"),
    ):
        assert resp.status_code == 409, resp.text
    assert admin_client.delete(f"{BASE}/{cid}/invoices/{run['invoice_id']}").status_code == 409

    ohne_grund = admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"})
    assert ohne_grund.status_code == 422
    body = {"monat": "2026-08", "begruendung": "Korrektur"}
    v2 = _ok(admin_client.post(f"{BASE}/{cid}/runs", json=body), 201)
    assert v2["version"] == 2
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{v2['id']}/finalize"))
    status = {r["version"]: r["status"] for r in admin_client.get(f"{BASE}/{cid}/runs").json()}
    assert status == {1: "ersetzt", 2: "festgeschrieben"}


def test_entwurf_loeschen(admin_client: TestClient, admin_user: User, db: Session) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    assert admin_client.delete(f"{BASE}/{cid}/runs/{run['id']}").status_code == 204
    assert admin_client.get(f"{BASE}/{cid}/runs/{run['id']}").status_code == 404


def test_blockierende_befunde_verhindern_festschreiben(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    ohne = _mp(admin_client, "Ohne")
    _position(admin_client, cid, label="Ohne", kind="meter", measuring_point_id=ohne, sort_order=5)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    codes = _codes(run)
    assert ("Ohne", "ohne_eigentuemer", True) in codes
    assert run["blocking_count"] >= 1
    resp = admin_client.post(f"{BASE}/{cid}/runs/{run['id']}/finalize")
    assert resp.status_code == 409
    assert admin_client.get(f"{BASE}/{cid}/runs/{run['id']}").json()["status"] == "entwurf"


def test_stand_alt_wird_gegen_vormonat_geprueft(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, mps = _setup(admin_client, db, admin_user)
    august = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{august['id']}/finalize"))
    for label, neu in (("Stall", "160"), ("Pumpe", "250"), ("Generator", "110")):
        _stand(db, admin_user, mps[label], "2026-09-30", neu)
    _invoice(db, cid, "2026-09", bezug="500", betrag="250.00")
    sept = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-09"}), 201)
    assert [c for c in _codes(sept) if c[1] in ("kein_vorlauf", "stand_alt_vorlauf")] == []
    stall = _zeile(sept, "Stall")
    url = f"{BASE}/{cid}/runs/{sept['id']}/lines/{stall['id']}"
    geaendert = _ok(admin_client.patch(url, json={"manual_stand_alt": "149", "manual_note": "x"}))
    assert ("Stall", "stand_alt_vorlauf", False) in _codes(geaendert)


def test_ohne_rechnung_und_rechte(
    admin_client: TestClient, recorder_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    assert admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-07"}).status_code == 422
    assert admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-13"}).status_code == 422
    assert admin_client.get(f"{BASE}/{cid}/runs/999").status_code == 404
    assert recorder_client.get(f"{BASE}/{cid}/runs").status_code == 403
    body = {"monat": "2026-08"}
    assert recorder_client.post(f"{BASE}/{cid}/runs", json=body).status_code == 403


def test_unterzaehler_wird_vom_hauptzaehler_abgezogen(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    positionen = admin_client.get(f"{BASE}/{cid}/positions").json()
    stall = next(p["id"] for p in positionen if p["label"] == "Stall")
    owner = next(p["owner_id"] for p in positionen if p["label"] == "Rest")
    unter = _mp(admin_client, "Unter", owner_id=owner, kostenstelle=10105)
    _position(
        admin_client,
        cid,
        label="Unter",
        kind="meter",
        measuring_point_id=unter,
        parent_position_id=stall,
        sort_order=1,
    )
    _stand(db, admin_user, unter, "2026-07-31", "0")
    _stand(db, admin_user, unter, "2026-08-31", "20")
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    assert _zeile(run, "Unter")["parent_label"] == "Stall"
    assert _zeile(run, "Unter")["kwh"] == "20"
    assert _zeile(run, "Stall")["kwh"] == "480"  # (150 - 100) x 10 - 20
    assert _zeile(run, "Rest")["kwh"] == "200"  # 1000 - (480 + 200 + 100 + 20)
    assert run["result"]["zaehlersumme"] == "1000"
    assert run["blocking_count"] == 0


def test_paralleles_festschreiben_trifft_nur_einmal(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    veraltet = db.get(BillingRun, run["id"])  # noch im Status Entwurf geladen
    assert veraltet is not None
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{run['id']}/finalize"))
    with pytest.raises(ProblemError) as fehler:
        finalize_run(db, veraltet, admin_user.id)
    assert fehler.value.status_code == 409
    db.rollback()
    assert admin_client.get(f"{BASE}/{cid}/runs/{run['id']}").json()["status"] == "festgeschrieben"


def test_verbrauchsabweichung_zum_vormonat_wird_gemeldet(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, mps = _setup(admin_client, db, admin_user)
    august = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{august['id']}/finalize"))
    # September: Stall unveraendert (500 kWh), Generator unveraendert (100 kWh),
    # Pumpe verdreifacht (200 -> 600 kWh), Restzeile dadurch 200 -> 800 kWh
    for label, neu in (("Stall", "200"), ("Pumpe", "800"), ("Generator", "200")):
        _stand(db, admin_user, mps[label], "2026-09-30", neu)
    _invoice(db, cid, "2026-09", bezug="2000", betrag="500.00")
    sept = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-09"}), 201)
    abweichung = [c[0] for c in _codes(sept) if c[1] == "verbrauch_abweichung"]
    assert abweichung == ["Pumpe", "Rest"]
    assert _zeile(sept, "Stall")["kwh"] == "500"  # unveraendert, kein Befund
    meldung = next(b["message"] for b in sept["befunde"] if b["label"] == "Pumpe")
    assert "200.0 %" in meldung and "Grenze 50 %" in meldung
    assert all(not b["blocking"] for b in sept["befunde"])


def test_kontrolle_zeitraum_und_menge(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    rechnung = db.scalars(select(BillingInvoice).where(BillingInvoice.circle_id == cid)).one()
    rechnung.period_to = date(2026, 8, 20)
    rechnung.positions[0].menge = Decimal("900")
    db.commit()
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    codes = [c[1] for c in _codes(run)]
    assert "rechnungszeitraum" in codes
    assert "menge_energielieferung" in codes
    assert run["blocking_count"] == 0  # Hinweise, kein Blocker


def test_nicht_gemessene_menge_negativ(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    positionen = admin_client.get(f"{BASE}/{cid}/positions").json()
    rest = next(p["id"] for p in positionen if p["label"] == "Rest")
    assert admin_client.delete(f"{BASE}/{cid}/positions/{rest}").status_code == 204
    rechnung = db.scalars(select(BillingInvoice).where(BillingInvoice.circle_id == cid)).one()
    rechnung.verbrauch_kwh = Decimal("700")  # Zaehler messen 800 kWh
    db.commit()
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    assert ("Zaehlersumme", "nicht_gemessen_negativ", False) in _codes(run)
    assert run["result"]["nicht_gemessen_kwh"] == "-100"


def test_strom_messstellen_ohne_position(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    ohne = _mp(admin_client, "Ohne Position")
    _mp(admin_client, "Wasser", type="water", initial_values={"water": "0"})
    offen = admin_client.get(f"{BASE}/unassigned-meters", params={"stichtag": "2026-08-31"})
    assert offen.status_code == 200, offen.text
    assert [(m["id"], m["name"], m["serial_numbers"]) for m in offen.json()] == [
        (ohne, "Ohne Position", "TEST-Ohne Position")
    ]
    # Position angelegt -> nicht mehr offen; vor der Gueltigkeit weiterhin offen
    _position(admin_client, cid, label="Ohne Position", kind="meter", measuring_point_id=ohne)
    assert (
        admin_client.get(f"{BASE}/unassigned-meters", params={"stichtag": "2026-08-31"}).json()
        == []
    )
    # Vor der Gueltigkeit der Positionen (ab 2026-01-01) sind alle Strom-Messstellen offen
    frueher = admin_client.get(f"{BASE}/unassigned-meters", params={"stichtag": "2025-06-30"})
    assert [m["name"] for m in frueher.json()] == ["Generator", "Ohne Position", "Pumpe", "Stall"]


def test_vormonat_ohne_verbrauch_meldet_keine_abweichung(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    """Vormonat 0 kWh (keine Basis) und neue Position ohne Vormonatszeile: kein Befund."""
    cid, mps = _setup(admin_client, db, admin_user)
    august = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    assert _zeile(august, "Generator")["kwh"] == "100"
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{august['id']}/finalize"))
    # September: Generator ohne Verbrauch im August waere Division durch 0 - hier Stall ohne
    # Vormonatsbasis pruefen, indem eine neue Position erst im September gueltig wird.
    neu = _mp(admin_client, "Neu", owner_id=_zeile(august, "Rest")["owner_id"], kostenstelle=10106)
    _ok(
        admin_client.post(
            f"{BASE}/{cid}/positions",
            json={
                "label": "Neu",
                "kind": "meter",
                "measuring_point_id": neu,
                "sort_order": 4,
                "valid_from": "2026-09-01",
            },
        ),
        201,
    )
    for label, wert in (("Stall", "150"), ("Pumpe", "200"), ("Generator", "100")):
        _stand(db, admin_user, mps[label], "2026-09-30", wert)  # kein Verbrauch im September
    _stand(db, admin_user, neu, "2026-08-31", "0")
    _stand(db, admin_user, neu, "2026-09-30", "500")
    _invoice(db, cid, "2026-09", bezug="1000", betrag="250.00")
    sept = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-09"}), 201)
    abweichung = [c[0] for c in _codes(sept) if c[1] == "verbrauch_abweichung"]
    assert "Neu" not in abweichung  # neue Position: keine Vormonatszeile
    assert _zeile(sept, "Neu")["kwh"] == "500"
    # Stall/Pumpe/Generator ohne Verbrauch: Vormonat > 0, Abweichung -100 % -> gemeldet
    assert set(abweichung) == {"Stall", "Pumpe", "Generator", "Rest"}


def test_uebertragungsansicht_rechnet_je_rechnungszeile(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    """Beide Stall-Positionen teilen sich eine Rechnungszeile; Betrag = Menge x Preis."""
    cid, _ = _setup(admin_client, db, admin_user)
    positionen = admin_client.get(f"{BASE}/{cid}/positions").json()
    for label in ("Stall", "Pumpe"):
        pid = next(p["id"] for p in positionen if p["label"] == label)
        _ok(
            admin_client.patch(
                f"{BASE}/{cid}/positions/{pid}",
                json={"invoice_line": "Strom (gewerblich) Kostenstelle 10101"},
            ),
            200,
        )
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    ansicht = _ok(admin_client.get(f"{BASE}/{cid}/runs/{run['id']}/transfer"))
    assert ansicht["monatsname"] == "August 2026"
    assert ansicht["kopfsatz"].startswith("Für den Stromverbrauch im Monat August 2026")
    assert (ansicht["stichtag"], ansicht["preis_eur"]) == ("2026-08-31", "0.25")

    extern = next(e for e in ansicht["empfaenger"] if e["owner_name"] == "Muster A KG")
    zeilen = {z["beschreibung"]: z for z in extern["rows"]}
    gewerblich = zeilen["Strom (gewerblich) Kostenstelle 10101"]
    assert gewerblich["menge"] == "700.00"  # 500 (Stall) + 200 (Pumpe)
    assert gewerblich["betrag"] == "175.00"  # 700 x 0,25
    assert gewerblich["positionen"] == ["Stall", "Pumpe"]
    assert zeilen["Strom (gewerblich) Kostenstelle 10104"]["menge"] == "200.00"  # Restzeile
    assert (extern["netto"], extern["brutto"]) == ("225.00", "267.75")
    assert (extern["netto_lauf"], extern["differenz"]) == ("225.00", "0.00")
    assert extern["transfer"] is None
    assert extern["internal_allocation"] is False

    intern = next(e for e in ansicht["empfaenger"] if e["owner_name"] == "Muster Intern")
    assert intern["internal_allocation"] is True
    assert intern["netto"] == "25.00"


def test_uebertragung_abhaken_und_zuruecknehmen(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    url = f"{BASE}/{cid}/runs/{run['id']}/transfers"
    body = {"owner_name": "Muster A KG", "belegnummer": "RE-4711"}
    # Entwurf: erst festschreiben
    assert admin_client.post(url, json=body).status_code == 409
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{run['id']}/finalize"))

    nach = _ok(admin_client.post(url, json=body), 201)
    extern = next(e for e in nach["empfaenger"] if e["owner_name"] == "Muster A KG")
    assert extern["transfer"]["belegnummer"] == "RE-4711"
    assert extern["transfer"]["transferred_at"] is not None
    assert admin_client.post(url, json=body).status_code == 409  # nur einmal
    assert admin_client.post(url, json={"owner_name": "Gibt es nicht"}).status_code == 404

    zurueck = _ok(admin_client.delete(f"{url}/{extern['transfer']['id']}"))
    assert all(e["transfer"] is None for e in zurueck["empfaenger"])
    assert admin_client.delete(f"{url}/999").status_code == 404


def test_ersetzte_version_kann_nicht_uebertragen_werden(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    v1 = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{v1['id']}/finalize"))
    body = {"monat": "2026-08", "begruendung": "Korrektur"}
    v2 = _ok(admin_client.post(f"{BASE}/{cid}/runs", json=body), 201)
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{v2['id']}/finalize"))
    assert admin_client.get(f"{BASE}/{cid}/runs/{v1['id']}").json()["status"] == "ersetzt"
    # Ansicht bleibt lesbar, das Abhaken nicht mehr moeglich
    assert admin_client.get(f"{BASE}/{cid}/runs/{v1['id']}/transfer").status_code == 200
    ersetzt = admin_client.post(
        f"{BASE}/{cid}/runs/{v1['id']}/transfers", json={"owner_name": "Muster A KG"}
    )
    assert ersetzt.status_code == 409
    _ok(
        admin_client.post(
            f"{BASE}/{cid}/runs/{v2['id']}/transfers", json={"owner_name": "Muster A KG"}
        ),
        201,
    )


def test_rechnungsanhang_je_empfaenger(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    cid, _ = _setup(admin_client, db, admin_user)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    anhang = _ok(admin_client.get(f"{BASE}/{cid}/runs/{run['id']}/anhang"))

    kopf = anhang["head"]
    assert (kopf["circle_code"], kopf["rechnungsleger"]) == ("NORD", "Musterhof GmbH")
    assert (kopf["monatsname"], kopf["version"], kopf["status"]) == ("August 2026", 1, "entwurf")
    assert (kopf["rechnung_nummer"], kopf["abnahmestelle"]) == ("TEST-2026-08", "AID-000001")
    assert (kopf["zeitraum_von"], kopf["zeitraum_bis"]) == ("2026-08-01", "2026-08-31")

    summe = anhang["summary"]
    assert (summe["preis_eur"], summe["preis_ct"]) == ("0.25", "25.00")
    assert (summe["einkaufspreis_ct"], summe["umlagepreis_ct"]) == ("25.00", "25.00")
    assert (summe["bezugsmenge"], summe["zaehlersumme"]) == ("1000", "1000")
    assert (summe["gesamt_eur"], summe["umsatzsteuer"]) == ("250.00", "19.0")

    extern = next(e for e in anhang["empfaenger"] if e["owner_name"] == "Muster A KG")
    zeilen = {z["label"]: z for z in extern["lines"]}
    assert list(zeilen) == ["Stall", "Pumpe", "Rest"]
    assert (zeilen["Stall"]["stand_alt"], zeilen["Stall"]["stand_alt_art"]) == ("100", "abgelesen")
    assert (zeilen["Stall"]["transformer_factor"], zeilen["Stall"]["kwh"]) == (10, "500")
    assert zeilen["Stall"]["serial_numbers"] == "TEST-Stall"
    assert zeilen["Rest"]["stand_alt"] is None  # Restzeile ohne Zaehler
    assert [(k["kst"], k["eur"]) for k in extern["kostenstellen"]] == [
        ("10101", "125.00"),
        ("10102", "50.00"),
        ("10104", "50.00"),
    ]
    assert (extern["kwh"], extern["eur"]) == ("900", "225.00")

    # Zusammensetzung: Abschnitte der Lieferantenrechnung, Energielieferung traegt den Rest
    abschnitte = {a["name"]: a for a in extern["abschnitte"]}
    assert list(abschnitte) == [
        "Energiebeschaffung",
        "Steuern, Abgaben und Entgelte",
        "Netzentgelte",
    ]
    energie = abschnitte["Energiebeschaffung"]["positionen"][0]
    assert energie["name"] == "Energielieferung"
    summen = [Decimal(a["summe"]) for a in extern["abschnitte"]]
    assert sum(summen) == Decimal(extern["eur"])


def test_rechnungsanhang_zeigt_zeilen_ohne_empfaenger(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    """Positionen ohne Eigentuemer stehen im Entwurf unter der Sammelgruppe - mit ihren Zeilen."""
    cid, _ = _setup(admin_client, db, admin_user)
    ohne = _mp(admin_client, "Ohne")
    _position(admin_client, cid, label="Ohne", kind="meter", measuring_point_id=ohne, sort_order=5)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    anhang = _ok(admin_client.get(f"{BASE}/{cid}/runs/{run['id']}/anhang"))

    gruppe = next(e for e in anhang["empfaenger"] if e["owner_name"] == "(ohne Empfaenger)")
    assert [z["label"] for z in gruppe["lines"]] == ["Ohne"]


def test_rechnungsanhang_ohne_ergebnis_409(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    """Ohne berechnetes Ergebnis (blockierender Eingabefehler) gibt es keinen Anhang."""
    cid, _ = _setup(admin_client, db, admin_user)
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    lauf = db.get(BillingRun, run["id"])
    assert lauf is not None
    lauf.result = None
    db.commit()
    assert admin_client.get(f"{BASE}/{cid}/runs/{run['id']}/anhang").status_code == 409


def _uebersicht(client: TestClient, **params: str) -> dict[str, Any]:
    return _ok(client.get(f"{BASE}/overview", params=params))


def test_monatsuebersicht_zeigt_status_je_kreis_und_monat(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    """Monatsuebersicht: Rechnung da, Entwurf, festgeschrieben, vollstaendig uebertragen."""
    cid, _ = _setup(admin_client, db, admin_user)

    # Nur die Rechnung ist importiert (Juli ist leer, August hat eine Rechnung).
    zellen = {
        z["monat"]: z
        for z in _uebersicht(admin_client, von="2026-07", bis="2026-08")["kreise"][0]["monate"]
    }
    assert [z["status"] for z in zellen.values()] == ["leer", "rechnung"]
    assert (zellen["2026-07"]["invoice"], zellen["2026-08"]["invoice"]) == (False, True)
    assert zellen["2026-08"]["run_id"] is None

    # Entwurf
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    zelle = _uebersicht(admin_client, von="2026-08", bis="2026-08")["kreise"][0]["monate"][0]
    assert (zelle["status"], zelle["run_id"], zelle["version"]) == ("entwurf", run["id"], 1)
    assert zelle["empfaenger"] == 2 and zelle["uebertragen"] == 0

    # Festgeschrieben
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{run['id']}/finalize"))
    zelle = _uebersicht(admin_client, von="2026-08", bis="2026-08")["kreise"][0]["monate"][0]
    assert (zelle["status"], zelle["eur"]) == ("festgeschrieben", "250.00")

    # Beide Empfaenger uebertragen
    for name in ("Muster A KG", "Muster Intern"):
        _ok(
            admin_client.post(
                f"{BASE}/{cid}/runs/{run['id']}/transfers",
                json={"owner_name": name, "belegnummer": None},
            ),
            201,
        )
    zelle = _uebersicht(admin_client, von="2026-08", bis="2026-08")["kreise"][0]["monate"][0]
    assert (zelle["status"], zelle["uebertragen"]) == ("uebertragen", 2)


def test_monatsuebersicht_zeitraum(admin_client: TestClient, admin_user: User, db: Session) -> None:
    """Ohne Zeitraum die letzten zwoelf Monate; ungueltige Angaben werden abgewiesen."""
    _setup(admin_client, db, admin_user)
    ohne = _uebersicht(admin_client)
    assert len(ohne["monate"]) == 12
    assert ohne["monate"][-1] == ohne["bis"] == date.today().strftime("%Y-%m")

    assert admin_client.get(f"{BASE}/overview", params={"von": "2026-13"}).status_code == 422
    assert (
        admin_client.get(
            f"{BASE}/overview", params={"von": "2026-08", "bis": "2026-07"}
        ).status_code
        == 422
    )
    assert (
        admin_client.get(
            f"{BASE}/overview", params={"von": "2000-01", "bis": "2026-08"}
        ).status_code
        == 422
    )


def _audit_lauf(client: TestClient, run_id: int) -> list[tuple[str, dict[str, Any]]]:
    eintraege = _ok(client.get("/api/v1/audit-log", params={"limit": 500}))
    return [
        (e["action"], e["diff"] or {})
        for e in sorted(cast(list[dict[str, Any]], eintraege), key=lambda e: e["id"])
        if e["entity_type"] == "billing_run" and e["entity_id"] == run_id
    ]


def test_lebenszyklus_wird_protokolliert(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    """Abnahme: jede Aktion am Lauf steht im Audit-Log, die neue Version mit Begruendung."""
    cid, _ = _setup(admin_client, db, admin_user)
    v1 = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    url = f"{BASE}/{cid}/runs/{v1['id']}/lines/{_zeile(v1, 'Pumpe')['id']}"
    _ok(admin_client.patch(url, json={"manual_stand_neu": "210", "manual_note": "Foto"}))
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{v1['id']}/finalize"))
    body = {"monat": "2026-08", "begruendung": "Ablesefehler"}
    v2 = _ok(admin_client.post(f"{BASE}/{cid}/runs", json=body), 201)
    _ok(admin_client.post(f"{BASE}/{cid}/runs/{v2['id']}/finalize"))

    erster = _audit_lauf(admin_client, v1["id"])
    assert [a for a, _ in erster] == ["create", "update", "billing_run_finalized"]
    felder = erster[1][1]["felder"]
    assert felder["manual_stand_neu"] == {"from": None, "to": "210"}
    assert felder["manual_note"] == {"from": None, "to": "Foto"}
    zweiter = _audit_lauf(admin_client, v2["id"])
    assert [a for a, _ in zweiter] == ["create", "billing_run_finalized"]
    assert (zweiter[0][1]["version"], zweiter[0][1]["begruendung"]) == (2, "Ablesefehler")
    assert zweiter[1][1]["ersetzt_run_id"] == v1["id"]


def test_abrechnen_an_mieter_bildet_eigenen_empfaenger(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    """Pumpe rechnet an ihren Mieter ab: eigener Empfaenger in Lauf, Anhang und Uebertragung."""
    cid, mps = _setup(admin_client, db, admin_user)
    mieter = _ok(admin_client.post("/api/v1/mieters", json={"last_name": "Pumpen GmbH"}), 201)
    _ok(
        admin_client.post(
            f"/api/v1/measuring-points/{mps['Pumpe']}/change-mieter",
            json={"mieter_id": mieter["id"], "valid_from": "2026-01-01"},
        )
    )
    _ok(
        admin_client.post(
            f"/api/v1/measuring-points/{mps['Pumpe']}/change-bill-to",
            json={"bill_to": "mieter", "valid_from": "2026-01-01"},
        )
    )
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    pumpe = _zeile(run, "Pumpe")
    assert (pumpe["owner_name"], pumpe["recipient_kind"]) == ("Pumpen GmbH", "mieter")
    assert _zeile(run, "Stall")["recipient_kind"] == "owner"
    assert not [b for b in run["befunde"] if b["blocking"]]

    anhang = _ok(admin_client.get(f"{BASE}/{cid}/runs/{run['id']}/anhang"))
    gruppen = {e["owner_name"]: e for e in anhang["empfaenger"]}
    assert [z["label"] for z in gruppen["Pumpen GmbH"]["lines"]] == ["Pumpe"]
    assert gruppen["Pumpen GmbH"]["eur"] == "50.00"  # 200 kWh x 0,25
    assert gruppen["Muster A KG"]["eur"] == "175.00"  # Stall 125 + Rest 50

    _ok(admin_client.post(f"{BASE}/{cid}/runs/{run['id']}/finalize"))
    url = f"{BASE}/{cid}/runs/{run['id']}/transfers"
    nach = _ok(admin_client.post(url, json={"owner_name": "Pumpen GmbH"}), 201)
    pumpen = next(e for e in nach["empfaenger"] if e["owner_name"] == "Pumpen GmbH")
    assert pumpen["transfer"] is not None


def test_mieter_gleichnamig_mit_eigentuemer_eine_rechnung(
    admin_client: TestClient, admin_user: User, db: Session
) -> None:
    """Heisst der Mieter wie ein Eigentuemer, landen beide auf einer Rechnung - ohne Sperre."""
    cid, mps = _setup(admin_client, db, admin_user)
    mieter = _ok(admin_client.post("/api/v1/mieters", json={"last_name": "Muster A KG"}), 201)
    pumpe = f"/api/v1/measuring-points/{mps['Pumpe']}"
    _ok(
        admin_client.post(
            f"{pumpe}/change-mieter", json={"mieter_id": mieter["id"], "valid_from": "2026-01-01"}
        )
    )
    _ok(
        admin_client.post(
            f"{pumpe}/change-bill-to", json={"bill_to": "mieter", "valid_from": "2026-01-01"}
        )
    )
    run = _ok(admin_client.post(f"{BASE}/{cid}/runs", json={"monat": "2026-08"}), 201)
    assert _zeile(run, "Pumpe")["recipient_kind"] == "mieter"
    assert not [b for b in run["befunde"] if b["blocking"]]

    anhang = _ok(admin_client.get(f"{BASE}/{cid}/runs/{run['id']}/anhang"))
    extern = next(e for e in anhang["empfaenger"] if e["owner_name"] == "Muster A KG")
    assert [z["label"] for z in extern["lines"]] == ["Stall", "Pumpe", "Rest"]
    assert extern["eur"] == "225.00"
