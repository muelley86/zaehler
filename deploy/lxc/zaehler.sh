#!/usr/bin/env bash
# =============================================================================
#  zaehler.sh — zentrales Verwaltungsskript für die Zählerstand-App im LXC.
#
#  Aufruf:
#      sudo bash zaehler.sh <kommando>
#
#  Kommandos (siehe `zaehler.sh help` für Details):
#      install            Erstinstallation oder Re-Bootstrap (idempotent)
#      upgrade-system     System-Pakete via apt aktualisieren
#      upgrade-tools      uv und pnpm auf die neueste Version bringen
#      upgrade-app        App-Code aktualisieren (git pull, deps, migrate, restart)
#      upgrade-all        upgrade-system + upgrade-tools + upgrade-app
#      set-timezone [tz]  System-Zeitzone setzen (Default Europe/Berlin)
#      backup             SQLite-Datenbank sofort sichern
#      restore <datei>    DB aus Backup wiederherstellen
#      repair-midnight-readings [--apply]   00:00-Readings -> Vortag 23:59:59
#      repair-legacy-timestamps [--apply]   naiv-UTC-Readings korrigieren
#      status             Übersicht: Service, Versionen, DB-Größe, letztes Backup
#      help               Befehlsreferenz
#
#  Die Erstinstallation muss als root laufen — alle weiteren Kommandos können
#  als root aufgerufen werden; Operationen, die als App-User ausgeführt werden
#  sollen, wickelt das Skript intern via sudo ab.
# =============================================================================

set -euo pipefail

# UTF-8 erzwingen, damit Box-Banner, Em-Dashes und whiptail-Bullets korrekt
# angezeigt werden — auch im frischen Container vor Locale-Setup. C.UTF-8
# ist auf Debian/Ubuntu immer verfügbar (kein 'locales'-Paket nötig).
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

# -----------------------------------------------------------------------------
# Konfiguration (per Umgebungsvariable überschreibbar)
# -----------------------------------------------------------------------------

APP_USER="${APP_USER:-zaehler}"
APP_DIR="${APP_DIR:-/opt/zaehler}"
REPO_DIR="${REPO_DIR:-$APP_DIR/repo}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
SERVICE_NAME="${SERVICE_NAME:-zaehler.service}"
REPO_URL="${REPO_URL:-https://example.invalid/REPLACE-ME.git}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
PNPM_VERSION="${PNPM_VERSION:-11}"

# -----------------------------------------------------------------------------
# Hilfsfunktionen
# -----------------------------------------------------------------------------

C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_RED=$'\033[31m'; C_GRN=$'\033[32m'
C_YEL=$'\033[33m'; C_DIM=$'\033[2m'; C_BLU=$'\033[34m'; C_CYA=$'\033[36m'

log()       { printf '%s%s%s  %s\n' "$C_DIM" "$(date '+%H:%M:%S')" "$C_RESET" "$*"; }
step()      { printf '\n%s==> %s%s\n' "$C_BOLD" "$*" "$C_RESET"; }
ok()        { printf '%s✓%s %s\n' "$C_GRN" "$C_RESET" "$*"; }
warn()      { printf '%s⚠%s %s\n' "$C_YEL" "$C_RESET" "$*" >&2; }
die()       { printf '%s✗ FEHLER:%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }
msg_info()  { printf '%sℹ%s %s\n'   "$C_BLU" "$C_RESET" "$*"; }
msg_run()   { printf '%s▸%s %s …\n' "$C_CYA" "$C_RESET" "$*"; }

# Zeichnet das Banner zu Beginn der Installation.
banner() {
    clear 2>/dev/null || true
    printf '%s%s' "$C_CYA" "$C_BOLD"
    cat <<'EOF'

  ╔══════════════════════════════════════════════════════════════╗
  ║                                                              ║
  ║            Z Ä H L E R S T A N D - A P P                     ║
  ║                                                              ║
  ║      Self-hosted Verbrauchs-Tracking · LXC-Installer         ║
  ║                                                              ║
  ╚══════════════════════════════════════════════════════════════╝

EOF
    printf '%s' "$C_RESET"
}

# whiptail-Wrapper. Fällt sauber auf "nicht verfügbar" zurück.
have_whiptail() { command -v whiptail >/dev/null 2>&1; }

# Stellt sicher, dass whiptail vorhanden ist (für die Wizard-Dialoge).
ensure_whiptail() {
    if ! have_whiptail; then
        msg_run "whiptail nachinstallieren"
        DEBIAN_FRONTEND=noninteractive apt-get update -qq
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends whiptail >/dev/null
        ok "whiptail installiert"
    fi
}

# Whiptail-Eingabe-Helfer. whiptail schreibt das Ergebnis auf stderr — das
# 3>&1 1>&2 2>&3 vertauscht Kanäle, damit $(...) den Wert einfangen kann.
wt_menu()     { whiptail --backtitle "Zählerstand-App Installer" --title "$1" --menu "$2" 18 76 6 "${@:3}" 3>&1 1>&2 2>&3; }
wt_input()    { whiptail --backtitle "Zählerstand-App Installer" --title "$1" --inputbox "$2" 11 76 "$3" 3>&1 1>&2 2>&3; }
wt_password() { whiptail --backtitle "Zählerstand-App Installer" --title "$1" --passwordbox "$2" 11 76 3>&1 1>&2 2>&3; }
wt_yesno()    { whiptail --backtitle "Zählerstand-App Installer" --title "$1" --yesno "$2" 14 76; }
wt_msgbox()   { whiptail --backtitle "Zählerstand-App Installer" --title "$1" --msgbox "$2" 16 76; }

require_root() {
    [ "$(id -u)" -eq 0 ] || die "Dieses Kommando muss als root ausgeführt werden (sudo)."
}

# Setzt die System-Zeitzone idempotent (Default Europe/Berlin). Betrifft nur
# Logs/Backups/systemd-Timer — DB/API bleiben bewusst UTC. Wird von install,
# upgrade-app und dem set-timezone-Kommando genutzt; ist bereits-gesetzt ein
# No-op und bricht ohne root nicht ab (warnt nur).
ensure_timezone() {
    local tz="${1:-Europe/Berlin}"
    local current=""
    if command -v timedatectl >/dev/null 2>&1; then
        current=$(timedatectl show -p Timezone --value 2>/dev/null || echo "")
    fi
    [ -n "$current" ] || current=$(readlink -f /etc/localtime 2>/dev/null | sed 's#.*/zoneinfo/##')
    if [ "$current" = "$tz" ]; then
        log "Zeitzone bereits $tz"
        return 0
    fi
    if [ "$(id -u)" -ne 0 ]; then
        warn "Zeitzone ist '$current' statt '$tz', aber nicht als root — übersprungen."
        warn "Fix: sudo zaehler set-timezone"
        return 0
    fi
    # Fallback ohne nutzbares timedatectl (manche LXC ohne systemd-timedated):
    # direkter /etc/localtime-Symlink.
    timedatectl set-timezone "$tz" 2>/dev/null \
        || ln -sf "/usr/share/zoneinfo/$tz" /etc/localtime
    ok "Zeitzone auf $tz gesetzt (war: ${current:-unbekannt})"
}

# Führt einen Befehl als App-User aus, mit ge-source-tem Profil (PATH ~/.local/bin).
# Sourct außerdem $DATA_DIR/meters.env, falls vorhanden — damit haben CLI-Aufrufe
# (alembic, meters.cli) dieselbe DATABASE_URL wie der systemd-Service.
# Wechselt initial ins $HOME des App-Users — sonst startet die Subshell mit
# CWD = /root (das CWD vom root-Caller), und Tools wie pnpm scannen parent-
# Dirs nach package.json, was mit EACCES failt.
as_user() {
    sudo -u "$APP_USER" -H bash -lc "cd; set -a; [ -f '$DATA_DIR/meters.env' ] && . '$DATA_DIR/meters.env'; set +a; $*"
}

# Prüft, ob ein Befehl im PATH des Users 'zaehler' verfügbar ist.
user_has() {
    sudo -u "$APP_USER" -H bash -lc "command -v $1 >/dev/null 2>&1"
}

# Stellt sicher, dass eine bestehende meters.env die für CLI-Aufrufe nötigen
# Keys enthält. Idempotent — fügt nur fehlendes hinzu, ändert nichts an
# vorhandenen Werten.
ensure_env_file() {
    local env_file="$DATA_DIR/meters.env"
    [ -f "$env_file" ] || return 0
    if ! grep -q '^METERS_DATABASE_URL=' "$env_file"; then
        echo "METERS_DATABASE_URL=sqlite:///$DATA_DIR/meters.db" >> "$env_file"
        ok "meters.env: DATABASE_URL ergänzt"
    fi
}

# Stellt sicher, dass Node.js >= NODE_MAJOR_REQUIRED installiert ist. Auf
# Debian 12 liefert apt nur Node 18, das frontend/package.json setzt aber
# `engines.node >=20` voraus (Vite 5 + neueres Toolchain). Ohne diesen
# Helper warnt pnpm bei jedem install, neuere Pakete brechen ggf. ganz
# ab. Wir ziehen Node 20 aus dem offiziellen NodeSource-Repo nach —
# idempotent: läuft nur, wenn die installierte Version zu alt ist.
NODE_MAJOR_REQUIRED="${NODE_MAJOR_REQUIRED:-20}"

ensure_node_lts() {
    local current_major=0
    if command -v node >/dev/null 2>&1; then
        current_major=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')
        # falls sed nichts liefert (zerfetzte Ausgabe) → 0
        case "$current_major" in ''|*[!0-9]*) current_major=0 ;; esac
    fi
    if [ "$current_major" -ge "$NODE_MAJOR_REQUIRED" ] 2>/dev/null; then
        ok "Node $(node -v) erfüllt Anforderung (>= ${NODE_MAJOR_REQUIRED})"
        return 0
    fi
    msg_run "NodeSource-Repository für Node ${NODE_MAJOR_REQUIRED}.x einbinden"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
        ca-certificates curl gnupg >/dev/null
    local tmp_setup=/tmp/nodesource_setup.sh
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR_REQUIRED}.x" -o "$tmp_setup"
    # Das NodeSource-Setup-Skript ruft intern ``apt`` auf, was eine
    # ``WARNING: apt does not have a stable CLI interface``-Zeile auf
    # stderr produziert. Die Warnung ist hier kosmetisch — wir filtern
    # sie weg, damit der Install-Output sauber bleibt. Echte Fehler
    # bleiben sichtbar (alles, was nicht exakt diese Zeile ist).
    bash "$tmp_setup" 2> >(grep -v "apt does not have a stable CLI interface" >&2) >/dev/null
    rm -f "$tmp_setup"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends nodejs >/dev/null
    ok "Node $(node -v) installiert"
}

# Erzeugt /etc/sudoers.d/zaehler-restart (idempotent), damit der App-User den
# Service ohne Passwort neu starten kann — wird vom upgrade-app gebraucht.
ensure_sudo_rule() {
    local file=/etc/sudoers.d/zaehler-restart
    if [ ! -f "$file" ]; then
        printf '%s ALL=(root) NOPASSWD: /bin/systemctl restart %s\n' \
            "$APP_USER" "$SERVICE_NAME" > "$file"
        chmod 440 "$file"
        ok "sudo-Regel angelegt: $file"
    fi
}

