# Installation und Betrieb der Zählerstand-App im LXC-Container

Diese Anleitung richtet sich an Einsteiger und beschreibt **Schritt für Schritt**,
wie die App auf einem frisch erstellten Debian-13-Container (Trixie) installiert
und betrieben wird. Du brauchst keine Programmiererfahrung, aber etwas Grund­
verständnis im Umgang mit der Linux-Shell ist hilfreich.

> **Wichtig:** Die App speichert ihre Daten in einer SQLite-Datei
> (`/opt/zaehler/data/meters.db`). Verlierst du diese Datei, sind alle Erfassungen
> weg. Halte dich an den Backup-Abschnitt.

Im Mittelpunkt steht ein einziges Verwaltungsskript:
**`/opt/zaehler/repo/deploy/lxc/zaehler.sh`** — es erledigt Installation,
Updates aller Komponenten, Backups, Wiederherstellung und Status-Diagnose.

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#1-voraussetzungen)
2. [LXC-Container anlegen](#2-lxc-container-anlegen)
3. [zaehler.sh herunterladen und Installation starten](#3-zaehlersh-herunterladen-und-installation-starten)
4. [Erstmaliger Login](#4-erstmaliger-login)
5. [Reverse-Proxy mit HTTPS](#5-reverse-proxy-mit-https)
6. [Updates einspielen](#6-updates-einspielen)
7. [Daten sichern (Backup)](#7-daten-sichern-backup)
8. [Datenwiederherstellung](#8-datenwiederherstellung)
9. [Status und Diagnose](#9-status-und-diagnose)
10. [Fehlersuche](#10-fehlersuche)
11. [Deinstallation](#11-deinstallation)
12. [Befehlsreferenz `zaehler.sh`](#12-befehlsreferenz-zaehlersh)

---

## 1. Voraussetzungen

- Ein Proxmox-Host (oder ein anderer LXC-fähiger Linux-Host) mit Internetzugriff.
- 1 GB RAM, 4 GB Plattenplatz, 1 vCPU im Container reichen aus.
- Eine Debian-13-Vorlage (`debian-13-standard_*.tar.zst`) — in Proxmox unter
  *Storage → CT Templates → Templates → Debian 13.0 standard* herunterladbar.
- Optional: ein Reverse-Proxy auf dem Host (Caddy, nginx, Traefik) für HTTPS.

---

## 2. LXC-Container anlegen

### Per Proxmox-Weboberfläche

1. *Datacenter → dein-node → CT erstellen*
2. **Allgemein**: ID frei wählen, Hostname `zaehler`, Passwort vergeben.
3. **Vorlage**: `debian-13-standard`.
4. **Festplatte**: 4 GB.
5. **CPU**: 1 Core. **RAM**: 1024 MB. **Swap**: 512 MB.
6. **Netzwerk**: IPv4 = `dhcp` oder feste IP.
7. Bestätigen, Container starten.

### Per Shell auf dem Host

```bash
pct create 200 local:vztmpl/debian-13-standard_*.tar.zst \
  --hostname zaehler \
  --cores 1 --memory 1024 --swap 512 \
  --rootfs local-lvm:4 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 \
  --features nesting=1 \
  --start 1
```

In den Container wechseln: `pct enter 200` (Proxmox) bzw. `lxc-attach -n zaehler`.

---

## 3. zaehler.sh herunterladen und Installation starten

Im Container, **als root**:

```bash
# 1) Minimale Werkzeuge, um das Repo erstmalig zu klonen.
apt update
apt install -y --no-install-recommends git ca-certificates curl

# 2) Repository klonen — passe die URL auf deinen Git-Remote an:
git clone https://example.invalid/REPLACE-ME.git /opt/zaehler/repo

# 3) Erstinstallation aufrufen.
#    Das Skript installiert alle weiteren Pakete, legt den App-User an,
#    konfiguriert systemd, baut Frontend + Backend und startet den Service.
REPO_URL=https://example.invalid/REPLACE-ME.git \
  bash /opt/zaehler/repo/deploy/lxc/zaehler.sh install
```

> Der `REPO_URL`-Parameter ist nur beim allerersten Aufruf nötig (für späteres
> `git pull`). Wenn das Repo bereits unter `/opt/zaehler/repo` liegt, kannst du
> den Parameter weglassen.

Nach erfolgreichem Lauf siehst du eine grüne „Installation abgeschlossen"-Meldung
und einen Hinweis, wie du den initialen Admin-Benutzer anlegst:

```bash
sudo -u zaehler -H bash -lc \
  "cd /opt/zaehler/repo/backend && uv run python -m meters.cli create-admin \
   --username admin --password '<starkes-passwort>' --force-change"
```

---

## 4. Erstmaliger Login

Die App lauscht jetzt auf `127.0.0.1:8000` im Container. Test direkt im Container:

```bash
curl http://127.0.0.1:8000/api/v1/health
# → {"status":"ok"}
```

Für Browser-Zugriff brauchst du einen Reverse-Proxy mit HTTPS (nächster Abschnitt).

Nach Login mit `admin` / dem von dir gesetzten Passwort wirst du sofort zum
Passwortwechsel aufgefordert (Force-Change). Im Bereich **Mehr → Benutzer**
legst du danach weitere Konten an.

---

## 5. Reverse-Proxy mit HTTPS

Beispiel **Caddy** auf dem Host (`/etc/caddy/Caddyfile`):

```caddyfile
zaehler.example.com {
    reverse_proxy <container-ip>:8000
}
```

Caddy holt automatisch ein Let's-Encrypt-Zertifikat. Im Container danach:

```bash
sed -i 's/^METERS_COOKIE_SECURE=.*/METERS_COOKIE_SECURE=True/' \
  /opt/zaehler/data/meters.env

systemctl restart zaehler.service
```

> Solange du **kein** HTTPS davor hast, muss `METERS_COOKIE_SECURE=False` bleiben
> — sonst kommt der Login-Cookie nie beim Browser an.

---

## 6. Updates einspielen

Die Update-Strategie ist in mehrere Stufen aufgeteilt:

| Kommando | Was es tut |
|---|---|
| `zaehler.sh upgrade-system` | Debian-Pakete via `apt upgrade` aktualisieren |
| `zaehler.sh upgrade-tools` | `uv` und `pnpm` auf die neueste Version bringen |
| `zaehler.sh upgrade-app` | Code-Update mit automatischem DB-Backup |
| `zaehler.sh upgrade-all` | Alle drei in der richtigen Reihenfolge |

### Empfohlener manueller Ablauf (z. B. monatlich)

```bash
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh upgrade-all
```

Was passiert dabei:

1. **System** — `apt update && apt upgrade && apt autoremove`. Wenn das Update
   einen neuen Kernel mitbringt, wird ein Hinweis ausgegeben („Reboot
   empfohlen") — der Service läuft nach dem Reboot automatisch wieder an.
2. **Tools** — `uv self update` und `pnpm self-update`. Damit bleibt die
   Toolchain immer aktuell, ohne dass du daran denken musst.
3. **App** — automatisches DB-Backup, dann `git pull --ff-only`, neue
   Backend-Abhängigkeiten, neuer Frontend-Build, Datenbank-Migrationen,
   Service-Neustart. Schlägt einer der Schritte fehl, läuft der alte Service
   weiter, das Backup ist da.

### Automatisch im Cron

```bash
# Als root:
cat > /etc/cron.weekly/zaehler-upgrade <<'EOF'
#!/bin/sh
exec /opt/zaehler/repo/deploy/lxc/zaehler.sh upgrade-all >>/var/log/zaehler-upgrade.log 2>&1
EOF
chmod +x /etc/cron.weekly/zaehler-upgrade
```

> Halte ein Auge auf `/var/log/zaehler-upgrade.log` und reagiere, wenn der
> Reboot-Hinweis erscheint — Cron startet keinen Reboot von alleine.

### Nur Software, ohne Service-Pakete (Cron-tauglich, kein Reboot nötig)

```bash
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh upgrade-tools
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh upgrade-app
```

---

## 7. Daten sichern (Backup)

### Manuelles Einzel-Backup

```bash
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh backup
```

Das Skript schreibt einen konsistenten Snapshot nach
`/opt/zaehler/backups/meters-YYYYMMDD-HHMMSS.db.gz` und behält die letzten
30 Backups (älter wird automatisch gelöscht).

### Tägliches Backup per systemd-Timer

```bash
# Als root:
cat > /etc/systemd/system/zaehler-backup.service <<'EOF'
[Unit]
Description=Tägliches Backup der Zählerstand-Datenbank
After=zaehler.service

[Service]
Type=oneshot
User=zaehler
ExecStart=/opt/zaehler/repo/deploy/lxc/backup.sh
EOF

cat > /etc/systemd/system/zaehler-backup.timer <<'EOF'
[Unit]
Description=Tägliches Backup um 03:30

[Timer]
OnCalendar=03:30
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now zaehler-backup.timer
systemctl list-timers | grep zaehler   # prüft, dass der Timer aktiv ist
```

### Backups vom Host abholen

Backups, die nur im Container liegen, helfen nichts, falls der Container
verloren geht. Synchronisiere `/opt/zaehler/backups/` regelmäßig auf einen
externen Speicher, z. B. vom Proxmox-Host:

```bash
pct exec 200 -- tar -czf - -C /opt/zaehler/backups . > /backup-store/zaehler-backups.tar.gz
```

---

## 8. Datenwiederherstellung

```bash
# Als root, mit dem Pfad zu einem komprimierten Backup:
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh restore \
    /opt/zaehler/backups/meters-20260502-033000.db.gz
```

Was das Skript macht:

1. Stoppt `zaehler.service`.
2. Verschiebt die aktuelle DB zur Sicherheit nach `meters.db.broken-<timestamp>`.
3. Entpackt das Backup auf `meters.db` und setzt den Owner.
4. Startet den Service neu und prüft, ob er läuft.

Wenn etwas schief geht, kannst du anschließend `meters.db.broken-*` zurück­
schieben.

---

## 9. Status und Diagnose

```bash
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh status
```

Die Ausgabe zeigt:

- Service-Status (active/inactive, letzte Log-Zeilen)
- Versionen von Kernel, Distri, Python, git, sqlite3, uv, pnpm, node
- DB-Größe, Anzahl Erfassungen und Benutzer, aktuelle Migrations-Version
- Pfad zum letzten Backup und Anzahl gespeicherter Backups
- Repository-Branch, aktuelle Revision, Commits hinter dem Remote

Damit hast du auf einen Blick, ob alles aktuell ist und ob etwas zu tun wäre.

---

## 10. Fehlersuche

### Service startet nicht

```bash
journalctl -u zaehler.service -n 100 --no-pager
```

Häufige Ursachen:

- **`METERS_SECRET_KEY` fehlt** — `/opt/zaehler/data/meters.env` anlegen
  (`zaehler.sh install` macht das automatisch).
- **Berechtigungen kaputt** — `chown -R zaehler:zaehler /opt/zaehler` und
  Service neu starten.
- **Port 8000 belegt** — `ss -tlnp | grep 8000`.

### „Login fehlgeschlagen" trotz richtigem Passwort

In den meisten Fällen passt der Cookie nicht, weil
`METERS_COOKIE_SECURE=True` aber kein HTTPS davor steht.

```bash
sed -i 's/^METERS_COOKIE_SECURE=.*/METERS_COOKIE_SECURE=False/' \
  /opt/zaehler/data/meters.env
systemctl restart zaehler.service
```

Sobald der Reverse-Proxy TLS macht, wieder auf `True` setzen.

### Migration schlägt fehl

```bash
sudo -u zaehler bash -lc 'cd /opt/zaehler/repo/backend && uv run alembic current'
```

Wenn die App nach einem Update nicht startet, ist das Backup von vor dem
Update unter `/opt/zaehler/backups/` — siehe Wiederherstellung (Abschnitt 8).

### Frontend zeigt alte Version

Im Browser **harten Reload** (Cmd/Strg + Shift + R). Wenn das Problem bleibt,
prüfe, ob der Build durchgelaufen ist:

```bash
ls /opt/zaehler/repo/backend/src/meters/static/
# sollte index.html und einen assets/-Ordner enthalten
```

Wenn nicht, `zaehler.sh upgrade-app` erneut.

---

## 11. Deinstallation

```bash
# Backups zuerst sichern!
tar -czf /tmp/zaehler-final-backup.tar.gz \
    -C /opt/zaehler data backups

# Service und Timer abschalten
systemctl disable --now zaehler.service zaehler-backup.timer 2>/dev/null
rm -f /etc/systemd/system/zaehler.service \
      /etc/systemd/system/zaehler-backup.{service,timer} \
      /etc/sudoers.d/zaehler-restart \
      /etc/cron.weekly/zaehler-upgrade
systemctl daemon-reload

# User und Daten entfernen
userdel -r zaehler
rm -rf /opt/zaehler
```

---

## 12. Befehlsreferenz `zaehler.sh`

```text
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh <kommando>
```

| Kommando | Wirkung |
|---|---|
| `install` | Erstinstallation (Pakete, User, uv/pnpm, Repo, Build, systemd) |
| `upgrade-system` | apt update + upgrade + autoremove |
| `upgrade-tools` | uv self update + pnpm self-update |
| `upgrade-app` | Backup, git pull, deps, build, migrate, restart |
| `upgrade-all` | system + tools + app, in dieser Reihenfolge |
| `backup` | Sofortiger SQLite-Snapshot |
| `restore <datei.gz>` | Backup einspielen |
| `status` | Service, Versionen, DB, Backups, Repo |
| `help` | Befehlsreferenz mit Beispielen |

Konfigurationsoptionen via Umgebungsvariablen (selten nötig):
`REPO_URL`, `APP_USER`, `APP_DIR`, `REPO_DIR`, `DATA_DIR`, `BACKUP_DIR`,
`SERVICE_NAME`, `PYTHON_BIN`, `PNPM_VERSION`.

---

## Anhang: Verzeichnis-Layout im Container

```
/opt/zaehler/
├── repo/                # geklontes Git-Repo (Code)
│   ├── backend/         # FastAPI-Anwendung
│   ├── frontend/        # React-App (Quellcode + gebautes static/)
│   └── deploy/lxc/      # zaehler.sh, backup.sh, systemd-Unit, README
├── backend  → repo/backend
├── frontend → repo/frontend
├── deploy   → repo/deploy
├── data/                # WIRD NIE GELÖSCHT
│   ├── meters.db        # SQLite-Datenbank
│   ├── meters.db-wal    # Write-Ahead-Log
│   ├── meters.db-shm    # Shared-Memory
│   └── meters.env       # Konfiguration (SECRET_KEY etc.)
└── backups/             # Snapshots aus zaehler.sh backup
    └── meters-YYYYMMDD-HHMMSS.db.gz
```
