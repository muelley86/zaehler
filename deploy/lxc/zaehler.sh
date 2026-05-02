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
#      backup             SQLite-Datenbank sofort sichern
#      restore <datei>    DB aus Backup wiederherstellen
#      status             Übersicht: Service, Versionen, DB-Größe, letztes Backup
#      help               Befehlsreferenz
#
#  Die Erstinstallation muss als root laufen — alle weiteren Kommandos können
#  als root aufgerufen werden; Operationen, die als App-User ausgeführt werden
#  sollen, wickelt das Skript intern via sudo ab.
# =============================================================================

set -euo pipefail

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
PNPM_VERSION="${PNPM_VERSION:-9}"

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

# Führt einen Befehl als App-User aus, mit ge-source-tem Profil (PATH ~/.local/bin).
as_user() {
    sudo -u "$APP_USER" -H bash -lc "$*"
}

# Prüft, ob ein Befehl im PATH des Users 'zaehler' verfügbar ist.
user_has() {
    sudo -u "$APP_USER" -H bash -lc "command -v $1 >/dev/null 2>&1"
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

# Heuristik: kann der Wizard interaktive Dialoge zeigen?
is_interactive() { [ -t 0 ] && [ -t 1 ] && have_whiptail; }

# Validatoren — geben 0 zurück wenn ok, sonst eine kurze Fehlermeldung auf stdout.
valid_port() { [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1 ] && [ "$1" -le 65535 ]; }
valid_time() { [[ "$1" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; }
valid_user() { [[ "$1" =~ ^[a-zA-Z][a-zA-Z0-9_-]{1,31}$ ]]; }

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

    # REPO_URL — immer pflichtig falls noch kein Repo da
    if [ -z "$WIZ_REPO_URL" ]; then
        while :; do
            WIZ_REPO_URL=$(wt_input "Git-Repository" \
                "URL des Git-Repos, das die App enthält.\n\nBeispiele:\n  https://github.com/user/zaehler.git\n  git@github.com:user/zaehler.git" \
                "https://github.com/user/zaehler.git") || die "Abgebrochen."
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
    if ! wt_yesno "Bereit zur Installation" "Folgende Konfiguration wird verwendet:

  Repository    : $WIZ_REPO_URL
  Bind-Host     : $WIZ_BIND_HOST
  Bind-Port     : $WIZ_BIND_PORT
  Admin-User    : $WIZ_ADMIN_USER
  Backup-Zeit   : $WIZ_BACKUP_TIME (täglich)

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
    msg_run "Pakete installieren (git, python3, nodejs, sqlite3, …)"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
        ca-certificates curl git build-essential pkg-config sudo \
        sqlite3 locales \
        python3 python3-venv python3-dev \
        nodejs npm >/dev/null
    ok "System-Pakete installiert"

    step "2/10  Locale auf de_DE.UTF-8 setzen"
    sed -i 's/^# *de_DE.UTF-8/de_DE.UTF-8/' /etc/locale.gen
    locale-gen >/dev/null
    update-locale LANG=de_DE.UTF-8
    ok "Locale konfiguriert"

    step "3/10  App-Benutzer und Verzeichnisse"
    if ! id "$APP_USER" &>/dev/null; then
        useradd --system --create-home --home-dir "$APP_DIR" --shell /bin/bash "$APP_USER"
        ok "User '$APP_USER' angelegt"
    else
        ok "User '$APP_USER' existiert bereits"
    fi
    install -d -o "$APP_USER" -g "$APP_USER" "$DATA_DIR"
    install -d -o "$APP_USER" -g "$APP_USER" "$BACKUP_DIR"
    ok "Verzeichnisse angelegt: $DATA_DIR, $BACKUP_DIR"

    step "4/10  Konfiguration ($DATA_DIR/meters.env)"
    local env_file="$DATA_DIR/meters.env"
    if [ ! -f "$env_file" ]; then
        install -m 0600 -o "$APP_USER" -g "$APP_USER" /dev/null "$env_file"
        local secret_key
        secret_key=$("$PYTHON_BIN" -c 'import secrets; print(secrets.token_urlsafe(48))')
        cat >> "$env_file" <<EOF
METERS_SECRET_KEY=$secret_key
METERS_BIND_HOST=$WIZ_BIND_HOST
METERS_BIND_PORT=$WIZ_BIND_PORT
METERS_COOKIE_SECURE=False
EOF
        ok "Konfiguration mit zufälligem SECRET_KEY angelegt"
    else
        ok "Konfiguration existiert bereits — unverändert"
    fi

    step "5/10  uv und pnpm installieren / aktualisieren"
    msg_run "uv und pnpm bereitstellen"
    as_user '
        export PATH="$HOME/.local/bin:$PATH"
        if ! command -v uv >/dev/null; then
            curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null
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

    step "8/10  systemd-Unit + sudo-Regel"
    install -m 0644 "$REPO_DIR/deploy/systemd/$SERVICE_NAME" \
        "/etc/systemd/system/$SERVICE_NAME"
    systemctl daemon-reload
    systemctl enable --now "$SERVICE_NAME" >/dev/null 2>&1
    ensure_sudo_rule
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
    local url="http://$container_ip:$WIZ_BIND_PORT"

    printf '\n%s%s═══════════════════════════════════════════════════════════════%s\n' "$C_GRN" "$C_BOLD" "$C_RESET"
    printf '%s%s   Installation abgeschlossen.%s\n' "$C_GRN" "$C_BOLD" "$C_RESET"
    printf '%s%s═══════════════════════════════════════════════════════════════%s\n\n' "$C_GRN" "$C_BOLD" "$C_RESET"

    printf '  %sApp-URL:%s    %s\n' "$C_BOLD" "$C_RESET" "$url"
    printf '  %sAdmin:%s      %s  (Passwort wird beim ersten Login geändert)\n' "$C_BOLD" "$C_RESET" "$WIZ_ADMIN_USER"
    printf '  %sService:%s    systemctl status %s\n'  "$C_BOLD" "$C_RESET" "$SERVICE_NAME"
    printf '  %sLogs:%s       journalctl -u %s -f\n' "$C_BOLD" "$C_RESET" "$SERVICE_NAME"
    printf '  %sBackup:%s     täglich %s → %s\n'    "$C_BOLD" "$C_RESET" "$WIZ_BACKUP_TIME" "$BACKUP_DIR"
    printf '  %sUpdate:%s     sudo bash %s/deploy/lxc/zaehler.sh upgrade-all\n\n' "$C_BOLD" "$C_RESET" "$REPO_DIR"

    if is_interactive; then
        wt_msgbox "Fertig" "Installation abgeschlossen.

App-URL    :  $url
Admin-User :  $WIZ_ADMIN_USER
Backup     :  täglich $WIZ_BACKUP_TIME

Nächste Schritte:
  1) URL im Browser öffnen
  2) Mit Admin-Daten einloggen
  3) Beim Force-Change-Dialog neues Passwort setzen

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
    step "Tool-Chain aktualisieren (uv, pnpm)"

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

    step "1/6  Backup der Datenbank"
    "$REPO_DIR/deploy/lxc/backup.sh" || warn "Backup fehlgeschlagen — Update wird trotzdem fortgesetzt."

    step "2/6  Code aktualisieren (git pull)"
    as_user "cd '$REPO_DIR' && git fetch --tags && git pull --ff-only"

    step "3/6  Backend-Abhängigkeiten"
    as_user "cd '$REPO_DIR/backend' && uv sync --frozen"

    step "4/6  Frontend bauen"
    as_user "cd '$REPO_DIR/frontend' && pnpm install --frozen-lockfile && NODE_OPTIONS=--max-old-space-size=2048 pnpm build"

    step "5/7  Datenbank-Migrationen"
    as_user "cd '$REPO_DIR/backend' && uv run alembic upgrade head"

    step "6/7  systemd-Unit synchronisieren (falls geändert)"
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

    step "7/7  Service neu starten"
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
    upgrade-app          App-Code aktualisieren (mit DB-Backup)
    upgrade-all          upgrade-system → upgrade-tools → upgrade-app

  ${C_BOLD}Daten-Pflege:${C_RESET}
    backup               Sofort einen DB-Snapshot erzeugen
    restore <datei.gz>   Backup einspielen (stoppt Service, ersetzt DB,
                         startet Service neu)

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
    PNPM_VERSION         Default: 9

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

# -----------------------------------------------------------------------------
# Dispatcher
# -----------------------------------------------------------------------------

case "${1:-help}" in
    install)         cmd_install ;;
    upgrade-system)  cmd_upgrade_system ;;
    upgrade-tools)   cmd_upgrade_tools ;;
    upgrade-app)     cmd_upgrade_app ;;
    upgrade-all)     cmd_upgrade_all ;;
    backup)          cmd_backup ;;
    restore)         cmd_restore "${2:-}" ;;
    status)          cmd_status ;;
    help|-h|--help)  cmd_help ;;
    *)
        warn "Unbekanntes Kommando: ${1}"
        cmd_help
        exit 2
        ;;
esac
