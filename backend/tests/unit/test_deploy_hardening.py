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


def _case_branch(text: str, mode: str) -> str:
    """Rumpf eines ``case``-Zweigs aus ``cmd_configure_network`` (bis zum ``;;``)."""
    match = re.search(rf"^\s*{re.escape(mode)}\)\n(.*?)^\s*;;", text, re.S | re.M)
    assert match is not None, f"case-Zweig {mode!r} nicht gefunden"
    return match.group(1)


def test_every_proxy_mode_sets_public_base_url_for_qr_links() -> None:
    """Jeder Modus mit HTTPS-Proxy-Domain muss ``METERS_PUBLIC_BASE_URL`` setzen.

    Sonst leitet die App die QR-URL aus dem internen Request ab und druckt
    ``http://`` auf die Etiketten (``proxy-other`` hatte das vergessen).
    """
    text = SCRIPT.read_text(encoding="utf-8")
    for mode in ("proxy-other", "proxy-same", "proxy-external"):
        assert 'public_base_url="https://$proxy_domain"' in _case_branch(text, mode), mode


def test_lan_only_leaves_public_base_url_empty() -> None:
    text = SCRIPT.read_text(encoding="utf-8")
    assert "public_base_url=" not in _case_branch(text, "lan-only")


def test_install_writes_public_base_url_when_proxy_host_given() -> None:
    """Die Erstinstallation mit Proxy-Domain schreibt die QR-Basis-URL mit."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert 'public_base_url_value="https://$WIZ_REVERSE_PROXY_HOST"' in text
    assert "METERS_PUBLIC_BASE_URL=$public_base_url_value" in text
    assert "grep -q '^METERS_PUBLIC_BASE_URL='" in text
