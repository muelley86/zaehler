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

Vier Optionen im Menü:

- **Nur direkt im LAN per IP** (`lan-only`, HTTP, Standard)
- **HTTPS-Proxy + offene LAN-IP** (`proxy-other`, NPM/nginx auf anderem Host —
  App bleibt parallel per IP erreichbar; **nur LAN, nicht fürs Internet**)
- **Strikt HTTPS via Proxy auf gleichem Host** (`proxy-same`, Caddy/nginx neben
  der App, App nur auf `127.0.0.1` — der saubere Internet-Modus)
- **Internet via Proxy auf anderem Host** (`proxy-external`, fragt zusätzlich
  die Proxy-IP ab und setzt `trusted_proxy_ips`/`public_facing`; **Firewall
  Pflicht**, siehe Abschnitt 6)

Der Wizard fragt bei den Proxy-Optionen nach der Domain, schreibt
`meters.env`, startet den Service neu und verifiziert die
Erreichbarkeit.

Alle übrigen Einstellungen (Session-Dauer, Login-Limits, bcrypt, 2FA-Pflicht,
Foto-Limit, …) passt du mit `sudo zaehler configure` an — jede Einstellung mit
kurzer Erklärung; die vollständige Variablen-Referenz steht im
Haupt-[`README.md`](../../README.md).

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

Für den Internet-Betrieb gibt es zwei taugliche Topologien — beide stellst du
geführt über `sudo zaehler configure-network` ein:

- **`proxy-same` (am saubersten):** HTTPS-Reverse-Proxy auf demselben Host, App
  bindet auf `127.0.0.1` → die App hat **keine** direkte Exposition, es gibt
  keinen offenen Port abzusichern.
- **`proxy-external`:** Reverse-Proxy auf einem **anderen** Host/Container (NPM,
  separates nginx). Die App muss dann auf `0.0.0.0` lauschen, damit der Proxy
  sie erreicht — der App-Port ist also im Netz offen und **muss per Firewall**
  abgesichert werden (siehe Unterabschnitt unten).

```bash
sudo zaehler configure-network   # → "proxy-same" ODER "proxy-external" wählen
```

Beide setzen automatisch `cookie_secure=True`, `trust_proxy=True` und
`METERS_PUBLIC_FACING=True`. Letzteres lässt den Dienst **hart abbrechen**, falls
`cookie_secure` doch auf `False` steht — so geht das Session-Cookie nie
versehentlich im Klartext über die Leitung. `proxy-external` setzt zusätzlich
`METERS_TRUSTED_PROXY_IPS` auf die Proxy-IP (XFF-Spoofing-Schutz).

**Checkliste vor der Freigabe nach außen:**

1. **Nur der Proxy ist erreichbar.** Firewall so setzen, dass der App-Port
   (8000) von außen nicht direkt offen ist — einziger Eingang ist der
   HTTPS-Proxy. `proxy-other` (parallel offene LAN-IP) ist **nicht**
   internet-tauglich.
2. **2FA verpflichtend** für alle Accounts (siehe Abschnitt 5), insbesondere
   Admins. Mit `METERS_REQUIRE_TOTP_FOR_ADMIN=True` lässt sich das für Admins
   erzwingen (Default aus — im reinen LAN-Betrieb kein Zwang).
3. **Limits am Proxy** gegen Überlast/Missbrauch, z. B. bei Caddy/nginx:
   `client_max_body_size 25m;` und ein `limit_req`/Rate-Limit. Greift, bevor
   ein Request die App erreicht.

**Optionale Härtungs-Settings** in `/opt/zaehler/data/meters.env` (alle leer =
unverändertes Verhalten):

| Variable | Zweck |
|---|---|
| `METERS_TRUSTED_PROXY_IPS` | Komma-Liste erlaubter Proxy-IPs. Gesetzt ⇒ `X-Forwarded-For` wird nur akzeptiert, wenn die direkte Verbindung von einer dieser IPs kommt (Spoofing-Schutz). |
| `METERS_PUBLIC_BASE_URL` | Feste Basis-URL (z. B. `https://zaehler.example.com`) für gedruckte QR-Code-Links — sonst kann hinter dem Proxy eine interne `http://`-URL auf den Etiketten landen. |
| `METERS_REQUIRE_TOTP_FOR_ADMIN` | `True` ⇒ Admins ohne aktives TOTP werden nach dem Login zur 2FA-Einrichtung gezwungen und können bis dahin nichts anderes tun. Default `False` = kein Zwang (reiner LAN-Betrieb unberührt). |

Nach Änderungen an `meters.env`: `systemctl restart zaehler.service`.

### Proxy auf einem anderen Host (`proxy-external`)

`sudo zaehler configure-network → proxy-external` fragt **Domain** und
**Proxy-Host-IP** ab und schreibt alles Nötige (`cookie_secure=True`,
`trust_proxy=True`, `public_facing=True`, `trusted_proxy_ips=<proxy-ip>`,
`allowed_origins`/`public_base_url=https://<domain>`, `bind_host=0.0.0.0`).

**Zwingend dazu — die Firewall**, denn die App lauscht auf `0.0.0.0:8000`:

1. Aus dem Internet **nur** `:443` auf den **Proxy** weiterleiten — den
   App-Port `:8000` **niemals** ins Internet forwarden.
