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
from starlette.middleware.gzip import GZipMiddleware
from starlette.types import Scope

from meters.api import router as api_router
from meters.core.config import assert_secure_secret_key, settings
from meters.core.logging import configure_logging
from meters.core.middleware import install_origin_check, install_security_headers
from meters.core.problem import ProblemError, install_problem_handlers


# Cache-Header für die von Vite gehashten Bundle-Dateien unter /assets.
# Dateinamen enthalten einen Content-Hash (z. B. ``index-a1b2c3d4.js``),
# darum ist ``immutable`` sicher: bei Änderungen ändert sich der Name.
_IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
# index.html und Top-Level-Files (manifest, sw.js, icons) dürfen nicht
# stark gecacht werden, sonst sehen Nutzer Updates erst nach manuellem
# Reload. ``no-cache`` erlaubt Caching, erzwingt aber Revalidierung.
_NO_CACHE = "no-cache"


class _CachedAssets(StaticFiles):
    """Static-Files-Mount, der ``Cache-Control: immutable`` setzt."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers.setdefault("Cache-Control", _IMMUTABLE_CACHE)
        return response


def create_app() -> FastAPI:
    configure_logging("DEBUG" if settings.debug else "INFO")
    assert_secure_secret_key()
    app = FastAPI(title=settings.app_name, debug=settings.debug)
    # GZip vor Routing aktivieren — komprimiert JSON-Responses und das
    # gebaute JS/CSS um typischerweise 60–75 %. Schwelle 1024 B vermeidet
    # Overhead für kleine Antworten.
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    install_security_headers(app)
    install_origin_check(app)
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
        app.mount("/assets", _CachedAssets(directory=assets_dir), name="assets")

    index_file = static_dir / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> Response:
        # Die Catch-All-Route greift auch für GET-Requests auf unbekannte
        # API-Pfade — FastAPI hat keinen eingebauten "match nur Nicht-API"-
        # Filter. Würden wir unbeschadet durchfallen, käme für
        # ``GET /api/v1/foo-existiert-nicht`` die index.html als 200 OK
        # zurück (und API-Clients würden sich darüber wundern, warum sie
        # HTML zurückbekommen). Daher: alles unter ``api/`` explizit als
        # RFC-7807-404 ablehnen, das passt zum Format der echten
        # API-Routen.
        if full_path.startswith("api/"):
            raise ProblemError(
                status_code=404,
                title="Not Found",
                detail=f"Unbekannter API-Pfad: /{full_path}",
            )
        # Echte Static-Files (manifest, sw.js, icons, …) werden direkt
        # ausgeliefert. Alles andere ist eine Client-Route → index.html.
        candidate = static_dir / full_path
        if full_path and candidate.is_file():
            response = FileResponse(candidate)
            response.headers.setdefault("Cache-Control", _NO_CACHE)
            return response
        if index_file.is_file():
            response = FileResponse(index_file)
            response.headers.setdefault("Cache-Control", _NO_CACHE)
            return response
        return Response(status_code=404)


app = create_app()
