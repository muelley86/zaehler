"""Rechenkern der Stromabrechnung: portierte Modelltests der Stromabrechnung (``tools/tests``).

Synthetischer Datensatz wie ``tools/tests/daten.py`` (handrechenbar):
NORD_TEST: Zaehlersumme 9000 kWh, Rechnung 2100,00 EUR -> Umlagepreis 23,33 ct -> 0,24 EUR/kWh
          (aufgerundet), Summe 2160,00 EUR, Saldo -60,00.
SUED_TEST: Bezugsmenge 5000 kWh, Rechnung 1000,00 EUR -> 0,20 EUR/kWh (genau), Restzeile 3000.
Erwartungswerte wie dort (Decimal, ROUND_HALF_UP), nicht neu hergeleitet.
"""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

import pytest

from meters.billing.calculation import (
    Ablesung,
    Abzug,
    Ergebnis,
    Gruppe,
    Kreis,
    Monatsdaten,
    Rechnungsposition,
    Verbraucher,
    berechne,
    kostenstellen_von,
    pruefe_eingaben,
    round_half_up,
    round_up,
    validiere,
)

D = Decimal

GRUPPE_A, GRUPPE_B, GRUPPE_C, INTERN = (
    "Musterhof A KG",
    "Musterhof B GmbH",
    "Musterhof C KG",
    "Intern",
)

NORD_TEST = Kreis(
    gruppen=(Gruppe(GRUPPE_A), Gruppe(GRUPPE_B), Gruppe(INTERN, intern=True)),
    verbraucher=(
        Verbraucher("Stall A", GRUPPE_A, "10104", faktor=D("80")),
        Verbraucher("Anlage West", GRUPPE_A, "10105"),
        Verbraucher("Pumpe", GRUPPE_A, "10107"),
        Verbraucher("Haus 1", GRUPPE_B),
        Verbraucher("Haus 2", GRUPPE_B, "10103", faktor=D("40")),
        Verbraucher("Generator", INTERN, "10109"),
    ),
)
SUED_TEST = Kreis(
    gruppen=(Gruppe(GRUPPE_C), Gruppe(INTERN, intern=True)),
    verbraucher=(
        Verbraucher("Anlage Ost", GRUPPE_C, "10106"),
        Verbraucher("Rest", GRUPPE_C, "10101", rest=True),
        Verbraucher("Generator", INTERN, "10110"),
    ),
)


def daten_nord() -> Monatsdaten:
    return Monatsdaten(
        bezugsmenge=D("10000"),
        rechnungsbetrag=D("2100.00"),
        positionen=(
            Rechnungsposition("Energielieferung", D("1200.00"), D("10000"), D("12.0000")),
            Rechnungsposition("Konzessionsabgabe", D("100.00"), D("10000"), D("1.0000")),
            Rechnungsposition("Stromsteuer", D("205.00"), D("10000"), D("2.0500")),
            Rechnungsposition("Leistungsentgelt", D("300.00")),
            Rechnungsposition("Wirkarbeit - Netznutzung", D("250.00")),
            Rechnungsposition("Messstellenbetrieb", D("45.00")),
        ),
        verbraucher={
            "Stall A": Ablesung(stand_alt=D("100"), stand_neu=D("160")),
            "Anlage West": Ablesung(stand_alt=D("5000"), stand_neu=D("7000"), korrektur=D("500")),
            "Pumpe": Ablesung(kwh=D("1000")),
            "Haus 1": Ablesung(kwh=D("150.5")),
            "Haus 2": Ablesung(stand_alt=D("10"), stand_neu=D("12.5")),
            "Generator": Ablesung(kwh=D("449.5")),
        },
    )


def daten_sued() -> Monatsdaten:
    return Monatsdaten(
        bezugsmenge=D("5000"),
        rechnungsbetrag=D("1000.00"),
        positionen=(
            Rechnungsposition("Energielieferung", D("800.00"), D("5000"), D("16.0000")),
            Rechnungsposition("Leistungsentgelt", D("200.00")),
        ),
        verbraucher={
            "Anlage Ost": Ablesung(kwh=D("1500")),
            "Rest": Ablesung(),
            "Generator": Ablesung(kwh=D("500")),
        },
    )