# Legt einen Wrapper unter /usr/local/bin/zaehler an, damit der User auf
# einem installierten Container mit `sudo zaehler upgrade-all` auskommt
# (statt dem Pfad zum Skript). Idempotent — bei jedem upgrade-app neu
# gesetzt, falls REPO_DIR sich geändert hat.
ensure_cli_link() {
    local dest=/usr/local/bin/zaehler
    local target="$REPO_DIR/deploy/lxc/zaehler.sh"
    if [ ! -L "$dest" ] || [ "$(readlink "$dest")" != "$target" ]; then
        ln -sfn "$target" "$dest"
        ok "CLI-Wrapper angelegt: 'sudo zaehler <kommando>' funktioniert ab jetzt überall"
    fi
}

# -----------------------------------------------------------------------------
# install — Erstinstallation
# -----------------------------------------------------------------------------

# Wizard-Werte — vom install_wizard befüllt, von den Schritten genutzt.
WIZ_REPO_URL=""
WIZ_BIND_HOST="0.0.0.0"
WIZ_BIND_PORT="8000"
WIZ_ADMIN_USER="admin"
WIZ_ADMIN_PASSWORD=""
WIZ_BACKUP_TIME="03:30"
WIZ_REVERSE_PROXY_HOST=""

# Heuristik: kann der Wizard interaktive Dialoge zeigen?
is_interactive() { [ -t 0 ] && [ -t 1 ] && have_whiptail; }

