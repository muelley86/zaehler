"""Statische Checks der Deploy-Dateien (Security-Audit #3).

Root führt bei ``sudo zaehler …`` Skripte und die Unit-Quelle aus dem Repo
aus. Damit eine kompromittierte App daraus nicht root im Container macht,
müssen zwei Invarianten halten:

1. Der Dienst darf im Repo nichts schreiben außer ``repo/data``.
2. Root ruft ``backup.sh`` nie direkt auf, sondern über ``cmd_backup``
   (der als root per ``as_user`` delegiert).
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
UNIT = REPO / "deploy" / "systemd" / "zaehler.service"
SCRIPT = REPO / "deploy" / "lxc" / "zaehler.sh"


def _unit_paths(key: str) -> list[str]:
    paths: list[str] = []
    for line in UNIT.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{key}="):
            paths.extend(p.lstrip("-") for p in line.split("=", 1)[1].split())
    return paths


def test_service_cannot_write_repo_except_data() -> None:
    assert "/opt/zaehler/repo" in _unit_paths("ReadOnlyPaths")
    writable_in_repo = [
        p for p in _unit_paths("ReadWritePaths") if p.startswith("/opt/zaehler/repo")
    ]
    assert writable_in_repo == ["/opt/zaehler/repo/data"]


def test_root_never_runs_backup_script_directly() -> None:
    text = SCRIPT.read_text(encoding="utf-8")
    match = re.search(r"^cmd_backup\(\) \{\n(.*?)^\}", text, re.S | re.M)
    assert match is not None
    body_start, body_end = match.span()
    for hit in re.finditer(r'^\s*"\$REPO_DIR/deploy/lxc/backup\.sh"', text, re.M):
        assert body_start <= hit.start() < body_end, (
            f"backup.sh direkt aufgerufen in Zeile {text.count(chr(10), 0, hit.start()) + 1}"
            " — als root stattdessen cmd_backup verwenden"
        )
