# Zählerstand-App

Self-hosted Webapp zur Erfassung und Historisierung von Strom-, Gas-, Wasser-
und Heizöl-Zählerständen für einen Privathaushalt. Läuft als einzelner
Python-Prozess (FastAPI + Uvicorn), Daten in SQLite, Frontend ist eine React-SPA,
die direkt vom Backend ausgeliefert wird. Keine Cloud, keine externen
Abhängigkeiten zur Laufzeit.

Die fachliche Spezifikation steht in [`CLAUDE.md`](./CLAUDE.md).

> Anfänger? In [`docs/anleitung.md`](./docs/anleitung.md) steht eine
> kompakte Schritt-für-Schritt-Anleitung für Container-Installation,
> eigene Code-Änderungen nach GitHub pushen und Container-Updates.

## Funktionsumfang (Stand: aktuell)

- Mehrere Messstellen-Typen: **Strom** (mit HT/NT und bidirektional), **Gas**,
  **Wasser**, **Ölheizung** (Tankstand + Betriebsstunden + Lieferungen).
- Mehrere **Erfassungen pro Tag** mit voller Plausibilitätsprüfung für
  kumulative Zähler (Wert darf nicht zurückgehen, auch bei Rückdatierung).
- **Heizöl-Tank**: Bestand, Lieferungen erfassen, Bestandskorrektur,
  Tankvolumen + Prozent-Anzeige.
- **Standorte** zentral verwalten, **Benutzerverwaltung** (admin / recorder)
  mit erzwungenem Passwortwechsel beim ersten Login.
- **Audit-Log** über alle Änderungen.
- **Dashboard** mit Verbrauchs- und Stand-Diagrammen, Filter nach Standort,
  Zählerart, Messstelle und Zeitraum, plus aggregierter Verbrauchs-Übersicht.
- **CSV-Export** auf Dashboard- und Erfassungs-Seite.
- **iOS-/SwiftUI-inspirierte UI** mit Dark-Mode-Folge und Responsive-Layout
  (Mobile: Bottom-Tab-Bar, Desktop: Sidebar).

## Repo-Struktur

```
backend/    FastAPI + SQLAlchemy 2 + Alembic, verwaltet mit uv
frontend/   React 18 + Vite + TypeScript + Tailwind, gebaut mit pnpm
docs/       Architektur-, Datenmodell-, Auth-, API-, Deployment-Notizen
deploy/     systemd-Unit + Bootstrap-/Update-/Backup-Skripte für LXC
data/       SQLite-DB zur Laufzeit (Inhalte git-ignoriert)
```

## Schnellstart auf dem Entwicklungsrechner

```sh
# Backend
cd backend
uv sync
uv run alembic upgrade head
uv run python -m meters.cli create-admin --username admin --password 'admin-pass-12345'
uv run uvicorn meters.main:app --reload

# Frontend (zweites Terminal)
cd frontend
pnpm install
pnpm dev
```

→ App auf http://localhost:5173 (Vite proxyt `/api/*` an Port 8000).

## Produktion — LXC-Container

Die ausführliche, anfängerfreundliche Anleitung mit Container-Erstellung,
Backups und Updates steht in **[`deploy/lxc/README.md`](./deploy/lxc/README.md)**.

**Installation in einem Befehl** — im frischen Debian-13-Container als `root`:

```sh
bash -c "$(curl -fsSL https://raw.githubusercontent.com/muelley86/zaehler/main/deploy/lxc/install.sh)"
```

Der Bootstrap zieht das Repo, danach läuft der whiptail-Wizard durch alle
Eingaben (Admin-Username + Passwort, optional Bind-Host/Port, Backup-Zeit).
Am Ende zeigt der Wizard die App-URL.

Spätere Komplett-Updates (System, Tools, App):

```sh
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh upgrade-all
```

Granulare Kommandos: `upgrade-system`, `upgrade-tools`, `upgrade-app`,
`backup`, `restore`, `status`, `help`. App-Updates legen automatisch ein
DB-Backup an. `data/meters.db` wird durch das Skript **niemals** verändert
oder überschrieben.

## Tests, Lint, Typcheck

```sh
# Backend
cd backend
uv run ruff check .
uv run ruff format --check .
uv run mypy
uv run pytest

# Frontend
cd frontend
pnpm lint
pnpm format:check
pnpm type-check
pnpm test --run
pnpm build
```

## Konfiguration

Alle Einstellungen via Umgebungsvariablen (Präfix `METERS_`). Im LXC-Setup
liegen sie in `/opt/zaehler/data/meters.env`. Wichtige Optionen:

| Variable | Default | Bedeutung |
|---|---|---|
| `METERS_DATABASE_URL` | `sqlite:///./data/meters.db` | SQLite-Pfad |
| `METERS_SECRET_KEY` | `change-me-in-production` | Server-Geheimnis für Session-Token-Hashing — **muss in Produktion gesetzt werden** |
| `METERS_SESSION_LIFETIME_DAYS` | `30` | Cookie-Lebensdauer (Sliding) |
| `METERS_BCRYPT_ROUNDS` | `12` | Bcrypt-Cost-Faktor |
| `METERS_LOGIN_MAX_ATTEMPTS` | `5` | Login-Versuche pro Minute pro IP |
| `METERS_LOGIN_LOCKOUT_SECONDS` | `900` | Sperrdauer nach Überschreiten |
| `METERS_COOKIE_SECURE` | `False` | `True` setzen, sobald HTTPS davor steht |
| `METERS_COOKIE_SAMESITE` | `strict` | `strict` oder `lax` |

## Lizenz / Status

Privates Hobby-Projekt, öffentlich gemacht, damit der Bootstrap-Einzeiler
ohne Auth funktioniert. Es gibt keine Veröffentlichungs- oder
Support-Verpflichtung. Konventionen sind in `CLAUDE.md` beschrieben.

**Sicherheits-Hinweis:** Das Repo enthält bewusst **keine** Geheimnisse —
Secrets (Session-Key, DB-Pfad, etc.) liegen in `meters.env` außerhalb des
Repos und werden bei der Erstinstallation zufällig generiert. Wenn du den
Code forkst, prüfe vor jedem Commit, dass keine eigenen Konfig-Daten oder
Backups versehentlich mitcommittet werden (das `.gitignore` blockt
`.env`, `*.db` und `data/` standardmäßig).
