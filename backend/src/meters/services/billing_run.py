"""Abrechnungslauf: Snapshot aus der App, Berechnung mit dem Rechenkern, Festschreiben (Phase 4c).

Abbildung auf den Rechenkern (``billing/calculation.py``):
- Gruppe = Empfaenger (Eigentuemer zum Monatsende bzw. Empfaenger der Restposition); Reihenfolge
  nach erster Position (``sort_order``), interne Umlage zuletzt. Ohne Empfaenger: Gruppe
  ``OHNE_EMPFAENGER`` (Berechnung als Vorschau moeglich, Festschreiben blockiert).
- Verbraucher = Position (Bezeichnung eindeutig im Kreis), KST, Wandlerfaktor (1 ohne Faktor),
  Restposition; Unterzaehler -> ``Abzug(haupt, unter)``.
- Monatsdaten = Rechnung (Bezugsmenge, Nettobetrag, Positionen), Staende/Korrektur je Zeile
  (manuelle Werte vor App-Werten), Zusatzkosten und Aufschlaege des Laufs.

Befunde tragen ``blocking``: blockierende verhindern das Festschreiben (fehlender Empfaenger,
ungueltige Eingaben, Zeilenpruefung nicht OK, Rechnungspositionen gehen nicht auf), die uebrigen
sind Hinweise (interpolierte/weit entfernte Staende, Saldo-Grenze, Abweichung zum Vormonat ...).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any, cast

from sqlalchemy import CursorResult, select, update
from sqlalchemy.orm import Session

from meters.billing.calculation import (
    ENERGIE_POSITION,
    PRUEF_OK,
    STANDARD_POSITIONEN,
    Ablesung,
    Abzug,
    Ergebnis,
    Gruppe,
    Kreis,
    Monatsdaten,
    Rechnungsposition,
    Verbraucher,
    berechne,
    pruefe_eingaben,
    round_half_up,
    validiere,
)
from meters.core.config import settings
from meters.core.problem import ProblemError
from meters.models import (
    BillingCircle,
    BillingInvoice,
    BillingPositionKind,
    BillingRun,
    BillingRunLine,
    BillingRunStatus,
)
from meters.schemas.billing_run import BillingRunTotals
from meters.services.billing_circle import check_circle
from meters.services.billing_readings import monatsgrenzen, readings_for_month

OHNE_EMPFAENGER = "(ohne Empfaenger)"
# Blockierende Befunde des Pruefberichts; die uebrigen sind Hinweise.
_BLOCKIEREND_CHECK = {
    "ohne_eigentuemer",
    "empfaenger_mehrdeutig",
    "hauptzaehler_inaktiv",
    "keine_positionen",
}
_NULL = Decimal("0")
_MENGEN_TOLERANZ = Decimal("0.005")  # wie die Excel-Kontrolle "Kontrolle Menge"

Befund = dict[str, Any]


def befund(
    position_id: int | None, label: str, code: str, message: str, *, blocking: bool
) -> Befund:
    return {
        "position_id": position_id,
        "label": label,
        "code": code,
        "message": message,
        "blocking": blocking,
    }


def vormonat(monat: str) -> str:
    jahr, mon = (int(t) for t in monat.split("-"))
    return f"{jahr - 1}-12" if mon == 1 else f"{jahr}-{mon - 1:02d}"


def assert_entwurf(run: BillingRun) -> None:
    if run.status is not BillingRunStatus.ENTWURF:
        raise ProblemError(
            status_code=409,
            title="Billing run is final",
            detail="Der Lauf ist festgeschrieben und kann nicht mehr geaendert werden.",
        )


def invoice_for_month(db: Session, circle: BillingCircle, monat: str) -> BillingInvoice:
    invoice = db.scalar(
        select(BillingInvoice).where(
            BillingInvoice.circle_id == circle.id, BillingInvoice.period_month == monat
        )
    )
    if invoice is None:
        raise ProblemError(
            status_code=422,
            title="No invoice for month",
            detail=f"Fuer {monat} ist im Kreis {circle.code} keine Rechnung importiert.",
        )
    return invoice


# --- Snapshot aus der App --------------------------------------------------------------------


def snapshot(
    db: Session, circle: BillingCircle, monat: str
) -> tuple[list[BillingRunLine], list[Befund]]:
    """Zeilen und Befunde zum Monatsende aus Pruefbericht und Monatsend-Staenden."""
    _, neu_tag = monatsgrenzen(monat)
    pruefung = check_circle(db, circle, neu_tag)
    monatsende = readings_for_month(db, circle, monat)
    staende = {r.position_id: r for r in monatsende.positions}
    label_von = {r.position_id: r.label for r in pruefung.positions}
    zeilen: list[BillingRunLine] = []
    for i, r in enumerate(pruefung.positions):
        s = staende.get(r.position_id)
        zeile = BillingRunLine(
            sort_order=i,
            position_id=r.position_id,
            label=r.label,
            kind=r.kind,
            parent_label=label_von.get(r.parent_position_id) if r.parent_position_id else None,
            owner_id=r.owner_id,
            owner_name=r.owner_name,
            recipient_kind=r.recipient_kind,
            internal_allocation=r.internal_allocation,
            kostenstelle=r.kostenstelle,
            mieter_name=r.mieter_name,
            invoice_line=r.invoice_line,
            measuring_point_id=r.measuring_point_id,
            measuring_point_name=r.measuring_point_name,
            serial_numbers=s.serial_numbers if s else "",
            transformer_factor=s.transformer_factor if s else None,
        )
        if s is not None:
            if s.stand_alt is not None:
                zeile.stand_alt = s.stand_alt.wert
                zeile.stand_alt_art = s.stand_alt.art
                zeile.stand_alt_abstand = s.stand_alt.abstand_tage
            if s.stand_neu is not None:
                zeile.stand_neu = s.stand_neu.wert
                zeile.stand_neu_art = s.stand_neu.art
                zeile.stand_neu_abstand = s.stand_neu.abstand_tage
            zeile.korrektur_kwh = s.korrektur_kwh
            zeile.korrektur_note = s.korrektur_note
        zeilen.append(zeile)
    befunde = [
        befund(f.position_id, f.label, f.code, f.message, blocking=f.code in _BLOCKIEREND_CHECK)
        for f in pruefung.findings
    ]
    befunde += [
        befund(f.position_id, f.label, f.code, f.message, blocking=False)
        for f in monatsende.findings
    ]
    return zeilen, befunde


# --- Rechenkern --------------------------------------------------------------------------------


def _gruppe(zeile: BillingRunLine) -> str:
    return zeile.owner_name or OHNE_EMPFAENGER


def kreis_und_daten(
    lines: Iterable[BillingRunLine], invoice: BillingInvoice, run: BillingRun
) -> tuple[Kreis, Monatsdaten]:
    zeilen = sorted(lines, key=lambda z: z.sort_order)
    reihenfolge: list[str] = []
    intern: dict[str, bool] = {}
    for z in zeilen:
        if _gruppe(z) not in intern:
            reihenfolge.append(_gruppe(z))
            intern[_gruppe(z)] = z.internal_allocation
    namen = sorted(reihenfolge, key=lambda g: (intern[g], reihenfolge.index(g)))
    rang = {g: i for i, g in enumerate(namen)}
    verbraucher = tuple(
        Verbraucher(
            name=z.label,
            gruppe=_gruppe(z),
            kst=str(z.kostenstelle) if z.kostenstelle is not None else None,
            faktor=Decimal(z.transformer_factor or 1),
            rest=z.kind is BillingPositionKind.REST,
        )
        for z in sorted(zeilen, key=lambda z: (rang[_gruppe(z)], z.sort_order))
    )
    kreis = Kreis(
        gruppen=tuple(Gruppe(g, intern[g]) for g in namen),
        verbraucher=verbraucher,
        abzuege=tuple(Abzug(z.parent_label, z.label) for z in zeilen if z.parent_label),
        positionen=STANDARD_POSITIONEN,
    )
    daten = Monatsdaten(
        bezugsmenge=invoice.verbrauch_kwh,
        rechnungsbetrag=invoice.betrag_netto,
        positionen=tuple(
            Rechnungsposition(p.name, p.betrag, p.menge, p.preis_ct, p.kategorie)
            for p in invoice.positions
        ),
        verbraucher={
            z.label: Ablesung(
                stand_alt=z.effektiv_stand_alt,
                stand_neu=z.effektiv_stand_neu,
                korrektur=z.effektiv_korrektur,
            )
            for z in zeilen
            if z.kind is BillingPositionKind.METER
        },
        zusatzkosten=run.zusatzkosten,
        aufschlag_prozent=run.aufschlag_prozent,
        aufschlag_ct=run.aufschlag_ct,
    )
    return kreis, daten


def _json(wert: Any) -> Any:
    if isinstance(wert, Decimal):
        return format(wert, "f")
    if isinstance(wert, dict):
        return {k: _json(v) for k, v in wert.items()}
    if isinstance(wert, list | tuple):
        return [_json(v) for v in wert]
    return wert


def saldo_grenze(erg: Ergebnis) -> Decimal:
    """Fachkonzept /5: Warnung ab |Saldo| > Zaehlersumme x 1 ct + 0,50 EUR."""
    return (abs(erg.zaehlersumme) * Decimal("0.01") + Decimal("0.50")).quantize(Decimal("0.01"))


def _dec(daten: dict[str, Any], key: str) -> Decimal | None:
    wert = daten.get(key)
    return None if wert is None else Decimal(str(wert))


def differenz_eur(result: dict[str, Any] | None) -> Decimal | None:
    """Summe Betraege - Gesamtkosten (= -Saldo; positiv = mehr weiterberechnet), ohne ``-0.00``."""
    saldo = None if result is None else _dec(result, "saldo_eur")
    return None if saldo is None else Decimal(0) - saldo


def ergebnis_summen(run: BillingRun) -> BillingRunTotals | None:
    """Kennzahlen fuer die Ergebnisuebersicht aus dem eingefrorenen Snapshot ``run.result``.

    Wird beim Ausliefern abgeleitet statt gespeichert, damit auch alte festgeschriebene Laeufe sie
    haben. Rechnungsbetrag = Gesamtkosten - Zusatzkosten (``berechne``: Gesamtkosten =
    Rechnungsbetrag + Zusatzkosten). Fehlt im Snapshot ein benoetigter Wert, gibt es keine
    Kennzahlen (``None``) statt eines Fehlers - der Lauf bleibt lesbar.
    """
    erg = run.result
    if erg is None:
        return None
    saldo = _dec(erg, "saldo_eur")
    grenze = _dec(erg, "saldo_grenze_eur")
    gesamtkosten = _dec(erg, "gesamtkosten")
    zaehlersumme = _dec(erg, "zaehlersumme")
    gesamt_eur = _dec(erg, "gesamt_eur")
    gruppen = erg.get("gruppen")
    if (
        saldo is None
        or grenze is None
        or gesamtkosten is None
        or zaehlersumme is None
        or gesamt_eur is None
        or not isinstance(gruppen, list)
    ):
        return None
    extern_kwh = extern_eur = intern_kwh = intern_eur = Decimal(0)
    for g in gruppen:
        kwh, eur = _dec(g, "kwh"), _dec(g, "eur")
        if kwh is None or eur is None:
            return None
        if g.get("intern"):
            intern_kwh, intern_eur = intern_kwh + kwh, intern_eur + eur
        else:
            extern_kwh, extern_eur = extern_kwh + kwh, extern_eur + eur
    return BillingRunTotals(
        rechnungsbetrag_eur=gesamtkosten - run.zusatzkosten,
        zusatzkosten_eur=run.zusatzkosten,
        gesamtkosten_eur=gesamtkosten,
        extern_kwh=extern_kwh,
        extern_eur=extern_eur,
        intern_kwh=intern_kwh,
        intern_eur=intern_eur,
        gesamt_kwh=zaehlersumme,
        gesamt_eur=gesamt_eur,
        differenz_eur=Decimal(0) - saldo,
        rahmen_eur=grenze,
        # Gleiche Bedingung wie der Befund ``saldo_grenze`` (dort: > Grenze = Hinweis).
        im_rahmen=abs(saldo) <= grenze,
    )


def ergebnis_json(kreis: Kreis, erg: Ergebnis) -> dict[str, Any]:
    daten: dict[str, Any] = _json(
        {
            "positionen_summe": erg.positionen_summe,
            "positionen_kontrolle": erg.positionen_kontrolle,
            "kategorien": erg.kategorien,
            "bezugsmenge": erg.bezugsmenge,
            "gesamtkosten": erg.gesamtkosten,
            "zaehlersumme": erg.zaehlersumme,
            "nicht_gemessen_kwh": erg.nicht_gemessen_kwh,
            "einkaufspreis_ct": erg.einkaufspreis_ct,
            "umlagepreis_ct": erg.umlagepreis_ct,
            "implizite_umlage": erg.implizite_umlage,
            "preis_ct": erg.preis_ct,
            "preis_eur": erg.preis_eur,
            "gesamt_eur": erg.gesamt_eur,
            "saldo_eur": erg.saldo_eur,
            "saldo_grenze_eur": saldo_grenze(erg),
            "fehleranzahl": erg.fehleranzahl,
            "positionen": [p.name for p in kreis.positionen],
            "abschnitte": list(dict.fromkeys(p.abschnitt for p in kreis.positionen)),
            "gruppen": [
                {
                    "name": g.name,
                    "intern": g.intern,
                    "kwh": erg.gruppen[g.name].kwh,
                    "eur": erg.gruppen[g.name].eur,
                    "kostenstellen": [asdict(k) for k in erg.gruppen[g.name].kostenstellen],
                    "zusammensetzung": asdict(erg.gruppen[g.name].zusammensetzung),
                }
                for g in kreis.gruppen
            ],
        }
    )
    return daten


def _vorlauf_befunde(db: Session, run: BillingRun) -> list[Befund]:
    vorlauf = db.scalar(
        select(BillingRun).where(
            BillingRun.circle_id == run.circle_id,
            BillingRun.monat == vormonat(run.monat),
            BillingRun.status == BillingRunStatus.FESTGESCHRIEBEN,
        )
    )
    if vorlauf is None:
        return [
            befund(
                None,
                "Vormonat",
                "kein_vorlauf",
                f"Kein festgeschriebener Lauf fuer {vormonat(run.monat)}; Stand alt ungeprueft.",
                blocking=False,
            )
        ]
    vorher_stand = {z.position_id: z.effektiv_stand_neu for z in vorlauf.lines if z.position_id}
    vorher_kwh = {z.position_id: z.kwh for z in vorlauf.lines if z.position_id}
    grenze = Decimal(settings.billing_consumption_deviation_percent)
    befunde = []
    for z in run.lines:
        if z.position_id is None:
            continue
        stand, jetzt = vorher_stand.get(z.position_id), z.effektiv_stand_alt
        if stand is not None and jetzt is not None and stand != jetzt:
            befunde.append(
                befund(
                    z.position_id,
                    z.label,
                    "stand_alt_vorlauf",
                    f"Stand alt {jetzt} weicht vom Stand neu des Vormonats ({stand}) ab.",
                    blocking=False,
                )
            )
        alt_kwh = vorher_kwh.get(z.position_id)
        if alt_kwh is None or alt_kwh <= _NULL or z.kwh is None:
            continue
        abweichung = (z.kwh - alt_kwh) / alt_kwh * 100
        if abs(abweichung) > grenze:
            befunde.append(
                befund(
                    z.position_id,
                    z.label,
                    "verbrauch_abweichung",
                    f"Verbrauch {z.kwh} kWh weicht um {round_half_up(abweichung, 1)} % vom "
                    f"Vormonat ({alt_kwh} kWh) ab (Grenze {grenze} %).",
                    blocking=False,
                )
            )
    return befunde


def _rechnungs_befunde(invoice: BillingInvoice, monat: str) -> list[Befund]:
    """Kontrolle Zeitraum und Kontrolle Menge wie im Blatt "Erfassung"."""
    von, bis = monatsgrenzen(monat)
    befunde = []
    if (invoice.period_from, invoice.period_to) != (von + timedelta(days=1), bis):
        befunde.append(
            befund(
                None,
                "Rechnung",
                "rechnungszeitraum",
                f"Rechnungszeitraum {invoice.period_from} - {invoice.period_to} weicht vom "
                f"Abrechnungsmonat ab.",
                blocking=False,
            )
        )
    energie = next((p for p in invoice.positions if p.name == ENERGIE_POSITION), None)
    menge = energie.menge if energie is not None else None
    if menge is not None and abs(menge - invoice.verbrauch_kwh) > _MENGEN_TOLERANZ:
        befunde.append(
            befund(
                None,
                "Rechnung",
                "menge_energielieferung",
                f"Menge der Energielieferung ({menge} kWh) weicht vom Verbrauch der Rechnung "
                f"({invoice.verbrauch_kwh} kWh) ab.",
                blocking=False,
            )
        )
    return befunde


def _kontroll_befunde(erg: Ergebnis) -> list[Befund]:
    """Kontrollzellen der Abrechnungsblaetter: Kostenstellen-Summen = Gruppensumme, Summe der
    Gruppen = Summe der Betraege; nicht gemessene Menge darf nicht negativ sein."""
    befunde = []
    for name, gruppe in erg.gruppen.items():
        kwh = sum((k.kwh for k in gruppe.kostenstellen), _NULL)
        eur = round_half_up(sum((k.eur for k in gruppe.kostenstellen), _NULL), 2)
        if (kwh, eur) != (gruppe.kwh, gruppe.eur):
            befunde.append(
                befund(
                    None,
                    name,
                    "kontrolle_kostenstellen",
                    f"Summe je Kostenstelle ({kwh} kWh / {eur} EUR) weicht von der Summe des "
                    f"Empfaengers ({gruppe.kwh} kWh / {gruppe.eur} EUR) ab.",
                    blocking=True,
                )
            )
    summe = round_half_up(sum((g.eur for g in erg.gruppen.values()), _NULL), 2)
    if summe != erg.gesamt_eur:
        befunde.append(
            befund(
                None,
                "Abstimmung",
                "kontrolle_summe",
                f"Summe der Empfaenger ({summe} EUR) weicht von der Summe der Betraege "
                f"({erg.gesamt_eur} EUR) ab.",
                blocking=True,
            )
        )
    if erg.nicht_gemessen_kwh is not None and erg.nicht_gemessen_kwh < _NULL:
        befunde.append(
            befund(
                None,
                "Zaehlersumme",
                "nicht_gemessen_negativ",
                f"Die Zaehler messen {-erg.nicht_gemessen_kwh} kWh mehr als die Bezugsmenge.",
                blocking=False,
            )
        )
    return befunde


def _manuell(z: BillingRunLine) -> bool:
    return (
        z.manual_stand_alt is not None
        or z.manual_stand_neu is not None
        or z.manual_korrektur_kwh is not None
    )


def berechne_lauf(db: Session, run: BillingRun) -> None:
    """Rechnet den Lauf neu: Zeilenergebnisse, ``result`` und ``befunde``."""
    invoice = db.get(BillingInvoice, run.invoice_id)
    assert invoice is not None  # RESTRICT-FK
    befunde: list[Befund] = list(run.befunde_snapshot)
    for z in run.lines:
        z.kwh = z.eur = None
        z.pruefung = None
        if _manuell(z):
            befunde.append(
                befund(
                    z.position_id, z.label, "manuell", f"Manuell: {z.manual_note}", blocking=False
                )
            )
    kreis, daten = kreis_und_daten(run.lines, invoice, run)
    try:
        validiere(kreis)
        pruefe_eingaben(kreis, daten)
        erg = berechne(kreis, daten)
    except ValueError as exc:
        run.result = None
        befunde.append(befund(None, "Berechnung", "berechnung", str(exc), blocking=True))
        run.befunde = befunde + _vorlauf_befunde(db, run)
        return
    for z in run.lines:
        zeile = erg.zeilen[z.label]
        z.kwh, z.eur, z.pruefung = zeile.kwh, zeile.eur, zeile.pruefung
        if zeile.pruefung != PRUEF_OK:
            befunde.append(
                befund(z.position_id, z.label, "pruefung", zeile.pruefung, blocking=True)
            )
    if erg.positionen_kontrolle != _NULL:
        befunde.append(
            befund(
                None,
                "Rechnung",
                "positionen_kontrolle",
                f"Rechnungspositionen weichen um {erg.positionen_kontrolle} EUR "
                "vom Nettobetrag ab.",
                blocking=True,
            )
        )
    if abs(erg.saldo_eur) > saldo_grenze(erg):
        befunde.append(
            befund(
                None,
                "Saldo",
                "saldo_grenze",
                f"Saldo {erg.saldo_eur} EUR ueber der Grenze {saldo_grenze(erg)} EUR.",
                blocking=False,
            )
        )
    befunde += _rechnungs_befunde(invoice, run.monat)
    befunde += _kontroll_befunde(erg)
    run.result = ergebnis_json(kreis, erg)
    run.befunde = befunde + _vorlauf_befunde(db, run)


# --- Lebenszyklus ------------------------------------------------------------------------------


def create_run(
    db: Session,
    circle: BillingCircle,
    monat: str,
    *,
    zusatzkosten: Decimal,
    aufschlag_prozent: Decimal,
    aufschlag_ct: Decimal,
    begruendung: str | None,
    user_id: int,
) -> BillingRun:
    invoice = invoice_for_month(db, circle, monat)
    vorhanden = list(
        db.scalars(
            select(BillingRun).where(BillingRun.circle_id == circle.id, BillingRun.monat == monat)
        )
    )
    if any(r.status is BillingRunStatus.ENTWURF for r in vorhanden):
        raise ProblemError(
            status_code=409,
            title="Draft exists",
            detail=f"Fuer {monat} gibt es bereits einen Entwurf.",
        )
    if any(r.status is BillingRunStatus.FESTGESCHRIEBEN for r in vorhanden) and not begruendung:
        raise ProblemError(
            status_code=422,
            title="Reason required",
            detail=f"{monat} ist festgeschrieben - eine neue Version braucht eine Begruendung.",
        )
    version = max((r.version for r in vorhanden), default=0) + 1
    zeilen, befunde = snapshot(db, circle, monat)
    run = BillingRun(
        circle_id=circle.id,
        monat=monat,
        version=version,
        status=BillingRunStatus.ENTWURF,
        invoice_id=invoice.id,
        zusatzkosten=zusatzkosten,
        aufschlag_prozent=aufschlag_prozent,
        aufschlag_ct=aufschlag_ct,
        begruendung=begruendung,
        befunde_snapshot=befunde,
        befunde=[],
        created_by=user_id,
        lines=zeilen,
    )
    db.add(run)
    berechne_lauf(db, run)
    return run


def refresh_run(db: Session, circle: BillingCircle, run: BillingRun) -> None:
    """Neuaufbau aus der App; manuelle Werte bleiben je Position erhalten."""
    assert_entwurf(run)
    manuell = {z.position_id: z for z in run.lines if z.position_id is not None and _manuell(z)}
    zeilen, befunde = snapshot(db, circle, run.monat)
    for z in zeilen:
        alt = manuell.get(z.position_id) if z.position_id is not None else None
        if alt is not None:
            z.manual_stand_alt = alt.manual_stand_alt
            z.manual_stand_neu = alt.manual_stand_neu
            z.manual_korrektur_kwh = alt.manual_korrektur_kwh
            z.manual_note = alt.manual_note
    run.lines.clear()
    db.flush()
    run.lines.extend(zeilen)
    run.befunde_snapshot = befunde
    berechne_lauf(db, run)


def blocking(run: BillingRun) -> list[Befund]:
    return [b for b in run.befunde if b.get("blocking")]


def finalize_run(db: Session, run: BillingRun, user_id: int) -> BillingRun | None:
    """Schreibt den Lauf fest; liefert die dadurch ersetzte Version (falls vorhanden)."""
    assert_entwurf(run)
    berechne_lauf(db, run)  # Vormonats-Befunde auf den aktuellen Stand bringen
    offen = blocking(run)
    if offen or run.result is None:
        raise ProblemError(
            status_code=409,
            title="Billing run has blocking findings",
            detail=f"{len(offen)} blockierende Befunde - Festschreiben nicht moeglich.",
        )
    db.flush()
    # Bedingtes UPDATE statt Attribut setzen: ein paralleles Festschreiben desselben Laufs wartet
    # auf die Schreibsperre und trifft danach keine Zeile mehr (409) - kein doppelter Audit-Eintrag.
    getroffen = cast(
        "CursorResult[Any]",
        db.execute(
            update(BillingRun)
            .where(BillingRun.id == run.id, BillingRun.status == BillingRunStatus.ENTWURF)
            .values(
                status=BillingRunStatus.FESTGESCHRIEBEN,
                finalized_at=datetime.now(UTC),
                finalized_by=user_id,
            )
            .execution_options(synchronize_session=False)
        ),
    ).rowcount
    if getroffen != 1:
        raise ProblemError(
            status_code=409,
            title="Billing run is final",
            detail="Der Lauf wurde soeben bereits festgeschrieben.",
        )
    alt = db.scalar(
        select(BillingRun).where(
            BillingRun.circle_id == run.circle_id,
            BillingRun.monat == run.monat,
            BillingRun.id != run.id,
            BillingRun.status == BillingRunStatus.FESTGESCHRIEBEN,
        )
    )
    if alt is not None:
        alt.status = BillingRunStatus.ERSETZT
    db.refresh(run)
    return alt