# Validatoren — geben 0 zurück wenn ok, sonst eine kurze Fehlermeldung auf stdout.
valid_port() { [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1 ] && [ "$1" -le 65535 ]; }
valid_time() { [[ "$1" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; }
valid_user() { [[ "$1" =~ ^[a-zA-Z][a-zA-Z0-9_-]{1,31}$ ]]; }
# Positive Ganzzahl >= $2.
valid_uint_min() { [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge "$2" ]; }

# Sammelt alle Eingaben für die Installation per whiptail-Dialogen oder
# (falls non-interactive) aus ENV-Variablen + Defaults.
install_wizard() {
    # REPO_URL kann aus ENV, dem geklonten Repo, oder dem Wizard kommen.
    if [ -d "$REPO_DIR/.git" ]; then
        WIZ_REPO_URL=$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || echo "")
    fi
    if [ "$REPO_URL" != "https://example.invalid/REPLACE-ME.git" ]; then
        WIZ_REPO_URL="$REPO_URL"
    fi
    [ -n "${ADMIN_USER:-}" ]     && WIZ_ADMIN_USER="$ADMIN_USER"
    [ -n "${ADMIN_PASSWORD:-}" ] && WIZ_ADMIN_PASSWORD="$ADMIN_PASSWORD"

    if ! is_interactive; then
        if [ -z "$WIZ_REPO_URL" ]; then
            die "Kein TTY/whiptail und keine REPO_URL gesetzt. Aufruf:
  REPO_URL=https://github.com/user/zaehler.git sudo bash $0 install"
        fi
        msg_info "Non-interactive Modus — nutze Defaults und ENV-Variablen."
        return 0
    fi

    # Welcome
    if ! wt_yesno "Willkommen" "Dieses Skript installiert die Zählerstand-App in diesem Container.\n\nBenötigte Schritte werden geführt — du kannst zwischen einer Standard- und einer erweiterten Installation wählen.\n\nFortfahren?"; then
        die "Abgebrochen."
    fi

    local mode
    mode=$(wt_menu "Installations-Modus" \
        "Wie möchtest du installieren?\n\n• Standard nutzt sinnvolle Defaults (0.0.0.0:8000, Backup um 03:30) und fragt nur die unbedingt nötigen Werte.\n• Erweitert fragt jeden Wert einzeln ab." \
        "standard"  "Schnell — nur Repo-URL, Admin-Daten" \
        "advanced"  "Erweitert — alle Werte abfragen" \
        "abort"     "Abbrechen") || die "Abgebrochen."
    [ "$mode" = "abort" ] && die "Abgebrochen."

    # REPO_URL — immer pflichtig falls noch kein Repo da. Default zeigt auf
    # das Upstream-Repo, weil 99 % der Installationen kein Fork sind.
    if [ -z "$WIZ_REPO_URL" ]; then
        while :; do
            WIZ_REPO_URL=$(wt_input "Git-Repository" \
                "URL des Git-Repos, das die App enthält.\n\nDefault zeigt auf das Upstream-Repo. Wenn du einen eigenen Fork verwendest, hier deine Fork-URL einsetzen." \
                "https://github.com/muelley86/zaehler.git") || die "Abgebrochen."
            [[ "$WIZ_REPO_URL" =~ ^(https://|git@) ]] && break
            wt_msgbox "Ungültige URL" "Die URL muss mit 'https://' oder 'git@' beginnen.\n\nVerwendet wurde: $WIZ_REPO_URL"
        done
    fi

    if [ "$mode" = "advanced" ]; then
        WIZ_BIND_HOST=$(wt_input "Bind-Host" \
            "Auf welcher Adresse soll der Server lauschen?\n\n• 0.0.0.0 — direkt im LAN erreichbar\n• 127.0.0.1 — nur lokal (mit Reverse-Proxy davor)" \
            "$WIZ_BIND_HOST") || die "Abgebrochen."

        while :; do
            WIZ_BIND_PORT=$(wt_input "Port" \
                "TCP-Port für die App (Standard: 8000)." \
                "$WIZ_BIND_PORT") || die "Abgebrochen."
            valid_port "$WIZ_BIND_PORT" && break
            wt_msgbox "Ungültiger Port" "Der Port muss eine Zahl zwischen 1 und 65535 sein."
        done

        while :; do
            WIZ_BACKUP_TIME=$(wt_input "Backup-Zeit" \
                "Tägliche Backup-Zeit im Format HH:MM (24h)." \
                "$WIZ_BACKUP_TIME") || die "Abgebrochen."
            valid_time "$WIZ_BACKUP_TIME" && break
            wt_msgbox "Ungültige Zeit" "Format muss HH:MM sein (z. B. 03:30)."
        done
    fi

    # Netzwerk-Defaults sind immer "App per IP im LAN sofort erreichbar"
    # (BIND_HOST=0.0.0.0). Optional fragen wir nach einer Reverse-Proxy-
    # Domain — wird nur in ALLOWED_ORIGINS für den CSRF-Origin-Check
    # eingetragen, ändert NICHT den Bind-Host oder Cookie-Modus. Damit
    # bleibt der direkte IP-Zugriff in jedem Fall garantiert.
    WIZ_REVERSE_PROXY_HOST=$(wt_input "Reverse-Proxy-Domain (optional)" \
        "Wenn die App zusätzlich über einen HTTPS-Reverse-Proxy (NPM, Caddy, nginx) erreichbar sein soll, hier die Domain eintragen — z. B. zaehler.example.com.\n\nDie App ist unabhängig davon IMMER per http://<container-ip>:$WIZ_BIND_PORT direkt im LAN erreichbar.\n\nLeer lassen, wenn (noch) kein Reverse-Proxy geplant ist." \
        "") || die "Abgebrochen."

    # Admin-Daten — auch im Standard-Modus immer abfragen
    while :; do
        WIZ_ADMIN_USER=$(wt_input "Admin-Username" \
            "Benutzername für den initialen Admin-Account.\n(2-32 Zeichen, beginnt mit Buchstabe)" \
            "$WIZ_ADMIN_USER") || die "Abgebrochen."
        valid_user "$WIZ_ADMIN_USER" && break
        wt_msgbox "Ungültiger Username" "Username muss 2-32 Zeichen lang sein und mit einem Buchstaben beginnen."
    done

    if [ -z "$WIZ_ADMIN_PASSWORD" ]; then
        while :; do
            WIZ_ADMIN_PASSWORD=$(wt_password "Admin-Passwort" \
                "Initiales Passwort für '$WIZ_ADMIN_USER' (mindestens 12 Zeichen).\nMuss beim ersten Login geändert werden.") || die "Abgebrochen."
            if [ "${#WIZ_ADMIN_PASSWORD}" -lt 12 ]; then
                wt_msgbox "Zu kurz" "Das Passwort muss mindestens 12 Zeichen lang sein."
                WIZ_ADMIN_PASSWORD=""
                continue
            fi
            local pw_confirm
            pw_confirm=$(wt_password "Passwort bestätigen" "Bitte das Passwort erneut eingeben.") || die "Abgebrochen."
            if [ "$WIZ_ADMIN_PASSWORD" != "$pw_confirm" ]; then
                wt_msgbox "Stimmt nicht überein" "Die beiden Eingaben unterscheiden sich. Bitte nochmal."
                WIZ_ADMIN_PASSWORD=""
                continue
            fi
            break
        done
    fi

    # Zusammenfassung + finale Bestätigung
    local proxy_line="Reverse-Proxy : (keine) — App nur per IP im LAN"
    if [ -n "$WIZ_REVERSE_PROXY_HOST" ]; then
        proxy_line="Reverse-Proxy : https://$WIZ_REVERSE_PROXY_HOST (zusätzlich zur direkten IP)"
    fi
    if ! wt_yesno "Bereit zur Installation" "Folgende Konfiguration wird verwendet:

  Repository    : $WIZ_REPO_URL
  Bind-Host     : $WIZ_BIND_HOST  (App immer per IP im LAN erreichbar)
  Bind-Port     : $WIZ_BIND_PORT
  Admin-User    : $WIZ_ADMIN_USER
  Backup-Zeit   : $WIZ_BACKUP_TIME (täglich)
  $proxy_line

App-Verzeichnis : $APP_DIR
Daten-Verzeichnis: $DATA_DIR

Jetzt installieren?"; then
        die "Abgebrochen."
    fi
}

cmd_install() {
    require_root

    banner
    ensure_whiptail
    install_wizard

    msg_info "Installation startet — das dauert je nach Hardware 3-8 Minuten."

    step "1/10  System-Pakete installieren"
    msg_run "apt update"
    apt-get update -qq
    ok "Paketlisten aktualisiert"
    msg_run "Pakete installieren (git, python3, sqlite3, …)"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
        ca-certificates curl git build-essential pkg-config sudo \
        sqlite3 locales \
        python3 python3-venv python3-dev >/dev/null
    ok "System-Pakete installiert"

    msg_run "Node.js ${NODE_MAJOR_REQUIRED}.x sicherstellen"
    ensure_node_lts

    step "2/10  Locale (de_DE.UTF-8) + Zeitzone (Europe/Berlin) setzen"
    sed -i 's/^# *de_DE.UTF-8/de_DE.UTF-8/' /etc/locale.gen
    locale-gen >/dev/null
    update-locale LANG=de_DE.UTF-8
    ensure_timezone Europe/Berlin
    ok "Locale + Zeitzone konfiguriert"

    step "3/10  App-Benutzer und Verzeichnisse"
    if ! id "$APP_USER" &>/dev/null; then
        useradd --system --create-home --home-dir "$APP_DIR" --shell /bin/bash "$APP_USER"
        ok "User '$APP_USER' angelegt"
    else
        ok "User '$APP_USER' existiert bereits"
    fi
    # Backups nicht world-readable: nur User+Group lesen Backup-Snapshots.
    install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$DATA_DIR"
    install -d -m 0700 -o "$APP_USER" -g "$APP_USER" "$BACKUP_DIR"
    ok "Verzeichnisse angelegt: $DATA_DIR (0750), $BACKUP_DIR (0700)"

    step "4/10  Konfiguration ($DATA_DIR/meters.env)"
    local env_file="$DATA_DIR/meters.env"
    # Defaults: App per IP im LAN sofort erreichbar (BIND_HOST=0.0.0.0).
    # Spätere HTTPS-only-Härtung via `zaehler.sh configure-network`.
    local cookie_secure_value="False"
    # Beim Install steht KEIN Proxy davor — die App ist direkt per IP (0.0.0.0)
    # erreichbar. Darum X-Forwarded-For NICHT vertrauen (sonst kann jeder
    # Client den Header fälschen → Rate-Limit-Bypass / Audit-Vergiftung). Auf
    # True schaltet erst `configure-network` bei einem echten Proxy (proxy-*).
    local trust_proxy_value="False"
    local allowed_origins_value=""
    if [ -n "$WIZ_REVERSE_PROXY_HOST" ]; then
        # Beide Origins erlauben: Direkt-IP + Reverse-Proxy-Domain.
        local container_ip
        container_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
        allowed_origins_value="https://$WIZ_REVERSE_PROXY_HOST"
        [ -n "$container_ip" ] && \
            allowed_origins_value="$allowed_origins_value,http://$container_ip:$WIZ_BIND_PORT"
    fi
    if [ ! -f "$env_file" ]; then
        install -m 0600 -o "$APP_USER" -g "$APP_USER" /dev/null "$env_file"
        local secret_key
        secret_key=$("$PYTHON_BIN" -c 'import secrets; print(secrets.token_urlsafe(48))')
        cat >> "$env_file" <<EOF
METERS_SECRET_KEY=$secret_key
METERS_DATABASE_URL=sqlite:///$DATA_DIR/meters.db
METERS_BIND_HOST=$WIZ_BIND_HOST
METERS_BIND_PORT=$WIZ_BIND_PORT
METERS_COOKIE_SECURE=$cookie_secure_value
METERS_TRUST_PROXY=$trust_proxy_value
METERS_PUBLIC_FACING=False
METERS_ALLOWED_ORIGINS=$allowed_origins_value
EOF
        ok "Konfiguration mit zufälligem SECRET_KEY angelegt (cookie_secure=$cookie_secure_value, trust_proxy=$trust_proxy_value)"
    else
        # Bestehende meters.env idempotent ergänzen, falls Schlüssel fehlen
        local appended=0
        if ! grep -q '^METERS_DATABASE_URL=' "$env_file"; then
            echo "METERS_DATABASE_URL=sqlite:///$DATA_DIR/meters.db" >> "$env_file"
            appended=1
        fi
        if ! grep -q '^METERS_TRUST_PROXY=' "$env_file"; then
            echo "METERS_TRUST_PROXY=$trust_proxy_value" >> "$env_file"
            appended=1
        fi
        if ! grep -q '^METERS_ALLOWED_ORIGINS=' "$env_file"; then
            echo "METERS_ALLOWED_ORIGINS=$allowed_origins_value" >> "$env_file"
            appended=1
        fi
        if [ "$appended" = "1" ]; then
            ok "fehlende Schlüssel in bestehender meters.env ergänzt"
        else
            ok "Konfiguration existiert bereits — unverändert"
        fi
    fi

    step "5/10  uv und pnpm installieren / aktualisieren"
    msg_run "uv und pnpm bereitstellen"
    # uv install.sh und pnpm self-update produzieren beim primären
    # Mirror gelegentlich 404-Output (Fallback-URL fängt das ab); das
    # ist kosmetisches Geräusch. Hier komplett still — Install-Erfolg
    # wird im nachfolgenden ok()-Output über `uv --version` /
    # `pnpm --version` verifiziert.
    as_user '
        export PATH="$HOME/.local/bin:$PATH"
        if ! command -v uv >/dev/null; then
            curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null 2>&1
        else
            uv self update >/dev/null 2>&1 || true
        fi
        if ! command -v pnpm >/dev/null; then
            npm install -g --prefix "$HOME/.local" pnpm@'"$PNPM_VERSION"' >/dev/null 2>&1
        else
            pnpm self-update >/dev/null 2>&1 || true
        fi
    '
    ok "uv $(as_user 'uv --version' 2>/dev/null | awk '{print $2}'), pnpm $(as_user 'pnpm --version' 2>/dev/null) bereit"

    step "6/10  Repository klonen / aktualisieren"
    if [ ! -d "$REPO_DIR/.git" ]; then
        msg_run "git clone $WIZ_REPO_URL"
        as_user "git clone --quiet '$WIZ_REPO_URL' '$REPO_DIR'"
        ok "Geklont nach $REPO_DIR"
    else
        msg_run "git pull --ff-only"
        as_user "git -C '$REPO_DIR' fetch --tags --quiet && git -C '$REPO_DIR' pull --ff-only --quiet"
        ok "Repository aktualisiert"
    fi
    as_user "ln -sfn '$REPO_DIR/backend'  '$APP_DIR/backend'"
    as_user "ln -sfn '$REPO_DIR/frontend' '$APP_DIR/frontend'"
    as_user "ln -sfn '$REPO_DIR/deploy'   '$APP_DIR/deploy'"

    step "7/10  Backend-Abhängigkeiten, Frontend-Build, Migrationen"
    msg_run "uv sync (Backend-Abhängigkeiten)"
    as_user "cd '$REPO_DIR/backend' && uv sync --frozen --quiet"
    ok "Backend-Abhängigkeiten installiert"
    msg_run "pnpm install + build (Frontend-Bundle, dauert am längsten)"
    as_user "cd '$REPO_DIR/frontend' && pnpm install --frozen-lockfile --silent && NODE_OPTIONS=--max-old-space-size=2048 pnpm build"
    ok "Frontend gebaut"
    msg_run "alembic upgrade head (Datenbank-Migrationen)"
    as_user "cd '$REPO_DIR/backend' && uv run alembic upgrade head"
    ok "Datenbank auf aktuellem Stand"

    step "8/10  systemd-Unit + sudo-Regel + CLI-Wrapper"
    install -m 0644 "$REPO_DIR/deploy/systemd/$SERVICE_NAME" \
        "/etc/systemd/system/$SERVICE_NAME"
    systemctl daemon-reload
    systemctl enable --now "$SERVICE_NAME" >/dev/null 2>&1
    ensure_sudo_rule
    ensure_cli_link
    ok "Service '$SERVICE_NAME' aktiv und beim Boot gestartet"

    step "9/10  Admin-Benutzer anlegen"
    cmd_install_admin

    step "10/10 Tägliches Backup (systemd-Timer)"
    cmd_install_backup_timer

    install_summary
}

# Legt einen Admin-User an, falls in der DB noch keiner existiert.
# Nimmt $WIZ_ADMIN_USER und $WIZ_ADMIN_PASSWORD aus dem Wizard.
cmd_install_admin() {
    local user_count
    user_count=$(as_user "cd '$REPO_DIR/backend' && uv run python -c 'from meters.db import SessionLocal; from meters.models import User; s=SessionLocal(); print(s.query(User).count()); s.close()' 2>/dev/null" || echo "")
    if [ "$user_count" != "0" ] && [ -n "$user_count" ]; then
        ok "Es existieren bereits $user_count Benutzer — Admin-Anlage übersprungen"
        return 0
    fi
    if [ -z "$WIZ_ADMIN_PASSWORD" ]; then
        warn "Kein Admin-Passwort gesetzt — Admin-Anlage übersprungen."
        warn "Lege später manuell an:"
        warn "  sudo -u $APP_USER -H bash -lc \"cd $REPO_DIR/backend && uv run python -m meters.cli create-admin --username admin --password '<pw>' --force-change\""
        return 0
    fi
    msg_run "create-admin '$WIZ_ADMIN_USER' (force-change beim ersten Login)"
    as_user "cd '$REPO_DIR/backend' && uv run python -m meters.cli create-admin --username '$WIZ_ADMIN_USER' --password '$WIZ_ADMIN_PASSWORD' --force-change"
    ok "Admin '$WIZ_ADMIN_USER' angelegt"
}

# Aktiviert einen täglichen Backup-Timer (systemd) — idempotent.
# Nimmt $WIZ_BACKUP_TIME aus dem Wizard (Format HH:MM).
cmd_install_backup_timer() {
    local svc=/etc/systemd/system/zaehler-backup.service
    local tmr=/etc/systemd/system/zaehler-backup.timer
    cat > "$svc" <<EOF
[Unit]
Description=Tägliches Backup der Zählerstand-Datenbank
After=$SERVICE_NAME

[Service]
Type=oneshot
User=$APP_USER
ExecStart=$REPO_DIR/deploy/lxc/backup.sh
EOF
    cat > "$tmr" <<EOF
[Unit]
Description=Tägliches Backup der Zählerstand-Datenbank um $WIZ_BACKUP_TIME

[Timer]
OnCalendar=$WIZ_BACKUP_TIME
Persistent=true

[Install]
WantedBy=timers.target
EOF
    systemctl daemon-reload
    systemctl enable --now zaehler-backup.timer >/dev/null 2>&1 || true
    ok "Backup-Timer aktiv (täglich $WIZ_BACKUP_TIME → $BACKUP_DIR)"
}

# Abschluss-Anzeige nach erfolgreicher Installation.
install_summary() {
    local container_ip
    container_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    container_ip="${container_ip:-<container-ip>}"
    local direct_url="http://$container_ip:$WIZ_BIND_PORT"
    local proxy_url=""
    [ -n "$WIZ_REVERSE_PROXY_HOST" ] && proxy_url="https://$WIZ_REVERSE_PROXY_HOST"

    printf '\n%s%s═══════════════════════════════════════════════════════════════%s\n' "$C_GRN" "$C_BOLD" "$C_RESET"
    printf '%s%s   Installation abgeschlossen.%s\n' "$C_GRN" "$C_BOLD" "$C_RESET"
    printf '%s%s═══════════════════════════════════════════════════════════════%s\n\n' "$C_GRN" "$C_BOLD" "$C_RESET"

    printf '  %sDirekt-IP:%s     %s\n' "$C_BOLD" "$C_RESET" "$direct_url"
    if [ -n "$proxy_url" ]; then
        printf '  %sReverse-Proxy:%s %s\n' "$C_BOLD" "$C_RESET" "$proxy_url"
        printf '  %s              %s%s(Proxy muss separat eingerichtet sein und auf %s zeigen)%s\n' \
            "$C_DIM" "" "" "$direct_url" "$C_RESET"
    fi
    printf '  %sAdmin:%s         %s  (Passwort beim ersten Login ändern)\n' "$C_BOLD" "$C_RESET" "$WIZ_ADMIN_USER"
    printf '  %sService:%s       systemctl status %s\n'  "$C_BOLD" "$C_RESET" "$SERVICE_NAME"
    printf '  %sLogs:%s          journalctl -u %s -f\n' "$C_BOLD" "$C_RESET" "$SERVICE_NAME"
    printf '  %sBackup:%s        täglich %s → %s\n'    "$C_BOLD" "$C_RESET" "$WIZ_BACKUP_TIME" "$BACKUP_DIR"
    printf '  %sUpdate:%s        sudo bash %s/deploy/lxc/zaehler.sh upgrade-all\n\n' "$C_BOLD" "$C_RESET" "$REPO_DIR"

    if is_interactive; then
        local proxy_box=""
        [ -n "$proxy_url" ] && proxy_box="\nReverse-Proxy:  $proxy_url\n  ↳ Proxy muss auf $direct_url zeigen"
        wt_msgbox "Fertig" "Installation abgeschlossen.

Direkt-IP   :  $direct_url$proxy_box

Admin-User  :  $WIZ_ADMIN_USER
Backup      :  täglich $WIZ_BACKUP_TIME

Nächste Schritte:
  1) Direkt-URL im Browser öffnen
  2) Mit Admin-Daten einloggen
  3) Beim Force-Change-Dialog neues Passwort setzen

Topologie später ändern (z. B. strikt HTTPS):
  sudo bash $REPO_DIR/deploy/lxc/zaehler.sh configure-network

Spätere Updates:
  sudo bash $REPO_DIR/deploy/lxc/zaehler.sh upgrade-all" || true
    fi
}

# -----------------------------------------------------------------------------
# upgrade-system — apt update + upgrade
# -----------------------------------------------------------------------------

cmd_upgrade_system() {
    require_root
    step "Paketlisten aktualisieren"
    apt-get update

    step "Sicherheits- und reguläre Updates installieren"
    DEBIAN_FRONTEND=noninteractive apt-get -y -o Dpkg::Options::=--force-confdef \
        -o Dpkg::Options::=--force-confold upgrade

    step "Verwaiste Pakete aufräumen"
    apt-get -y autoremove --purge
    apt-get -y autoclean

    if [ -f /var/run/reboot-required ]; then
        warn "Ein Neustart wird empfohlen — ein Kernel-Update wartet."
        warn "Nach Neustart läuft der Service automatisch wieder an."
        if [ -f /var/run/reboot-required.pkgs ]; then
            sed 's/^/  - /' /var/run/reboot-required.pkgs >&2
        fi
    fi

    ok "System-Update abgeschlossen"
}

# -----------------------------------------------------------------------------
# upgrade-tools — uv und pnpm auf neueste Version bringen
# -----------------------------------------------------------------------------

cmd_upgrade_tools() {
    require_root
    step "Tool-Chain aktualisieren (Node.js, uv, pnpm)"

    ensure_node_lts

    as_user '
        export PATH="$HOME/.local/bin:$PATH"
        echo "Vorher: uv $(uv --version 2>/dev/null || echo nicht installiert), pnpm $(pnpm --version 2>/dev/null || echo nicht installiert)"

        if command -v uv >/dev/null; then
            uv self update || true
        else
            curl -LsSf https://astral.sh/uv/install.sh | sh
        fi

        if command -v pnpm >/dev/null; then
            pnpm self-update || npm install -g --prefix "$HOME/.local" pnpm@'"$PNPM_VERSION"' || true
        else
            npm install -g --prefix "$HOME/.local" pnpm@'"$PNPM_VERSION"'
        fi

        echo "Nachher: uv $(uv --version), pnpm $(pnpm --version)"
    '

    ok "Tool-Update abgeschlossen"
}

# -----------------------------------------------------------------------------
# upgrade-app — Code-Update mit automatischem DB-Backup
# -----------------------------------------------------------------------------

cmd_upgrade_app() {
    [ -d "$REPO_DIR/.git" ] || die "Kein Repository unter $REPO_DIR — bitte erst 'install' ausführen."

    ensure_sudo_rule
    ensure_env_file

    # Frühe Vorbedingung: pnpm und vite verlangen Node >= 20. Wenn das
    # System noch auf einer älteren Version steht, würde der Build mit
    # Engine-Warning durchrasseln und teils kryptisch fehlschlagen.
    local node_major=0
    if command -v node >/dev/null 2>&1; then
        node_major=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')
        case "$node_major" in ''|*[!0-9]*) node_major=0 ;; esac
    fi
    if [ "$node_major" -lt "$NODE_MAJOR_REQUIRED" ] 2>/dev/null; then
        warn "Installierte Node-Version (v${node_major}) ist älter als ${NODE_MAJOR_REQUIRED}."
        warn "Bitte zuerst 'sudo $0 upgrade-tools' ausführen, dann 'upgrade-app' erneut."
        die "Abgebrochen — Frontend-Build würde sonst inkonsistent sein."
    fi

    step "1/8  Backup der Datenbank"
    "$REPO_DIR/deploy/lxc/backup.sh" || warn "Backup fehlgeschlagen — Update wird trotzdem fortgesetzt."

    step "2/8  Code aktualisieren (git fetch + reset)"
    # Idempotent: fetch + hard reset auf den gewünschten Branch (Default main).
    # Damit ist der Update-Pfad robust gegen lokal modifizierte Build-Artefakte
    # (z. B. backend/src/meters/static/ aus früheren Versionen, als das Bundle
    # noch im Repo lag). Persistente Daten liegen unter $DATA_DIR, nicht im Repo.
    local update_branch
    update_branch="$(as_user "git -C '$REPO_DIR' symbolic-ref --short -q HEAD" 2>/dev/null || echo main)"
    [ -n "$update_branch" ] || update_branch="main"
    as_user "cd '$REPO_DIR' && git fetch --tags --prune origin"
    as_user "cd '$REPO_DIR' && git reset --hard 'origin/$update_branch'"
    as_user "cd '$REPO_DIR' && git clean -fd -- backend/src/meters/static"

    step "3/8  Backend-Abhängigkeiten"
    as_user "cd '$REPO_DIR/backend' && uv sync --frozen"

    step "4/8  Frontend bauen"
    as_user "cd '$REPO_DIR/frontend' && pnpm install --frozen-lockfile && NODE_OPTIONS=--max-old-space-size=2048 pnpm build"

    step "5/8  Datenbank-Migrationen + Monats-Cache"
    as_user "cd '$REPO_DIR/backend' && uv run alembic upgrade head"
    # monthly_consumption ist ein materialisierter Cache (nur die Monats-Diagramme
    # lesen daraus). Migrationen legen die Tabelle leer an -> ohne Backfill bleiben
    # die Monats-Charts leer ("Keine Verbrauchsdaten"). recompute-monthly ist
    # idempotent (delete+reinsert je Register), also bei jedem Update sicher; hält
    # den Cache zugleich gegen Drift robust.
    as_user "cd '$REPO_DIR/backend' && uv run python -m meters.cli recompute-monthly"

    step "6/8  systemd-Unit synchronisieren (falls geändert) + CLI-Wrapper"
    local unit_src="$REPO_DIR/deploy/systemd/$SERVICE_NAME"
    local unit_dst="/etc/systemd/system/$SERVICE_NAME"
    if [ -f "$unit_src" ] && ! cmp -s "$unit_src" "$unit_dst" 2>/dev/null; then
        if [ "$(id -u)" -eq 0 ]; then
            install -m 0644 "$unit_src" "$unit_dst"
            systemctl daemon-reload
            ok "systemd-Unit aktualisiert"
        else
            warn "Die systemd-Unit hat sich geändert, aber wir laufen nicht als root."
            warn "Führe einmalig als root aus, damit die neue Unit aktiv wird:"
            warn "  sudo install -m 0644 $unit_src $unit_dst"
            warn "  sudo systemctl daemon-reload"
        fi
    else
        log "systemd-Unit unverändert"
    fi
    if [ "$(id -u)" -eq 0 ]; then
        ensure_cli_link
    fi

    step "7/8  Zeitzone sicherstellen (Europe/Berlin)"
    # Self-Healing: Bestands-Container, die vor dem TZ-Schritt aufgesetzt wurden,
    # konvergieren so beim Update auf Europe/Berlin. Idempotent (bereits gesetzt = No-op).
    ensure_timezone Europe/Berlin

    step "8/8  Service neu starten"
    if [ "$(id -u)" -eq 0 ]; then
        systemctl restart "$SERVICE_NAME"
    else
        sudo systemctl restart "$SERVICE_NAME"
    fi

    ok "App-Update abgeschlossen"
    systemctl --no-pager status "$SERVICE_NAME" | head -n 5 || true
}

