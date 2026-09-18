"""Historie des Abrechnungsmoduls (Plan Phase 5): Versionsvergleich und Verbrauchsverlauf.

Beides liest nur bereits gespeicherte Laeufe - es wird nichts neu gerechnet:

* ``compare_runs`` stellt zwei Versionen desselben Monats gegenueber. Fuer jede Position steht da,
  ob sie gleich blieb, sich geaendert hat (mit den betroffenen Feldern) oder nur in einer der
  beiden Versionen vorkommt. So ist nachvollziehbar, was eine Korrekturversion bewirkt hat.
* ``history`` zeigt den Verlauf der festgeschriebenen Monate je Empfaenger und je Position -
  die Grundlage fuer "warum ist der Betrag diesen Monat hoeher?".
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.core.problem import ProblemError
from meters.models import BillingRun, BillingRunLine, BillingRunStatus
from meters.schemas.billing_history import (
    BillingHistory,
    BillingHistoryPoint,
    BillingHistoryRow,
    BillingRunDiff,
    BillingRunDiffLine,
    BillingRunDiffSide,
    DiffStatus,
)
from meters.services.billing_overview import monatsliste, zeitraum

_NULL = Decimal("0")

# Felder, deren Aenderung im Vergleich benannt wird (Reihenfolge = Anzeigereihenfolge).
_VERGLEICHSFELDER = (
    "owner_name",
    "kostenstelle",
    "invoice_line",
    "serial_numbers",
    "transformer_factor",
    "stand_alt",
    "stand_neu",
    "korrektur",
    "kwh",
    "eur",
)


def _wert(zeile: BillingRunLine, feld: str) -> object:
    """Vergleichswert eines Feldes - Staende und Korrektur mit den manuellen Werten."""
    if feld == "stand_alt":
        return zeile.effektiv_stand_alt
    if feld == "stand_neu":
        return zeile.effektiv_stand_neu
    if feld == "korrektur":
        return zeile.effektiv_korrektur
    return getattr(zeile, feld)


def _seite(run: BillingRun) -> BillingRunDiffSide:
    ergebnis = run.result or {}
    return BillingRunDiffSide(
        run_id=run.id,
        version=run.version,
        status=run.status,
        begruendung=run.begruendung,
        finalized_at=run.finalized_at,
        preis_eur=ergebnis.get("preis_eur"),
        gesamt_eur=ergebnis.get("gesamt_eur"),
        saldo_eur=ergebnis.get("saldo_eur"),
    )


def _delta(alt: Decimal | None, neu: Decimal | None) -> Decimal | None:
    if alt is None and neu is None:
        return None
    return (neu or _NULL) - (alt or _NULL)


def _summe(run: BillingRun, feld: str) -> Decimal:
    return sum((getattr(z, feld) or _NULL for z in run.lines), _NULL)


def compare_runs(alt: BillingRun, neu: BillingRun) -> BillingRunDiff:
    """Zwei Versionen desselben Monats gegenueberstellen (Reihenfolge nach der neueren Version)."""
    if alt.circle_id != neu.circle_id or alt.monat != neu.monat:
        raise ProblemError(
            status_code=400,
            title="Runs not comparable",
            detail="Vergleichen laesst sich nur derselbe Monat desselben Kreises.",
        )
    if alt.version > neu.version:
        alt, neu = neu, alt

    alte = {z.label: z for z in alt.lines}
    neue = {z.label: z for z in neu.lines}
    reihenfolge = [z.label for z in sorted(neu.lines, key=lambda z: z.sort_order)]
    reihenfolge += [
        z.label for z in sorted(alt.lines, key=lambda z: z.sort_order) if z.label not in neue
    ]

    zeilen: list[BillingRunDiffLine] = []
    for label in reihenfolge:
        a, n = alte.get(label), neue.get(label)
        felder = (
            [feld for feld in _VERGLEICHSFELDER if _wert(a, feld) != _wert(n, feld)]
            if a is not None and n is not None
            else []
        )
        status: DiffStatus
        if a is None:
            status = "neu"
        elif n is None:
            status = "entfallen"
        else:
            status = "geaendert" if felder else "gleich"
        zeilen.append(
            BillingRunDiffLine(
                label=label,
                status=status,
                felder=felder,
                kwh_alt=a.kwh if a else None,
                kwh_neu=n.kwh if n else None,
                eur_alt=a.eur if a else None,
                eur_neu=n.eur if n else None,
                kwh_delta=_delta(a.kwh if a else None, n.kwh if n else None),
                eur_delta=_delta(a.eur if a else None, n.eur if n else None),
            )
        )

    return BillingRunDiff(
        monat=neu.monat,
        alt=_seite(alt),
        neu=_seite(neu),
        zeilen=zeilen,
        kwh_delta=_summe(neu, "kwh") - _summe(alt, "kwh"),
        eur_delta=_summe(neu, "eur") - _summe(alt, "eur"),
    )


def other_version(db: Session, run: BillingRun, mit: int | None) -> BillingRun:
    """Gegenstueck fuer den Vergleich: angegebene Version oder die naechstaeltere."""
    if mit is not None:
        andere = db.get(BillingRun, mit)
        if andere is None or andere.circle_id != run.circle_id:
            raise ProblemError(status_code=404, title="Billing run not found")
        return andere
    vorige = db.scalars(
        select(BillingRun)
        .where(
            BillingRun.circle_id == run.circle_id,
            BillingRun.monat == run.monat,
            BillingRun.version < run.version,
        )
        .order_by(BillingRun.version.desc())
        .limit(1)
    ).first()
    if vorige is None:
        raise ProblemError(
            status_code=404,
            title="No earlier version",
            detail="Zu diesem Monat gibt es nur eine Version.",
        )
    return vorige


def history(db: Session, circle_id: int, von: str | None, bis: str | None) -> BillingHistory:
    """Verlauf der festgeschriebenen Monate je Empfaenger und je Position."""
    start, ende = zeitraum(von, bis)
    monate = monatsliste(start, ende)
    laeufe = db.scalars(
        select(BillingRun)
        .where(
            BillingRun.circle_id == circle_id,
            BillingRun.monat.in_(monate),
            BillingRun.status == BillingRunStatus.FESTGESCHRIEBEN,
        )
        .order_by(BillingRun.monat, BillingRun.version)
    ).all()

    empfaenger: dict[str, dict[str, BillingHistoryPoint]] = defaultdict(dict)
    positionen: dict[str, dict[str, BillingHistoryPoint]] = defaultdict(dict)
    intern: dict[str, bool] = {}
    for lauf in laeufe:
        je_empfaenger: dict[str, list[BillingRunLine]] = defaultdict(list)
        for zeile in lauf.lines:
            je_empfaenger[zeile.owner_name or ""].append(zeile)
            positionen[zeile.label][lauf.monat] = BillingHistoryPoint(
                monat=lauf.monat,
                version=lauf.version,
                kwh=zeile.kwh or _NULL,
                eur=zeile.eur or _NULL,
            )
        for name, zeilen in je_empfaenger.items():
            intern[name] = any(z.internal_allocation for z in zeilen)
            empfaenger[name][lauf.monat] = BillingHistoryPoint(
                monat=lauf.monat,
                version=lauf.version,
                kwh=sum((z.kwh or _NULL for z in zeilen), _NULL),
                eur=sum((z.eur or _NULL for z in zeilen), _NULL),
            )

    def zeilen_aus(
        daten: dict[str, dict[str, BillingHistoryPoint]], mit_intern: bool
    ) -> list[BillingHistoryRow]:
        return [
            BillingHistoryRow(
                name=name,
                internal_allocation=mit_intern and intern.get(name, False),
                punkte=[punkte[m] for m in monate if m in punkte],
            )
            for name, punkte in sorted(daten.items())
        ]

    gefuellt = {lauf.monat for lauf in laeufe}
    return BillingHistory(
        monate=[m for m in monate if m in gefuellt],
        empfaenger=zeilen_aus(empfaenger, True),
        positionen=zeilen_aus(positionen, False),
    )
