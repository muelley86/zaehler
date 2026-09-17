# Architektur

> Ausgelagert aus CLAUDE.md, damit die Projekt-Memory schlank bleibt.


- Monorepo: /backend, /frontend, /docs, /deploy
- Frontend wird gebaut und vom FastAPI als Static Files ausgeliefert
- Ein Prozess, ein Port (Standard 8000)
- API-Routen unter /api/v1/..., alles andere → SPA-Fallback auf index.html
- Multi-User mit gemeinsamem Datenbestand (alle Nutzer sehen dieselben Zähler)
- Rollen: admin und recorder (siehe Sektion Auth & Benutzer)
- PWA mit vollem Offline-Modus (seit v2.69.0): Erfassung inkl. Fotos offline,
  historische Daten als letzter bekannter Stand, Auto-Sync bei Serverkontakt —
  Details in „Weitere Features → Offline-Modus"


## Code-Layout

Backend (`backend/src/meters/`):

- `main.py` — FastAPI-App-Factory, Static-Mount, SPA-Fallback (`/api/*` → 404, alles andere → `index.html`)
- `api/v1/` — Router pro Ressource (auth, readings, measuring_points, qr_tokens, …); `api/deps.py` hält die Auth-/Session-Dependencies
- `models/` — SQLAlchemy-2.x-Modelle (eine Datei pro Entität)
- `schemas/` — Pydantic-v2-DTOs (Request/Response)
- `services/` — Business-Logik (consumption, meter_replacement, access, audit, qr_token, totp, rate_limit)
- `core/` — Config (`pydantic-settings`, Präfix `METERS_`), Logging, Middleware (Security-Header + Origin-Check), RFC-7807-Problem-Handler, OBIS-Konstanten, bcrypt-Helper
- `db/` — Engine, `SessionLocal`, Type-Helper (Decimal-as-String etc.)
- `cli.py` — `python -m meters.cli` für Admin-Anlage / Passwort-Reset, Reparaturen, `recompute-monthly`, `seed-readings` (Dev-Testdaten)
- `static/` — kompiliertes Frontend (von `pnpm build` befüllt, nicht im Repo)

Frontend (`frontend/src/`):

- `App.tsx` + `main.tsx` — Router-Wiring, Layout-Shells (Bottom-Tab mobile / Sidebar desktop)
- `features/{auth,dashboard,readings,scanner,offline,admin,export,more}` — vertikale Slices, jeweils Routes + Components + Tests beieinander
- `features/dashboard/` — `DashboardPage.tsx` ist reine Komposition; Daten/State kommen aus Hooks (`useDashboardData` Cache/SWR, `useDashboardFilters`), Fachlogik aus reinen Selektoren (`dashboardSelectors.ts` Filter/Optionen, `dashboardMetrics.ts` KPI/Hinweise/Top-Verbraucher), Darstellung aus `KpiTiles`/`InsightsCard`/`TopConsumers`. Keine Diagramme (seit v2.72: dafür die Auswertungen-Seite).
- `features/reports/` — `ReportsPage.tsx` hält Filter-State + Konfig-Laden/-Speichern und komponiert `SavedReportsSection` (ganz oben), Filter-Sections, Aktionszeile („Auswerten"/CSV/Speichern) und `ReportResults` (Platzhalter, Stale-Hinweis, Umschalter Tabelle|Diagramm; `ReportTables.tsx`, lazy `ReportChart.tsx` — einziger Pfad dieser Route zum Recharts-Chunk). `useReportQuery.ts` trennt anstehende von ausgeführter Query, `reportChartSeries.ts` ist der reine Adapter `ReportRow[]` → Chart-Gruppen, `reportUtils.ts` hält Labels/Perioden/Diff/Query-Builder/`runBlocker`.
- `components/` — geteilte UI-Bausteine
- `lib/` — API-Client, Hooks, Utilities; `lib/offline/` hält Outbox, Sync-Engine und Stammdaten-Snapshot des Offline-Modus (IndexedDB, kein React)
- `styles/` — Tailwind-Layer + OKLCH-Tokens (Light/Dark)
- `tests/setup.ts` — Vitest-Setup (jsdom, MSW)

Tests (`backend/tests/`): `unit/` (reine Service-Logik) vs. `integration/` (FastAPI-TestClient + echte SQLite-DB pro Test).

