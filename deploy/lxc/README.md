# Zählerstand-App im LXC-Container — Installation in einer Zeile

Diese Anleitung führt einen Neueinsteiger in unter 10 Minuten zur lauffähigen
App in einem Debian-13-Container (Trixie). Du brauchst keine
Programmiererfahrung, nur Zugriff auf einen Proxmox-Host (oder einen anderen
LXC-fähigen Linux-Host).

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

## 2. Installation starten

Im Container — als root — **eine einzige Zeile** einfügen:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/muelley86/zaehler/main/deploy/lxc/install.sh)"
```

Der Bootstrap installiert die nötigen Mindest-Pakete, legt den App-User
`zaehler` an, klont das Repository nach `/opt/zaehler/repo` und startet danach
den geführten Wizard (im Stil der Proxmox Helper Scripts) auf Basis von
`whiptail`:

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
ADMIN_USER=admin ADMIN_PASSWORD='dein-langes-passwort' \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/muelley86/zaehler/main/deploy/lxc/install.sh)"
```

Forks: `REPO_URL=https://github.com/<dein-fork>/zaehler.git` zusätzlich setzen.

---

## 3. Im Browser öffnen

Container-IP ermitteln (falls nicht gemerkt):

```bash
hostname -I
```

Im Browser die angezeigte URL aufrufen, z. B. `http://10.10.2.38:8000`. Login
mit deinem Admin-User → Force-Change-Dialog → neues Passwort setzen → fertig.

---

## 4. (Optional) Reverse-Proxy mit HTTPS

Zur Erinnerung: nach dem Install ist die App **immer** per
`http://<container-ip>:8000` im LAN erreichbar. Der nachfolgende
Abschnitt beschreibt nur die optionale HTTPS-Härtung.

**Im Container** stellst du die Topologie geführt um — kein manuelles
Editieren von `meters.env`:

```bash
sudo zaehler configure-network
```

Drei Optionen im Menü:

- **Nur direkt im LAN per IP** (HTTP, Standard)
- **Plus HTTPS via Proxy auf anderem Host** (NPM in eigenem Container,
  separates nginx etc. — App bleibt parallel per IP erreichbar)
- **Strikt HTTPS via Proxy auf gleichem Host** (Caddy/nginx neben der
  App, keine HTTP-IP-Erreichbarkeit)

Der Wizard fragt bei den Proxy-Optionen nach der Domain, schreibt
`meters.env`, startet den Service neu und verifiziert die
Erreichbarkeit.

Solange die App nur im Heimnetz läuft, ist Schritt 4 ausreichend. Sobald du
sie per Domainname und HTTPS bereitstellen willst, schalte einen Reverse-Proxy
auf dem Host davor (Caddy ist am einfachsten):

`/etc/caddy/Caddyfile`:

