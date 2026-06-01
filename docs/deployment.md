# Deployment

Die anfängerfreundliche, vollständige Schritt-für-Schritt-Anleitung mit
Container-Erstellung, Updates und Backups steht in:

→ [`deploy/lxc/README.md`](../deploy/lxc/README.md)

Alles läuft über ein zentrales Verwaltungsskript:
**`/opt/zaehler/repo/deploy/lxc/zaehler.sh`**

## Wichtigste Kommandos (im Container, als root)

| Aktion | Befehl |
|---|---|
| Erstinstallation | `bash zaehler.sh install` (whiptail-Wizard: Modus-Wahl, Admin-Daten, optionale Erweitert-Einstellungen, Bestätigung, dann Installation) |
| **Komplett-Update** (System + Tools + App) | `bash zaehler.sh upgrade-all` |
| Nur System (apt) | `bash zaehler.sh upgrade-system` |
| Nur Tools (uv + pnpm) | `bash zaehler.sh upgrade-tools` |
| Nur App-Code | `bash zaehler.sh upgrade-app` |
| Zeitzone setzen | `bash zaehler.sh set-timezone [zone]` (Default Europe/Berlin) |
| Sofort-Backup | `bash zaehler.sh backup` |
| Backup einspielen | `bash zaehler.sh restore <datei.gz>` |
| 00:00-Readings → Vortag 23:59:59 | `sudo zaehler repair-midnight-readings [--apply]` (Default Dry-Run; sichert vor `--apply`) |
| Naiv-UTC-Altdaten korrigieren | `sudo zaehler repair-legacy-timestamps [--apply]` (Default Dry-Run; sichert vor `--apply`) |
| Status-Bericht | `bash zaehler.sh status` |
| Weiteren Admin nachträglich anlegen | `cd /opt/zaehler/repo/backend && uv run python -m meters.cli create-admin --username admin --password '…' --force-change` |

## Datenpfad

- DB-Datei: `/opt/zaehler/data/meters.db`
- Konfiguration: `/opt/zaehler/data/meters.env`
- Backups: `/opt/zaehler/backups/`

Die `data/`- und `backups/`-Verzeichnisse werden vom Skript **nie** gelöscht
oder überschrieben. Verlierst du sie trotzdem (z. B. weil der ganze Container
gelöscht wird), hilft nur ein externes Backup.

## Zeitzone

Der Installer setzt die Container-Zeitzone auf **Europe/Berlin**
(`timedatectl set-timezone Europe/Berlin`, DST automatisch); die systemd-Unit
setzt zusätzlich `TZ=Europe/Berlin` für den App-Prozess. Das betrifft **Logs,
den Backup-Timer und Datei-Zeitstempel** — sie laufen damit in Lokalzeit statt
UTC.

**Wichtig:** Erfassungs-/Verbrauchsdaten werden in der DB bewusst in **UTC**
gespeichert und vom Browser in die lokale Zeit umgerechnet — daran ändert die
Container-Zeitzone nichts.

Auf einem bestehenden Container, der noch auf UTC steht, nachträglich:

```bash
sudo zaehler set-timezone        # Europe/Berlin (idempotent)
```

`upgrade-app`/`upgrade-all` setzen die Zeitzone seit v2.33.1 außerdem bei jedem
Lauf idempotent mit — Bestands-Container konvergieren also automatisch beim
nächsten Update auf Europe/Berlin.

## Update-Strategie

Der `upgrade-all`-Workflow ist konservativ:

1. **System** — `apt update && apt upgrade && apt autoremove`. Gibt Hinweis,
   wenn ein Reboot wegen Kernel-Update nötig ist.
2. **Tools** — `uv self update`, `pnpm self-update`. Hält die Toolchain
   automatisch aktuell.
3. **App** —
   1. Vor jeder Aktion automatisches DB-Backup
   2. Code-Update via `git pull --ff-only`
   3. Backend-Abhängigkeiten via `uv sync --frozen`
   4. Frontend-Build via `pnpm install --frozen-lockfile && pnpm build`
   5. Datenbank-Migrationen via `uv run alembic upgrade head`
   6. Service-Neustart

Schlägt einer der Schritte 3.2-3.5 fehl, bleibt der alte Service laufen — die
SQLite-Datei wird nicht angefasst, du hast trotzdem ein frisches Backup, und
kannst den Fehler in Ruhe beheben.

Für regelmäßige automatische Updates (z. B. wöchentlich) kann ein einfacher
Cron-Job eingerichtet werden — siehe README, Abschnitt 6.
