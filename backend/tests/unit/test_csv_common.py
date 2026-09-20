"""Unit-Tests für csv_guard_formula (Schutz vor CSV-Formel-Injection).

Werte, die mit ``=`` ``+`` ``-`` ``@`` ``TAB`` oder ``CR`` beginnen, würden in
Excel/LibreOffice als Formel ausgeführt — sie werden mit einem Apostroph
entschärft. TAB und CR zählen mit, weil die Tabellenprogramme sie beim Parsen
entfernen und das danach folgende ``=`` dann doch als Formel werten.
"""

from __future__ import annotations

import pytest

from meters.schemas.common import csv_guard_formula


@pytest.mark.parametrize("char", ["=", "+", "-", "@", "\t", "\r"])
def test_dangerous_prefix_is_escaped(char: str) -> None:
    assert csv_guard_formula(f"{char}HARM") == f"'{char}HARM"


def test_formula_payload_is_escaped() -> None:
    assert csv_guard_formula('=HYPERLINK("http://evil","x")') == '\'=HYPERLINK("http://evil","x")'


@pytest.mark.parametrize("value", ["Halle Nord", "kWh", "m³", "1.8.0", "12,5", ""])
def test_harmless_values_unchanged(value: str) -> None:
    assert csv_guard_formula(value) == value


def test_tab_hides_formula_from_naive_guard() -> None:
    """Der konkrete Bypass: führendes TAB vor der Formel.

    Ein Guard, der nur ``= + - @`` kennt, lässt diesen Wert durch; Excel
    strippt das TAB und führt die Formel dann aus.
    """
    payload = '\t=HYPERLINK("http://evil","Klick")'
    assert csv_guard_formula(payload) == "'" + payload