```caddyfile
zaehler.example.com {
    reverse_proxy <container-ip>:8000 {
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

Im Container danach in `/opt/zaehler/data/meters.env`:

```
METERS_BIND_HOST=127.0.0.1
METERS_COOKIE_SECURE=True
METERS_TRUST_PROXY=True
METERS_ALLOWED_ORIGINS=https://zaehler.example.com
```

und `systemctl restart zaehler.service`. Damit ist die App nur noch über den
HTTPS-Proxy erreichbar, nicht mehr direkt im Klartext im LAN. Wenn du den
Wizard mit der HTTPS-Frage durchgeklickt hast, ist all das schon
automatisch eingetragen.

## 5. (Empfohlen) Zwei-Faktor-Authentisierung

Sobald die App von außen erreichbar ist, **2FA pro Account aktivieren**:

1. Im Browser einloggen → unten rechts **Mehr**.
2. **Zwei-Faktor-Authentisierung → 2FA jetzt einrichten**.
3. QR-Code mit einer Authenticator-App scannen (Google Authenticator,
   Authy, 1Password, Bitwarden, KeePassXC), 6-stelligen Code eingeben.
4. **10 Backup-Codes** ausdrucken oder im Passwort-Manager ablegen.

Ausführliche Anleitung inkl. Notausstieg bei verlorenem Smartphone +
Codes: `docs/anleitung.md` Teil 6.

---

## 6. (Nur bei Bedarf) Betrieb im öffentlichen Internet

> Für den reinen Heimnetz-Betrieb ist dieser Abschnitt **nicht** nötig — die
> LAN-Defaults sind bewusst nicht fürs Internet ausgelegt.

Soll die App vom offenen Internet aus erreichbar sein, gilt **ausschließlich**
die Topologie `proxy-same` (HTTPS-Reverse-Proxy auf gleichem Host, App nur auf
`127.0.0.1`):

```bash
sudo zaehler configure-network   # → "proxy-same" wählen
```

Das setzt automatisch `cookie_secure=True`, `trust_proxy=True`, bindet auf
`127.0.0.1` und aktiviert `METERS_PUBLIC_FACING=True`. Letzteres lässt den
Dienst **hart abbrechen**, falls `cookie_secure` doch auf `False` steht — so
geht das Session-Cookie nie versehentlich im Klartext über die Leitung.

**Checkliste vor der Freigabe nach außen:**

1. **Nur der Proxy ist erreichbar.** Firewall so setzen, dass der App-Port
   (8000) von außen nicht direkt offen ist — einziger Eingang ist der
   HTTPS-Proxy. `proxy-other` (parallel offene LAN-IP) ist **nicht**
   internet-tauglich.
2. **2FA verpflichtend** für alle Accounts (siehe Abschnitt 5), insbesondere
   Admins.
3. **Limits am Proxy** gegen Überlast/Missbrauch, z. B. bei Caddy/nginx:
   `client_max_body_size 25m;` und ein `limit_req`/Rate-Limit. Greift, bevor
   ein Request die App erreicht.

**Optionale Härtungs-Settings** in `/opt/zaehler/data/meters.env` (alle leer =
unverändertes Verhalten):

| Variable | Zweck |
|---|---|
| `METERS_TRUSTED_PROXY_IPS` | Komma-Liste erlaubter Proxy-IPs. Gesetzt ⇒ `X-Forwarded-For` wird nur akzeptiert, wenn die direkte Verbindung von einer dieser IPs kommt (Spoofing-Schutz). |
| `METERS_PUBLIC_BASE_URL` | Feste Basis-URL (z. B. `https://zaehler.example.com`) für gedruckte QR-Code-Links — sonst kann hinter dem Proxy eine interne `http://`-URL auf den Etiketten landen. |

Nach Änderungen an `meters.env`: `systemctl restart zaehler.service`.

---

## Spätere Updates

**Ein Befehl, der alles erledigt:**

```bash
sudo zaehler upgrade-all
```

Das aktualisiert in einem Lauf:
1. **System-Pakete** (`apt upgrade`)
2. **uv** und **pnpm** (self-update)
3. **App-Code** (`git fetch` + `git reset --hard origin/main` + neuer
   Build + Datenbank-Migrationen + Service-Neustart)

Vor dem App-Update wird automatisch ein DB-Snapshot nach
`/opt/zaehler/backups/` geschrieben.

Nur App-Code ohne System-/Tool-Updates: `sudo zaehler upgrade-app`.

> **Hinweis:** `zaehler` ist ein Symlink auf
> `/opt/zaehler/repo/deploy/lxc/zaehler.sh`, den die Installation
> automatisch in `/usr/local/bin` ablegt. Du kannst alle Kommandos
> auch mit dem vollen Pfad aufrufen, wenn du möchtest:
> `sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh upgrade-all`.

### Erstes Update auf einem alten Container (vor v2.4.0)

Container, die ihre letzte Aktualisierung vor **v2.4.0** hatten, kennen
das Symlink-Tool und das selbstheilende Update-Skript noch nicht.
Symptom beim klassischen Update-Versuch:

