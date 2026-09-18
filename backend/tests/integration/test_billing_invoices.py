"""Eingangsrechnungen je Abrechnungskreis (Migration 0038, Plan Phase 4a).

Die Test-PDFs werden hier von Hand erzeugt (eine Seite, Helvetica) und enthalten ausschliesslich
fiktive Werte - das Repo ist oeffentlich.
"""

from __future__ import annotations

import hashlib
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient

from meters.api.v1 import billing_invoices

BASE = "/api/v1/billing-circles"

RECHNUNG = """Rechnungsnr.: {nummer}
Rechnungsdat.:10.09.2026
Monatsrechnung Zeitraum {von} - {bis} Strom
Abnahmestellen-ID {aid}
Marktlokation 12345678901
Verbrauch 1.000,00 kWh
Leistungsspitze 12,50 kW
Rechnungsbetrag (netto) 1.350,00 EUR
Energiebeschaffung
Energielieferung Standard {von} - {bis} 19 1.000,00 10,0000 100,00
Gesamtbetrag (netto) 19 100,00
Steuern, Abgaben und Entgelte
NEV-Umlage {von} - {bis} 19 1.000,00 1,5590 15,59
Beschaffungsentgelte / -nebenkosten {von} - {bis} 19 4,41
Gesamtbetrag (netto) 19 20,00
Netzentgelte
Wirkarbeit - Netznutzung {von} - {bis} 19 1.230,00
Gesamtbetrag (netto) 19 1.230,00"""


def _pdf(
    nummer: str = "TEST-100",
    von: str = "01.08.2026",
    bis: str = "31.08.2026",
    aid: str = "AID-000001",
) -> bytes:
    """Minimale einseitige PDF mit einer Textzeile je Rechnungszeile."""
    text = RECHNUNG.format(nummer=nummer, von=von, bis=bis, aid=aid)
    zeilen = [
        z.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)") for z in text.split("\n")
    ]
    stream = "\n".join(
        ["BT", "/F1 9 Tf", "11 TL", "40 800 Td", *(f"({z}) Tj T*" for z in zeilen), "ET"]
    ).encode("ascii")
    objekte = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for nr, objekt in enumerate(objekte, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % nr + objekt + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objekte) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objekte) + 1,
        xref,
    )
    return bytes(out)


def _circle(client: TestClient, code: str = "NORD", aid: str = "AID-000001") -> int:
    resp = client.post(
        BASE,
        json={
            "code": code,
            "name": "Musterhof",
            "rechnungsleger": "Musterhof GmbH",
            "abnahmestelle": aid,
        },
    )
    assert resp.status_code == 201, resp.text
    return int(resp.json()["id"])


def _upload(client: TestClient, cid: int, daten: bytes, name: str = "rechnung.pdf") -> Any:
    return client.post(f"{BASE}/{cid}/invoices", files={"file": (name, daten, "application/pdf")})


def _ok(resp: Any, status: int = 201) -> dict[str, Any]:
    assert resp.status_code == status, resp.text
    return cast(dict[str, Any], resp.json())


def _list(client: TestClient, cid: int) -> list[dict[str, Any]]:
    resp = client.get(f"{BASE}/{cid}/invoices")
    assert resp.status_code == 200, resp.text
    return cast(list[dict[str, Any]], resp.json())