def _mini(faktor: str = "1") -> Kreis:
    return Kreis(
        gruppen=(Gruppe("A"),),
        verbraucher=(
            Verbraucher("Z1", "A", faktor=D(faktor)),
            Verbraucher("Z2", "A"),
            Verbraucher("M", "A"),
        ),
    )


def _daten(**verbraucher: Ablesung) -> Monatsdaten:
    return Monatsdaten(
        bezugsmenge=D("1000"),
        rechnungsbetrag=D("200"),
        positionen=(Rechnungsposition("Energielieferung", D("200"), D("1000"), D("20")),),
        verbraucher=verbraucher,
    )


@pytest.fixture(scope="module")
def nord() -> Ergebnis:
    return berechne(NORD_TEST, daten_nord())


@pytest.fixture(scope="module")
def sued() -> Ergebnis:
    return berechne(SUED_TEST, daten_sued())


# --- Rundung -----------------------------------------------------------------------------------


def test_round_half_up_rundet_kaufmaennisch_wie_excel() -> None:
    assert round_half_up(D("2.675"), 2) == D("2.68")
    assert round_half_up(D("0.5"), 0) == D("1")
    assert round_half_up(D("-2.675"), 2) == D("-2.68")
    assert round_half_up(D("22.75705"), 4) == D("22.7571")
    assert round_up(D("0.200001"), 2) == D("0.21")


# --- NORD ---------------------------------------------------------------------------------------


def test_nord_positionen_und_kategorien(nord: Ergebnis) -> None:
    assert nord.positionen_summe == D("2100.00")
    assert nord.positionen_kontrolle == D("0.00")
    assert nord.kategorien == {
        "Energie": D("1500.00"),
        "Abgaben/Umlagen": D("305.00"),
        "Netz": D("250.00"),
        "Messung": D("45.00"),
        "Sonstige": D("0.00"),
    }


def test_nord_zaehlersumme_und_gruppen(nord: Ergebnis) -> None:
    assert nord.zaehlersumme == D("9000")
    assert nord.gruppen[GRUPPE_A].kwh == D("8300")
    assert nord.gruppen[GRUPPE_B].kwh == D("250.5")
    assert nord.gruppen[INTERN].kwh == D("449.5")
    assert nord.nicht_gemessen_kwh == D("1000")


def test_nord_preis_und_umlage(nord: Ergebnis) -> None:
    assert nord.einkaufspreis_ct == D("21")
    assert nord.preis_eur == D("0.24") and nord.preis_ct == D("24.00")
    assert nord.preis_eur.as_tuple().exponent == -2
    assert nord.umlagepreis_ct.quantize(D("0.0001")) == D("23.3333")
    assert nord.implizite_umlage.quantize(D("0.0001")) == D("0.1111")


def test_nord_eur_je_zeile_und_saldo(nord: Ergebnis) -> None:
    assert nord.zeilen["Stall A"].kwh == D("4800")  # (160 - 100) x Faktor 80
    assert nord.zeilen["Stall A"].eur == D("1152.00")
    assert nord.zeilen["Anlage West"].kwh == D("2500")  # 7000 - 5000 + Korrektur 500
    assert nord.zeilen["Haus 2"].kwh == D("100")  # 2,5 x 40
    assert nord.zeilen["Generator"].eur == D("107.88")
    assert nord.gesamt_eur == D("2160.00")
    assert nord.saldo_eur == D("-60.00")
    assert nord.fehleranzahl == 0


def test_alle_eur_werte_sind_zweistellig(nord: Ergebnis) -> None:
    werte = [
        nord.positionen_summe,
        nord.gesamtkosten,
        nord.gesamt_eur,
        nord.saldo_eur,
        *nord.kategorien.values(),
        *(g.eur for g in nord.gruppen.values()),
        *(z.eur for z in nord.zeilen.values()),
    ]
    assert all(w.as_tuple().exponent == -2 for w in werte), werte