# -----------------------------------------------------------------------------
# upgrade-all — alles in der richtigen Reihenfolge
# -----------------------------------------------------------------------------

cmd_upgrade_all() {
    require_root
    cmd_upgrade_system
    cmd_upgrade_tools
    cmd_upgrade_app
    ok "Vollständiges Update durchgeführt."
}

# -----------------------------------------------------------------------------
# backup — Datenbank-Snapshot
# -----------------------------------------------------------------------------

cmd_backup() {
    if [ "$(id -u)" -eq 0 ]; then
        as_user "$REPO_DIR/deploy/lxc/backup.sh"
    else
        "$REPO_DIR/deploy/lxc/backup.sh"
    fi
}

# -----------------------------------------------------------------------------
# restore — DB aus Backup wiederherstellen
# -----------------------------------------------------------------------------

cmd_restore() {
    require_root
    local archive="${1:-}"
    [ -n "$archive" ] || die "Pfad zum Backup-Archiv fehlt. Beispiel:
  sudo bash $0 restore $BACKUP_DIR/meters-20260502-033000.db.gz"
    [ -f "$archive" ] || die "Datei nicht gefunden: $archive"

    local db="$DATA_DIR/meters.db"
    local broken="$DATA_DIR/meters.db.broken-$(date +%Y%m%d-%H%M%S)"

    step "Service stoppen"
    systemctl stop "$SERVICE_NAME"

    step "Aktuelle DB beiseite legen → $broken"
    if [ -f "$db" ]; then
        mv "$db" "$broken"
        rm -f "$DATA_DIR/meters.db-shm" "$DATA_DIR/meters.db-wal" || true
    fi

    step "Backup einspielen"
    case "$archive" in
        *.gz) gunzip -c "$archive" > "$db" ;;
        *)    cp "$archive" "$db" ;;
    esac
    chown "$APP_USER:$APP_USER" "$db"

    step "Service wieder starten"
    systemctl start "$SERVICE_NAME"
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        ok "Wiederherstellung erfolgreich. Alte DB liegt zur Sicherheit unter $broken"
    else
        die "Service startet nicht — alte DB unter $broken kann zurückgespielt werden."
    fi
}

# -----------------------------------------------------------------------------
# status — Übersicht über System-, App- und Datenstand
# -----------------------------------------------------------------------------