2. Auf dem App-Container `:8000` nur für die Proxy-IP zulassen, z. B.:
   ```bash
   ufw allow from <proxy-ip> to any port 8000 proto tcp
   ufw deny 8000
   ```

Am Proxy (NPM/nginx/Caddy): `X-Forwarded-For` = echte Client-IP **ersetzen**
(nicht anhängen), `X-Forwarded-Proto=https`, `client_max_body_size 25m` und ein
Rate-Limit. Wenn der Proxy auf demselben Host möglich ist, ist `proxy-same`
(App nur auf `127.0.0.1`) ohne Firewall-Aufwand die sicherere Wahl.

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

Nur App-Code ohne System-/Tool-Updates: `sudo zaehler upgrade-app`. `upgrade-app`
setzt dabei auch die **Zeitzone idempotent** auf `Europe/Berlin` (heilt Bestands-
Container, die noch auf UTC stehen).

**Zeitzone separat setzen** (z. B. ohne ein App-Update abzuwarten):

```bash
sudo zaehler set-timezone            # Europe/Berlin (Default)
sudo zaehler set-timezone <zone>     # andere IANA-Zone
```

> Die System-Zeitzone betrifft nur Logs, Backup-Dateinamen und systemd-Timer.
> Die in der App angezeigten Erfassungszeiten hängen **nicht** davon ab — die
> regeln `METERS_TIMEZONE` (Backend) und die Browser-Zeitzone.

**Daten-Reparaturen** (laufen als App-User mit gesourcter `meters.env`; Default
Dry-Run, `--apply` schreibt und sichert vorher automatisch):

```bash
sudo zaehler repair-midnight-readings          # zeigt betroffene 00:00-Readings
sudo zaehler repair-midnight-readings --apply  # verschiebt sie auf Vortag 23:59:59
sudo zaehler repair-legacy-timestamps [--apply]  # naiv-UTC-Altdaten korrigieren
```

**Register-Einheit umbenennen** (kein `zaehler`-Subcommand — direkt als App-User
ausführen). Benennt die Einheit passender Register um, **ohne die gespeicherten Werte zu
ändern** (reines Label). Typischer Fall: versehentlich mit kWh statt MWh angelegte
Wärmemengenzähler, bei denen die Stände bereits als MWh-Zahlen erfasst wurden. Default
Dry-Run; `--apply` schreibt und frischt den Monats-Cache der betroffenen Register auf.
**Vorher `sudo zaehler backup`** — dieser Direktaufruf sichert (anders als die `repair-*`-
Kommandos oben) NICHT automatisch.

```bash
sudo zaehler backup   # Sicherung vorher (kein Auto-Backup bei diesem Direktaufruf)

# Dry-Run — zeigt die betroffenen Register, ändert nichts:
sudo -u zaehler -H bash -lc 'cd /opt/zaehler/backend && set -a && . /opt/zaehler/data/meters.env && set +a && uv run python -m meters.cli relabel-register-unit --type heating --from kWh --to MWh'

# Schreiben — Einheit kWh → MWh (Werte unverändert, Monats-Cache neu berechnet):
sudo -u zaehler -H bash -lc 'cd /opt/zaehler/backend && set -a && . /opt/zaehler/data/meters.env && set +a && uv run python -m meters.cli relabel-register-unit --type heating --from kWh --to MWh --apply'
```

> Die Einheit `MWh` muss eine gültige Heizungs-Einheit sein (ist sie:
> `ALLOWED_HEATING_UNITS`). `--type`/`--from`/`--to` sind anpassbar, falls mal eine andere
> Einheit/ein anderer Messstellen-Typ korrigiert werden muss.

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

### Backup über die App-UI laden (ohne SSH)

Als Admin in der App unter **System & Backup → „Backup laden"**. Das zieht
denselben konsistenten Online-Snapshot wie `zaehler backup` und lädt ihn als
`meters-<datum>.db.gz` direkt im Browser herunter — praktisch, wenn du keinen
Shell-Zugriff hast oder den Bestand schnell auf einen Arbeitsrechner holen
willst. Das Ergebnis ist 1:1 das Format, das `zaehler restore` und das lokale
Einspielen (siehe unten) erwarten.

> Das Backup enthält Passwort-Hashes und TOTP-Secrets. Der Download ist
> admin-only und `no-store`; behandle die Datei entsprechend vertraulich.

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

### Lokal einspielen (Entwicklung / Test)

Ein heruntergeladenes Backup (`meters-<datum>.db.gz`, z. B. über die App-UI
geladen) in die lokale Dev-Umgebung übernehmen, um mit echten Daten zu testen:

```bash
# 1. Dev-Server stoppen (sonst lockt er die DB / WAL).
# 2. Aktuelle Dev-DB inkl. WAL/SHM zur Seite legen:
cd <repo>/data
mv meters.db meters.db.bak 2>/dev/null; rm -f meters.db-wal meters.db-shm
# 3. Backup entpacken (Pfad anpassen):
gunzip -c ~/Downloads/meters-<datum>.db.gz > <repo>/data/meters.db
# 4. Server wieder starten.
```

Die WAL-/SHM-Dateien **müssen** vor dem Ersetzen weg, sonst spielt SQLite ein
altes WAL auf die neue DB (Korruption). Ein `alembic upgrade head` oder
`recompute-monthly` ist **nicht** nötig: Der Snapshot ist bereits auf dem
Schema-Stand der Quell-Instanz inklusive des materialisierten Monats-Caches.

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
