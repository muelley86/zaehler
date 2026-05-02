# Zählerstand-App im LXC-Container — Installation in 5 Schritten

Diese Anleitung führt einen Neueinsteiger in 10 Minuten zur lauffähigen App
in einem Debian-13-Container (Trixie). Du brauchst keine Programmiererfahrung,
nur Zugriff auf einen Proxmox-Host (oder einen anderen LXC-fähigen Linux-Host).

> **Daten-Hinweis vorab:** Die App speichert ihre Daten in einer SQLite-Datei
> (`/opt/zaehler/data/meters.db`). Verlierst du diese Datei, sind alle
> Erfassungen weg. Das Setup richtet ab Schritt 4 automatisch ein tägliches
> Backup ein — synchronisiere `/opt/zaehler/backups/` zusätzlich auf einen
> externen Speicher.

---

## 1. Container anlegen

In Proxmox einen neuen Container erstellen:

| Einstellung | Wert |
|---|---|
| Vorlage | `debian-13-standard` |
| RAM | **2048 MB** |
| Swap | 1024 MB |
| Festplatte | 4 GB |
| CPU | 1 Core |
| Netzwerk | DHCP oder feste IP |

Per Shell auf dem Host alternativ:

```bash
pct create 200 local:vztmpl/debian-13-standard_*.tar.zst --hostname zaehler --cores 1 --memory 2048 --swap 1024 --rootfs local-lvm:4 --net0 name=eth0,bridge=vmbr0,ip=dhcp --unprivileged 1 --features nesting=1 --start 1
```

In den Container einsteigen: `pct enter 200`.

---

## 2. Repo-Zugriff einrichten

Wenn dein GitHub-Repo **öffentlich** ist, überspring diesen Abschnitt — du
kannst gleich weitermachen.

Bei **privatem** Repo brauchst du einen Deploy-Key. Im Container, **als root**:

```bash
apt update && apt install -y --no-install-recommends git ca-certificates curl openssh-client
```

```bash
useradd --system --create-home --home-dir /opt/zaehler --shell /bin/bash zaehler
```

```bash
sudo -u zaehler ssh-keygen -t ed25519 -N '' -f /opt/zaehler/.ssh/id_ed25519 -C "lxc-zaehler"
```

```bash
cat /opt/zaehler/.ssh/id_ed25519.pub
```

Den ausgegebenen Schlüssel **in den Browser** kopieren:

- GitHub → dein Repo → **Settings → Deploy keys → Add deploy key**
- **Title**: `lxc-zaehler`
- **Key**: einfügen
- **Allow write access**: NICHT anhaken
- **Add key**

Verifizieren:

```bash
sudo -u zaehler ssh -T git@github.com
```

Bei der Frage `Are you sure you want to continue connecting`: `yes`.
Erwartet: `Hi DEIN-USER/zaehler! You've successfully authenticated...`.

---

## 3. Installation starten

> Ersetze `DEIN-USERNAME/zaehler` durch deinen tatsächlichen GitHub-Pfad.

```bash
sudo -u zaehler git clone git@github.com:DEIN-USERNAME/zaehler.git /opt/zaehler/repo \
  && bash /opt/zaehler/repo/deploy/lxc/zaehler.sh install
```

Der Installer öffnet einen geführten Wizard (im Stil der Proxmox Helper Scripts)
auf Basis von `whiptail`:

1. **Willkommen** — Bestätigung, dass es losgehen soll
2. **Modus wählen** — *Standard* (Defaults: `0.0.0.0:8000`, Backup `03:30`) oder
   *Erweitert* (jeden Wert einzeln abfragen)
3. **Eingaben** — Admin-Username, Admin-Passwort (zweimal, mind. 12 Zeichen);
   bei *Erweitert* zusätzlich Bind-Host, Port, Backup-Zeit
4. **Bestätigung** — alle Werte zur finalen Kontrolle, dann erst geht es los
5. **Installation** — 10 nummerierte Schritte mit Fortschrittsanzeige
   (Pakete → Locale → User → Konfig → uv/pnpm → Repo → Build → systemd →
   Admin-User → Backup-Timer); dauert 3-8 Minuten
6. **Fertig-Dialog** — App-URL und nächste Schritte werden angezeigt