```
error: Your local changes to the following files would be overwritten by merge:
        backend/src/meters/static/index.html
Please commit your changes or stash them before you merge.
Aborting
```

Das alte Skript kann sich nicht selbst reparieren, weil es **vor** dem
Code-Update abbricht. Einmal-Befehle, um den Container auf den aktuellen
Stand zu heben:

```bash
curl -fsSL https://raw.githubusercontent.com/muelley86/zaehler/main/deploy/lxc/zaehler.sh -o /tmp/zaehler.sh
```

```bash
sudo bash /tmp/zaehler.sh upgrade-app
```

Beide Befehle einzeln eingeben (Enter zwischendrin). Der erste lädt das
aktuelle Skript nach `/tmp/`, der zweite führt es aus. Das aktuelle
Skript räumt automatisch alte Build-Artefakte weg, legt den Symlink
`/usr/local/bin/zaehler` an und macht den Service-Neustart.

Persistente Daten unter `/opt/zaehler/data/` werden dabei **nicht**
angefasst; ein automatisches DB-Backup wird vorher angelegt.

Ab dem nächsten Mal reicht dann der einfache Befehl:

```bash
sudo zaehler upgrade-all
```

---

## Diagnose und weitere Kommandos

```bash
sudo zaehler status
```

Zeigt Service-Status, Software-Versionen, DB-Größe, Anzahl Erfassungen,
letztes Backup, Repo-Stand.

Vollständige Befehlsreferenz:

```bash
sudo zaehler help
```

---

## Backups verstehen und einspielen

Die App produziert in `/opt/zaehler/data/meters.db` ihre einzige
relevante Datei. Sie enthält **alles**: Messstellen, Erfassungen,
Lieferungen, Benutzer, Sessions, 2FA-Secrets, Audit-Log.

### Was wird gesichert (und was nicht)

- **Gesichert** (automatisch): nur `meters.db`. Snapshots werden mit
  SQLites Online-`.backup` erzeugt — der Service läuft währenddessen
  weiter, kein Lock.
- **Nicht** gesichert: `meters.env` mit dem Server-Secret-Key. Den
  einmalig nach dem `install` separat sichern. Bei Verlust generiert
  ein neuer Wizard zwar einen neuen Secret-Key, aber dann sind alle
  bestehenden Sessions ungültig (User müssen neu anmelden) und
  TOTP-Hashes funktionieren nicht mehr — User müssen 2FA neu einrichten.
- **Nicht** gesichert: das Repo selbst (liegt in Git auf GitHub) und
  das gebaute Frontend (wird beim `upgrade-app` neu erzeugt).

### Wann läuft ein Backup

| Auslöser | Wann |
|---|---|
| systemd-Timer `zaehler-backup.timer` | täglich, Default 03:30 (Wizard fragt beim Erstinstall) |
| Vor jedem `upgrade-app` | automatisch im Skript-Schritt 1/6 |
| Vor jedem `rollback` | automatisch im Skript-Schritt 1/6 |
| Manuell jederzeit | `sudo bash zaehler.sh backup` |

Wann die täglichen Snapshots wirklich liefen:

```bash
sudo systemctl status zaehler-backup.timer
sudo systemctl list-timers --all | grep zaehler
```

### Wo liegen sie

```
/opt/zaehler/backups/
├── meters-20260501-033000.db.gz
├── meters-20260502-033000.db.gz
└── meters-20260503-033000.db.gz
```

Permissions `0700` (nur User `zaehler` liest mit). Retention: die
**30 jüngsten** werden behalten, ältere werden im nächsten Backup-Lauf
gelöscht. Anders: `KEEP=14 sudo bash zaehler.sh backup` z. B.

### Backup manuell ziehen

```bash
sudo zaehler backup
```

Ausgabe nennt den Pfad: `Backup erstellt: /opt/zaehler/backups/meters-….db.gz`.

