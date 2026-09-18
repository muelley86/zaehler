"""Monatsend-Staende je Abrechnungsposition (Plan Phase 4b) - reine Rechenregeln, fiktive Werte."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from meters.services.billing_readings import Geraet, monatsgrenzen, monatswerte
from meters.services.report_meter_readings import DayValue, RegisterSeries

D = Decimal
ALT, NEU = date(2026, 7, 31), date(2026, 8, 31)


def _reg(*staende: tuple[date, str], max_value: str = "0") -> RegisterSeries:
    return RegisterSeries(
        values=tuple(DayValue(day=t, value=D(w)) for t, w in staende), max_value=D(max_value)
    )


def _geraet(
    *registers: RegisterSeries,
    faktor: int | None = None,
    seit: date = date(2024, 1, 1),
    bis: date | None = None,
    sn: str = "TEST-1",
) -> Geraet:
    return Geraet(sn, faktor, seit, bis, registers)


def _codes(befunde: list[tuple[str, str]]) -> list[str]:
    return [code for code, _ in befunde]


def test_monatsgrenzen() -> None:
    assert monatsgrenzen("2026-08") == (ALT, NEU)
    assert monatsgrenzen("2026-03") == (date(2026, 2, 28), date(2026, 3, 31))
    assert monatsgrenzen("2026-01") == (date(2025, 12, 31), date(2026, 1, 31))


def test_ablesung_am_stichtag_ist_echter_wert() -> None:
    reg = _reg((ALT, "100"), (NEU, "160"))
    w = monatswerte([_geraet(reg, faktor=80)], ALT, NEU, 3)
    assert w.stand_alt is not None
    assert w.stand_neu is not None
    assert (w.stand_alt.wert, w.stand_alt.art, w.stand_alt.abstand_tage) == (
        D("100"),
        "abgelesen",
        0,
    )
    assert w.stand_neu.art == "abgelesen"
    assert w.kwh == D("4800")  # (160 - 100) x 80
    assert w.korrektur_kwh is None
    assert w.transformer_factor == 80
    assert w.befunde == []


def test_interpoliert_taggenau_mit_kennzeichnung() -> None:
    # 29.07. 100, 02.08. 140 -> 10 je Tag -> 31.07. = 120; 30.08. 400, 02.09. 430 -> 31.08. = 410
    reg = _reg(
        (date(2026, 7, 29), "100"),
        (date(2026, 8, 2), "140"),
        (date(2026, 8, 30), "400"),
        (date(2026, 9, 2), "430"),
    )
    w = monatswerte([_geraet(reg)], ALT, NEU, 3)
    assert w.stand_alt is not None
    assert w.stand_neu is not None
    assert (w.stand_alt.wert, w.stand_alt.art) == (D("120.000"), "interpoliert")
    assert w.stand_alt.ablesung_vor == date(2026, 7, 29)
    assert w.stand_alt.ablesung_nach == date(2026, 8, 2)
    assert w.stand_alt.abstand_tage == 2
    assert w.stand_neu.wert == D("410.000")
    assert w.stand_neu.abstand_tage == 1
    assert w.kwh == D("290.000")
    assert w.befunde == []


def test_interpolation_wird_auf_drei_stellen_gerundet() -> None:
    reg = _reg((date(2026, 7, 30), "0"), (date(2026, 8, 2), "1"), (NEU, "5"))
    w = monatswerte([_geraet(reg)], ALT, NEU, 3)
    assert w.stand_alt is not None
    assert w.stand_alt.wert == D("0.333")


def test_warnung_bei_grossem_abstand() -> None:
    reg = _reg((date(2026, 7, 20), "0"), (date(2026, 8, 10), "210"), (NEU, "500"))
    w = monatswerte([_geraet(reg)], ALT, NEU, 3)
    assert w.stand_alt is not None
    assert w.stand_alt.abstand_tage == 10
    assert _codes(w.befunde) == ["stand_alt_abstand"]
    assert monatswerte([_geraet(reg)], ALT, NEU, 10).befunde == []


def test_keine_ablesung_nach_monatsende() -> None:
    reg = _reg((ALT, "100"), (date(2026, 8, 25), "150"))
    w = monatswerte([_geraet(reg)], ALT, NEU, 3)
    assert w.stand_neu is not None
    assert (w.stand_neu.wert, w.stand_neu.art) == (D("150"), "nur_davor")
    assert _codes(w.befunde) == ["stand_neu_ohne_folgeablesung"]


def test_ht_nt_register_werden_summiert() -> None:
    ht = _reg((ALT, "100"), (NEU, "150"))
    nt = _reg((ALT, "10"), (date(2026, 8, 30), "15"), (date(2026, 9, 1), "17"))
    w = monatswerte([_geraet(ht, nt)], ALT, NEU, 3)
    assert w.stand_alt is not None
    assert w.stand_neu is not None
    assert w.stand_alt.wert == D("110")
    assert (w.stand_neu.wert, w.stand_neu.art) == (D("166.000"), "interpoliert")
    assert w.kwh == D("56.000")


def test_zaehlertausch_im_monat_wird_korrektur() -> None:
    tag = date(2026, 8, 15)
    alt_geraet = _geraet(_reg((ALT, "1000"), (tag, "1100")), faktor=40, bis=tag, sn="TEST-ALT")
    neu_geraet = _geraet(_reg((tag, "0"), (NEU, "30")), faktor=20, seit=tag, sn="TEST-NEU")
    w = monatswerte([neu_geraet, alt_geraet], ALT, NEU, 3)
    assert w.serial_numbers == "TEST-ALT / TEST-NEU"
    assert w.transformer_factor == 20
    assert w.stand_alt is not None
    assert w.stand_neu is not None
    assert (w.stand_alt.wert, w.stand_neu.wert) == (D("0"), D("30"))
    assert w.korrektur_kwh == D("4000")  # (1100 - 1000) x 40
    assert w.kwh == D("4600")  # 30 x 20 + 4000
    assert "TEST-ALT" in w.korrektur_notizen[0]
    assert _codes(w.befunde) == ["zaehlertausch"]


def test_tausch_am_stichtag_alt_zaehlt_nicht_mehr() -> None:
    alt_geraet = _geraet(_reg((date(2026, 7, 1), "0"), (ALT, "50")), bis=ALT, sn="TEST-ALT")
    neu_geraet = _geraet(_reg((ALT, "0"), (NEU, "70")), seit=ALT, sn="TEST-NEU")
    w = monatswerte([alt_geraet, neu_geraet], ALT, NEU, 3)
    assert w.serial_numbers == "TEST-NEU"
    assert w.kwh == D("70")
    assert w.befunde == []


def test_ueberlauf_wird_korrektur() -> None:
    reg = _reg((ALT, "99990"), (NEU, "20"), max_value="100000")
    w = monatswerte([_geraet(reg, faktor=2)], ALT, NEU, 3)
    assert w.korrektur_kwh == D("200000")
    assert w.kwh == D("60")  # (20 - 99990) x 2 + 100000 x 2
    assert _codes(w.befunde) == ["ueberlauf"]


def test_neuer_zaehler_im_monat_startet_mit_anfangsstand() -> None:
    seit = date(2026, 8, 10)
    w = monatswerte([_geraet(_reg((seit, "5"), (NEU, "25")), seit=seit)], ALT, NEU, 3)
    assert w.stand_alt is not None
    assert (w.stand_alt.wert, w.stand_alt.art) == (D("5"), "abgelesen")
    assert w.kwh == D("20")
    assert _codes(w.befunde) == ["zaehler_neu"]


def test_ohne_zaehler_und_ohne_ablesung() -> None:
    assert _codes(monatswerte([], ALT, NEU, 3).befunde) == ["ohne_zaehler"]
    spaeter = _geraet(_reg((NEU, "1")), seit=date(2026, 9, 1))
    assert _codes(monatswerte([spaeter], ALT, NEU, 3).befunde) == ["ohne_zaehler"]
    leer = monatswerte([_geraet(_reg())], ALT, NEU, 3)
    assert leer.kwh is None
    assert _codes(leer.befunde) == ["ohne_ablesung"]


def test_negativer_verbrauch_ohne_max_value() -> None:
    w = monatswerte([_geraet(_reg((ALT, "100"), (NEU, "90")))], ALT, NEU, 3)
    assert w.kwh == D("-10")
    assert _codes(w.befunde) == ["negativ"]


def test_zaehlertausch_mit_veraltetem_stand_des_alten_zaehlers_wird_gemeldet() -> None:
    tag = date(2026, 8, 20)
    # alter Zaehler: letzte Ablesung am 03.08., kein Endstand am Tauschtag
    alt_geraet = _geraet(_reg((ALT, "1000"), (date(2026, 8, 3), "1050")), bis=tag, sn="TEST-ALT")
    neu_geraet = _geraet(_reg((tag, "0"), (NEU, "10")), seit=tag, sn="TEST-NEU")
    w = monatswerte([alt_geraet, neu_geraet], ALT, NEU, 3)
    assert w.korrektur_kwh == D("50")
    assert _codes(w.befunde) == ["tausch_ausbau_ohne_folgeablesung", "zaehlertausch"]
    assert "TEST-ALT" in w.befunde[0][1]


def test_zaehlertausch_mit_interpoliertem_monatsanfang_des_alten_zaehlers() -> None:
    tag = date(2026, 8, 20)
    alt_geraet = _geraet(
        _reg((date(2026, 7, 10), "0"), (date(2026, 8, 12), "330"), (tag, "400")),
        bis=tag,
        sn="TEST-ALT",
    )
    neu_geraet = _geraet(_reg((tag, "0"), (NEU, "10")), seit=tag, sn="TEST-NEU")
    w = monatswerte([alt_geraet, neu_geraet], ALT, NEU, 3)
    assert w.korrektur_kwh == D("190.000")  # 400 - 210 (31.07. interpoliert, 10 je Tag)
    assert _codes(w.befunde) == ["tausch_alt_abstand", "zaehlertausch"]


def test_zaehlertausch_ohne_verbrauch_zeigt_korrektur_null() -> None:
    tag = date(2026, 8, 20)
    alt_geraet = _geraet(_reg((ALT, "7"), (tag, "7")), bis=tag, sn="TEST-ALT")
    neu_geraet = _geraet(_reg((tag, "0"), (NEU, "10")), seit=tag, sn="TEST-NEU")
    w = monatswerte([alt_geraet, neu_geraet], ALT, NEU, 3)
    assert w.korrektur_kwh == D("0")
    assert w.kwh == D("10")


def test_zaehler_im_monat_ausgebaut_ohne_nachfolger() -> None:
    aus = date(2026, 8, 10)
    w = monatswerte([_geraet(_reg((ALT, "100"), (aus, "130")), bis=aus)], ALT, NEU, 3)
    assert w.stand_neu is not None
    assert (w.stand_neu.wert, w.stand_neu.art) == (D("130"), "abgelesen")
    assert w.kwh == D("30")
    assert _codes(w.befunde) == ["ausgebaut"]
