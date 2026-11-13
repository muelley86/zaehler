"""Kennzahlen der Ergebnisuebersicht: Differenz in Prozent. Nur fiktive Werte."""

from __future__ import annotations

from decimal import Decimal

import pytest

from meters.services.billing_run import prozent_von


@pytest.mark.parametrize(
    ("differenz", "basis", "erwartet"),
    [
        ("10.00", "250.00", "4.00"),
        ("-3.00", "1350.00", "-0.22"),
        ("0.00", "250.00", "0.00"),
        # Kaufmaennisch gerundet: 1/800 = 0,125 % -> 0,13 %.
        ("1", "800", "0.13"),
        ("-12.5", "1000", "-1.25"),
    ],
)
def test_prozent_von_rundet_kaufmaennisch_auf_zwei_stellen(
    differenz: str, basis: str, erwartet: str
) -> None:
    assert prozent_von(Decimal(differenz), Decimal(basis)) == Decimal(erwartet)
    assert str(prozent_von(Decimal(differenz), Decimal(basis))) == erwartet


def test_prozent_von_ohne_basis_gibt_keinen_wert() -> None:
    assert prozent_von(Decimal("5.00"), Decimal(0)) is None
