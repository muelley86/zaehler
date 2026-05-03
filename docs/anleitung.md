# Schritt-für-Schritt-Anleitung für Anfänger

Diese Anleitung beschreibt sieben Dinge in voller Länge — auch wenn du
Linux, Git oder Container noch nie wirklich benutzt hast:

1. **Teil 1** — Wie du die Zählerstand-App in einen LXC-Container installierst.
2. **Teil 2** — Wie du am Code Änderungen vornimmst und nach GitHub hochlädst.
3. **Teil 3** — Wie der Container die neuen Versionen bekommt.
4. **Teil 4** — Was tun, wenn etwas nicht klappt.
5. **Teil 5** — HTTPS-Reverse-Proxy mit Caddy einrichten.
6. **Teil 6** — Zwei-Faktor-Authentisierung (2FA) aktivieren.
7. **Teil 7** — Versionen taggen und im Notfall zurückrollen.

Was du **vorab brauchst**:

- Einen Proxmox-Host (oder einen anderen LXC-fähigen Linux-Host).
- Einen GitHub-Account (für Teil 2).
- Auf deinem **eigenen PC**: einen Texteditor (z. B. VS Code) und
  installiertes `git`. Auf macOS reicht `brew install git`, auf Windows
  [git-scm.com](https://git-scm.com/download/win), auf Linux liefert dein
  Paketmanager das Paket.

Alle Befehle in Code-Blöcken sind zum **Kopieren und Einfügen** gedacht. Wenn
in einem Befehl `…` steht, musst du diesen Teil durch deinen eigenen Wert
ersetzen.

---

## Teil 1 — App im Container installieren

### 1.1 Container anlegen

In Proxmox einen neuen Container erstellen mit folgenden Werten:

| Einstellung | Wert |
|---|---|
| Vorlage | `debian-13-standard` |
| Hostname | `zaehler` (oder ein anderer freier Name) |
| RAM | **2048 MB** (1 GB ist zu wenig fürs Frontend-Build) |
| Swap | 1024 MB |
| Festplatte | 4 GB |
| CPU | 1 Core |
| Netzwerk | DHCP oder feste IP |
| Unprivileged | Ja |
| Nesting | Ja |

Wenn du lieber per Shell arbeitest — auf dem Proxmox-**Host**:

```bash
pct create 200 local:vztmpl/debian-13-standard_*.tar.zst \
  --hostname zaehler --cores 1 --memory 2048 --swap 1024 \
  --rootfs local-lvm:4 --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --features nesting=1 --start 1
```

In den Container einsteigen:

```bash
pct enter 200
```

(Die `200` ist die Container-ID — falls du eine andere gewählt hast, nimm
deine.)

### 1.2 Die Installation in einer Zeile

Im Container — du bist dort automatisch als `root` — fügst du **diese eine
Zeile** ein:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/muelley86/zaehler/main/deploy/lxc/install.sh)"
```

Was passiert:

1. Mindest-Pakete werden installiert (`curl`, `git`, `sudo`, `whiptail`).
2. Ein System-Benutzer `zaehler` wird angelegt.
3. Das Repository wird nach `/opt/zaehler/repo` geklont.
4. Der **Wizard** öffnet sich (blaue Dialog-Boxen).

### 1.3 Den Wizard durchklicken

Mit den **Pfeiltasten** navigierst du, mit **Tab** wechselst du zwischen
Auswahl und „OK"/„Cancel", mit **Enter** bestätigst du.

| Dialog | Was du tust |
|---|---|
| Willkommen | „Ja" wählen — fortfahren |
| Installations-Modus | „Standard" auswählen (Defaults reichen) |
| Admin-Username | Deinen gewünschten Benutzernamen eingeben (z. B. `kmueller`) |
| Admin-Passwort | Mindestens 12 Zeichen — wird beim ersten Login wieder geändert |
| Passwort bestätigen | Gleiches Passwort nochmal |
| Bereit zur Installation | Werte prüfen — „Ja" |

Dann läuft die eigentliche Installation 3–8 Minuten durch. Du siehst farbige
`✓`- und `▸`-Zeilen für jeden der 10 Schritte. Am Ende ein Dialog mit der
**App-URL**.

### 1.4 Im Browser öffnen

Falls du die URL aus dem Dialog nicht mehr hast, im Container die IP
ermitteln:

```bash
hostname -I
```

Im Browser z. B. `http://10.10.2.38:8000` aufrufen → mit Admin-Username +
Passwort einloggen → Force-Change-Dialog → ein eigenes neues Passwort
setzen → fertig.

