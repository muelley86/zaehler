"""Vergleich frei gewaehlter Abrechnungslaeufe eines Kreises.

Zwei Laeufe ergeben die Gegenueberstellung zweier Monate, mehrere eine Reihe. Jede Zeile
(Kennzahl, Empfaenger, Position) traegt je Lauf ihren Wert und die Abweichung zum vorherigen Lauf
der Auswahl. Wie der Versionsvergleich und der Verlauf (``billing_history``) liest das nur
gespeicherte Laeufe - es wird nichts neu gerechnet.

Anders als der Versionsvergleich nennt dieser Vergleich keine geaenderten Staende: Ueber Monate
hinweg aendern die sich immer. Benannt werden nur Stammdaten-Merkmale einer Position.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from meters.core.problem import ProblemError
from meters.models import BillingRun, BillingRunLine
from meters.schemas.billing_compare import (
    BillingCompareMetric,
    BillingCompareRow,
    BillingCompareRun,
    BillingCompareValue,
    BillingComparison,
    CompareUnit,
)
from meters.schemas.billing_run import BillingRunTotals
from meters.services.billing_run import ergebnis_summen, prozent_von

MIN_LAEUFE = 2
MAX_LAEUFE = 12

_NULL = Decimal("0")

# Merkmale einer Position, deren Aenderung zwischen zwei Laeufen benannt wird.
_MERKMALE = ("owner_name", "kostenstelle", "invoice_line", "serial_numbers", "transformer_factor")


def _dec(wert: object) -> Decimal | None:
    return None if wert is None else Decimal(str(wert))


def _reihe(
    werte: Sequence[Decimal | None], *, mit_prozent: bool = True
) -> list[BillingCompareValue]:
    """Werte in Lauf-Reihenfolge um die Abweichung zum jeweils vorherigen Lauf ergaenzen."""
    reihe: list[BillingCompareValue] = []
    vorher: Decimal | None = None
    for index, wert in enumerate(werte):
        delta = None if index == 0 or wert is None or vorher is None else wert - vorher
        prozent = (
            prozent_von(delta, abs(vorher))
            if mit_prozent and delta is not None and vorher is not None
            else None
        )
        reihe.append(BillingCompareValue(wert=wert, delta=delta, delta_prozent=prozent))
        vorher = wert
    return reihe


def _aus_ergebnis(key: str) -> Callable[[BillingRun, BillingRunTotals | None], Decimal | None]:
    return lambda run, _summen: _dec((run.result or {}).get(key))


def _aus_summen(feld: str) -> Callable[[BillingRun, BillingRunTotals | None], Decimal | None]:
    return lambda _run, summen: None if summen is None else _dec(getattr(summen, feld))


# Kennzahlen in Anzeigereihenfolge: Schluessel, Einheit, Quelle.
_KENNZAHLEN: tuple[
    tuple[str, CompareUnit, Callable[[BillingRun, BillingRunTotals | None], Decimal | None]], ...
] = (
    ("preis", "eur_kwh", _aus_ergebnis("preis_eur")),
    ("bezugsmenge", "kwh", _aus_ergebnis("bezugsmenge")),
    ("zaehlersumme", "kwh", _aus_ergebnis("zaehlersumme")),
    ("gesamtkosten", "eur", _aus_summen("gesamtkosten_eur")),
    ("weiterberechnet", "eur", _aus_summen("gesamt_eur")),
    ("differenz_eur", "eur", _aus_summen("differenz_eur")),
    ("differenz_prozent", "prozent", _aus_summen("differenz_prozent")),
    ("differenz_kwh", "kwh", _aus_summen("differenz_kwh")),
    ("differenz_kwh_prozent", "prozent", _aus_summen("differenz_kwh_prozent")),
)


def _kennzahlen(laeufe: Sequence[BillingRun]) -> list[BillingCompareMetric]:
    summen = [ergebnis_summen(lauf) for lauf in laeufe]
    return [
        BillingCompareMetric(
            key=key,
            einheit=einheit,
            # Abweichung zweier Prozentwerte sind Prozentpunkte - davon kein weiteres Prozent.
            werte=_reihe(
                [quelle(lauf, s) for lauf, s in zip(laeufe, summen, strict=True)],
                mit_prozent=einheit != "prozent",
            ),
        )
        for key, einheit, quelle in _KENNZAHLEN
    ]


def _positions_reihenfolge(laeufe: Sequence[BillingRun]) -> list[str]:
    """Reihenfolge des juengsten Laufs; Positionen aelterer Laeufe an ihrem alten Platz dahinter."""
    reihenfolge: list[str] = []
    for lauf in reversed(laeufe):
        for zeile in sorted(lauf.lines, key=lambda z: z.sort_order):
            if zeile.label not in reihenfolge:
                reihenfolge.append(zeile.label)
    return reihenfolge


def _merkmale_geaendert(zeilen: Sequence[BillingRunLine | None]) -> list[str]:
    vorhandene = [z for z in zeilen if z is not None]
    return [feld for feld in _MERKMALE if len({getattr(z, feld) for z in vorhandene}) > 1]


def _positionen(laeufe: Sequence[BillingRun]) -> list[BillingCompareRow]:
    je_lauf = [{z.label: z for z in lauf.lines} for lauf in laeufe]
    zeilen: list[BillingCompareRow] = []
    for label in _positions_reihenfolge(laeufe):
        treffer = [zeilen_des_laufs.get(label) for zeilen_des_laufs in je_lauf]
        zeilen.append(
            BillingCompareRow(
                name=label,
                internal_allocation=any(z.internal_allocation for z in treffer if z is not None),
                merkmale_geaendert=_merkmale_geaendert(treffer),
                kwh=_reihe([None if z is None else z.kwh for z in treffer]),
                eur=_reihe([None if z is None else z.eur for z in treffer]),
            )
        )
    return zeilen


def _summe(zeilen: Sequence[BillingRunLine], feld: str) -> Decimal | None:
    """Summe der Zeilen eines Empfaengers; ohne Zeilen gibt es den Empfaenger im Lauf nicht."""
    if not zeilen:
        return None
    return sum((getattr(z, feld) or _NULL for z in zeilen), _NULL)


def _empfaenger(laeufe: Sequence[BillingRun]) -> list[BillingCompareRow]:
    namen = sorted({z.owner_name or "" for lauf in laeufe for z in lauf.lines})
    zeilen: list[BillingCompareRow] = []
    for name in namen:
        je_lauf = [[z for z in lauf.lines if (z.owner_name or "") == name] for lauf in laeufe]
        zeilen.append(
            BillingCompareRow(
                name=name,
                internal_allocation=any(
                    z.internal_allocation for gruppe in je_lauf for z in gruppe
                ),
                merkmale_geaendert=[],
                kwh=_reihe([_summe(gruppe, "kwh") for gruppe in je_lauf]),
                eur=_reihe([_summe(gruppe, "eur") for gruppe in je_lauf]),
            )
        )
    return zeilen


def _laeufe(db: Session, circle_id: int, run_ids: Sequence[int]) -> list[BillingRun]:
    """Die gewaehlten Laeufe des Kreises, chronologisch (Monat, dann Version)."""
    if not MIN_LAEUFE <= len(run_ids) <= MAX_LAEUFE or len(set(run_ids)) != len(run_ids):
        raise ProblemError(
            status_code=422,
            title="Invalid run selection",
            detail=(f"Vergleichen lassen sich {MIN_LAEUFE} bis {MAX_LAEUFE} verschiedene Laeufe."),
        )
    laeufe = db.scalars(
        select(BillingRun)
        .where(BillingRun.circle_id == circle_id, BillingRun.id.in_(run_ids))
        .order_by(BillingRun.monat, BillingRun.version)
    ).all()
    # Unbekannte Laeufe und Laeufe anderer Kreise sind nicht unterscheidbar - beides 404.
    if len(laeufe) != len(run_ids):
        raise ProblemError(status_code=404, title="Billing run not found")
    return list(laeufe)


def compare_series(db: Session, circle_id: int, run_ids: Sequence[int]) -> BillingComparison:
    """Zwei bis zwoelf Laeufe eines Kreises nebeneinanderstellen."""
    laeufe = _laeufe(db, circle_id, run_ids)
    return BillingComparison(
        laeufe=[
            BillingCompareRun(
                run_id=lauf.id,
                monat=lauf.monat,
                version=lauf.version,
                status=lauf.status,
                hat_ergebnis=lauf.result is not None,
            )
            for lauf in laeufe
        ],
        kennzahlen=_kennzahlen(laeufe),
        empfaenger=_empfaenger(laeufe),
        positionen=_positionen(laeufe),
    )
