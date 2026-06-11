"""Globales Wartungs-Gate für den Backup-Restore.

Eigenes Mini-Modul ohne weitere Abhängigkeiten, damit sowohl ``meters.db``
(``get_session``-Gate) als auch ``meters.services.restore`` importieren können,
ohne einen Zirkular-Import zu riskieren.

Single-Process-App (ein uvicorn-Worker): ein ``threading``-Primitiv genügt.
"""

from __future__ import annotations

import threading

# Genau ein Restore gleichzeitig — der Commit-Endpoint acquired non-blocking
# und antwortet sonst mit 409.
restore_lock = threading.Lock()

# Solange gesetzt, lehnt ``get_session`` alle neuen Requests mit 503 ab.
# Der Restore selbst arbeitet an ``get_session`` vorbei (eigene Connections).
restore_in_progress = threading.Event()