---

## Teil 2 — Änderungen machen und auf GitHub pushen

Hier arbeitest du **nicht im Container**, sondern auf deinem eigenen PC.

### 2.1 Repository einmalig auf den eigenen PC klonen

```bash
git clone https://github.com/muelley86/zaehler.git
cd zaehler
```

(Wenn du kein Schreibrecht am Repo hast, brauchst du einen *Fork* — das ist
ein eigener Klon des Repos in deinem GitHub-Account. In dem Fall ersetze
`muelley86` durch deinen GitHub-Namen.)

### 2.2 Änderungen vornehmen

Öffne den Ordner in deinem Editor (`code .` für VS Code) und ändere, was
du ändern willst — z. B. einen Tippfehler in einer Datei oder einen Text in
der Oberfläche.

### 2.3 Aktuellen Stand kontrollieren

```bash
git status
```

Zeigt dir, welche Dateien du geändert hast.

```bash
git diff
```

Zeigt dir **was** sich genau geändert hat (mit `q` schließt du das wieder).

### 2.4 Änderungen einpacken (stagen + committen)

```bash
git add .
```

(Sammelt alle deine Änderungen.)

```bash
git commit -m "fix: Tippfehler in Login-Seite korrigiert"
```

Die Commit-Nachricht ist eine **kurze Beschreibung**, was du gemacht hast.
Konvention im Projekt:

| Präfix | Wofür |
|---|---|
| `feat:` | Neue Funktion |
| `fix:` | Fehlerbehebung |
| `chore:` | Aufräumen, Werkzeug-Updates |
| `refactor:` | Umbau ohne Verhaltensänderung |
| `docs:` | Doku-Änderung |

Beispiele für gute Nachrichten:

- `feat: CSV-Export für Erfassungen ergänzt`
- `fix: Datum wird nicht mehr falsch gerundet`
- `docs: README um Kapitel zur Tankberechnung erweitert`

### 2.5 Hochladen zu GitHub

```bash
git push
```

GitHub verlangt beim ersten Mal eine Authentifizierung (Login per Browser
oder Personal Access Token). Wenn das einmal eingerichtet ist, reicht ab
da `git push` allein.

### 2.6 Nachprüfen, dass es geklappt hat

```bash
git log --oneline -5
```

Der oberste Eintrag muss deine neue Commit-Nachricht sein. Auf
`https://github.com/muelley86/zaehler/commits/main` siehst du dasselbe.

### 2.7 Falls du dir unsicher bist

Du kannst Änderungen **vor** dem `git add` jederzeit verwerfen:

```bash
git restore <datei>      # diese eine Datei zurücksetzen
git restore .            # alle ungestageten Änderungen zurücksetzen
```

**Nach** dem Commit aber **vor** dem Push:

```bash
git reset --soft HEAD~1   # letzten Commit rückgängig, Änderungen bleiben
```

**Nach** dem Push: nicht mehr einfach rückgängig — schreib lieber einen
neuen Commit, der den Fehler korrigiert.

---

## Teil 3 — Container auf den neuen Stand bringen

Nach jedem `git push` muss der Container die Änderungen aktiv abholen. Im
Container — als `root` — ein einziger Befehl:

```bash
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh upgrade-app
```

Der macht der Reihe nach:

1. Ein Backup der aktuellen Datenbank.
2. `git pull` (zieht deine neuen Commits).
3. `uv sync` (Python-Pakete aktualisieren, falls Änderungen).
4. `pnpm install + build` (Frontend neu bauen).
5. `alembic upgrade head` (Datenbank-Migrationen, falls welche neu sind).
6. systemd-Unit synchronisieren, Service neu starten.

Schlägt einer dieser Schritte fehl, bleibt der **alte** Service laufen — die
DB-Datei wird nicht angefasst, du hast trotzdem ein frisches Backup.

