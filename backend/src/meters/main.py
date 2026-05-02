"""FastAPI-Anwendung: Router-Wiring, Static-Auslieferung, SPA-Fallback.

Die kompilierte React-App liegt nach ``pnpm build`` unter
``backend/src/meters/static/``. Wir mounten ``/assets`` als Static-Files und
liefern für alles andere die ``index.html`` aus, damit die Client-seitigen
Routen (z. B. ``/erfassen``) funktionieren — die API-Routen unter ``/api/...``
greifen vorher und werden nicht überschrieben.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from meters.api import router as api_router
from meters.core.config import settings
from meters.core.problem import install_problem_handlers


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, debug=settings.debug)
    install_problem_handlers(app)
    app.include_router(api_router)

    @app.get("/api/v1/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    _mount_static(app, settings.static_dir)
    return app


def _mount_static(app: FastAPI, static_dir: Path) -> None:
    if not static_dir.exists():
        return
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    index_file = static_dir / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> Response:
        # API-Pfade gehen schon vorher in den API-Router; hier landen nur
        # Frontend-Routen oder echte Static-Files (z. B. manifest, icons).
        candidate = static_dir / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        if index_file.is_file():
            return FileResponse(index_file)
        return Response(status_code=404)


app = create_app()
