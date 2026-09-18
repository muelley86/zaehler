"""Rechenkern der Stromabrechnung (Plan Phase 3) - reine Funktion ohne Datenbank.

1:1-Portierung von ``Stromabrechnung/tools/stromabrechnung/model.py`` (Vorlagen-Version
2026-09-17/5); die Bezeichner folgen bewusst dem Fachkonzept (``docs/FACHKONZEPT.md`` dort), damit
beide Seiten zeilenweise vergleichbar bleiben. Alle Werte in ``Decimal``; Excel ``ROUND`` =
``ROUND_HALF_UP``, ``ROUNDUP`` = ``ROUND_UP``.

Rechenweg: Verbrauch je Zeile -> Zaehlersumme -> Umlagepreis = Gesamtkosten / Zaehlersumme ->
Abrechnungspreis EUR/kWh =
ROUNDUP(ROUND((Umlagepreis x (1 + Aufschlag %) + Aufschlag ct) / 100; 6); 2)
-> Betrag je Zeile = ROUND(kWh x Preis; 2) -> Summen je Gruppe/Kostenstelle, Zusammensetzung wie
Stromlieferant (Energielieferung traegt den Rest), Saldo = Gesamtkosten - Summe Betraege.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, ROUND_UP, Decimal

KATEGORIEN: tuple[str, ...] = ("Energie", "Abgaben/Umlagen", "Netz", "Messung", "Sonstige")
ABSCHNITTE: tuple[str, ...] = (
    "Energiebeschaffung",
    "Steuern, Abgaben und Entgelte",
    "Netzentgelte",
)
ENERGIE_POSITION = "Energielieferung"
RESERVE_POSITIONEN = 3

PRUEF_OK = "OK"
PRUEF_UNVOLLSTAENDIG = "Zählerstand unvollständig"
PRUEF_DOPPELT = "Zähler und manuell"
PRUEF_NEGATIV = "negativ"
PRUEF_LEER = "keine Angabe"

_NULL = Decimal("0")


def round_half_up(wert: Decimal, stellen: int) -> Decimal:
    """Wie Excel ROUND (kaufmaennisch)."""
    return wert.quantize(Decimal(1).scaleb(-stellen), rounding=ROUND_HALF_UP)


def round_up(wert: Decimal, stellen: int) -> Decimal:
    """Wie Excel ROUNDUP: von null weg auf die Stellenzahl."""
    return wert.quantize(Decimal(1).scaleb(-stellen), rounding=ROUND_UP)


# --- Konfiguration des Abrechnungskreises ------------------------------------------------------


@dataclass(frozen=True)
class PositionsDefinition:
    name: str
    kategorie: str
    mit_menge: bool
    abschnitt: str


_E, _S, _N = ABSCHNITTE
STANDARD_POSITIONEN: tuple[PositionsDefinition, ...] = (
    PositionsDefinition(ENERGIE_POSITION, "Energie", True, _E),
    PositionsDefinition("Konzessionsabgabe", "Abgaben/Umlagen", True, _S),
    PositionsDefinition("Stromsteuer", "Abgaben/Umlagen", True, _S),
    PositionsDefinition("NEV-Umlage", "Abgaben/Umlagen", True, _S),
    PositionsDefinition("KWK-Umlage", "Abgaben/Umlagen", True, _S),
    PositionsDefinition("Offshore-Haftungsumlage", "Abgaben/Umlagen", True, _S),
    PositionsDefinition("Leistungsentgelt", "Energie", False, _S),
    PositionsDefinition("Beschaffungsentgelte / -nebenkosten", "Energie", False, _S),
    PositionsDefinition("Wirkarbeit - Netznutzung", "Netz", False, _N),
    PositionsDefinition("Leistung - Netznutzung", "Netz", False, _N),
    PositionsDefinition("Messstellenbetrieb", "Messung", False, _N),
    PositionsDefinition("Messstellendienstleistung", "Messung", False, _N),
)


@dataclass(frozen=True)
class Gruppe:
    """Empfaenger (Eigentuemer); ``intern`` = Umlage per KOST-Stapel statt Rechnung."""

    name: str
    intern: bool = False


@dataclass(frozen=True)
class Verbraucher:
    """Abrechnungsposition; ``rest`` = Restmenge (Bezugsmenge minus uebrige Verbraeuche)."""

    name: str
    gruppe: str
    kst: str | None = None
    faktor: Decimal = Decimal("1")
    rest: bool = False


@dataclass(frozen=True)
class Abzug:
    """Unterzaehler hinter einem Hauptzaehler: Verbrauch Hauptzaehler -= Verbrauch Unterzaehler."""

    haupt: str
    unter: str


@dataclass(frozen=True)
class Kreis:
    """Abrechnungskreis: Gruppen und Verbraucher in Anzeigereihenfolge."""

    gruppen: tuple[Gruppe, ...]
    verbraucher: tuple[Verbraucher, ...]
    abzuege: tuple[Abzug, ...] = ()
    positionen: tuple[PositionsDefinition, ...] = STANDARD_POSITIONEN

    def verbraucher_von(self, gruppe: str) -> tuple[Verbraucher, ...]:
        return tuple(v for v in self.verbraucher if v.gruppe == gruppe)

    def energie_index(self) -> int:
        return next(i for i, p in enumerate(self.positionen) if p.name == ENERGIE_POSITION)


def validiere(kreis: Kreis) -> None:
    """Wirft ValueError bei Konfigurationsfehlern (wie ``config.validiere``)."""
    gruppen = [g.name for g in kreis.gruppen]
    if len(set(gruppen)) != len(gruppen):
        raise ValueError(f"Gruppe doppelt: {gruppen}")
    namen: set[str] = set()
    for v in kreis.verbraucher:
        if v.name in namen:
            raise ValueError(f"Bezeichnung nicht eindeutig: {v.name!r}")
        namen.add(v.name)
        if v.gruppe not in gruppen:
            raise ValueError(f"Unbekannte Gruppe bei {v.name!r}: {v.gruppe!r}")
        if v.faktor <= 0:
            raise ValueError(f"Wandlerfaktor ungültig bei {v.name!r}: {v.faktor}")
    if not namen:
        raise ValueError("Abrechnungskreis ohne Verbraucher")
    # Referenz verschachtelt Verbraucher in Gruppen: Zeilen stehen immer gruppenweise.
    folge = [v.gruppe for v in kreis.verbraucher]
    bloecke = [g for i, g in enumerate(folge) if i == 0 or g != folge[i - 1]]
    if bloecke != [g for g in gruppen if g in folge]:
        raise ValueError("Verbraucher müssen gruppenweise in der Reihenfolge der Gruppen stehen")
    restzeilen = [v.name for v in kreis.verbraucher if v.rest]
    if len(restzeilen) > 1:
        raise ValueError(f"Mehr als eine Restzeile: {restzeilen}")
    energie = [p for p in kreis.positionen if p.name == ENERGIE_POSITION]
    if len(energie) != 1 or not energie[0].mit_menge:
        raise ValueError(f"Genau eine Position {ENERGIE_POSITION!r} mit Menge erforderlich")
    haupt = [a.haupt for a in kreis.abzuege]
    for a in kreis.abzuege:
        unbekannt = [n for n in (a.haupt, a.unter) if n not in namen]
        if unbekannt:
            raise ValueError(f"Abzug {a.haupt!r} - {a.unter!r}: unbekannte Bezeichnung {unbekannt}")
        if a.haupt == a.unter:
            raise ValueError(f"Abzug {a.haupt!r} von sich selbst")
        if {a.haupt, a.unter} & set(restzeilen):
            raise ValueError(f"Abzug {a.haupt!r} - {a.unter!r}: Restzeile nicht erlaubt")
        if a.unter in haupt:
            raise ValueError(f"Abzug als Kette nicht erlaubt: {a.unter!r} ist selbst Hauptzähler")
    if len(set(haupt)) != len(haupt):
        raise ValueError(f"Hauptzähler mehrfach mit Abzug: {haupt}")


# --- Monatsdaten -------------------------------------------------------------------------------


@dataclass(frozen=True)
class Rechnungsposition:
    """Position der Lieferantenrechnung; unbekannte Namen sind Reservepositionen ("Sonstige")."""

    name: str
    betrag: Decimal
    menge: Decimal | None = None
    preis_ct: Decimal | None = None
    kategorie: str | None = None


@dataclass(frozen=True)
class Ablesung:
    """Eingabe je Verbraucher: Staende (x Wandlerfaktor) oder Verbrauch manuell, plus Korrektur."""

    stand_alt: Decimal | None = None
    stand_neu: Decimal | None = None
    kwh: Decimal | None = None
    korrektur: Decimal | None = None


@dataclass(frozen=True)
class Monatsdaten:
    bezugsmenge: Decimal
    rechnungsbetrag: Decimal
    positionen: tuple[Rechnungsposition, ...]
    verbraucher: Mapping[str, Ablesung]
    zusatzkosten: Decimal = _NULL
    aufschlag_prozent: Decimal = _NULL  # 0.05 = 5 %
    aufschlag_ct: Decimal = _NULL


def pruefe_eingaben(kreis: Kreis, daten: Monatsdaten) -> None:
    """Wirft ValueError bei unbekannten Verbrauchern, doppelten Positionen oder zu vielen
    Reservepositionen (wie ``pruefe_verbraucher``/``pruefe_positionen``)."""
    bekannt = {v.name for v in kreis.verbraucher}
    unbekannt = sorted(set(daten.verbraucher) - bekannt)
    if unbekannt:
        raise ValueError(f"Unbekannte Verbraucher: {unbekannt}")
    namen = [p.name for p in daten.positionen]
    doppelt = sorted({n for n in namen if namen.count(n) > 1})
    if doppelt:
        raise ValueError(f"Positionen doppelt: {doppelt}")
    standard = {p.name for p in kreis.positionen}
    kategorie_von = {p.name: p.kategorie for p in kreis.positionen}
    for pos in daten.positionen:
        _kategorie(pos, kategorie_von)
    extra = [n for n in namen if n not in standard]
    if len(extra) > RESERVE_POSITIONEN:
        raise ValueError(f"Mehr als {RESERVE_POSITIONEN} Zusatzpositionen (Reservezeilen): {extra}")


# --- Ergebnis ----------------------------------------------------------------------------------


@dataclass(frozen=True)
class Zeile:
    name: str
    gruppe: str
    kwh: Decimal
    eur: Decimal
    pruefung: str
    rest: bool = False


@dataclass(frozen=True)
class Zusammensetzung:
    """Betrag eines Empfaengers gegliedert wie die Lieferantenrechnung; Energielieferung = Rest."""

    betraege: tuple[Decimal, ...]
    sonstige: Decimal
    zwischensummen: tuple[Decimal, ...]
    energie_ct: Decimal
    gesamt: Decimal
    cts: tuple[Decimal, ...]
    zwischen_cts: tuple[Decimal, ...]
    sonstige_ct: Decimal
    gesamt_ct: Decimal


@dataclass(frozen=True)
class KstSumme:
    kst: str | None  # None = ohne KST/KTR
    kwh: Decimal
    eur: Decimal


@dataclass(frozen=True)
class GruppenSumme:
    kwh: Decimal
    eur: Decimal
    zusammensetzung: Zusammensetzung
    kostenstellen: tuple[KstSumme, ...]


@dataclass(frozen=True)
class Ergebnis:
    positionen_summe: Decimal
    positionen_kontrolle: Decimal
    kategorien: dict[str, Decimal]
    bezugsmenge: Decimal
    gesamtkosten: Decimal
    zaehlersumme: Decimal
    nicht_gemessen_kwh: Decimal | None
    einkaufspreis_ct: Decimal
    umlagepreis_ct: Decimal
    implizite_umlage: Decimal
    preis_ct: Decimal
    preis_eur: Decimal
    zeilen: dict[str, Zeile]
    gruppen: dict[str, GruppenSumme]
    gesamt_eur: Decimal
    saldo_eur: Decimal
    fehleranzahl: int = field(default=0)


# --- Rechnung ----------------------------------------------------------------------------------


def _n(wert: Decimal | None) -> Decimal:
    """Wie Excel N(): leer -> 0."""
    return _NULL if wert is None else wert


def _verbrauch_und_pruefung(eingabe: Ablesung, faktor: Decimal) -> tuple[Decimal, str]:
    alt, neu = eingabe.stand_alt is not None, eingabe.stand_neu is not None
    manuell, korrektur = eingabe.kwh is not None, eingabe.korrektur is not None
    if eingabe.stand_alt is not None and eingabe.stand_neu is not None:
        kwh = (eingabe.stand_neu - eingabe.stand_alt) * faktor + _n(eingabe.korrektur)
    else:
        kwh = _n(eingabe.kwh) + _n(eingabe.korrektur)
    if alt != neu:
        return kwh, PRUEF_UNVOLLSTAENDIG
    if alt and neu and manuell:
        return kwh, PRUEF_DOPPELT
    if kwh < 0:
        return kwh, PRUEF_NEGATIV
    if not (alt or neu or manuell or korrektur):
        return kwh, PRUEF_LEER
    return kwh, PRUEF_OK


def _kategorie(pos: Rechnungsposition, kategorie_von: Mapping[str, str]) -> str:
    """Kategorie der Position; unbekannter Text bricht ab (wie der KeyError der Referenz)."""
    kategorie = pos.kategorie or kategorie_von.get(pos.name, "Sonstige")
    if kategorie not in KATEGORIEN:
        raise ValueError(f"Position {pos.name!r}: unbekannte Kategorie {kategorie!r}")
    return kategorie


def _positionen(kreis: Kreis, daten: Monatsdaten) -> tuple[Decimal, dict[str, Decimal]]:
    kategorie_von = {p.name: p.kategorie for p in kreis.positionen}
    kategorien = {k: _NULL for k in KATEGORIEN}
    summe = _NULL
    for pos in daten.positionen:
        kategorie = _kategorie(pos, kategorie_von)
        kategorien[kategorie] += pos.betrag
        summe += pos.betrag
    return round_half_up(summe, 2), {k: round_half_up(v, 2) for k, v in kategorien.items()}


def _zusammensetzung(
    kreis: Kreis, daten: Monatsdaten, kwh: Decimal, eur: Decimal, bezugsmenge: Decimal
) -> Zusammensetzung:
    """Mengenpositionen: kWh x Lieferantenpreis; Pauschalen und Reserve: Betrag x kWh / Bezugsmenge;
    Energielieferung = Rest bis zum Betrag des Empfaengers."""

    def anteil(betrag: Decimal) -> Decimal:
        return round_half_up(betrag * kwh / bezugsmenge, 2) if bezugsmenge > 0 else Decimal("0.00")

    def ct(betrag: Decimal) -> Decimal:
        return betrag / kwh * 100 if kwh > 0 else _NULL

    eingaben = {p.name: p for p in daten.positionen}
    standard = {p.name for p in kreis.positionen}
    reserve = [p for p in daten.positionen if p.name not in standard][:RESERVE_POSITIONEN]
    sonstige = anteil(sum((p.betrag for p in reserve), _NULL))
    energie = kreis.energie_index()
    betraege: list[Decimal] = []
    for definition in kreis.positionen:
        e = eingaben.get(definition.name)
        if definition.mit_menge:
            betraege.append(round_half_up(kwh * _n(e.preis_ct if e else None) / 100, 2))
        else:
            betraege.append(anteil(e.betrag if e else _NULL))
    betraege[energie] = _NULL
    betraege[energie] = round_half_up(eur - sum(betraege, _NULL) - sonstige, 2)
    zwischen = tuple(
        round_half_up(
            sum(
                (b for b, p in zip(betraege, kreis.positionen, strict=True) if p.abschnitt == a),
                _NULL,
            ),
            2,
        )
        for a in ABSCHNITTE
        if any(p.abschnitt == a for p in kreis.positionen)
    )
    gesamt = round_half_up(sum(zwischen, _NULL) + sonstige, 2)
    cts: list[Decimal] = []
    for definition, betrag in zip(kreis.positionen, betraege, strict=True):
        e = eingaben.get(definition.name)
        cts.append(_n(e.preis_ct if e else None) if definition.mit_menge else ct(betrag))
    cts[energie] = ct(betraege[energie])
    return Zusammensetzung(
        betraege=tuple(betraege),
        sonstige=sonstige,
        zwischensummen=zwischen,
        energie_ct=cts[energie],
        gesamt=gesamt,
        cts=tuple(cts),
        zwischen_cts=tuple(ct(z) for z in zwischen),
        sonstige_ct=ct(sonstige),
        gesamt_ct=ct(gesamt),
    )


def kostenstellen_von(verbraucher: tuple[Verbraucher, ...]) -> tuple[str | None, ...]:
    """Kostenstellen aufsteigend; None (ohne KST/KTR) zuletzt, falls ein Verbraucher keine hat."""
    kst = tuple(sorted({v.kst for v in verbraucher if v.kst}))
    return kst + ((None,) if any(not v.kst for v in verbraucher) else ())


def _kostenstellen(
    verbraucher: tuple[Verbraucher, ...], zeilen: dict[str, Zeile]
) -> tuple[KstSumme, ...]:
    ergebnis = []
    for kst in kostenstellen_von(verbraucher):
        namen = [v.name for v in verbraucher if (v.kst or None) == kst]
        ergebnis.append(
            KstSumme(
                kst,
                sum((zeilen[n].kwh for n in namen), _NULL),
                round_half_up(sum((zeilen[n].eur for n in namen), _NULL), 2),
            )
        )
    return tuple(ergebnis)


def berechne(kreis: Kreis, daten: Monatsdaten) -> Ergebnis:
    """Berechnet alle Werte einer Monatsabrechnung (Erfassung + Abrechnungsblaetter)."""
    bezugsmenge = daten.bezugsmenge
    rechnungsbetrag = daten.rechnungsbetrag
    positionen_summe, kategorien = _positionen(kreis, daten)
    gesamtkosten = round_half_up(rechnungsbetrag + daten.zusatzkosten, 2)

    roh: dict[str, tuple[str, Decimal, str, bool]] = {}
    rest_name: str | None = None
    unter_von = {a.haupt: a.unter for a in kreis.abzuege}
    for durchlauf in ("unter", "haupt"):  # Hauptzaehler erst, wenn alle Unterzaehler berechnet sind
        for v in kreis.verbraucher:
            if (v.name in unter_von) != (durchlauf == "haupt"):
                continue
            if v.rest:
                rest_name = v.name
                roh[v.name] = (v.gruppe, _NULL, PRUEF_OK, True)
                continue
            eingabe = daten.verbraucher.get(v.name, Ablesung())
            if v.name in unter_von:  # Korrektur = -Verbrauch Unterzaehler + eigene Korrektur
                abzug = roh[unter_von[v.name]][1]
                eingabe = Ablesung(
                    eingabe.stand_alt, eingabe.stand_neu, eingabe.kwh, _n(eingabe.korrektur) - abzug
                )
            kwh, pruefung = _verbrauch_und_pruefung(eingabe, v.faktor)
            roh[v.name] = (v.gruppe, kwh, pruefung, False)
    roh = {v.name: roh[v.name] for v in kreis.verbraucher}
    if rest_name is not None:
        andere = sum((k for _, k, _, r in roh.values() if not r), _NULL)
        rest_kwh = bezugsmenge - andere
        pruefung = PRUEF_NEGATIV if rest_kwh < 0 else PRUEF_OK
        roh[rest_name] = (roh[rest_name][0], rest_kwh, pruefung, True)

    zaehlersumme = sum((k for _, k, _, _ in roh.values()), _NULL)
    einkaufspreis = rechnungsbetrag / bezugsmenge * 100 if bezugsmenge else _NULL
    umlagepreis = gesamtkosten / zaehlersumme * 100 if zaehlersumme else _NULL
    implizit = umlagepreis / einkaufspreis - 1 if einkaufspreis else _NULL
    preis_roh = umlagepreis * (1 + daten.aufschlag_prozent) + daten.aufschlag_ct
    preis_eur = round_up(round_half_up(preis_roh / 100, 6), 2)
    preis_ct = preis_eur * 100

    zeilen = {
        name: Zeile(name, gruppe, kwh, round_half_up(kwh * preis_eur, 2), pruefung, rest)
        for name, (gruppe, kwh, pruefung, rest) in roh.items()
    }
    gruppen: dict[str, GruppenSumme] = {}
    for g in kreis.gruppen:
        mitglieder = kreis.verbraucher_von(g.name)
        g_kwh = sum((zeilen[v.name].kwh for v in mitglieder), _NULL)
        g_eur = round_half_up(sum((zeilen[v.name].eur for v in mitglieder), _NULL), 2)
        gruppen[g.name] = GruppenSumme(
            g_kwh,
            g_eur,
            _zusammensetzung(kreis, daten, g_kwh, g_eur, bezugsmenge),
            _kostenstellen(mitglieder, zeilen),
        )
    gesamt_eur = round_half_up(sum((z.eur for z in zeilen.values()), _NULL), 2)
    return Ergebnis(
        positionen_summe=positionen_summe,
        positionen_kontrolle=round_half_up(positionen_summe - rechnungsbetrag, 2),
        kategorien=kategorien,
        bezugsmenge=bezugsmenge,
        gesamtkosten=gesamtkosten,
        zaehlersumme=zaehlersumme,
        nicht_gemessen_kwh=None if rest_name else bezugsmenge - zaehlersumme,
        einkaufspreis_ct=einkaufspreis,
        umlagepreis_ct=umlagepreis,
        implizite_umlage=implizit,
        preis_ct=preis_ct,
        preis_eur=preis_eur,
        zeilen=zeilen,
        gruppen=gruppen,
        gesamt_eur=gesamt_eur,
        saldo_eur=round_half_up(gesamtkosten - gesamt_eur, 2),
        fehleranzahl=sum(1 for z in zeilen.values() if z.pruefung != PRUEF_OK),
    )