Komplett-Update inklusive System-Pakete und Toolchain:

```bash
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh upgrade-all
```

---

## Teil 4 — Wenn etwas nicht klappt

### App nicht erreichbar

1. Service-Status prüfen:

   ```bash
   sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh status
   ```

2. Live-Logs anschauen:

   ```bash
   sudo journalctl -u zaehler.service -f
   ```

   Mit `Strg+C` schließt du das wieder.

### Login lehnt mein Passwort ab

Mit dem Skript-Wizard zurücksetzen:

```bash
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh reset-password
```

Username eingeben, neues Passwort zweimal eingeben — beim nächsten Login
musst du es nochmal ändern.

### Backup einspielen

Wenn die DB beschädigt wurde:

```bash
ls -la /opt/zaehler/backups/
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh restore /opt/zaehler/backups/meters-YYYYMMDD-HHMMSS.db.gz
```

### Container neu aufsetzen

Geht jederzeit gefahrlos, **solange** du die `/opt/zaehler/data/`- und
`/opt/zaehler/backups/`-Verzeichnisse vorher gesichert hast. Anschließend
neuen Container anlegen, Bootstrap-Einzeiler laufen lassen, alte
`data/meters.db` und `data/meters.env` zurückkopieren, Service starten.

---

## Teil 5 — HTTPS-Reverse-Proxy mit Caddy

Solange die App nur im lokalen Heimnetz läuft, ist HTTP ausreichend. Sobald
du sie aber unter einer Domain bereitstellen oder über das Internet
erreichbar machen willst, **muss** ein HTTPS-Reverse-Proxy davor — sonst
wandern Passwort und Session-Cookie unverschlüsselt durchs Netz.

Das Setup folgt einem festen Ablauf:

```
[Internet] --443--> [Caddy auf dem Proxmox-Host] --8000--> [LXC-Container]
```

### 5.1 DNS einrichten

Bei deinem DNS-Anbieter einen A- oder AAAA-Record auf die öffentliche IP
deines Routers setzen, z. B.

```
zaehler.example.com.   A   203.0.113.42
```

Auf dem Router Port 80 und 443 an den Proxmox-Host weiterleiten (TCP).
80 braucht Caddy für die Let's-Encrypt-HTTP-Challenge, 443 ist der
HTTPS-Listener.

### 5.2 Caddy auf dem Proxmox-Host installieren

```bash
sudo apt update
sudo apt install -y caddy
```

(Bei Debian/Ubuntu liefert das System-Paket Caddy 2.x; alternativ
`https://caddyserver.com/download`.)

### 5.3 Caddyfile schreiben

Datei `/etc/caddy/Caddyfile` editieren:

```caddyfile
zaehler.example.com {
    reverse_proxy <container-ip>:8000 {
        # Container-IP herausfinden im Container per `hostname -I`.
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

```bash
sudo systemctl reload caddy
```

Caddy holt sich beim ersten Aufruf automatisch ein Let's-Encrypt-
Zertifikat. Im Browser `https://zaehler.example.com` testen — Schloss-Symbol
muss erscheinen.

### 5.4 App im Container auf Reverse-Proxy umstellen

Im **Container** (per `pct enter <id>`):

```bash
sudo nano /opt/zaehler/data/meters.env
```

Diese vier Zeilen setzen (oder ergänzen, falls fehlend):

```ini
METERS_BIND_HOST=127.0.0.1
METERS_COOKIE_SECURE=True
METERS_TRUST_PROXY=True
METERS_ALLOWED_ORIGINS=https://zaehler.example.com
```

Was bedeuten die Werte?

| Schlüssel | Wirkung |
|---|---|
| `METERS_BIND_HOST=127.0.0.1` | App lauscht nur lokal, Caddy ist der einzige Weg rein |
| `METERS_COOKIE_SECURE=True` | Session-Cookie wird nur über HTTPS gesendet |
| `METERS_TRUST_PROXY=True` | Backend wertet `X-Forwarded-For` aus (sonst würden Audit-Log und Rate-Limiter immer Caddys IP sehen) |
| `METERS_ALLOWED_ORIGINS=https://…` | CSRF-Schutz: Origin-Check für POST/PATCH/DELETE |

