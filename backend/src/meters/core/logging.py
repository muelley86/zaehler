"""Zentrales Logging-Setup.

Stellt sicher, dass App-Logs ein einheitliches Format haben (Zeitstempel,
Level, Logger-Name, Message) und dass Library-Logger nicht versehentlich
sensible Daten ausgeben (SQL-Connection-String mit Credentials etc.).

Wird einmalig bei FastAPI-App-Build aufgerufen. Tests nutzen pytest-eigenes
caplog und sollen davon nicht beeinflusst werden — daher idempotent
(zweimal Aufrufen ist no-op).
"""

from __future__ import annotations

import logging
import logging.config

_CONFIGURED = False


def configure_logging(level: str = "INFO") -> None:
    """Konfiguriert root + drei häufige Library-Logger einheitlich."""
    global _CONFIGURED
    if _CONFIGURED:
        return
    _CONFIGURED = True

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "standard": {
                    "format": "%(asctime)s %(levelname)-7s %(name)s — %(message)s",
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                },
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "standard",
                    "stream": "ext://sys.stdout",
                },
            },
            "root": {
                "level": level,
                "handlers": ["console"],
            },
            "loggers": {
                # SQLAlchemy: Default-Logger schweigsam halten — Engine-Logs
                # können DB-Statements mit Werten ausgeben (auch Hashes etc.).
                "sqlalchemy.engine": {"level": "WARNING", "propagate": True},
                # FastAPI/Uvicorn: Access-Logs gehen über uvicorn.access,
                # die werden vom systemd journald separat gehändelt.
                "uvicorn.error": {"level": level, "propagate": True},
                "uvicorn.access": {"level": "WARNING", "propagate": True},
            },
        }
    )