cmd_status() {
    step "Service-Status"
    if systemctl list-units --type=service --no-pager | grep -q "$SERVICE_NAME"; then
        systemctl --no-pager status "$SERVICE_NAME" | head -n 8 || true
    else
        warn "Service $SERVICE_NAME ist nicht installiert."
    fi

    step "Software-Versionen"
    local distri="-"
    [ -r /etc/os-release ] && distri="$(. /etc/os-release && echo "${PRETTY_NAME:-$NAME}")"
    printf '  %-12s %s\n' "Kernel:"     "$(uname -r)"
    printf '  %-12s %s\n' "Distri:"     "$distri"
    printf '  %-12s %s\n' "Python:"     "$(command -v "$PYTHON_BIN" >/dev/null && "$PYTHON_BIN" --version 2>&1 || echo '-')"
    printf '  %-12s %s\n' "git:"        "$(git --version 2>&1 || echo '-')"
    printf '  %-12s %s\n' "sqlite3:"    "$(sqlite3 --version 2>&1 | awk '{print $1}' || echo '-')"
    if id "$APP_USER" &>/dev/null; then
        printf '  %-12s %s\n' "uv:"     "$(as_user 'uv --version' 2>&1 || echo '-')"
        printf '  %-12s %s\n' "pnpm:"   "$(as_user 'pnpm --version' 2>&1 || echo '-')"
        printf '  %-12s %s\n' "node:"   "$(node --version 2>&1 || echo '-')"
    fi

    step "App-Daten"
    local db="$DATA_DIR/meters.db"
    if [ -f "$db" ]; then
        local size; size=$(du -h "$db" | cut -f1)
        printf '  %-18s %s\n' "Datenbank:"     "$db ($size)"
        if command -v sqlite3 >/dev/null; then
            local readings users mig
            readings=$(sqlite3 "$db" 'SELECT COUNT(*) FROM reading' 2>/dev/null || echo '?')
            users=$(sqlite3 "$db" 'SELECT COUNT(*) FROM user' 2>/dev/null || echo '?')
            mig=$(sqlite3 "$db" 'SELECT version_num FROM alembic_version' 2>/dev/null || echo '?')
            printf '  %-18s %s\n' "Erfassungen:"  "$readings"
            printf '  %-18s %s\n' "Benutzer:"     "$users"
            printf '  %-18s %s\n' "DB-Migration:" "$mig"
        fi
    else
        warn "Keine Datenbank unter $db gefunden."
    fi
    if [ -d "$BACKUP_DIR" ]; then
        local last_backup count
        last_backup=$(ls -1t "$BACKUP_DIR"/meters-*.db.gz 2>/dev/null | head -1 || true)
        count=$(ls -1 "$BACKUP_DIR"/meters-*.db.gz 2>/dev/null | wc -l | tr -d ' ')
        printf '  %-18s %s\n' "Letztes Backup:" "${last_backup:-keines}"
        printf '  %-18s %s\n' "Backups gesamt:" "$count"
    fi

    if [ -d "$REPO_DIR/.git" ]; then
        step "Repository"
        local rev branch
        rev=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo '?')
        branch=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')
        printf '  %-18s %s\n' "Branch:"   "$branch"
        printf '  %-18s %s\n' "Revision:" "$rev"
        local behind
        behind=$(git -C "$REPO_DIR" rev-list --count "HEAD..@{u}" 2>/dev/null || echo '?')
        printf '  %-18s %s\n' "Hinten an Remote:" "$behind"
    fi
}

# -----------------------------------------------------------------------------
# configure-network — Topologie nachträglich umstellen ohne meters.env-Editieren
# -----------------------------------------------------------------------------

# Schreibt vier Schlüssel idempotent in meters.env: legt sie an, wenn sie
# fehlen, ersetzt vorhandene Werte, lässt alles andere in Ruhe.
_set_env_key() {
    local file="$1" key="$2" value="$3"
    if [ ! -f "$file" ]; then
        die "meters.env nicht gefunden: $file"
    fi
    if grep -q "^${key}=" "$file"; then
        # Sichere sed-Variante: | als Trennzeichen, weil Werte Slashes enthalten
        local escaped
        escaped=$(printf '%s' "$value" | sed -e 's/[\\&|]/\\&/g')
        sed -i "s|^${key}=.*|${key}=${escaped}|" "$file"
    else
        printf '%s=%s\n' "$key" "$value" >> "$file"
    fi
}

# Liest den aktuellen Wert eines Schlüssels aus meters.env (letzter Treffer
# gewinnt). Leerer Output, wenn der Schlüssel fehlt — der Caller setzt dann
# den Default für die Vorbelegung.
_get_env_value() {
    local file="$1" key="$2"
    [ -f "$file" ] || return 0
    # `|| true`: fehlt der Key, liefert grep Exit 1 — das wuerde unter dem
    # `set -euo pipefail` des Skripts (pipefail) die ganze Command-Substitution
    # scheitern lassen und `cmd_configure` STILL beenden (Menue erscheint nie).
    # So: leerer Output + Exit 0; der ${var:-default}-Fallback greift.
    grep -E "^${key}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d ' "' || true
}

cmd_configure_network() {
    require_root
    local env_file="$DATA_DIR/meters.env"
    [ -f "$env_file" ] || die "Konfiguration $env_file fehlt — bitte erst 'install' ausführen."

    ensure_whiptail
    local mode
    mode=$(wt_menu "Netzwerk-Topologie" \
        "Wie soll die App erreichbar sein?\n\nAlle Optionen schreiben die nötigen Werte direkt in meters.env und starten den Service neu — du musst keinen Editor öffnen." \
        "lan-only"     "Nur direkt im LAN per IP (Standard, HTTP)" \
        "proxy-other"  "HTTPS-Proxy + offene LAN-IP (nur LAN, nicht Internet)" \
        "proxy-same"   "Strikt HTTPS via Proxy auf gleichem Host (Internet)" \
        "proxy-external" "Internet via Proxy auf anderem Host (+ Firewall)" \
        "abort"        "Abbrechen") || die "Abgebrochen."
    [ "$mode" = "abort" ] && die "Abgebrochen."

    local container_ip
    container_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    local current_port
    current_port=$(grep -E '^METERS_BIND_PORT=' "$env_file" | cut -d= -f2 | tr -d ' "')
    [ -z "$current_port" ] && current_port=8000

    # trusted_proxy_ips/public_base_url werden in allen Modi gesetzt (auch leer),
    # damit ein Wechsel von proxy-external zurück keinen stale Wert hinterlässt.
    local bind_host cookie_secure trust_proxy public_facing origins=""
    local trusted_proxy_ips="" public_base_url=""
    case "$mode" in
        lan-only)
            # Kein Proxy → direkter IP-Zugriff, also XFF nicht vertrauen.
            bind_host="0.0.0.0"
            cookie_secure="False"
            trust_proxy="False"
            public_facing="False"
            origins=""
            ;;
        proxy-other)
            local proxy_domain
            proxy_domain=$(wt_input "Proxy-Domain" \
                "Hostname/Domain, unter der die App via HTTPS-Proxy erreichbar ist.\n\nHinweis: In diesem Modus bleibt die App ZUSAETZLICH direkt per HTTP-IP im LAN erreichbar — daher NICHT fuer echte Internet-Exposition geeignet. Fuer Internet 'proxy-same' oder 'proxy-external' waehlen." \
                "zaehler.lan") || die "Abgebrochen."
            bind_host="0.0.0.0"
            cookie_secure="False"
            trust_proxy="True"
            # Nicht public_facing: cookie_secure=False (Klartext-IP im LAN
            # weiter offen). Würde public_facing=True den Boot hart abbrechen.
            public_facing="False"
            origins="https://$proxy_domain"
            [ -n "$container_ip" ] && origins="$origins,http://$container_ip:$current_port"
            ;;
        proxy-same)
            local proxy_domain
            proxy_domain=$(wt_input "Proxy-Domain" \
                "Hostname/Domain, unter der die App via HTTPS-Proxy erreichbar ist:" \
                "zaehler.lan") || die "Abgebrochen."
            bind_host="127.0.0.1"
            cookie_secure="True"
            trust_proxy="True"
            # Internet-tauglich (Proxy auf gleichem Host) → public_facing
            # aktiviert den harten Boot-Guard (kein Klartext-Cookie online).
            public_facing="True"
            origins="https://$proxy_domain"
            public_base_url="https://$proxy_domain"
            ;;
        proxy-external)
            # Internet, Proxy auf ANDEREM Host. App muss auf 0.0.0.0 lauschen
            # (sonst kommt der externe Proxy nicht ran) → Direkt-Port bleibt im
            # Netz offen. Sicher nur mit Firewall (nur Proxy-IP auf :PORT) +
            # cookie_secure + XFF-Pinning auf die Proxy-IP.
            local proxy_domain proxy_ip
            proxy_domain=$(wt_input "Proxy-Domain" \
                "Öffentliche HTTPS-Domain, unter der die App über den Reverse-Proxy erreichbar ist (z. B. zaehler.example.com):" \
                "zaehler.example.com") || die "Abgebrochen."
            proxy_ip=$(wt_input "Proxy-Host-IP" \
                "IP-Adresse des Reverse-Proxy-Hosts. NUR dieser IP wird X-Forwarded-For geglaubt — schützt vor Header-Spoofing über den offenen App-Port." \
                "") || die "Abgebrochen."
            bind_host="0.0.0.0"
            cookie_secure="True"
            trust_proxy="True"
            public_facing="True"
            trusted_proxy_ips="$proxy_ip"
            origins="https://$proxy_domain"
            public_base_url="https://$proxy_domain"
            ;;
    esac

    msg_run "meters.env aktualisieren"
    _set_env_key "$env_file" "METERS_BIND_HOST" "$bind_host"
    _set_env_key "$env_file" "METERS_COOKIE_SECURE" "$cookie_secure"
    _set_env_key "$env_file" "METERS_TRUST_PROXY" "$trust_proxy"
    _set_env_key "$env_file" "METERS_PUBLIC_FACING" "$public_facing"
    _set_env_key "$env_file" "METERS_TRUSTED_PROXY_IPS" "$trusted_proxy_ips"
    _set_env_key "$env_file" "METERS_PUBLIC_BASE_URL" "$public_base_url"
    _set_env_key "$env_file" "METERS_ALLOWED_ORIGINS" "$origins"
    ok "BIND_HOST=$bind_host  COOKIE_SECURE=$cookie_secure  TRUST_PROXY=$trust_proxy  PUBLIC_FACING=$public_facing"
    [ -n "$origins" ] && ok "ALLOWED_ORIGINS=$origins"
    [ -n "$trusted_proxy_ips" ] && ok "TRUSTED_PROXY_IPS=$trusted_proxy_ips"
    [ -n "$public_base_url" ] && ok "PUBLIC_BASE_URL=$public_base_url"
    if [ "$mode" = "proxy-external" ]; then
        warn "WICHTIG (Firewall): Aus dem Internet darf NUR der Proxy (:443) erreichbar sein —"
        warn "  den App-Port :$current_port NIEMALS ins Internet forwarden. Idealerweise auf"
        warn "  diesem Container :$current_port nur fuer die Proxy-IP ($trusted_proxy_ips) zulassen."
    fi

    msg_run "Service neu starten"
    systemctl restart "$SERVICE_NAME"
    sleep 2

    msg_run "Erreichbarkeit testen"
    local probe_host="$bind_host"
    [ "$probe_host" = "0.0.0.0" ] && probe_host="$container_ip"
    if curl -sS -o /dev/null -w "" --max-time 3 "http://$probe_host:$current_port/api/v1/health"; then
        ok "App antwortet unter http://$probe_host:$current_port"
    else
        warn "App antwortet noch nicht unter http://$probe_host:$current_port — prüfe 'systemctl status $SERVICE_NAME'"
    fi

    if is_interactive; then
        local url_lines=""
        if [ -n "$container_ip" ]; then
            url_lines="• Direkt-IP   :  http://$container_ip:$current_port"
        fi
        local extra=""
        case "$mode" in
            proxy-other|proxy-same|proxy-external)
                local proxy_line
                proxy_line=$(grep -oE 'https://[^,]+' <<<"$origins" | head -1)
                url_lines="$url_lines\n• Reverse-Proxy:  $proxy_line"
                ;;
        esac
        if [ "$mode" = "proxy-external" ]; then
            extra="\n\nFIREWALL: aus dem Internet nur den Proxy (:443) erreichbar machen,\n:$current_port NIE forwarden — idealerweise nur die Proxy-IP zulassen."
        fi
        wt_msgbox "Netzwerk konfiguriert" "Topologie: $mode\n\n$url_lines$extra\n\nMit 'sudo bash $0 status' kannst du jederzeit den Service- und Bind-Status prüfen." || true
    fi
}

