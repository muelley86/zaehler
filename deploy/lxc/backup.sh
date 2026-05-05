#!/usr/bin/env bash
# Konsistentes Backup der Zählerstand-Datenbank.
#
# Nutzt den ".backup"-Befehl von SQLite, der einen Snapshot zieht, ohne
# laufende Schreibvorgänge zu blockieren — dadurch können Backups laufen,
# während die App weiterhin Lese- und Schreibzugriffe verarbeitet.
#
# Aufruf:
#   ./backup.sh                     # einzelnes Backup nach /opt/zaehler/backups
#   BACKUP_DIR=/anderswo ./backup.sh
#   KEEP=14 ./backup.sh             # nur die letzten 14 behalten

set -euo pipefail

# Backup-Files dürfen nur vom Owner gelesen werden — sie enthalten
# bcrypt-Hashes und (Klartext-)TOTP-Secrets. Default-umask 022 würde
# 0644 erzeugen → world-readable.
umask 0077

DB_FILE="${DB_FILE:-/opt/zaehler/data/meters.db}"
BACKUP_DIR="${BACKUP_DIR:-/opt/zaehler/backups}"
KEEP="${KEEP:-30}"

if [ ! -f "$DB_FILE" ]; then
    echo "Keine Datenbank unter $DB_FILE — Backup übersprungen (Container vermutlich frisch installiert)." >&2
    exit 0
fi

mkdir -p "$BACKUP_DIR"

stamp="$(date +%Y%m%d-%H%M%S)"
target="$BACKUP_DIR/meters-$stamp.db"

# Konsistenter Snapshot via .backup (SQLite kümmert sich um WAL-Synchronisation)
sqlite3 "$DB_FILE" ".backup '$target'"

# Direkt komprimieren — spart auf Dauer einiges an Plattenplatz
gzip "$target"
# umask greift bei `gzip` nicht in allen Setups; explizit absichern.
chmod 0600 "${target}.gz"
echo "Backup erstellt: ${target}.gz"

# Aufräumen: alte Backups nach Anzahl behalten
find "$BACKUP_DIR" -maxdepth 1 -name 'meters-*.db.gz' -type f -printf '%T@ %p\n' \
    | sort -nr \
    | tail -n +"$((KEEP + 1))" \
    | awk '{ $1=""; sub(/^ /, ""); print }' \
    | while read -r old; do
        echo "Lösche altes Backup: $old"
        rm -f -- "$old"
      done
