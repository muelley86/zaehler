"""Unit-Tests fuer die Groessen-Grenzen des Zaehlerstand-Imports.

Das Upload-Limit in ``api/v1/imports.py`` gilt fuer das *komprimierte*
xlsx. Eine ``sheet1.xml`` aus repetitivem XML komprimiert um Faktor 1000+,
und ``iter_rows`` paddet jede Zeile auf die deklarierte Spaltenzahl (bis
XFD = 16384) — ein 5-MB-Upload kann den Prozess so ins OOM treiben. Darum
zusaetzlich Zeilen-, Spalten- und Entpack-Grenzen.

Ueberschreitungen muessen *gemeldet* werden, nicht still abgeschnitten:
sonst gingen Zaehlerstaende verloren, ohne dass es jemandem auffaellt.
"""

from __future__ import annotations

import io
import zipfile

import pytest
from openpyxl import Workbook

from meters.services.import_readings import (
    _MAX_IMPORT_COLS,
    _MAX_IMPORT_ROWS,
    _MAX_UNCOMPRESSED_BYTES,
    _assert_no_zip_bomb,
    _read_grid,
)


def _xlsx_bytes(rows: int, cols: int) -> bytes:
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    for r in range(rows):
        ws.append([f"z{r}c{c}" for c in range(cols)])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_xlsx_within_limits_is_parsed() -> None:
    grid = _read_grid("ok.xlsx", _xlsx_bytes(5, 4))
    assert len(grid) == 5
    assert grid[0][0] == "z0c0"


def test_xlsx_with_too_many_rows_is_rejected() -> None:
    data = _xlsx_bytes(_MAX_IMPORT_ROWS + 5, 2)
    with pytest.raises(ValueError, match="Zeilen"):
        _read_grid("gross.xlsx", data)


def test_csv_with_too_many_rows_is_rejected() -> None:
    data = ("a;b" + chr(10)) * (_MAX_IMPORT_ROWS + 5)
    with pytest.raises(ValueError, match="Zeilen"):
        _read_grid("gross.csv", data.encode("utf-8"))


def test_csv_with_too_many_columns_is_rejected() -> None:
    """Spalten duerfen nicht still abgeschnitten werden — sonst Datenverlust."""
    data = ";".join(str(i) for i in range(_MAX_IMPORT_COLS + 5))
    with pytest.raises(ValueError, match="Spalten"):
        _read_grid("breit.csv", data.encode("utf-8"))


def test_zip_bomb_guard_accepts_normal_file() -> None:
    _assert_no_zip_bomb(_xlsx_bytes(3, 3))  # wirft nicht


def test_zip_bomb_guard_rejects_oversized_expansion() -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Hochkomprimierbarer Inhalt jenseits der Entpack-Grenze.
        zf.writestr("xl/sharedStrings.xml", b"A" * (_MAX_UNCOMPRESSED_BYTES + 1024))
    with pytest.raises(ValueError, match="entpackt zu gross"):
        _assert_no_zip_bomb(buf.getvalue())


def test_zip_bomb_guard_rejects_non_zip() -> None:
    with pytest.raises(ValueError, match="kein gueltiges"):
        _assert_no_zip_bomb(b"das ist kein zip")
