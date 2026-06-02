"""Unit-Tests für csv_guard_formula (Schutz vor CSV-Formel-Injection).

Werte, die mit ``=`` ``+`` ``-`` ``@`` beginnen, würden in Excel/LibreOffice
als Formel ausgeführt — sie werden mit einem Apostroph entschärft.
"""

from __future__ import annotations

import pytest

from meters.schemas.common import csv_guard_formula


@pytest.mark.parametrize("char", ["=", "+", "-", "@"])
def test_dangerous_prefix_is_escaped(char: str) -> None:
    assert csv_guard_formula(f"{char}HARM") == f"'{char}HARM"


def test_formula_payload_is_escaped() -> None:
    assert csv_guard_formula('=HYPERLINK("http://evil","x")') == '\'=HYPERLINK("http://evil","x")'


@pytest.mark.parametrize("value", ["Halle Nord", "kWh", "m³", "1.8.0", "12,5", ""])
def test_harmless_values_unchanged(value: str) -> None:
    assert csv_guard_formula(value) == value