Service neu starten:

```bash
sudo systemctl restart zaehler.service
```

> Tipp: Bei einem **frischen** Install kannst du dir den manuellen Schritt
> sparen — der Wizard fragt aktiv nach dem Reverse-Proxy und füllt diese
> Werte automatisch ein.

### 5.5 Verifizieren

```bash
curl -fsSI https://zaehler.example.com/api/v1/health
```

Erwartet: `HTTP/2 200`. Plus die Header `Strict-Transport-Security` und
`X-Frame-Options: DENY` müssen vorhanden sein — die kommen jetzt vom
Backend, sind ein Indiz für ein korrektes HTTPS-Setup.

---

## Teil 6 — Zwei-Faktor-Authentisierung (MFA)

Sobald die App von außen erreichbar ist, ist 2FA Pflicht. Es schützt
deinen Account auch dann, wenn dein Passwort durch ein Datenleck oder
Phishing in falsche Hände gerät.

### 6.1 Was du brauchst

- Eine **Authenticator-App** auf dem Smartphone:
  - Google Authenticator, Authy, Microsoft Authenticator, 1Password,
    Bitwarden, KeePassXC — alle funktionieren.
- 5 Minuten Zeit.

### 6.2 2FA aktivieren

1. In der App einloggen → unten rechts **Mehr**.
2. Section **Zwei-Faktor-Authentisierung** → "**2FA jetzt einrichten**".
3. QR-Code scannen mit der Authenticator-App. Die App zeigt jetzt einen
   6-stelligen Code an, der sich alle 30 Sekunden ändert.
4. Den aktuellen Code im Eingabefeld eintippen → **Aktivieren**.
5. Es erscheinen **10 Backup-Codes**. Diese sind dein Notfall-Schlüssel,
   wenn du das Smartphone verlierst.

### 6.3 Backup-Codes sicher aufbewahren

- "**Drucken**" klicken → ausdrucken und ins Sparbuch oder den Safe legen.
- Oder "**Kopieren**" → in einem Passwort-Manager (1Password, Bitwarden)
  als Anhang speichern.
- **Niemals** ungeschützt in einer Datei auf der Festplatte oder in einer
  E-Mail.

Jeder Code funktioniert genau einmal. Sind alle 10 verbraucht oder
kompromittiert: in **Mehr → 2FA → Backup-Codes neu generieren** klicken,
alte werden sofort ungültig.

### 6.4 Login mit 2FA

Beim nächsten Login fragt die App nach dem Schritt 1 (Username + Passwort)
zusätzlich nach einem Sicherheitscode:

1. Authenticator-App öffnen → 6-stelligen Code ablesen → eingeben → fertig.
2. Wenn das Smartphone gerade nicht da ist: einen 16-stelligen Backup-Code
   eingeben (mit oder ohne Bindestrich, Klein-/Großschreibung egal).

### 6.5 2FA wieder ausschalten

**Mehr → 2FA → 2FA deaktivieren** → aktuelles Passwort + ein gültiger
Code (Authenticator oder Backup) → Bestätigen. Die App löscht das Secret
und alle restlichen Backup-Codes.

### 6.6 Was wenn ich Smartphone UND Backup-Codes verloren habe?

Dann brauchst du Container-Zugang als root:

```bash
# DB-Editor öffnen
sudo sqlite3 /opt/zaehler/data/meters.db
```

```sql
UPDATE user SET totp_enabled = 0, totp_secret = NULL WHERE username = 'kmueller';
.quit
```

Service neu starten:

```bash
sudo systemctl restart zaehler.service
```

Anschließend ohne 2FA einloggen, in Mehr → 2FA neu einrichten, neue
Backup-Codes ausdrucken.

> Wichtig: dieser Notausstieg setzt voraus, dass du root-Zugriff auf
> den Container hast. Externer Angreifer ohne diesen Zugang kommt damit
> nicht weiter.

---

## Teil 7 — Versionen taggen und zurückrollen

Git verwaltet automatisch jede Änderung als **Commit** mit eindeutiger ID.
Ein **Tag** ist ein menschen-lesbarer Name für einen Commit, den du als
"funktionierende Version" markierst. Im Notfall kannst du jederzeit auf
einen alten Tag zurückkehren.

