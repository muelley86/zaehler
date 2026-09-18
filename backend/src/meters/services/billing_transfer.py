"""Uebertragungsansicht Agrarmonitor: je Empfaenger die Zeilen des Rechnungsformulars (Phase 5).

Aufbau wie das Rechnungsformular in Agrarmonitor: Datum
(Monatsletzter), Menge kWh, Beschreibung, Preis EUR/kWh, MwSt., Gesamt. Zusammengefasst wird nach
der **Rechnungszeile** der Position (``invoice_line``; Standard "Strom (gewerblich) Mieter" bzw.
"... Kostenstelle {KST}", siehe ``billing_circle.invoice_line_for``).

Entscheidung des Nutzers (2026-09-18): der Betrag einer Zeile wird **wie in Agrarmonitor** aus der
gerundeten Menge berechnet - ``ROUND(Menge x Preis, 2)``. Die Summe je Zaehler aus dem Lauf
(Rechnungsanhang) kann dadurch um wenige Cent abweichen; die Differenz wird ausgewiesen.

Interne Empfaenger (``internal_allocation``) bekommen keine Rechnung, sondern den KOST-Stapel; sie
stehen mit Kennzeichen in der Ansicht, damit auch ihre Buchung abgehakt werden kann.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.billing.calculation import round_half_up
from meters.core.problem import ProblemError
from meters.models import BillingRun, BillingRunLine, BillingRunStatus, BillingTransfer
from meters.schemas.billing_transfer import (
    BillingTransferRead,
    BillingTransferRow,
    BillingTransferState,
    BillingTransferView,
)
from meters.services.billing_readings import monatsgrenzen

# Agrarmonitor: Menge mit 2 NK, Preis EUR/kWh mit 2 NK, MwSt. fest 19,0 % (Formular).
UMSATZSTEUER = Decimal("19.0")
MONATE = (
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
)


def monatsname(monat: str) -> str:
    jahr, mon = (int(t) for t in monat.split("-"))
    return f"{MONATE[mon - 1]} {jahr}"


def kopfsatz(monat: str) -> str:
    """Kopftext des Agrarmonitor-Formulars."""
    return (
        f"Für den Stromverbrauch im Monat {monatsname(monat)} erlauben wir uns Ihnen folgenden "
        "Betrag in Rechnung zu stellen."
    )


def _beschreibung(zeile: BillingRunLine) -> str:
    return zeile.invoice_line or zeile.label


def _zeilen(
    zeilen_je_text: dict[str, list[BillingRunLine]],
    reihenfolge: dict[str, int],
    stichtag: date,
    preis: Decimal,
) -> list[BillingTransferRow]:
    zeilen: list[BillingTransferRow] = []
    for beschreibung in sorted(zeilen_je_text, key=lambda b: reihenfolge[b]):
        teil = zeilen_je_text[beschreibung]
        menge = round_half_up(sum((z.kwh or Decimal("0") for z in teil), Decimal("0")), 2)
        zeilen.append(
            BillingTransferRow(
                datum=stichtag,
                menge=menge,
                beschreibung=beschreibung,
                preis_eur=preis,
                umsatzsteuer=UMSATZSTEUER,
                betrag=round_half_up(menge * preis, 2),
                betrag_lauf=round_half_up(
                    sum((z.eur or Decimal("0") for z in teil), Decimal("0")), 2
                ),
                positionen=[z.label for z in teil],
            )
        )
    return zeilen


def transfer_view(db: Session, run: BillingRun) -> BillingTransferView:
    """Formularzeilen je Empfaenger, Summen und Uebertragungsstatus."""
    _, stichtag = monatsgrenzen(run.monat)
    preis = Decimal(str((run.result or {}).get("preis_eur", "0")))
    intern = {z.owner_name or "": z.internal_allocation for z in run.lines}
    status = {
        t.owner_name: BillingTransferState(
            id=t.id,
            belegnummer=t.belegnummer,
            note=t.note,
            transferred_at=t.transferred_at,
            transferred_by=t.transferred_by,
        )
        for t in db.scalars(select(BillingTransfer).where(BillingTransfer.run_id == run.id))
    }
    gruppen: dict[str, dict[str, list[BillingRunLine]]] = defaultdict(lambda: defaultdict(list))
    reihenfolge: dict[str, dict[str, int]] = defaultdict(dict)
    for zeile in sorted(run.lines, key=lambda z: z.sort_order):
        empfaenger = zeile.owner_name or ""
        beschreibung = _beschreibung(zeile)
        gruppen[empfaenger][beschreibung].append(zeile)
        reihenfolge[empfaenger].setdefault(beschreibung, zeile.sort_order)

    ansicht: list[BillingTransferRead] = []
    for empfaenger, zeilen_je_text in gruppen.items():
        zeilen = _zeilen(zeilen_je_text, reihenfolge[empfaenger], stichtag, preis)
        netto = round_half_up(sum((z.betrag for z in zeilen), Decimal("0")), 2)
        lauf = round_half_up(sum((z.betrag_lauf for z in zeilen), Decimal("0")), 2)
        ansicht.append(
            BillingTransferRead(
                owner_name=empfaenger,
                internal_allocation=intern.get(empfaenger, False),
                rows=zeilen,
                netto=netto,
                brutto=round_half_up(netto * (1 + UMSATZSTEUER / 100), 2),
                netto_lauf=lauf,
                differenz=round_half_up(netto - lauf, 2),
                transfer=status.get(empfaenger),
            )
        )
    return BillingTransferView(
        run_id=run.id,
        monat=run.monat,
        monatsname=monatsname(run.monat),
        stichtag=stichtag,
        kopfsatz=kopfsatz(run.monat),
        preis_eur=preis,
        umsatzsteuer=UMSATZSTEUER,
        empfaenger=ansicht,
    )


def _assert_festgeschrieben(run: BillingRun) -> None:
    if run.status is not BillingRunStatus.FESTGESCHRIEBEN:
        raise ProblemError(
            status_code=409,
            title="Billing run is not final",
            detail="Erst festschreiben, dann nach Agrarmonitor uebertragen.",
        )


def mark_transferred(
    db: Session,
    run: BillingRun,
    owner_name: str,
    *,
    belegnummer: str | None,
    note: str | None,
    user_id: int,
) -> BillingTransfer:
    _assert_festgeschrieben(run)
    treffer = [z for z in run.lines if (z.owner_name or "") == owner_name]
    if not treffer:
        raise ProblemError(
            status_code=404,
            title="Recipient not in run",
            detail=f"Der Lauf hat keine Zeile fuer {owner_name!r}.",
        )
    eintrag = BillingTransfer(
        run_id=run.id,
        owner_id=treffer[0].owner_id,
        owner_name=owner_name,
        belegnummer=belegnummer,
        note=note,
        transferred_at=datetime.now(UTC),
        transferred_by=user_id,
    )
    db.add(eintrag)
    return eintrag


def unmark_transferred(db: Session, run: BillingRun, transfer_id: int) -> BillingTransfer:
    _assert_festgeschrieben(run)
    eintrag = db.get(BillingTransfer, transfer_id)
    if eintrag is None or eintrag.run_id != run.id:
        raise ProblemError(status_code=404, title="Transfer not found")
    db.delete(eintrag)
    return eintrag
