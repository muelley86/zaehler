"""Monatsuebersicht des Abrechnungsmoduls (Plan Phase 5).

Eine Zeile je Abrechnungskreis, eine Spalte je Monat; die Zelle sagt, wie weit der Monat ist:

``leer`` (nichts da) -> ``rechnung`` (Lieferantenrechnung importiert) -> ``entwurf`` ->
``festgeschrieben`` -> ``uebertragen`` (alle Empfaenger nach Agrarmonitor gebucht).

Gezeigt wird je Monat die hoechste nicht ersetzte Version; ein Entwurf neben einem
festgeschriebenen Lauf (neue Version) hat also Vorrang, weil er die offene Arbeit ist.

Die Uebersicht kommt mit vier Abfragen aus - je Kreis oder Monat nachzuladen waere bei einem Jahr
und mehreren Kreisen eine Flut kleiner Queries.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session, noload

from meters.core.problem import ProblemError
from meters.models import (
    BillingCircle,
    BillingInvoice,
    BillingRun,
    BillingRunStatus,
    BillingTransfer,
)
from meters.schemas.billing_overview import (
    BillingMonthCell,
    BillingMonthOverview,
    BillingMonthRow,
    BillingMonthStatus,
)

MAX_MONATE = 36
STANDARD_MONATE = 12


def monat_von(tag: date) -> str:
    return f"{tag.year:04d}-{tag.month:02d}"


def monatsliste(von: str, bis: str) -> list[str]:
    """Alle Monate von ``von`` bis ``bis`` einschliesslich (JJJJ-MM, aufsteigend)."""
    jahr, monat = (int(t) for t in von.split("-"))
    liste: list[str] = []
    while (aktuell := f"{jahr:04d}-{monat:02d}") <= bis:
        liste.append(aktuell)
        jahr, monat = (jahr + 1, 1) if monat == 12 else (jahr, monat + 1)
    return liste


def zeitraum(von: str | None, bis: str | None, heute: date | None = None) -> tuple[str, str]:
    """Standard: die letzten zwoelf Monate bis zum laufenden Monat."""
    ende = bis or monat_von(heute or date.today())
    if von is None:
        jahr, monat = (int(t) for t in ende.split("-"))
        zurueck = monat - (STANDARD_MONATE - 1)
        jahr, monat = (jahr + (zurueck - 1) // 12, (zurueck - 1) % 12 + 1)
        start = f"{jahr:04d}-{monat:02d}"
    else:
        start = von
    if start > ende:
        raise ProblemError(
            status_code=422,
            title="Invalid period",
            detail=f"Der Zeitraum beginnt nach seinem Ende ({start} > {ende}).",
        )
    if len(monatsliste(start, ende)) > MAX_MONATE:
        raise ProblemError(
            status_code=422,
            title="Period too long",
            detail=f"Die Uebersicht zeigt hoechstens {MAX_MONATE} Monate.",
        )
    return start, ende


def _status(
    lauf: BillingRun | None, rechnung: bool, empfaenger: int, uebertragen: int
) -> BillingMonthStatus:
    if lauf is None:
        return "rechnung" if rechnung else "leer"
    if lauf.status is BillingRunStatus.ENTWURF:
        return "entwurf"
    if empfaenger and uebertragen >= empfaenger:
        return "uebertragen"
    return "festgeschrieben"


def overview(db: Session, von: str | None, bis: str | None) -> BillingMonthOverview:
    """Status je Kreis und Monat."""
    start, ende = zeitraum(von, bis)
    monate = monatsliste(start, ende)
    kreise = db.scalars(select(BillingCircle).order_by(BillingCircle.code)).all()
    rechnungen = {
        (circle_id, monat)
        for circle_id, monat in db.execute(
            select(BillingInvoice.circle_id, BillingInvoice.period_month).where(
                BillingInvoice.period_month.in_(monate)
            )
        )
    }
    laeufe_im_zeitraum = select(BillingRun.id).where(BillingRun.monat.in_(monate))
    uebertragungen: dict[int, int] = {
        run_id: anzahl
        for run_id, anzahl in db.execute(
            select(BillingTransfer.run_id, func.count())
            .where(BillingTransfer.run_id.in_(laeufe_im_zeitraum))
            .group_by(BillingTransfer.run_id)
        )
    }
    # Hoechste nicht ersetzte Version je Kreis und Monat gewinnt (aufsteigend, die letzte bleibt).
    laeufe: dict[tuple[int, str], BillingRun] = {}
    for gefunden in db.scalars(
        select(BillingRun)
        .where(BillingRun.monat.in_(monate), BillingRun.status != BillingRunStatus.ERSETZT)
        # ``lines`` haengt mit lazy="selectin" am Lauf; die Uebersicht braucht keine Zeilen.
        .options(noload(BillingRun.lines))
        .order_by(BillingRun.version)
    ):
        laeufe[(gefunden.circle_id, gefunden.monat)] = gefunden

    zeilen: list[BillingMonthRow] = []
    for kreis in kreise:
        zellen: list[BillingMonthCell] = []
        for monat in monate:
            lauf = laeufe.get((kreis.id, monat))
            rechnung = (kreis.id, monat) in rechnungen
            ergebnis = (lauf.result or {}) if lauf else {}
            gruppen = ergebnis.get("gruppen", [])
            uebertragen = uebertragungen.get(lauf.id, 0) if lauf else 0
            zellen.append(
                BillingMonthCell(
                    monat=monat,
                    status=_status(lauf, rechnung, len(gruppen), uebertragen),
                    invoice=rechnung,
                    run_id=lauf.id if lauf else None,
                    version=lauf.version if lauf else None,
                    eur=ergebnis.get("gesamt_eur"),
                    empfaenger=len(gruppen),
                    uebertragen=uebertragen,
                    blocking=sum(1 for b in lauf.befunde if b.get("blocking")) if lauf else 0,
                )
            )
        zeilen.append(
            BillingMonthRow(circle_id=kreis.id, code=kreis.code, name=kreis.name, monate=zellen)
        )
    return BillingMonthOverview(von=start, bis=ende, monate=monate, kreise=zeilen)
