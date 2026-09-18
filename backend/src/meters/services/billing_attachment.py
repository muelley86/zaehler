"""Rechnungsanhang je Empfaenger (Plan Phase 5, Abschnitt "Rechnungsanhang").

Aufbau wie das Abrechnungsblatt der Excel-Mappe, damit der Kunde die Zusammensetzung des
Strompreises nachvollziehen kann:

1. Kopf (Rechnungsleger, Empfaenger, Leistungsmonat, Rechnung des Lieferanten, Abnahmestelle)
2. Preisermittlung (Einkaufspreis, Umlagepreis, Abrechnungspreis ct/kWh und EUR/kWh)
3. Zaehlertabelle (Bezeichnung, KST, Zaehlernummer, Faktor, Stand alt/neu mit Kennzeichnung,
   Korrektur, kWh, Betrag, Rechnungszeile)
4. Summierung je Kostenstelle
5. Zusammensetzung des Betrags je Abschnitt der Lieferantenrechnung
6. Betrag gesamt netto

Alle Werte stammen aus dem Lauf (``run.result`` und ``run.lines``) - hier wird nichts neu
gerechnet, nur umsortiert. ``run.result`` ist der beim Anlegen eingefrorene Snapshot von
``billing_run.ergebnis_json``; wer dessen Schluessel aendert, muss die Anhaenge alter Versionen
mitdenken (dieses Modul greift bewusst direkt zu, damit ein Bruch im Test auffaellt).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from meters.billing.calculation import STANDARD_POSITIONEN
from meters.core.problem import ProblemError
from meters.models import BillingCircle, BillingInvoice, BillingRun
from meters.schemas.billing_attachment import (
    BillingAttachmentHead,
    BillingAttachmentKst,
    BillingAttachmentLine,
    BillingAttachmentPosition,
    BillingAttachmentRead,
    BillingAttachmentRecipient,
    BillingAttachmentSection,
    BillingAttachmentSummary,
)
from meters.services.billing_run import OHNE_EMPFAENGER
from meters.services.billing_transfer import UMSATZSTEUER, monatsname

_ABSCHNITT_VON = {p.name: p.abschnitt for p in STANDARD_POSITIONEN}
_NULL = Decimal("0")


def _d(wert: Any) -> Decimal:
    return Decimal(str(wert)) if wert is not None else _NULL


def _abschnitte(result: dict[str, Any], gruppe: dict[str, Any]) -> list[BillingAttachmentSection]:
    """Positionen je Abschnitt der Lieferantenrechnung, mit Zwischensumme und ct/kWh."""
    z = gruppe["zusammensetzung"]
    namen: list[str] = result["positionen"]
    sections: list[BillingAttachmentSection] = []
    for i, abschnitt in enumerate(result["abschnitte"]):
        positionen = [
            BillingAttachmentPosition(name=name, betrag=_d(z["betraege"][j]), ct=_d(z["cts"][j]))
            for j, name in enumerate(namen)
            if _ABSCHNITT_VON.get(name) == abschnitt
        ]
        sections.append(
            BillingAttachmentSection(
                name=abschnitt,
                positionen=positionen,
                summe=_d(z["zwischensummen"][i]),
                ct=_d(z["zwischen_cts"][i]),
            )
        )
    if _d(z["sonstige"]) != _NULL:
        sections.append(
            BillingAttachmentSection(
                name="Sonstige",
                positionen=[],
                summe=_d(z["sonstige"]),
                ct=_d(z["sonstige_ct"]),
            )
        )
    return sections


def attachment(
    run: BillingRun, circle: BillingCircle, invoice: BillingInvoice
) -> BillingAttachmentRead:
    """Anhang je Empfaenger aus dem gespeicherten Ergebnis des Laufs."""
    if run.result is None:
        raise ProblemError(
            status_code=409,
            title="Billing run has no result",
            detail="Der Lauf konnte nicht berechnet werden - siehe blockierende Befunde.",
        )
    result = run.result
    zeilen_je_empfaenger: dict[str, list[BillingAttachmentLine]] = {}
    for z in sorted(run.lines, key=lambda z: z.sort_order):
        zeilen_je_empfaenger.setdefault(z.owner_name or OHNE_EMPFAENGER, []).append(
            BillingAttachmentLine(
                label=z.label,
                kostenstelle=z.kostenstelle,
                serial_numbers=z.serial_numbers,
                transformer_factor=z.transformer_factor,
                stand_alt=z.effektiv_stand_alt,
                stand_alt_art="manuell" if z.manual_stand_alt is not None else z.stand_alt_art,
                stand_neu=z.effektiv_stand_neu,
                stand_neu_art="manuell" if z.manual_stand_neu is not None else z.stand_neu_art,
                korrektur_kwh=z.effektiv_korrektur,
                kwh=z.kwh,
                eur=z.eur,
                invoice_line=z.invoice_line,
            )
        )
    empfaenger = [
        BillingAttachmentRecipient(
            owner_name=gruppe["name"],
            internal_allocation=bool(gruppe["intern"]),
            lines=zeilen_je_empfaenger.get(gruppe["name"], []),
            kostenstellen=[
                BillingAttachmentKst(kst=k["kst"], kwh=_d(k["kwh"]), eur=_d(k["eur"]))
                for k in gruppe["kostenstellen"]
            ],
            abschnitte=_abschnitte(result, gruppe),
            kwh=_d(gruppe["kwh"]),
            eur=_d(gruppe["eur"]),
            gesamt_ct=_d(gruppe["zusammensetzung"]["gesamt_ct"]),
        )
        for gruppe in result["gruppen"]
    ]
    kopf = BillingAttachmentHead(
        circle_code=circle.code,
        circle_name=circle.name,
        rechnungsleger=circle.rechnungsleger,
        abnahmestelle=circle.abnahmestelle,
        marktlokation=circle.marktlokation,
        monat=run.monat,
        monatsname=monatsname(run.monat),
        version=run.version,
        status=run.status,
        rechnung_nummer=invoice.nummer,
        rechnung_datum=invoice.datum,
        zeitraum_von=invoice.period_from,
        zeitraum_bis=invoice.period_to,
    )
    summe = BillingAttachmentSummary(
        einkaufspreis_ct=_d(result["einkaufspreis_ct"]),
        umlagepreis_ct=_d(result["umlagepreis_ct"]),
        preis_ct=_d(result["preis_ct"]),
        preis_eur=_d(result["preis_eur"]),
        bezugsmenge=_d(result["bezugsmenge"]),
        zaehlersumme=_d(result["zaehlersumme"]),
        gesamtkosten=_d(result["gesamtkosten"]),
        gesamt_eur=_d(result["gesamt_eur"]),
        umsatzsteuer=UMSATZSTEUER,
    )
    return BillingAttachmentRead(head=kopf, summary=summe, empfaenger=empfaenger)
