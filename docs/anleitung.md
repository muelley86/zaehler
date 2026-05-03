# Schritt-für-Schritt-Anleitung für Anfänger

Diese Anleitung beschreibt zwei Dinge in voller Länge — auch wenn du Linux,
Git oder Container noch nie wirklich benutzt hast:

1. **Teil 1** — Wie du die Zählerstand-App in einen LXC-Container installierst.
2. **Teil 2** — Wie du am Code Änderungen vornimmst und nach GitHub hochlädst.
3. **Teil 3** — Wie der Container die neuen Versionen bekommt.
4. **Teil 4** — Was tun, wenn etwas nicht klappt.

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

---

## Weiterführend

- **`README.md`** im Repo-Root — Funktionsumfang, Tech-Stack, Schnellstart fürs lokale Entwickeln
- **`deploy/lxc/README.md`** — knappe LXC-Referenz
- **`docs/deployment.md`** — Update-Strategie, Datenpfade
- **`docs/architecture.md`**, **`docs/data-model.md`**, **`docs/api.md`**, **`docs/auth.md`** — technische Hintergründe für Code-Änderungen
- **`CLAUDE.md`** — fachliche Spezifikation der App
