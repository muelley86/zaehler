#!/usr/bin/env bash
# =============================================================================
#  install.sh — Ein-Zeilen-Bootstrap für die Zählerstand-App im LXC-Container.
#
#  Aufruf (im frischen Debian-13-Container, als root):
#
#      bash -c "$(curl -fsSL https://raw.githubusercontent.com/muelley86/zaehler/main/deploy/lxc/install.sh)"
#
#  Was passiert:
#    1. Minimale Pakete (curl, git, sudo, whiptail) installieren.
#    2. System-User 'zaehler' anlegen (idempotent).
#    3. Repository nach /opt/zaehler/repo klonen.
#    4. deploy/lxc/zaehler.sh install starten — dort läuft der whiptail-
#       Wizard mit allen Eingaben (App-Admin, Bind-Host, Backup-Zeit, …).
#
#  Konfiguration via Umgebungsvariable, falls nicht-default:
#      REPO_URL=https://github.com/<fork>/zaehler.git \
#        bash -c "$(curl -fsSL <bootstrap-url>)"
# =============================================================================

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/muelley86/zaehler.git}"
APP_USER="${APP_USER:-zaehler}"
APP_DIR="${APP_DIR:-/opt/zaehler}"
REPO_DIR="$APP_DIR/repo"

C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_RED=$'\033[31m'
C_CYA=$'\033[36m';  C_GRN=$'\033[32m'

die() { printf '%s✗ FEHLER:%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }
say() { printf '%s▸%s %s\n' "$C_CYA" "$C_RESET" "$*"; }
ok()  { printf '%s✓%s %s\n' "$C_GRN" "$C_RESET" "$*"; }

[ "$(id -u)" -eq 0 ] || die "Bitte als root ausführen — z. B. innerhalb des Containers per 'pct enter'."

clear 2>/dev/null || true
printf '%s%s\n' "$C_CYA$C_BOLD" '
  ╔══════════════════════════════════════════════════════════════╗
  ║            Z Ä H L E R S T A N D - A P P                     ║
  ║         One-Line-Bootstrap · LXC-Installer                   ║
  ╚══════════════════════════════════════════════════════════════╝
'
printf '%s' "$C_RESET"

say "Mindest-Pakete installieren (curl, git, sudo, whiptail)"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
    ca-certificates curl git sudo whiptail >/dev/null
ok "Mindest-Pakete bereit"

say "App-Benutzer '$APP_USER' anlegen (falls nötig)"
if ! id "$APP_USER" &>/dev/null; then
    useradd --system --create-home --home-dir "$APP_DIR" --shell /bin/bash "$APP_USER"
    ok "User '$APP_USER' angelegt (Home: $APP_DIR)"
else
    ok "User '$APP_USER' existiert bereits"
fi

say "Repository nach $REPO_DIR klonen"
if [ ! -d "$REPO_DIR/.git" ]; then
    sudo -u "$APP_USER" git clone --quiet "$REPO_URL" "$REPO_DIR"
    ok "Geklont von $REPO_URL"
else
    sudo -u "$APP_USER" git -C "$REPO_DIR" fetch --tags --quiet
    sudo -u "$APP_USER" git -C "$REPO_DIR" pull --ff-only --quiet
    ok "Repository aktualisiert"
fi

say "Wizard-gestützte Installation startet …"
exec bash "$REPO_DIR/deploy/lxc/zaehler.sh" install