def test_zusammensetzung_wie_lieferantenrechnung_energie_traegt_den_rest(nord: Ergebnis) -> None:
    gruppe_a = nord.gruppen[GRUPPE_A]
    z = gruppe_a.zusammensetzung
    assert gruppe_a.eur == D("1992.00")
    assert z.betraege == (
        D("1245.00"), D("83.00"), D("170.15"), D("0.00"), D("0.00"), D("0.00"),
        D("249.00"), D("0.00"), D("207.50"), D("0.00"), D("37.35"), D("0.00"),
    )  # fmt: skip
    assert z.sonstige == D("0.00")
    assert z.zwischensummen == (D("1245.00"), D("502.15"), D("244.85"))
    assert z.energie_ct == D("15")
    assert z.gesamt == gruppe_a.eur


def test_zusammensetzung_rundet_halbe_cent_kaufmaennisch(nord: Ergebnis) -> None:
    gruppe_b = nord.gruppen[GRUPPE_B]
    z = gruppe_b.zusammensetzung
    assert z.betraege[1] == D("2.51") and z.betraege[6] == D("7.52")
    assert z.betraege[0] == D("37.56")
    assert z.zwischensummen == (D("37.56"), D("15.17"), D("7.39"))
    assert z.gesamt == gruppe_b.eur == D("60.12")


def test_zusammensetzung_nimmt_reservepositionen_als_sonstige_auf() -> None:
    daten = daten_nord()
    extra = Rechnungsposition("Neue Position", D("10.00"), kategorie="Sonstige")
    z = berechne(NORD_TEST, replace(daten, positionen=(*daten.positionen, extra)))
    zus = z.gruppen[GRUPPE_A].zusammensetzung
    assert zus.sonstige == D("8.30")
    assert zus.betraege[0] == D("1236.70") and zus.gesamt == D("1992.00")


def test_zusammensetzung_hat_ct_je_zeile_und_ergibt_den_abrechnungspreis(nord: Ergebnis) -> None:
    z = nord.gruppen[GRUPPE_A].zusammensetzung
    assert z.cts[0] == D("15") and z.cts[1] == D("1.0000") and z.cts[2] == D("2.0500")
    assert z.cts[6] == D("3") and z.cts[8] == D("2.5") and z.cts[10] == D("0.45")
    assert z.zwischen_cts == (D("15"), D("6.05"), D("2.95"))
    assert z.sonstige_ct == D("0")
    assert z.gesamt_ct == D("24") == nord.preis_ct


def test_summen_je_kostenstelle(nord: Ergebnis) -> None:
    assert [(k.kst, k.kwh, k.eur) for k in nord.gruppen[GRUPPE_A].kostenstellen] == [
        ("10104", D("4800"), D("1152.00")),
        ("10105", D("2500"), D("600.00")),
        ("10107", D("1000"), D("240.00")),
    ]
    assert [(k.kst, k.kwh, k.eur) for k in nord.gruppen[GRUPPE_B].kostenstellen] == [
        ("10103", D("100"), D("24.00")),
        (None, D("150.5"), D("36.12")),
    ]
    assert kostenstellen_von(NORD_TEST.verbraucher_von(GRUPPE_B)) == ("10103", None)


# --- SUED ---------------------------------------------------------------------------------------


def test_sued_zusammensetzung_ohne_nicht_gemessene_menge(sued: Ergebnis) -> None:
    z = sued.gruppen[GRUPPE_C].zusammensetzung
    assert z.betraege[0] == D("720.00") and z.betraege[6] == D("180.00")
    assert z.energie_ct == D("16") and z.gesamt == D("900.00")


def test_sued_restzeile_gruppe_a_schliesst_auf_bezugsmenge(sued: Ergebnis) -> None:
    assert sued.zeilen["Rest"].kwh == D("3000")
    assert sued.zaehlersumme == D("5000")
    assert sued.nicht_gemessen_kwh is None
    assert sued.preis_eur == D("0.20") and sued.preis_ct == D("20.00")
    assert sued.gruppen[GRUPPE_C].kwh == D("4500") and sued.gruppen[GRUPPE_C].eur == D("900.00")
    assert sued.saldo_eur == D("0.00")


# --- Einzelregeln ------------------------------------------------------------------------------


