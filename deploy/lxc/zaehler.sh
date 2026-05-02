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
C_YEL=$'\033[33m'; C_DIM=$'\033[2m'

log()    { printf '%s%s%s  %s\n' "$C_DIM" "$(date '+%H:%M:%S')" "$C_RESET" "$*"; }
step()   { printf '\n%s==> %s%s\n' "$C_BOLD" "$*" "$C_RESET"; }
ok()     { printf '%s✓%s %s\n' "$C_GRN" "$C_RESET" "$*"; }
warn()   { printf '%s⚠%s %s\n' "$C_YEL" "$C_RESET" "$*" >&2; }
die()    { printf '%s✗ FEHLER:%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

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

cmd_install() {
    require_root

    if [ "$REPO_URL" = "https://example.invalid/REPLACE-ME.git" ] && [ ! -d "$REPO_DIR/.git" ]; then
        die "Bitte REPO_URL setzen, z. B.:
  REPO_URL=https://github.com/user/zaehler.git sudo bash $0 install"
    fi

    step "1/8  System-Pakete installieren"
    apt-get update
    apt-get install -y --no-install-recommends \
        ca-certificates curl git build-essential pkg-config sudo \
        sqlite3 locales \
        python3 python3-venv python3-dev \
        nodejs npm

    step "2/8  Locale auf de_DE.UTF-8 setzen"
    sed -i 's/^# *de_DE.UTF-8/de_DE.UTF-8/' /etc/locale.gen
    locale-gen >/dev/null
    update-locale LANG=de_DE.UTF-8

    step "3/8  App-Benutzer und Verzeichnisse"
    if ! id "$APP_USER" &>/dev/null; then
        useradd --system --create-home --home-dir "$APP_DIR" --shell /bin/bash "$APP_USER"
        ok "User $APP_USER angelegt"
    fi
    install -d -o "$APP_USER" -g "$APP_USER" "$DATA_DIR"
    install -d -o "$APP_USER" -g "$APP_USER" "$BACKUP_DIR"

    step "4/8  Konfiguration ($DATA_DIR/meters.env)"
    local env_file="$DATA_DIR/meters.env"
    if [ ! -f "$env_file" ]; then
        install -m 0600 -o "$APP_USER" -g "$APP_USER" /dev/null "$env_file"
        "$PYTHON_BIN" - <<'PY' >> "$env_file"
import secrets
print(f"METERS_SECRET_KEY={secrets.token_urlsafe(48)}")
print("METERS_COOKIE_SECURE=False  # auf True setzen, sobald HTTPS davor steht")
PY
        ok "Konfiguration mit zufälligem SECRET_KEY angelegt"
    else
        log "Konfiguration existiert bereits — unverändert gelassen"
    fi

    step "5/8  uv und pnpm installieren / aktualisieren"
    as_user '
        export PATH="$HOME/.local/bin:$PATH"
        if ! command -v uv >/dev/null; then
            curl -LsSf https://astral.sh/uv/install.sh | sh
        else
            uv self update >/dev/null || true
        fi
        if ! command -v pnpm >/dev/null; then
            npm install -g --prefix "$HOME/.local" pnpm@'"$PNPM_VERSION"'
        else
            pnpm self-update >/dev/null || true
        fi
    '

    step "6/8  Repository klonen / aktualisieren"
    if [ ! -d "$REPO_DIR/.git" ]; then
        as_user "git clone '$REPO_URL' '$REPO_DIR'"
        ok "Geklont nach $REPO_DIR"
    else
        as_user "git -C '$REPO_DIR' fetch --tags && git -C '$REPO_DIR' pull --ff-only"
        ok "Repository aktualisiert"
    fi
    # Bequeme Symlinks (das systemd-Service nutzt sie)
    as_user "ln -sfn '$REPO_DIR/backend'  '$APP_DIR/backend'"
    as_user "ln -sfn '$REPO_DIR/frontend' '$APP_DIR/frontend'"
    as_user "ln -sfn '$REPO_DIR/deploy'   '$APP_DIR/deploy'"

    step "7/8  Backend-Abhängigkeiten, Frontend-Build, Migrationen"
    as_user "cd '$REPO_DIR/backend' && uv sync --frozen"
    as_user "cd '$REPO_DIR/frontend' && pnpm install --frozen-lockfile && pnpm build"
    as_user "cd '$REPO_DIR/backend' && uv run alembic upgrade head"

    step "8/8  systemd-Unit + sudo-Regel"
    install -m 0644 "$REPO_DIR/deploy/systemd/$SERVICE_NAME" \
        "/etc/systemd/system/$SERVICE_NAME"
    systemctl daemon-reload
    systemctl enable --now "$SERVICE_NAME"
    ensure_sudo_rule

    cat <<EOF

$(printf '%s%s%s' "$C_GRN$C_BOLD" "Installation abgeschlossen." "$C_RESET")

Status:
$(systemctl --no-pager status "$SERVICE_NAME" | head -n 5 || true)

Nächste Schritte:
  • Initialen Admin-Benutzer anlegen (passe das Passwort an):
      sudo -u $APP_USER -H bash -lc \\
        "cd $REPO_DIR/backend && uv run python -m meters.cli create-admin \\
         --username admin --password '<starkes-passwort>' --force-change"

  • Reverse-Proxy mit HTTPS davor schalten und in $env_file
    METERS_COOKIE_SECURE=True setzen, dann:
      sudo systemctl restart $SERVICE_NAME

  • Tägliches automatisches Backup einrichten (siehe deploy/lxc/README.md, §7).

EOF
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
    "$REPO_DIR/deploy/lxc/backup.sh"

    step "2/6  Code aktualisieren (git pull)"
    as_user "cd '$REPO_DIR' && git fetch --tags && git pull --ff-only"

    step "3/6  Backend-Abhängigkeiten"
    as_user "cd '$REPO_DIR/backend' && uv sync --frozen"

    step "4/6  Frontend bauen"
    as_user "cd '$REPO_DIR/frontend' && pnpm install --frozen-lockfile && pnpm build"

    step "5/6  Datenbank-Migrationen"
    as_user "cd '$REPO_DIR/backend' && uv run alembic upgrade head"

    step "6/6  Service neu starten"
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
