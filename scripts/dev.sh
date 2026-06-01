#!/usr/bin/env bash
# One-Shot lokaler Dev-Start (Unix/macOS): Backend + Frontend mit EINEM Befehl.
# Aufruf:  npm run dev   (aus dem Repo-Root)
#
# Idempotent: der erste Lauf richtet alles ein (.env, DB-Migration, Admin,
# Demo-Daten), weitere Läufe starten nur die Server. Strg+C beendet beide.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

# ---- Vorab-Checks ----------------------------------------------------------
command -v uv >/dev/null 2>&1 || {
  echo "FEHLER: 'uv' ist nicht installiert — siehe https://docs.astral.sh/uv/"; exit 1; }
command -v pnpm >/dev/null 2>&1 || {
  echo "FEHLER: 'pnpm' ist nicht installiert — 'npm install -g pnpm'"; exit 1; }

# ---- backend/.env sicherstellen (gitignored) -------------------------------
if [ ! -f "$BACKEND/.env" ]; then
  SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
  cat > "$BACKEND/.env" <<EOF
# Lokale Dev-Konfiguration (von scripts/dev.sh angelegt, gitignored).
# Produktion nutzt /opt/zaehler/data/meters.env — davon getrennt.
METERS_SECRET_KEY=$SECRET
METERS_DEBUG=true
METERS_COOKIE_SECURE=false
EOF
  echo "[dev] backend/.env mit zufälligem METERS_SECRET_KEY erzeugt."
fi

# ---- Backend: Deps + Migration + Bootstrap (Admin + Demo) ------------------
echo "[dev] Backend vorbereiten (uv sync, Migration, Bootstrap) ..."
(
  cd "$BACKEND"
  uv sync --quiet
  uv run alembic upgrade head >/dev/null
  uv run python "$ROOT/scripts/dev_bootstrap.py"
)

# ---- Frontend-Deps (nur falls fehlend) -------------------------------------
if [ ! -d "$FRONTEND/node_modules" ]; then
  echo "[dev] Frontend-Dependencies installieren (pnpm install) ..."
  ( cd "$FRONTEND" && pnpm install --silent )
fi

# ---- Beide Server starten --------------------------------------------------
echo "[dev] Starte Backend (:8000) und Frontend (:5173) ..."
( cd "$BACKEND" && exec uv run uvicorn meters.main:app --reload --port 8000 ) &
BACKEND_PID=$!
( cd "$FRONTEND" && exec pnpm dev ) &
FRONTEND_PID=$!

cleanup() { kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true; }
trap cleanup INT TERM EXIT

# Auf beide Ports warten (curl wartet selbst, kein Shell-sleep nötig)
curl -s --retry 60 --retry-delay 1 --retry-connrefused -o /dev/null \
  "http://localhost:8000/api/v1/health" 2>/dev/null || true
curl -s --retry 60 --retry-delay 1 --retry-connrefused -o /dev/null \
  "http://localhost:5173/" 2>/dev/null || true

echo ""
echo "============================================================"
echo "  Zählerstand-App läuft:  http://localhost:5173"
echo "  Login:  admin  /  admin123"
echo "  (Strg+C beendet Backend und Frontend gemeinsam)"
echo "============================================================"
if command -v open >/dev/null 2>&1; then
  open "http://localhost:5173" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:5173" >/dev/null 2>&1 || true
fi

# Im Vordergrund auf die Server warten; Strg+C läuft über das Trap-Cleanup.
wait