# -----------------------------------------------------------------------------
# configure — geführter meters.env-Editor (alle Werte, mit Kurz-Erklärung)
# -----------------------------------------------------------------------------

# Jeder _cfg_* gibt 0 zurück, wenn ein neuer Wert geschrieben wurde, sonst 1
# (Abbruch, ungültig oder unverändert) — der Aufrufer setzt darauf das
# changed-Flag.
_cfg_uint() {
    local file="$1" key="$2" cur="$3" min="$4" help="$5" val
    val=$(wt_input "$key" "$help\n\nGanze Zahl >= $min." "$cur") || return 1
    if ! valid_uint_min "$val" "$min"; then
        wt_msgbox "Ungültig" "'$val' ist keine ganze Zahl >= $min."
        return 1
    fi
    [ "$val" = "$cur" ] && return 1
    _set_env_key "$file" "$key" "$val"
    ok "$key=$val"
}

_cfg_bcrypt() {
    local file="$1" cur="$2" val
    val=$(wt_input "METERS_BCRYPT_ROUNDS" \
        "Rechenaufwand fürs Passwort-Hashing (bcrypt cost). Höher = sicherer, aber langsamer beim Login. Empfohlen: 12. Wirkt nur auf neue/geänderte Passwörter.\n\nWert zwischen 10 und 15." "$cur") || return 1
    if ! valid_uint_min "$val" 10 || [ "$val" -gt 15 ]; then
        wt_msgbox "Ungültig" "Bitte eine Zahl zwischen 10 und 15."
        return 1
    fi
    [ "$val" = "$cur" ] && return 1
    _set_env_key "$file" METERS_BCRYPT_ROUNDS "$val"
    ok "METERS_BCRYPT_ROUNDS=$val"
}

_cfg_photo() {
    local file="$1" cur_mb="$2" mb bytes
    mb=$(wt_input "Max. Foto-Upload (MB)" \
        "Maximale Größe einer hochgeladenen Foto-Datei in Megabyte (vor dem Reencode). Größere werden mit HTTP 413 abgelehnt.\n\nGanze Zahl >= 1." "$cur_mb") || return 1
    if ! valid_uint_min "$mb" 1; then
        wt_msgbox "Ungültig" "Bitte eine ganze Zahl >= 1 (MB)."
        return 1
    fi
    [ "$mb" = "$cur_mb" ] && return 1
    bytes=$(( mb * 1048576 ))
    _set_env_key "$file" METERS_PHOTO_MAX_UPLOAD_BYTES "$bytes"
    ok "METERS_PHOTO_MAX_UPLOAD_BYTES=$bytes (${mb} MB)"
}

_cfg_samesite() {
    local file="$1" cur="$2" val
    val=$(wt_menu "Cookie-SameSite" \
        "Steuert, wann der Browser das Session-Cookie mitsendet (CSRF-Schutz).\n\nstrict = maximal sicher; lax = lockerer, falls extern verlinkte Erfassungs-Links (?token=) zicken." \
        "strict" "Maximal sicher (Default)" \
        "lax"    "Lockerer (externe Links)") || return 1
    [ "$val" = "$cur" ] && return 1
    _set_env_key "$file" METERS_COOKIE_SAMESITE "$val"
    ok "METERS_COOKIE_SAMESITE=$val"
}

_cfg_2fa() {
    local file="$1" cur="$2" val
    val=$(wt_menu "Admin-2FA-Pflicht" \
        "Wenn aktiv, MUSS jeder Admin 2FA/TOTP einrichten und kann bis dahin nichts anderes tun. Empfohlen, sobald die App aus dem Internet erreichbar ist; im reinen LAN-Betrieb meist aus." \
        "False" "Aus - kein Zwang (Default)" \
        "True"  "An  - Admins muessen 2FA einrichten") || return 1
    [ "$val" = "$cur" ] && return 1
    _set_env_key "$file" METERS_REQUIRE_TOTP_FOR_ADMIN "$val"
    ok "METERS_REQUIRE_TOTP_FOR_ADMIN=$val"
}

_cfg_port() {
    local file="$1" cur="$2" val
    val=$(wt_input "App-Port" \
        "TCP-Port, auf dem die App lauscht. Achtung: ein vorhandener Reverse-Proxy muss danach auf denselben Port zeigen." "$cur") || return 1
    if ! valid_port "$val"; then
        wt_msgbox "Ungültig" "Bitte einen Port zwischen 1 und 65535."
        return 1
    fi
    [ "$val" = "$cur" ] && return 1
    _set_env_key "$file" METERS_BIND_PORT "$val"
    ok "METERS_BIND_PORT=$val"
}

_cfg_secret() {
    local file="$1" newkey
    wt_yesno "Secret-Key neu generieren?" \
        "Erzeugt einen neuen zufälligen METERS_SECRET_KEY.\n\nFOLGE: ALLE aktiven Sessions werden ungültig — jeder muss sich neu anmelden. 2FA/Backup-Codes bleiben gültig.\n\nFortfahren?" || return 1
    newkey=$("$PYTHON_BIN" -c 'import secrets; print(secrets.token_urlsafe(48))') \
        || { wt_msgbox "Fehler" "Konnte keinen Schlüssel erzeugen ($PYTHON_BIN fehlt?)."; return 1; }
    _set_env_key "$file" METERS_SECRET_KEY "$newkey"
    ok "METERS_SECRET_KEY neu gesetzt (Sessions werden beim Neustart ungültig)."
}

# Untermenüs (je <=6 Einträge) — nutzen das bewährte wt_menu (18 76 6), dieselbe
# Geometrie wie configure-network. Bei einer Änderung wird das (in cmd_configure
# lokale) CFG_CHANGED gesetzt. case-Arme set-e-sicher via `if … then … fi`.
_cfg_grp_auth() {
    local env_file="$1" sub v_session v_bcrypt v_2fa
    while :; do
        v_session=$(_get_env_value "$env_file" METERS_SESSION_LIFETIME_DAYS); v_session=${v_session:-30}
        v_bcrypt=$(_get_env_value "$env_file" METERS_BCRYPT_ROUNDS);          v_bcrypt=${v_bcrypt:-12}
        v_2fa=$(_get_env_value "$env_file" METERS_REQUIRE_TOTP_FOR_ADMIN);    v_2fa=${v_2fa:-False}
        sub=$(wt_menu "Login & Sicherheit" \
            "Einstellung wählen; '← Zurück' führt zum Hauptmenü." \
            "session" "Login-Gültigkeit (Tage) [aktuell: $v_session]" \
            "bcrypt"  "Passwort-Hash-Aufwand 10-15 [aktuell: $v_bcrypt]" \
            "2fa"     "Admin-2FA-Pflicht [aktuell: $v_2fa]" \
            "secret"  "Secret-Key neu generieren (meldet alle ab)" \
            "back"    "← Zurück") || break
        case "$sub" in
            session) if _cfg_uint "$env_file" METERS_SESSION_LIFETIME_DAYS "$v_session" 1 \
                        "Wie lange ein Login gültig bleibt (Sliding-Ablauf, in Tagen)."; then CFG_CHANGED=1; fi ;;
            bcrypt)  if _cfg_bcrypt "$env_file" "$v_bcrypt"; then CFG_CHANGED=1; fi ;;
            2fa)     if _cfg_2fa "$env_file" "$v_2fa"; then CFG_CHANGED=1; fi ;;
            secret)  if _cfg_secret "$env_file"; then CFG_CHANGED=1; fi ;;
            back)    break ;;
        esac
    done
    return 0
}

_cfg_grp_limit() {
    local env_file="$1" sub v_lmax v_lwin v_llock
    while :; do
        v_lmax=$(_get_env_value "$env_file" METERS_LOGIN_MAX_ATTEMPTS);     v_lmax=${v_lmax:-5}
        v_lwin=$(_get_env_value "$env_file" METERS_LOGIN_WINDOW_SECONDS);   v_lwin=${v_lwin:-60}
        v_llock=$(_get_env_value "$env_file" METERS_LOGIN_LOCKOUT_SECONDS); v_llock=${v_llock:-900}
        sub=$(wt_menu "Login-Rate-Limit" \
            "Einstellung wählen; '← Zurück' führt zum Hauptmenü." \
            "lmax"  "Fehlversuche bis Sperre [aktuell: $v_lmax]" \
            "lwin"  "Zähl-Zeitfenster (Sek.) [aktuell: $v_lwin]" \
            "llock" "Sperrdauer (Sek.) [aktuell: $v_llock]" \
            "back"  "← Zurück") || break
        case "$sub" in
            lmax)  if _cfg_uint "$env_file" METERS_LOGIN_MAX_ATTEMPTS "$v_lmax" 1 \
                      "Erlaubte Login-Fehlversuche je IP im Zeitfenster, bevor gesperrt wird."; then CFG_CHANGED=1; fi ;;
            lwin)  if _cfg_uint "$env_file" METERS_LOGIN_WINDOW_SECONDS "$v_lwin" 1 \
                      "Zeitfenster (Sekunden), über das die Login-Fehlversuche gezählt werden."; then CFG_CHANGED=1; fi ;;
            llock) if _cfg_uint "$env_file" METERS_LOGIN_LOCKOUT_SECONDS "$v_llock" 1 \
                      "Sperrdauer (Sekunden) nach zu vielen Fehlversuchen."; then CFG_CHANGED=1; fi ;;
            back)  break ;;
        esac
    done
    return 0
}