def test_zaehlerstaende_ergeben_verbrauch_und_korrektur_wird_addiert() -> None:
    erg = berechne(
        _mini(),
        _daten(
            Z1=Ablesung(stand_alt=D("100"), stand_neu=D("350")),
            Z2=Ablesung(stand_alt=D("999"), stand_neu=D("9"), korrektur=D("1000")),
            M=Ablesung(kwh=D("240")),
        ),
    )
    assert erg.zeilen["Z1"].kwh == D("250")
    assert erg.zeilen["Z2"].kwh == D("10")
    assert erg.zeilen["M"].kwh == D("240")
    assert erg.zaehlersumme == D("500")
    assert erg.preis_ct == D("40.0000")
    assert erg.zeilen["Z1"].eur == D("100.00")


def test_wandlerfaktor_multipliziert_nur_die_zaehlerdifferenz() -> None:
    erg = berechne(
        _mini("80"),
        _daten(
            Z1=Ablesung(stand_alt=D("100"), stand_neu=D("160"), korrektur=D("5")),
            Z2=Ablesung(kwh=D("95")),
            M=Ablesung(kwh=D("100")),
        ),
    )
    assert erg.zeilen["Z1"].kwh == D("4805")


def test_wandlerfaktor_gilt_nicht_fuer_manuellen_verbrauch() -> None:
    daten = _daten(
        Z1=Ablesung(kwh=D("100"), korrektur=D("1")), Z2=Ablesung(kwh=D("1")), M=Ablesung(kwh=D("1"))
    )
    assert berechne(_mini("40"), daten).zeilen["Z1"].kwh == D("101")


def test_aufschlaege_wirken_vor_der_aufrundung() -> None:
    ohne = _daten(Z1=Ablesung(kwh=D("500")), Z2=Ablesung(kwh=D("500")), M=Ablesung(kwh=D("0")))
    assert berechne(_mini(), ohne).preis_ct == D("20.0000")
    mit = replace(ohne, aufschlag_prozent=D("0.05"), aufschlag_ct=D("1"))
    assert berechne(_mini(), mit).preis_ct == D("22.0000")
    halb = replace(ohne, aufschlag_prozent=D("0.05"), aufschlag_ct=D("0.5"))  # 21,5 ct
    assert berechne(_mini(), halb).preis_eur == D("0.22")


def test_abrechnungspreis_wird_in_eur_auf_zwei_stellen_aufgerundet() -> None:
    erg = berechne(
        _mini(), _daten(Z1=Ablesung(kwh=D("300")), Z2=Ablesung(kwh=D("0")), M=Ablesung(kwh=D("0")))
    )
    assert erg.umlagepreis_ct.quantize(D("0.0001")) == D("66.6667")
    assert erg.preis_eur == D("0.67") and erg.zeilen["Z1"].eur == D("201.00")
    assert erg.saldo_eur == D("-1.00")


def test_preis_genau_auf_vollem_cent_wird_nicht_erhoeht_kleinster_rest_schon() -> None:
    genau = _daten(Z1=Ablesung(kwh=D("1000")), Z2=Ablesung(kwh=D("0")), M=Ablesung(kwh=D("0")))
    assert berechne(_mini(), genau).preis_eur == D("0.20")
    knapp = _daten(Z1=Ablesung(kwh=D("999.99")), Z2=Ablesung(kwh=D("0")), M=Ablesung(kwh=D("0")))
    assert berechne(_mini(), knapp).preis_eur == D("0.21")  # 20,0002 ct


def test_pruefung_meldet_fehlende_doppelte_und_negative_werte() -> None:
    erg = berechne(
        _mini(),
        _daten(
            Z1=Ablesung(stand_alt=D("100")),
            Z2=Ablesung(stand_alt=D("5"), stand_neu=D("1")),
        ),
    )
    assert erg.zeilen["Z1"].pruefung == "Zählerstand unvollständig"
    assert erg.zeilen["Z2"].pruefung == "negativ"
    assert erg.zeilen["M"].pruefung == "keine Angabe"
    assert erg.fehleranzahl == 3
    doppelt = _daten(Z1=Ablesung(stand_alt=D("1"), stand_neu=D("2"), kwh=D("1")))
    assert berechne(_mini(), doppelt).zeilen["Z1"].pruefung == "Zähler und manuell"


# --- Unterzaehler (Version /4) -------------------------------------------------------------------

