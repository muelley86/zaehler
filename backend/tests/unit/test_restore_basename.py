"""Unit-Tests für die Basename-Prüfung beim Backup-Restore.

Die Foto-Namen kommen aus einem hochgeladenen Archiv und sind damit
angreiferkontrolliert. Neben Pfad-Separatoren und ``..`` müssen zwei
Windows-Eigenheiten abgefangen werden: ``C:evil.jpg`` ist laufwerksrelativ
(``Path("dir") / "C:evil.jpg"`` verwirft die Basis), und ein NUL-Byte lässt
``open()`` mit ``ValueError`` platzen statt mit einer sauberen Meldung.
"""

from __future__ import annotations

import pytest

from meters.services.restore import _valid_photo_basename

_BACKSLASH = chr(92)
_NUL = chr(0)


@pytest.mark.parametrize(
    "name",
    ["1000-AbCdEf12.jpg", "ok.jpg", "42-xY_z-9Q.jpg"],
)
def test_legitimate_basenames_pass(name: str) -> None:
    assert _valid_photo_basename(name) is True


@pytest.mark.parametrize(
    ("name", "grund"),
    [
        ("", "leer"),
        ("../x.jpg", "Parent-Segment"),
        ("a/b.jpg", "POSIX-Separator"),
        ("a" + _BACKSLASH + "b.jpg", "Windows-Separator"),
        ("C:evil.jpg", "laufwerksrelativ"),
        ("x" + _NUL + ".jpg", "NUL-Byte"),
        (".hidden.jpg", "führender Punkt"),
        ("..", "Parent"),
    ],
)
def test_dangerous_basenames_rejected(name: str, grund: str) -> None:
    assert _valid_photo_basename(name) is False, grund
