"""Startbares Modul für die App.

Dünne Hülle um uvicorn, die Bind-Host und -Port aus den Settings liest
(siehe ``meters.core.config``). Damit ist der Bind-Host konfigurierbar über
``METERS_BIND_HOST`` in ``meters.env``, ohne die systemd-Unit anfassen zu
müssen.

Aufruf:
    uv run python -m meters.server
"""

from __future__ import annotations

import uvicorn

from meters.core.config import settings


def main() -> None:
    uvicorn.run(
        "meters.main:app",
        host=settings.bind_host,
        port=settings.bind_port,
        log_level="info",
        access_log=False,
    )


if __name__ == "__main__":
    main()
