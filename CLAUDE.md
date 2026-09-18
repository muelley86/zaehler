# CLAUDE.md

Projekt-Memory für Claude Code. Bewusst schlank gehalten — Details stehen in `docs/`
und werden bei Bedarf gelesen, nicht in jede Session geladen.

# Zählerstand-App

## Zweck

Self-hosted Webapp zur Erfassung und Historisierung von Strom-, Gas- und
Wasserzählerständen für einen Privathaushalt. Läuft in einem LXC-Container
auf eigener Hardware. Keine Cloud, keine externen Abhängigkeiten zur Laufzeit.

## Tech-Stack

- Backend: Python 3.13, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, openpyxl (Excel-Import)
- DB: SQLite (Datei unter ./data/meters.db)
- Frontend: React 18 + Vite + TypeScript, Tailwind CSS
- Charts: Recharts
- Auth: bcrypt (Passwort-Hash), Session-Cookie (httpOnly, SameSite=Strict, Secure)
- Tests: pytest + httpx (Backend), Vitest + React Testing Library (Frontend)
- Linting/Format: ruff, mypy --strict, eslint, prettier
- Package-Manager: uv (Python), pnpm (JS)

## Architektur in drei Sätzen

Monorepo (`/backend`, `/frontend`, `/docs`, `/deploy`). Das Frontend wird gebaut und
vom FastAPI als Static Files ausgeliefert — ein Prozess, ein Port (Standard 8000).
API unter `/api/v1/...`, alles andere fällt per SPA-Fallback auf `index.html`.
Multi-User mit gemeinsamem Datenbestand, Rollen `admin` und `recorder`.

## Entwicklungs-Befehle

Repo-Root hat ein Makefile: `make lint` (ruff + mypy + eslint + prettier + tsc),
`make test` (pytest + vitest), `make format`. Granular:
`make {lint,test,format}-{backend,frontend}`.

Backend (in `backend/`, via `uv`):

- Erststart: `uv sync && uv run alembic upgrade head`
- Admin anlegen: `uv run python -m meters.cli create-admin --username admin --password '...'`
- Server (dev): `uv run uvicorn meters.main:app --reload`
- Einzelner Test: `uv run pytest tests/integration/test_readings.py::test_create_reading -x`
- Neue Migration: `uv run alembic revision --autogenerate -m "<beschreibung>"`

Frontend (in `frontend/`, via `pnpm`):

- Dev-Server: `pnpm dev` (Port 5173, proxyt `/api/*` → `http://localhost:8000`)
- Einzelner Test: `pnpm exec vitest run src/features/readings/ReadingsList.test.tsx`
- Build: `pnpm build` (schreibt nach `backend/src/meters/static/`)

Windows-One-Shot-Setup: `scripts/dev-test.ps1` (idempotent, startet beide Server
in eigenen Fenstern).

## Invarianten — hier nie danebengreifen

- Zählerstände als **Decimal**, NIEMALS Float (Rundungsfehler).
- `reading_date` strikt von `created_at` trennen — Erfassung erfolgt oft nachträglich.
- Verbrauch = `value_neu − value_alt`, beide Readings MÜSSEN am selben
  `PhysicalMeter` hängen. Über Zählerwechsel hinweg gelten Sonderregeln.
- SQLite im **WAL-Modus** (`PRAGMA journal_mode=WAL`), sonst blockieren parallele
  Writes. Lange Transaktionen vermeiden, Foto-Uploads nie in der DB-Transaktion.
- Recorder bekommt auf nicht zugeordnete Messstellen **404 statt 403** —
  verhindert Existenz-Leaks. Nicht zu 403 „korrigieren".
- Eigenverbrauch PV wird NICHT berechnet (aus Bezug+Einspeisung nicht ableitbar).
- `monthly_consumption` ist ein Cache, `Reading` bleibt die Wahrheit.
- `billing/calculation.py` spiegelt die Rechenregeln der Stromabrechnung (`model.py`) 1:1 — nur gemeinsam
  mit dem Projekt Stromabrechnung ändern; Abnahme `tests/unit/test_billing_referenzfaelle.py` muss grün bleiben.
  Echte Abrechnungsdaten nie ins Repo (öffentlich) — nur synthetische Fixtures.
- Migrationen: unter SQLite **kein `batch_alter_table` für Spalten-Drops** an Tabellen mit
  `ON DELETE CASCADE`-Kindern (`measuring_point`, `physical_meter`, …). Der Neuaufbau
  löscht bei `foreign_keys=ON` alle Kinddaten; `PRAGMA foreign_keys=OFF` wirkt in der
  Migrations-Transaktion nicht. Stattdessen `ALTER TABLE … DROP COLUMN` (SQLite ≥ 3.35),
  siehe Migration 0035 und `test_0035_verschiebt_faktor_ohne_datenverlust`.

## API-Konventionen

- Routen: `/api/v1/{ressource}` (kebab-case bei Mehrwort-Ressourcen)
- JSON in/out, Datumsangaben als ISO-8601 (UTC)
- Decimal-Werte als String serialisieren (Pydantic-Konfiguration)
- Fehler im RFC-7807-Format (problem+json), Validierungsfehler feldbezogen

## Konventionen

- Python: ruff (lint+format), mypy strict, type hints überall
- TypeScript: strict mode, kein `any`, kein `as` ohne Begründung
- Commits: Conventional Commits (feat:, fix:, chore:, refactor:, test:)
- Branch-Naming: feature/..., fix/..., chore/...

## Vertiefung — bei Bedarf lesen

| Thema | Datei |
|---|---|
| Architektur, vollständiges Code-Layout (Backend + Frontend) | `docs/architecture.md` |
| Datenmodell, OBIS-Register, Verbrauchsberechnung, Zählerwechsel | `docs/data-model.md` |
| Rollen, Login, Sessions, Audit, Per-Recorder-Zugriff, Concurrency | `docs/auth.md` |
| UI-Anforderungen, Dashboard, Auswertungen, QR-Workflow | `docs/ui.md` |
| Offline-Modus, Backup/Restore, 2FA, Import, Verrechnete Messstellen | `docs/features.md` |
| Endpoint-Übersicht | `docs/api.md` |
| Deployment (LXC) | `docs/deployment.md` |

Bei Arbeit an einem dieser Bereiche die zugehörige Datei zuerst lesen — dort stehen
die Fallstricke, die hier aus Platzgründen fehlen.