### Inhalt eines Backups inspizieren (ohne zu ersetzen)

```bash
gunzip -c /opt/zaehler/backups/meters-20260502-033000.db.gz > /tmp/check.db
sqlite3 /tmp/check.db 'SELECT COUNT(*) FROM reading;'
sqlite3 /tmp/check.db 'SELECT version_num FROM alembic_version;'
rm /tmp/check.db
```

Die zweite Zeile ist wichtig vor einem `rollback`: Ist die Migration im
Backup älter als der Code, auf den du rollen willst, dann kommt es
nicht hin — entweder ein anderes Backup wählen oder die App auf eine
ältere Code-Version mitnehmen.

### Backup auf andere Maschine ziehen

Vom Proxmox-**Host** aus, ohne den Container zu betreten:

```bash
pct pull <ct-id> /opt/zaehler/backups/meters-20260503-033000.db.gz \
  ~/Downloads/meters-snapshot.db.gz
```

Per SSH/SCP, falls du SSH im Container hast:

```bash
scp root@<container-ip>:/opt/zaehler/backups/meters-20260503-033000.db.gz \
  ~/Downloads/
```

### Backups einspielen (Restore)

```bash
sudo zaehler restore \
  /opt/zaehler/backups/meters-YYYYMMDD-HHMMSS.db.gz
```

Was passiert:

1. Service wird gestoppt (`systemctl stop zaehler.service`).
2. Die aktuelle DB wird **nicht überschrieben**, sondern zur Seite
   gelegt als `meters.db.broken-<datum>`. WAL-Hilfsdateien werden
   entfernt.
3. Das Backup wird mit `gunzip` entpackt, Owner auf `zaehler:zaehler`
   gesetzt.
4. Service wird gestartet, 2 Sekunden später geprüft, ob er läuft.

Schlägt der Start fehl, blockt das Skript — du kannst die alte DB
zurückschieben:

```bash
sudo systemctl stop zaehler.service
sudo mv /opt/zaehler/data/meters.db.broken-<datum> /opt/zaehler/data/meters.db
sudo systemctl start zaehler.service
```

### Empfehlung: zusätzliche Off-Site-Sicherung

Lokale Backups schützen vor Software-Fehlern, **nicht** vor
Hardware-Defekt am Container-Storage oder versehentlichem
`pct destroy`. Cron-Job auf dem Proxmox-**Host**, der täglich das
jüngste Backup auf eine separate Platte/NAS zieht:

```bash
# /etc/cron.daily/zaehler-offsite (chmod +x)
#!/bin/bash
set -e
CT_ID=200                          # ← deine Container-ID
DEST=/var/backups/zaehler          # ← Pfad auf NAS / externer Disk
mkdir -p "$DEST"
LATEST=$(pct exec "$CT_ID" -- ls -1t /opt/zaehler/backups | head -1)
pct pull "$CT_ID" "/opt/zaehler/backups/$LATEST" \
  "$DEST/$(date +%Y%m%d)-$LATEST"
find "$DEST" -name '*.db.gz' -mtime +90 -delete
```

Damit hast du täglich eine Kopie außerhalb des Containers, mit
90 Tagen Retention.

### Komplette Recovery (Container weg)

1. Backup-Datei (`*.db.gz`) und `meters.env` extern verfügbar haben.
2. Neuen Container anlegen (Bootstrap-Einzeiler), Wizard durchklicken.
3. Service stoppen: `sudo systemctl stop zaehler.service`.
4. `meters.env` zurückkopieren nach `/opt/zaehler/data/meters.env`
   (Owner `zaehler:zaehler`, Permissions `0600`).
5. `sudo bash zaehler.sh restore <pfad>/meters-<datum>.db.gz`.

App-User können sich mit ihren bisherigen Passwörtern und 2FA-Codes
anmelden, weil der Secret-Key in `meters.env` und die User-Daten in
`meters.db` zueinander passen.

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