NORD_ABZUG = replace(NORD_TEST, abzuege=(Abzug("Anlage West", "Generator"),))


def test_unterzaehler_wird_vom_hauptzaehler_abgezogen() -> None:
    erg = berechne(NORD_ABZUG, daten_nord())
    assert erg.zeilen["Anlage West"].kwh == D("2050.5")  # 7000 - 5000 + 500 - Generator 449,5
    assert erg.zeilen["Generator"].kwh == D("449.5")
    assert erg.zaehlersumme == D("8550.5")
    assert erg.preis_ct == D("25") and erg.zeilen["Generator"].eur == D("112.38")


def test_hauptzaehler_ohne_eigene_korrektur() -> None:
    daten = daten_nord()
    verbraucher = dict(daten.verbraucher)
    verbraucher["Anlage West"] = Ablesung(stand_alt=D("5000"), stand_neu=D("7000"))
    erg = berechne(NORD_ABZUG, replace(daten, verbraucher=verbraucher))
    assert erg.zeilen["Anlage West"].kwh == D("1550.5")


def test_validierung() -> None:
    validiere(NORD_ABZUG)
    for abzug, meldung in (
        (Abzug("Anlage West", "Unbekannt"), "Unbekannt"),
        (Abzug("Anlage West", "Anlage West"), "sich selbst"),
        (Abzug("Fehlt", "Generator"), "Fehlt"),
    ):
        with pytest.raises(ValueError, match=meldung):
            validiere(replace(NORD_TEST, abzuege=(abzug,)))
    with pytest.raises(ValueError, match="Kette"):
        validiere(
            replace(
                NORD_TEST, abzuege=(Abzug("Anlage West", "Generator"), Abzug("Generator", "Pumpe"))
            )
        )
    with pytest.raises(ValueError, match="Restzeile"):
        validiere(replace(SUED_TEST, abzuege=(Abzug("Rest", "Generator"),)))
    with pytest.raises(ValueError, match="Gruppe"):
        validiere(replace(SUED_TEST, verbraucher=(Verbraucher("X", "Gibt es nicht"),)))


def test_pruefe_eingaben() -> None:
    pruefe_eingaben(_mini(), _daten(Z1=Ablesung(kwh=D("1"))))
    with pytest.raises(ValueError, match="Separator"):
        pruefe_eingaben(_mini(), _daten(Separator=Ablesung(kwh=D("1"))))
    daten = daten_nord()
    extra = tuple(Rechnungsposition(f"Extra {i}", D("1")) for i in range(1, 5))
    with pytest.raises(ValueError, match="Extra 4"):
        pruefe_eingaben(NORD_TEST, replace(daten, positionen=(*daten.positionen, *extra)))
    doppelt = (*daten.positionen, Rechnungsposition("Stromsteuer", D("1")))
    with pytest.raises(ValueError, match="Stromsteuer"):
        pruefe_eingaben(NORD_TEST, replace(daten, positionen=doppelt))


def test_unbekannte_kategorie_bricht_ab_wie_die_referenz() -> None:
    daten = daten_nord()
    tippfehler = Rechnungsposition("Extra", D("5.00"), kategorie="Sonstiges")
    falsch = replace(daten, positionen=(*daten.positionen, tippfehler))
    with pytest.raises(ValueError, match="Sonstiges"):
        pruefe_eingaben(NORD_TEST, falsch)
    with pytest.raises(ValueError, match="Sonstiges"):
        berechne(NORD_TEST, falsch)


def test_verbraucher_muessen_gruppenweise_in_gruppenreihenfolge_stehen() -> None:
    verschachtelt = Kreis(
        gruppen=(Gruppe("A"), Gruppe("B")),
        verbraucher=(Verbraucher("X1", "A"), Verbraucher("Y1", "B"), Verbraucher("X2", "A")),
    )
    with pytest.raises(ValueError, match="gruppenweise"):
        validiere(verschachtelt)
    vertauscht = Kreis(
        gruppen=(Gruppe("A"), Gruppe("B")),
        verbraucher=(Verbraucher("Y1", "B"), Verbraucher("X1", "A")),
    )
    with pytest.raises(ValueError, match="gruppenweise"):
        validiere(vertauscht)