_cfg_grp_misc() {
    local env_file="$1" sub v_same v_photo v_port photo_mb
    while :; do
        v_same=$(_get_env_value "$env_file" METERS_COOKIE_SAMESITE);         v_same=${v_same:-strict}
        v_photo=$(_get_env_value "$env_file" METERS_PHOTO_MAX_UPLOAD_BYTES); v_photo=${v_photo:-20971520}
        v_port=$(_get_env_value "$env_file" METERS_BIND_PORT);              v_port=${v_port:-8000}
        if [[ "$v_photo" =~ ^[0-9]+$ ]]; then photo_mb=$(( v_photo / 1048576 )); else photo_mb="?"; fi
        sub=$(wt_menu "Cookie, Foto, Port" \
            "Einstellung wählen; '← Zurück' führt zum Hauptmenü." \
            "samesite" "Cookie-SameSite [aktuell: $v_same]" \
            "photo"    "Max. Foto-Upload (MB) [aktuell: $photo_mb]" \
            "port"     "App-Port [aktuell: $v_port]" \
            "back"     "← Zurück") || break
        case "$sub" in
            samesite) if _cfg_samesite "$env_file" "$v_same"; then CFG_CHANGED=1; fi ;;
            photo)    if _cfg_photo "$env_file" "$photo_mb"; then CFG_CHANGED=1; fi ;;
            port)     if _cfg_port "$env_file" "$v_port"; then CFG_CHANGED=1; fi ;;
            back)     break ;;
        esac
    done
    return 0
}

cmd_configure() {
    require_root
    local env_file="$DATA_DIR/meters.env"
    [ -f "$env_file" ] || die "Konfiguration $env_file fehlt — bitte erst 'install' ausführen."
    is_interactive || die "Dieses Kommando ist interaktiv (whiptail). Auf einem TTY ausführen — oder Werte direkt in $env_file setzen (Doku: README, Abschnitt Konfiguration)."
    ensure_whiptail

    # Kleine, gruppierte Menüs (je <=6 Einträge) über das bewährte wt_menu —
    # ein großes 13-Punkte-Menü rendert auf manchen whiptail/newt-Versionen nicht.
    local CFG_CHANGED=0 top
    while :; do
        top=$(wt_menu "Konfiguration — meters.env" \
            "Bereich wählen; am Ende 'Speichern' startet den Service neu." \
            "auth"    "Login & Sicherheit (Dauer, bcrypt, 2FA, Secret)" \
            "limit"   "Login-Rate-Limit (Versuche, Fenster, Sperre)" \
            "misc"    "Cookie, Foto-Upload, App-Port" \
            "network" "Netzwerk & HTTPS-Proxy (Topologie)" \
            "save"    "Speichern & Service neu starten" \
            "abort"   "Abbrechen") || break
        case "$top" in
            auth)    _cfg_grp_auth "$env_file" ;;
            limit)   _cfg_grp_limit "$env_file" ;;
            misc)    _cfg_grp_misc "$env_file" ;;
            network) cmd_configure_network; return ;;
            save)    break ;;
            abort)   ok "Abgebrochen — bereits geschriebene Werte sind erst nach einem Neustart aktiv."; return ;;
        esac
    done

    if [ "$CFG_CHANGED" = "1" ]; then
        msg_run "Service neu starten (Einstellungen werden beim Start gelesen)"
        systemctl restart "$SERVICE_NAME"
        sleep 2
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            ok "Service läuft mit der neuen Konfiguration."
        else
            warn "Service nicht aktiv — prüfe 'systemctl status $SERVICE_NAME' und 'journalctl -u $SERVICE_NAME -n 50'."
        fi
    else
        ok "Keine Änderungen vorgenommen."
    fi
}

# -----------------------------------------------------------------------------
# fix-database — DB aus inkonsistentem Zustand sauber zurücksetzen
# -----------------------------------------------------------------------------
#
# Repariert das klassische "alembic_version fehlt"-Problem (z. B. wenn ein
# alter create-admin-Aufruf via Base.metadata.create_all Tabellen ohne
# Migrations-Tracking erzeugt hat, und spätere Upgrades dann mit
# OperationalError: no such column abbrechen).
#
# Ablauf (interaktiv bestätigt, weil destruktiv):
#   1. Service stoppen
#   2. Aktuelle DB als meters.db.broken-<timestamp> beiseite legen
#   3. alembic upgrade head — erzeugt frische Tabellen mit allen Migrationen
#   4. Admin-Anlage geführt (gleicher Wizard wie install)
#   5. Service starten

cmd_fix_database() {
    require_root
    [ -d "$REPO_DIR/.git" ] || die "Kein Repository unter $REPO_DIR — bitte erst 'install' ausführen."

    ensure_whiptail
    ensure_env_file

    local db_file="$DATA_DIR/meters.db"
    local current_version="(keine alembic-Tabelle)"
    if [ -f "$db_file" ]; then
        current_version=$(sqlite3 "$db_file" 'SELECT version_num FROM alembic_version' 2>/dev/null || echo "(keine alembic-Tabelle)")
    fi

    if is_interactive; then
        if ! wt_yesno "Datenbank zurücksetzen" "Dieses Kommando setzt die Datenbank auf einen sauberen, frisch migrierten Zustand zurück.\n\nAktueller Stand:\n  Datei      : $db_file\n  Migration  : $current_version\n\nWAS PASSIERT:\n  • Aktuelle DB wird als meters.db.broken-<datum> beiseite gelegt (nicht gelöscht)\n  • Frische DB mit allen Migrationen wird angelegt\n  • Admin-User wird neu angelegt (du kannst danach einloggen und alles neu eintragen)\n\nALLE BISHERIGEN ERFASSUNGEN, MESSSTELLEN, STANDORTE GEHEN VERLOREN.\n\nWenn du sie behalten willst: jetzt ABBRECHEN und vorher ein zaehler.sh backup machen.\n\nFortfahren?"; then
            die "Abgebrochen."
        fi
    else
        die "fix-database braucht einen interaktiven TTY — bitte direkt im Container aufrufen."
    fi

    # Admin-Daten vorab abfragen (wie im install-Wizard)
    local admin_user="admin"
    [ -n "${ADMIN_USER:-}" ] && admin_user="$ADMIN_USER"
    while :; do
        admin_user=$(wt_input "Admin-Username" \
            "Username für den neuen Admin-Account." \
            "$admin_user") || die "Abgebrochen."
        valid_user "$admin_user" && break
        wt_msgbox "Ungültiger Username" "2-32 Zeichen, beginnt mit Buchstabe."
    done

    local admin_pw=""
    while :; do
        admin_pw=$(wt_password "Admin-Passwort" \
            "Initiales Passwort für '$admin_user' (mind. 12 Zeichen).\nMuss beim ersten Login geändert werden.") || die "Abgebrochen."
        if [ "${#admin_pw}" -lt 12 ]; then
            wt_msgbox "Zu kurz" "Mindestens 12 Zeichen."
            continue
        fi
        local pw_confirm
        pw_confirm=$(wt_password "Passwort bestätigen" "Bitte erneut eingeben.") || die "Abgebrochen."
        if [ "$admin_pw" != "$pw_confirm" ]; then
            wt_msgbox "Stimmt nicht überein" "Bitte nochmal."
            continue
        fi
        break
    done

    step "1/5  Service stoppen"
    systemctl stop "$SERVICE_NAME"

    step "2/5  Aktuelle DB beiseite legen"
    if [ -f "$db_file" ]; then
        local broken="$DATA_DIR/meters.db.broken-$(date +%Y%m%d-%H%M%S)"
        mv "$db_file" "$broken"
        rm -f "$DATA_DIR/meters.db-shm" "$DATA_DIR/meters.db-wal" || true
        ok "DB nach $broken verschoben (kann manuell wiederhergestellt werden)"
    else
        ok "Keine bestehende DB — direkt frisch anlegen"
    fi

    step "3/5  Frische Migration durchziehen (alembic upgrade head)"
    as_user "cd '$REPO_DIR/backend' && uv run alembic upgrade head"
    ok "Schema auf aktuellem Stand"

    step "4/5  Admin-Benutzer anlegen"
    as_user "cd '$REPO_DIR/backend' && uv run python -m meters.cli create-admin --username '$admin_user' --password '$admin_pw' --force-change"
    ok "Admin '$admin_user' angelegt — Passwort beim ersten Login zu ändern"

    step "5/5  Service starten"
    systemctl start "$SERVICE_NAME"
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        local container_ip
        container_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
        container_ip="${container_ip:-<container-ip>}"
        local port
        port=$(grep -E '^METERS_BIND_PORT=' "$DATA_DIR/meters.env" | cut -d= -f2 | tr -d ' ')
        port="${port:-8000}"
        ok "Datenbank repariert. App läuft unter http://$container_ip:$port"
    else
        die "Service startet nicht — prüfe 'journalctl -u $SERVICE_NAME -n 40'"
    fi
}

# -----------------------------------------------------------------------------
# rollback — App auf einen früheren Tag/Commit umschalten und neu bauen
# -----------------------------------------------------------------------------

cmd_rollback() {
    require_root
    local ref="${1:-}"
    [ -n "$ref" ] || die "Bitte Tag/Branch/Commit angeben. Beispiel:
  sudo bash $0 rollback v0.1.0
  sudo bash $0 rollback abc1234"
    [ -d "$REPO_DIR/.git" ] || die "Kein Repository unter $REPO_DIR — bitte erst 'install' ausführen."

    ensure_sudo_rule
    ensure_env_file

    step "0/6  Existenz von '$ref' prüfen"
    if ! as_user "git -C '$REPO_DIR' rev-parse --verify '$ref^{commit}' >/dev/null 2>&1"; then
        as_user "git -C '$REPO_DIR' fetch --all --tags --quiet"
        if ! as_user "git -C '$REPO_DIR' rev-parse --verify '$ref^{commit}' >/dev/null 2>&1"; then
            die "Tag/Commit '$ref' nicht gefunden — verfügbar: \
$(as_user "git -C '$REPO_DIR' tag" | tr '\n' ' ')"
        fi
    fi

    step "1/6  Backup der Datenbank"
    "$REPO_DIR/deploy/lxc/backup.sh" || warn "Backup fehlgeschlagen — Rollback wird trotzdem fortgesetzt."

    step "2/6  Auf '$ref' wechseln (detached HEAD)"
    as_user "git -C '$REPO_DIR' checkout --quiet '$ref'"

    step "3/6  Backend-Abhängigkeiten"
    as_user "cd '$REPO_DIR/backend' && uv sync --frozen --quiet"

    step "4/6  Frontend bauen"
    as_user "cd '$REPO_DIR/frontend' && pnpm install --frozen-lockfile --silent && NODE_OPTIONS=--max-old-space-size=2048 pnpm build"

    step "5/6  Datenbank prüfen"
    msg_info "Achtung: ein Rollback führt KEIN automatisches alembic downgrade aus."
    msg_info "Falls die alte Code-Version eine ältere Datenbank-Migration erwartet,"
    msg_info "musst du manuell entweder das passende Backup einspielen (sudo bash $0 restore …)"
    msg_info "oder die DB downgraden (cd $REPO_DIR/backend && uv run alembic downgrade <revision>)."

    step "6/6  Service neu starten"
    if [ "$(id -u)" -eq 0 ]; then
        systemctl restart "$SERVICE_NAME"
    else
        sudo systemctl restart "$SERVICE_NAME"
    fi
    ok "Auf '$ref' zurückgerollt. Mit 'sudo bash $0 upgrade-app' kommst du wieder auf den aktuellen main-Stand."
}