### 7.1 Eine Version markieren (Tag)

Auf deinem **PC** im Projektordner:

```bash
git pull --tags                          # alle existierenden Tags holen
git tag -a v1.0.0 -m "Erste stabile Version: 2FA + HTTPS-Setup komplett"
git push origin v1.0.0                   # Tag auf GitHub hochladen
```

`-a` macht einen "annotated tag" — mit Autor, Datum und Nachricht. Auf
GitHub erscheint der Tag unter
`https://github.com/muelley86/zaehler/tags` und kann auch als **Release**
mit Changelog/ZIP-Download veröffentlicht werden:

GitHub → dein Repo → **Releases** → **Draft a new release** → Tag wählen
→ Beschreibung schreiben → **Publish release**.

### 7.2 Versionsschema (Empfehlung)

[Semantic Versioning](https://semver.org/):

| Beispiel | Wann erhöhen |
|---|---|
| `v1.0.0` → `v1.0.1` | Bugfix, kein Verhaltensunterschied |
| `v1.0.1` → `v1.1.0` | Neue Funktion, abwärtskompatibel |
| `v1.1.0` → `v2.0.0` | Inkompatible Änderung (DB-Migration mit Datenverlust, geänderte API) |

Vor 1.0.0 darf alles "Beta" sein — Tags wie `v0.1.0`, `v0.2.0`, etc.

### 7.3 Welche Tags gibt es?

```bash
git tag                          # lokal
git ls-remote --tags origin      # auf GitHub
```

Auf GitHub: **Code → Branches/Tags-Dropdown → Tags-Tab**.

### 7.4 Im Notfall zurück: Container auf alte Version

Im **Container**:

```bash
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh rollback v1.0.0
```

Was passiert:

1. **Backup** der aktuellen Datenbank (sicher ist sicher).
2. `git checkout v1.0.0` (Repo wechselt auf den Tag).
3. `uv sync` — Backend-Pakete der alten Version.
4. `pnpm install + build` — Frontend wird mit altem Code neu gebaut.
5. systemd-Service neu starten.

> **Wichtiger Hinweis zur Datenbank:** Falls die *neuere* Version eine
> Datenbank-Migration eingeführt hat (neue Spalten, neue Tabellen), läuft
> der alte Code möglicherweise nicht ohne Weiteres mit der neueren DB.
> In dem Fall:
>
> - Entweder ein **Backup** einspielen, das **vor** der Migration
>   entstanden ist (`zaehler.sh restore <ältere-datei.gz>`), und
>   dann den `rollback` ausführen.
> - Oder die DB manuell auf die alte Migration herunterstufen:
>
>   ```bash
>   sudo -u zaehler -H bash -lc \
>     "cd /opt/zaehler/repo/backend && uv run alembic downgrade <revision>"
>   ```
>
> `<revision>` ist die ID der gewünschten älteren Migration (siehe
> `backend/alembic/versions/`-Verzeichnis im Repo).

### 7.5 Zurück zum aktuellen Stand

Nach erfolgreichem Test der alten Version oder nach behobenem Problem:

```bash
sudo bash /opt/zaehler/repo/deploy/lxc/zaehler.sh upgrade-app
```

bringt den Container wieder auf den Stand von `main`.

### 7.6 Lokal auf einen alten Tag schauen

Auf deinem **PC**, ohne den main-Branch zu verlieren:

```bash
git checkout v1.0.0      # repo zeigt den Stand vom Tag
# … Code anschauen, verifizieren …
git checkout main        # zurück auf den aktuellen Branch
```

> Bei `git checkout v1.0.0` warnt Git mit "detached HEAD" — das ist
> normal und nicht gefährlich, solange du danach wieder auf einen Branch
> wechselst.

### 7.7 Wann taggen?

Sinnvolle Trigger:

- **Vor jeder größeren Änderung**: `v0.4.0` als "Stand vor Refactor X".
- **Nach jeder erfolgreich getesteten Version**: `v1.0.0`.
- **Vor einer Migration**, die Datenmodell-Felder verändert.
- **Vor dem Update auf eine neue Major-Library** (FastAPI, React, …).

So hast du in der Not immer einen Punkt, auf den du zurückkannst.

---

## Anhang — Mini-Cheatsheet

### Wichtige Pfade im Container

| Pfad | Inhalt |
|---|---|
| `/opt/zaehler/repo/` | Quellcode (per `git pull` aktuell halten) |
| `/opt/zaehler/data/meters.db` | SQLite-Datenbank — **niemals löschen** |
| `/opt/zaehler/data/meters.env` | Konfiguration (Secret-Key, Bind-Host, …) |
| `/opt/zaehler/backups/` | Tägliche DB-Snapshots |

### Häufige Skript-Kommandos (alle als `sudo bash …`)

| Kommando | Zweck |
|---|---|
| `install` | Erstinstallation oder kompletter Re-Bootstrap (idempotent) |
| `upgrade-app` | Code aktualisieren + neu bauen + Service-Neustart |
| `upgrade-all` | System + Tools + App in einem Lauf |
| `backup` | Sofort einen DB-Snapshot erzeugen |
| `restore <datei.gz>` | Backup einspielen |
| `rollback <tag>` | App auf eine ältere Tag/Commit-Version zurückrollen |
| `reset-password` | Passwort eines Users (z. B. Admin) neu setzen |
| `audit` | Dependency-Audit für Frontend (pnpm) und Backend (pip-audit) |
| `status` | Übersicht: Service, Versionen, DB, Backups, Repo |
| `help` | Komplette Befehlsreferenz |

### Sicherheit

- **HTTPS-Reverse-Proxy** dringend empfohlen, sobald die App von außen
  erreichbar ist. Im Wizard fragt `install` nach einem Proxy und setzt
  bei Ja automatisch `cookie_secure`, `trust_proxy` und HSTS ein. Caddy-
  Beispiel siehe `deploy/lxc/README.md` §4.
- **Regelmäßiger Audit-Lauf**: `sudo bash zaehler.sh audit` listet
  bekannte Schwachstellen in JavaScript- und Python-Abhängigkeiten auf.
  Empfehlung: monatlich oder bei jeder größeren Änderung.
- **Backup-Verzeichnis** liegt unter `0700`-Permissions — nur der App-
  User darf lesen. Zusätzliche Sicherung auf externen Speicher
  empfehlenswert (Hardware-Defekt-Schutz).
- **Login-Lockout**: pro IP nach 5 Fehlversuchen 15 min Sperre, pro
  Username nach 10 Fehlversuchen 30 min Sperre — schützt vor Brute-
  Force auch bei wechselnden IPs.

### git-Mini-Spickzettel

| Befehl | Zweck |
|---|---|
| `git status` | Was hat sich geändert? |
| `git diff` | Was hat sich genau geändert? |
| `git log --oneline -10` | Letzte 10 Commits |
| `git pull` | Aktuellen Stand vom GitHub holen |
| `git add <datei>` | Datei zum Commit vormerken |
| `git add .` | Alle Änderungen zum Commit vormerken |
| `git commit -m "…"` | Commit erstellen |
| `git push` | Commits zu GitHub hochladen |
| `git restore <datei>` | Änderung rückgängig (vor `git add`) |
| `git tag -a vX.Y.Z -m "…"` | Aktuellen Stand als Version markieren |
| `git push origin vX.Y.Z` | Tag zu GitHub hochladen |
| `git tag` | Alle lokalen Tags |
| `git checkout vX.Y.Z` | Repo lokal auf diesen Tag (detached HEAD) |
| `git checkout main` | Zurück auf Branch main |

---

## Weiterführend

- **`README.md`** im Repo-Root — Funktionsumfang, Tech-Stack, Schnellstart fürs lokale Entwickeln
- **`deploy/lxc/README.md`** — knappe LXC-Referenz
- **`docs/deployment.md`** — Update-Strategie, Datenpfade
- **`docs/architecture.md`**, **`docs/data-model.md`**, **`docs/api.md`**, **`docs/auth.md`** — technische Hintergründe für Code-Änderungen
- **`CLAUDE.md`** — fachliche Spezifikation der App