def test_upload_speichert_kopf_positionen_und_pdf(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    daten = _pdf()
    inv = _ok(_upload(admin_client, cid, daten, name="..\\ordner/August 2026.pdf"))
    assert inv["nummer"] == "TEST-100"
    assert (inv["period_from"], inv["period_to"]) == ("2026-08-01", "2026-08-31")
    assert inv["betrag_netto"] == "1350.00"
    assert inv["verbrauch_kwh"] == "1000.00"
    assert inv["pdf_sha256"] == hashlib.sha256(daten).hexdigest()
    assert inv["pdf_size"] == len(daten)
    assert inv["pdf_filename"] == "August 2026.pdf"
    assert inv["hinweise"] == []
    assert [p["name"] for p in inv["positions"]] == [
        "Energielieferung",
        "NEV-Umlage",
        "Beschaffungsentgelte / -nebenkosten",
        "Wirkarbeit - Netznutzung",
    ]
    assert inv["positions"][0]["menge"] == "1000.00"
    assert inv["positions"][2]["menge"] is None

    assert [i["id"] for i in _list(admin_client, cid)] == [inv["id"]]
    detail = _ok(admin_client.get(f"{BASE}/{cid}/invoices/{inv['id']}"), 200)
    assert detail["nummer"] == "TEST-100"
    pdf = admin_client.get(f"{BASE}/{cid}/invoices/{inv['id']}/pdf")
    assert pdf.status_code == 200
    assert pdf.content == daten
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.headers["content-disposition"] == f'inline; filename="rechnung-{inv["id"]}.pdf"'


def test_doppelte_datei_nummer_oder_monat_409(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    _ok(_upload(admin_client, cid, _pdf()))
    assert _upload(admin_client, cid, _pdf()).status_code == 409
    gleiche_nummer = _pdf(von="01.09.2026", bis="30.09.2026")
    assert _upload(admin_client, cid, gleiche_nummer).status_code == 409
    gleicher_monat = _upload(admin_client, cid, _pdf(nummer="TEST-101", bis="30.08.2026"))
    assert gleicher_monat.status_code == 409
    assert "TEST-100" in gleicher_monat.json()["detail"]
    _ok(_upload(admin_client, cid, _pdf(nummer="TEST-101", von="01.09.2026", bis="30.09.2026")))
    assert [i["nummer"] for i in _list(admin_client, cid)] == ["TEST-101", "TEST-100"]


def test_falsche_abnahmestelle_oder_marktlokation_422(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    resp = _upload(admin_client, cid, _pdf(aid="AID-000002"))
    assert resp.status_code == 422
    assert "AID-000002" in resp.json()["detail"]
    _ok(admin_client.patch(f"{BASE}/{cid}", json={"marktlokation": "99999999999"}), 200)
    assert _upload(admin_client, cid, _pdf()).status_code == 422
    assert _list(admin_client, cid) == []


@pytest.mark.parametrize(
    "daten",
    [b"GIF89a kein pdf", b"%PDF-1.4\nkaputt", _pdf().replace(b"Netzentgelte", b"Netzentgelt_")],
)
def test_unlesbare_datei_422(admin_client: TestClient, daten: bytes) -> None:
    cid = _circle(admin_client)
    resp = _upload(admin_client, cid, daten)
    assert resp.status_code == 422, resp.text
    assert _list(admin_client, cid) == []


def test_zu_grosse_datei_413(admin_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(billing_invoices, "MAX_PDF_BYTES", 100)
    cid = _circle(admin_client)
    assert _upload(admin_client, cid, _pdf()).status_code == 413


def test_loeschen_entfernt_rechnung_und_pdf(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    inv = _ok(_upload(admin_client, cid, _pdf()))
    assert admin_client.delete(f"{BASE}/{cid}").status_code == 409
    assert admin_client.delete(f"{BASE}/{cid}/invoices/{inv['id']}").status_code == 204
    assert admin_client.get(f"{BASE}/{cid}/invoices/{inv['id']}").status_code == 404
    assert admin_client.get(f"{BASE}/{cid}/invoices/{inv['id']}/pdf").status_code == 404
    # dieselbe Datei ist danach wieder importierbar
    _ok(_upload(admin_client, cid, _pdf()))


def test_rechnung_eines_anderen_kreises_404(admin_client: TestClient) -> None:
    cid = _circle(admin_client)
    andere = _circle(admin_client, code="SUED", aid="AID-000009")
    inv = _ok(_upload(admin_client, cid, _pdf()))
    assert admin_client.get(f"{BASE}/{andere}/invoices/{inv['id']}").status_code == 404
    assert admin_client.get(f"{BASE}/{andere}/invoices/{inv['id']}/pdf").status_code == 404
    assert admin_client.delete(f"{BASE}/{andere}/invoices/{inv['id']}").status_code == 404
    assert admin_client.get(f"{BASE}/999/invoices").status_code == 404


def test_nur_admin(recorder_client: TestClient) -> None:
    assert recorder_client.get(f"{BASE}/1/invoices").status_code == 403
    assert _upload(recorder_client, 1, _pdf()).status_code == 403
    assert recorder_client.get(f"{BASE}/1/invoices/1/pdf").status_code == 403
    assert recorder_client.get(f"{BASE}/1/invoices/1").status_code == 403
    assert recorder_client.delete(f"{BASE}/1/invoices/1").status_code == 403


def test_monat_je_kreis_ist_db_constraint(admin_client: TestClient) -> None:
    """Paralleler Upload: die Vorabpruefung sieht nichts, der Unique-Constraint greift (409)."""
    from datetime import date
    from decimal import Decimal

    from sqlalchemy.exc import IntegrityError

    from meters.db import SessionLocal
    from meters.models import BillingInvoice

    cid = _circle(admin_client)
    _ok(_upload(admin_client, cid, _pdf()))
    with SessionLocal() as db:
        db.add(
            BillingInvoice(
                circle_id=cid,
                nummer="TEST-999",
                datum=date(2026, 9, 10),
                aid="AID-000001",
                marktlokation="12345678901",
                period_from=date(2026, 8, 15),
                period_to=date(2026, 8, 31),
                period_month="2026-08",
                verbrauch_kwh=Decimal("1"),
                leistungsspitze_kw=Decimal("1"),
                betrag_netto=Decimal("1"),
                hinweise=[],
                pdf_sha256="b" * 64,
                pdf_size=1,
                pdf_filename="x.pdf",
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
