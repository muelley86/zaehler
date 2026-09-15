"""Unit-Tests fuer die Zaehlerstands-Spalten des Auswertungs-CSV.

Reine Logik ohne DB: taggenaue Interpolation an Periodengrenzen, Rollover,
Summe mehrerer Register (HT/NT), Geraete-Auswahl bei Zaehlerwechsel.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from meters.services.report_meter_readings import (
    EMPTY_METER_COLUMNS,
    DayValue,
    MeterColumns,
    MeterSeries,
    RegisterSeries,
    meter_columns,
    value_at,
)

_MAX = Decimal("99999.9")


def _reg(*values: tuple[date, str], max_value: Decimal = _MAX) -> RegisterSeries:
    return RegisterSeries(
        values=tuple(DayValue(day=d, value=Decimal(v)) for d, v in values),
        max_value=max_value,
    )


def _meter(serial: str, *registers: RegisterSeries) -> MeterSeries:
    return MeterSeries(serial_number=serial, registers=registers)


# --- value_at ---------------------------------------------------------------


def test_value_at_reading_day_returns_reading() -> None:
    reg = _reg((date(2024, 1, 31), "100"), (date(2024, 2, 29), "129"))
    assert value_at(reg, date(2024, 1, 31)) == Decimal("100")
    assert value_at(reg, date(2024, 2, 29)) == Decimal("129")


def test_value_at_reading_day_keeps_exact_representation() -> None:
    # Mittlere Ablesung auf der Grenze: Wert unveraendert, nicht "10.0" durch
    # Interpolation mit Anteil 0 (sichtbar im CSV als "10,0").
    reg = _reg((date(2024, 1, 1), "0"), (date(2024, 1, 31), "10"), (date(2024, 2, 29), "12.5"))
    assert str(value_at(reg, date(2024, 1, 31))) == "10"


def test_value_at_interpolates_per_day() -> None:
    # 31 Tage, 31 Einheiten -> 1 je Tag; 16 Tage nach dem 15.01. = 31.01.
    reg = _reg((date(2024, 1, 15), "100"), (date(2024, 2, 15), "131"))
    assert value_at(reg, date(2024, 1, 31)) == Decimal("116")


def test_value_at_clamps_outside_readings() -> None:
    reg = _reg((date(2024, 1, 15), "100"), (date(2024, 2, 15), "131"))
    assert value_at(reg, date(2023, 12, 31)) == Decimal("100")
    assert value_at(reg, date(2024, 12, 31)) == Decimal("131")


def test_value_at_handles_rollover() -> None:
    # 99990 -> (Ueberlauf bei 100000) -> 10: Verbrauch 20 in 10 Tagen = 2/Tag.
    reg = _reg(
        (date(2024, 1, 1), "99990"),
        (date(2024, 1, 11), "10"),
        max_value=Decimal("100000"),
    )
    assert value_at(reg, date(2024, 1, 3)) == Decimal("99994")
    assert value_at(reg, date(2024, 1, 6)) == Decimal("0")
    assert value_at(reg, date(2024, 1, 8)) == Decimal("4")


# --- meter_columns ----------------------------------------------------------


def test_single_meter_start_end_match_consumption() -> None:
    meter = _meter(
        "SN-1",
        _reg((date(2024, 1, 31), "100"), (date(2024, 2, 29), "129"), (date(2024, 3, 31), "150")),
    )
    cols = meter_columns(
        [meter], start_day=date(2024, 1, 31), end_day=date(2024, 2, 29), transformer_factor=None
    )
    assert cols == MeterColumns(
        serial_number="SN-1",
        transformer_factor=None,
        start_value=Decimal("100"),
        end_value=Decimal("129"),
    )


def test_registers_are_summed_for_dual_tariff() -> None:
    ht = _reg((date(2024, 1, 31), "1000"), (date(2024, 2, 29), "1100"))
    nt = _reg((date(2024, 1, 31), "500"), (date(2024, 2, 29), "530"))
    cols = meter_columns(
        [_meter("SN-HTNT", ht, nt)],
        start_day=date(2024, 1, 31),
        end_day=date(2024, 2, 29),
        transformer_factor=None,
    )
    assert cols.start_value == Decimal("1500")
    assert cols.end_value == Decimal("1630")


def test_transformer_factor_is_passed_through_values_stay_raw() -> None:
    meter = _meter("SN-W", _reg((date(2024, 1, 31), "10"), (date(2024, 2, 29), "12")))
    cols = meter_columns(
        [meter], start_day=date(2024, 1, 31), end_day=date(2024, 2, 29), transformer_factor=40
    )
    assert cols.transformer_factor == 40
    assert (cols.start_value, cols.end_value) == (Decimal("10"), Decimal("12"))


def test_meter_change_inside_period_uses_old_start_and_new_end() -> None:
    old = _meter("ALT", _reg((date(2024, 5, 31), "400"), (date(2024, 6, 20), "500")))
    new = _meter("NEU", _reg((date(2024, 6, 20), "0"), (date(2024, 6, 30), "30")))
    cols = meter_columns(
        [old, new], start_day=date(2024, 5, 31), end_day=date(2024, 6, 30), transformer_factor=None
    )
    assert cols.serial_number == "ALT / NEU"
    assert cols.start_value == Decimal("400")
    assert cols.end_value == Decimal("30")


def test_meter_change_on_period_end_keeps_old_meter() -> None:
    # Neuer Zaehler mit Anfangsstand genau am Periodenende traegt in dieser
    # Periode nichts bei -> Ende = Endstand des alten Zaehlers.
    old = _meter("ALT", _reg((date(2024, 5, 31), "400"), (date(2024, 6, 30), "500")))
    new = _meter("NEU", _reg((date(2024, 6, 30), "0"), (date(2024, 7, 31), "40")))
    june = meter_columns(
        [old, new], start_day=date(2024, 5, 31), end_day=date(2024, 6, 30), transformer_factor=None
    )
    assert june.serial_number == "ALT"
    assert june.end_value == Decimal("500")

    july = meter_columns(
        [old, new], start_day=date(2024, 6, 30), end_day=date(2024, 7, 31), transformer_factor=None
    )
    assert july.serial_number == "NEU"
    assert (july.start_value, july.end_value) == (Decimal("0"), Decimal("40"))


def test_rollover_in_period_shows_display_values_end_below_start() -> None:
    # Staende wie am Display: nach dem Ueberlauf ist Ende < Beginn; der
    # Verbrauch ergibt sich dann aus Ende - Beginn + max_value (dokumentiert).
    max_value = Decimal("100000")
    meter = _meter(
        "SN-MECH",
        _reg((date(2024, 1, 1), "99990"), (date(2024, 1, 11), "10"), max_value=max_value),
    )
    cols = meter_columns(
        [meter], start_day=date(2024, 1, 1), end_day=date(2024, 1, 8), transformer_factor=None
    )
    assert (cols.start_value, cols.end_value) == (Decimal("99990"), Decimal("4"))
    assert cols.start_value is not None and cols.end_value is not None
    consumption_7_days = Decimal("20") * 7 / 10
    assert cols.end_value - cols.start_value + max_value == consumption_7_days


def test_open_range_uses_first_and_last_reading() -> None:
    meter = _meter("SN-1", _reg((date(2024, 1, 15), "10"), (date(2024, 3, 15), "70")))
    cols = meter_columns([meter], start_day=date.min, end_day=date.max, transformer_factor=None)
    assert (cols.start_value, cols.end_value) == (Decimal("10"), Decimal("70"))


def test_same_day_readings_zero_span_still_resolve() -> None:
    meter = _meter("SN-1", _reg((date(2024, 2, 10), "5")))
    cols = meter_columns(
        [meter], start_day=date(2024, 1, 31), end_day=date(2024, 2, 29), transformer_factor=None
    )
    assert cols.serial_number == "SN-1"
    assert (cols.start_value, cols.end_value) == (Decimal("5"), Decimal("5"))


def test_no_readings_gives_empty_columns() -> None:
    assert (
        meter_columns(
            [_meter("SN-1")],
            start_day=date(2024, 1, 31),
            end_day=date(2024, 2, 29),
            transformer_factor=None,
        )
        == EMPTY_METER_COLUMNS
    )
    assert (
        meter_columns([], start_day=date.min, end_day=date.max, transformer_factor=None)
        == EMPTY_METER_COLUMNS
    )