# -----------------------------------------------------------------------------
# audit — Dependency-Audit fürs Frontend (pnpm) und Backend (pip-audit)
# -----------------------------------------------------------------------------

cmd_audit() {
    [ -d "$REPO_DIR/.git" ] || die "Kein Repository unter $REPO_DIR — bitte erst 'install' ausführen."

    step "Frontend (pnpm audit --prod)"
    as_user "cd '$REPO_DIR/frontend' && pnpm audit --prod --audit-level=moderate" \
        || warn "pnpm meldet bekannte Schwachstellen — siehe Output oben"

    step "Backend (uv tool run pip-audit)"
    as_user "cd '$REPO_DIR/backend' && uv tool run pip-audit --strict" \
        || warn "pip-audit meldet Schwachstellen oder ist nicht erreichbar"

    ok "Audit abgeschlossen — bei kritischen Funden umgehend 'upgrade-app' / Dependencies aktualisieren."
}

# -----------------------------------------------------------------------------
# reset-password — Passwort eines Users (z. B. Admin) neu setzen
# -----------------------------------------------------------------------------

cmd_reset_password() {
    require_root
    [ -d "$REPO_DIR/.git" ] || die "Kein Repository unter $REPO_DIR — bitte erst 'install' ausführen."

    ensure_whiptail
    local user="${ADMIN_USER:-admin}"
    local pw="${ADMIN_PASSWORD:-}"

    if is_interactive; then
        while :; do
            user=$(wt_input "Passwort zurücksetzen" \
                "Username, dessen Passwort neu gesetzt werden soll." \
                "$user") || die "Abgebrochen."
            valid_user "$user" && break
            wt_msgbox "Ungültiger Username" "Username muss 2-32 Zeichen lang sein und mit einem Buchstaben beginnen."
        done
        if [ -z "$pw" ]; then
            while :; do
                pw=$(wt_password "Neues Passwort" \
                    "Neues Passwort für '$user' (mindestens 12 Zeichen).\nDer Benutzer muss es beim nächsten Login ändern.") || die "Abgebrochen."
                if [ "${#pw}" -lt 12 ]; then
                    wt_msgbox "Zu kurz" "Mindestens 12 Zeichen."
                    pw=""
                    continue
                fi
                local pw_confirm
                pw_confirm=$(wt_password "Passwort bestätigen" "Bitte erneut eingeben.") || die "Abgebrochen."
                if [ "$pw" != "$pw_confirm" ]; then
                    wt_msgbox "Stimmt nicht überein" "Die beiden Eingaben unterscheiden sich."
                    pw=""
                    continue
                fi
                break
            done
        fi
    else
        if [ -z "$pw" ]; then
            die "Non-interactive Modus — bitte ADMIN_USER und ADMIN_PASSWORD setzen.
  ADMIN_USER=admin ADMIN_PASSWORD='neues-pw-12-zeichen' sudo bash $0 reset-password"
        fi
    fi

    msg_run "reset-password '$user' (force-change beim nächsten Login)"
    as_user "cd '$REPO_DIR/backend' && uv run python -m meters.cli reset-password --username '$user' --password '$pw' --force-change"
    ok "Passwort für '$user' zurückgesetzt"
    if is_interactive; then
        wt_msgbox "Fertig" "Passwort für '$user' wurde gesetzt.\n\nBeim nächsten Login wird ein neues Passwort verlangt." || true
    fi
}

# -----------------------------------------------------------------------------
# help
# -----------------------------------------------------------------------------

cmd_help() {
    cat <<EOF
${C_BOLD}zaehler.sh — Verwaltungsskript für die Zählerstand-App${C_RESET}

  ${C_BOLD}Aufruf:${C_RESET}
    sudo bash $(basename "$0") <kommando> [optionen]

  ${C_BOLD}Installation und Update:${C_RESET}
    install              Erstinstallation oder kompletter Re-Bootstrap
                         (Pakete, User, uv, pnpm, Repo, Build, systemd)
    upgrade-system       Debian/Ubuntu-Pakete via apt aktualisieren
    upgrade-tools        uv und pnpm auf die neueste Version bringen
    upgrade-app          App-Code aktualisieren (mit DB-Backup; setzt die
                         Zeitzone idempotent mit)
    upgrade-all          upgrade-system → upgrade-tools → upgrade-app
    set-timezone [zone]  System-Zeitzone setzen (Default Europe/Berlin) —
                         betrifft nur Logs/Backups/Timer, nicht die App-Zeiten

  ${C_BOLD}Daten-Pflege:${C_RESET}
    backup               Sofort einen DB-Snapshot erzeugen
    restore <datei.gz>   Backup einspielen (stoppt Service, ersetzt DB,
                         startet Service neu)
    fix-database         DB komplett zurücksetzen, wenn alembic-Migrations-
                         Tracking kaputt ist (alte DB wird beiseite gelegt,
                         Admin neu anlegen, alles andere neu eintragen)
    rollback <ref>       Auf eine frühere Tag/Commit-Version zurückgehen
                         (Backup → checkout → build → restart)
    repair-midnight-readings [--apply]
                         00:00-Readings auf den Vortag 23:59:59 verschieben
                         (Perioden-Zuordnung). Default: Dry-Run; --apply
                         schreibt (sichert vorher automatisch).
    repair-legacy-timestamps [--apply]
                         Synthetische Readings mit naiv-UTC-Zeit korrigieren.
                         Default: Dry-Run; --apply schreibt (sichert vorher).
    recompute-monthly    Monats-Cache (monthly_consumption) neu berechnen —
                         Backfill für die Monats-Diagramme. Läuft bei
                         upgrade-app automatisch mit; idempotent.

  ${C_BOLD}Benutzer-Verwaltung:${C_RESET}
    reset-password       Passwort eines Users neu setzen (z. B. Admin
                         vergessen) — fragt User+Passwort interaktiv

  ${C_BOLD}Netzwerk / Sicherheit:${C_RESET}
    configure            Alle meters.env-Einstellungen geführt anpassen
                         (Session, Login-Limits, bcrypt, 2FA-Pflicht,
                         Foto-Limit, … — je mit kurzer Erklärung); startet
                         den Service danach neu
    configure-network    Netzwerk-Topologie nachträglich umstellen
                         (LAN-Only / HTTPS-Proxy auf anderem oder
                         gleichem Host) — schreibt meters.env automatisch
                         und startet den Service neu
    audit                Dependency-Audit (pnpm audit + pip-audit) —
                         meldet bekannte Schwachstellen in Front- und
                         Backend-Abhängigkeiten

  ${C_BOLD}Diagnose:${C_RESET}
    status               Übersicht: Service, Versionen, DB, Backups, Repo

  ${C_BOLD}Konfigurations-Variablen${C_RESET} (per Umgebung überschreibbar):
    REPO_URL             Git-Remote für 'install' (Pflicht beim ersten Mal)
    APP_USER             Default: zaehler
    APP_DIR              Default: /opt/zaehler
    REPO_DIR             Default: \$APP_DIR/repo
    DATA_DIR             Default: \$APP_DIR/data
    BACKUP_DIR           Default: \$APP_DIR/backups
    SERVICE_NAME         Default: zaehler.service
    PYTHON_BIN           Default: python3 (Distri-Default)
    PNPM_VERSION         Default: 11

  ${C_BOLD}Beispiele:${C_RESET}
    # Erstinstallation:
    REPO_URL=https://github.com/user/zaehler.git sudo bash $(basename "$0") install

    # Wöchentliches Komplett-Update aus dem Cron:
    sudo bash $(basename "$0") upgrade-all

    # Kurzer Status-Check:
    sudo bash $(basename "$0") status

    # Backup wiederherstellen:
    sudo bash $(basename "$0") restore /opt/zaehler/backups/meters-20260502-033000.db.gz
EOF
}

cmd_set_timezone() {
    require_root
    ensure_timezone "${1:-Europe/Berlin}"
    log "Hinweis: Betrifft nur Logs/Backups/Timer — App-Zeiten regeln METERS_TIMEZONE + Browser."
}

# Fuehrt ein meters.cli-Reparatur-Kommando robust aus: als App-User mit Login-
# Shell (uv im PATH) und gesourcter meters.env (richtige DATABASE_URL) — via
# as_user. Akzeptiert genau ein optionales --apply; bei --apply wird vorher
# automatisch ein DB-Backup gezogen.
_run_meters_repair() {
    require_root
    local sub="$1"
    local arg="${2:-}"
    [ -d "$REPO_DIR/.git" ] || die "Kein Repository unter $REPO_DIR — bitte erst 'install' ausführen."
    local extra=""
    if [ "$arg" = "--apply" ]; then
        extra="--apply"
    elif [ -n "$arg" ]; then
        die "Unbekanntes Argument '$arg' (nur --apply erlaubt)."
    fi
    if [ "$extra" = "--apply" ]; then
        "$REPO_DIR/deploy/lxc/backup.sh" || warn "Backup fehlgeschlagen — Reparatur wird trotzdem fortgesetzt."
    fi
    as_user "cd '$REPO_DIR/backend' && uv run python -m meters.cli $sub $extra"
}

cmd_repair_midnight_readings() {
    _run_meters_repair repair-midnight-readings "${1:-}"
}

cmd_repair_legacy_timestamps() {
    _run_meters_repair repair-legacy-timestamps "${1:-}"
}

# Backfill/Neuberechnung des materialisierten Monats-Caches (monthly_consumption).
# Idempotent — gefahrlos manuell auszufuehren, wenn die Monats-Diagramme leer
# sind (z. B. nach einem Restore). Beim regulaeren upgrade-app laeuft das ohnehin
# automatisch mit (Step 5/8).
cmd_recompute_monthly() {
    require_root
    [ -d "$REPO_DIR/.git" ] || die "Kein Repository unter $REPO_DIR — bitte erst 'install' ausführen."
    as_user "cd '$REPO_DIR/backend' && uv run python -m meters.cli recompute-monthly"
}

# -----------------------------------------------------------------------------
# Dispatcher
# -----------------------------------------------------------------------------

case "${1:-help}" in
    install)         cmd_install ;;
    upgrade-system)  cmd_upgrade_system ;;
    upgrade-tools)   cmd_upgrade_tools ;;
    upgrade-app)     cmd_upgrade_app ;;
    upgrade-all)     cmd_upgrade_all ;;
    set-timezone)    cmd_set_timezone "${2:-}" ;;
    backup)              cmd_backup ;;
    restore)             cmd_restore "${2:-}" ;;
    fix-database)        cmd_fix_database ;;
    rollback)            cmd_rollback "${2:-}" ;;
    repair-midnight-readings)  cmd_repair_midnight_readings "${2:-}" ;;
    repair-legacy-timestamps)  cmd_repair_legacy_timestamps "${2:-}" ;;
    recompute-monthly)         cmd_recompute_monthly ;;
    reset-password)      cmd_reset_password ;;
    configure)           cmd_configure ;;
    configure-network)   cmd_configure_network ;;
    audit)               cmd_audit ;;
    status)              cmd_status ;;
    help|-h|--help)  cmd_help ;;
    *)
        warn "Unbekanntes Kommando: ${1}"
        cmd_help
        exit 2
        ;;
esac