Falls kein TTY verfügbar ist (z. B. Cloud-Init, automatisierter Run),
funktioniert der Installer auch headless — er nimmt dann Defaults und folgende
ENV-Variablen:

```bash
REPO_URL=https://...  ADMIN_USER=admin  ADMIN_PASSWORD='dein-langes-passwort' \
  bash /opt/zaehler/repo/deploy/lxc/zaehler.sh install
```

---

## 4. Im Browser öffnen

Container-IP ermitteln (falls nicht gemerkt):

```bash
hostname -I
```

Im Browser die angezeigte URL aufrufen, z. B. `http://10.10.2.38:8000`. Login
mit deinem Admin-User → Force-Change-Dialog → neues Passwort setzen → fertig.

---

## 5. (Optional) Reverse-Proxy mit HTTPS

Solange die App nur im Heimnetz läuft, ist Schritt 4 ausreichend. Sobald du
sie per Domainname und HTTPS bereitstellen willst, schalte einen Reverse-Proxy
auf dem Host davor (Caddy ist am einfachsten):

`/etc/caddy/Caddyfile`:

```caddyfile
zaehler.example.com {
    reverse_proxy <container-ip>:8000
}
```

Im Container danach in `/opt/zaehler/data/meters.env`:

```
METERS_BIND_HOST=127.0.0.1
METERS_COOKIE_SECURE=True
```

und `systemctl restart zaehler.service`. Damit ist die App nur noch über den
HTTPS-Proxy erreichbar, nicht mehr direkt im Klartext im LAN.

---

## Spätere Updates

```bash
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh upgrade-all
```

Das aktualisiert in einem Lauf:
1. **System-Pakete** (apt upgrade)
2. **uv** und **pnpm** (self-update)
3. **App-Code** (git pull + neuer Build + Datenbank-Migrationen + Service-Neustart)

Vor dem App-Update wird automatisch ein DB-Snapshot nach
`/opt/zaehler/backups/` geschrieben.

Nur App-Code ohne System-/Tool-Updates: `zaehler.sh upgrade-app`.

---

## Diagnose und weitere Kommandos

```bash
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh status
```

Zeigt Service-Status, Software-Versionen, DB-Größe, Anzahl Erfassungen,
letztes Backup, Repo-Stand.

Vollständige Befehlsreferenz:

```bash
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh help
```

---

## Backup wiederherstellen

```bash
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh restore /opt/zaehler/backups/meters-YYYYMMDD-HHMMSS.db.gz
```

Das Skript stoppt den Service, sichert die aktuelle DB beiseite, spielt das
Backup ein und startet den Service neu.

---

## Verzeichnis-Layout

```
/opt/zaehler/
├── repo/          # Quellcode (von dir geklont)
├── data/          # Datenbank + Konfiguration  ← NIEMALS löschen
│   ├── meters.db
│   └── meters.env
└── backups/       # Tägliche DB-Snapshots
    └── meters-YYYYMMDD-HHMMSS.db.gz
```

`data/meters.env` ist die zentrale Konfiguration — Bind-Host, Port,
Cookie-Verhalten. Inhaltsbeispiel:

```
METERS_SECRET_KEY=<zufällig generiert>
METERS_BIND_HOST=0.0.0.0     # 127.0.0.1 sobald HTTPS-Reverse-Proxy davor steht
METERS_BIND_PORT=8000
METERS_COOKIE_SECURE=False   # True sobald HTTPS davor steht
```

---

## Fehler oder Frage?

```bash
journalctl -u zaehler.service -n 50 --no-pager
```

zeigt die letzten Service-Logs. Häufige Ursachen für „lässt sich nicht
aufrufen":

- **Service läuft, aber nur loopback**: `METERS_BIND_HOST=127.0.0.1` in
  `meters.env` — auf `0.0.0.0` setzen und `systemctl restart zaehler.service`.
- **„Failed to connect" trotz `0.0.0.0`**: Container-Firewall blockiert (selten
  bei Standard-LXC); `ss -tlnp | grep 8000` muss `LISTEN ... 0.0.0.0:8000`
  zeigen.
- **Login wird abgewiesen mit gültigem Passwort**: `METERS_COOKIE_SECURE=True`
  ohne HTTPS davor — `False` setzen und Service neu starten.
