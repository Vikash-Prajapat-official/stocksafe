#!/bin/sh
# One encrypted backup of the StockSafe database.
#   stocksafe-YYYYmmdd-HHMMSS.sql.gz.enc  (pg_dump, gzip, AES-256-CBC with PBKDF2, key from BACKUP_PASSPHRASE)
# The file is checked (it must decrypt and unzip cleanly) before it is kept, and files older than
# BACKUP_KEEP_DAYS (default 14) are deleted. Plain-text data only ever exists in a temporary folder inside
# this container, which is removed when the script ends.
set -eu

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
dir="${BACKUP_DIR:-/backups}"
keep="${BACKUP_KEEP_DAYS:-14}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"
host="${PGHOST:-db}"
user="${PGUSER:-stocksafe}"
name="${PGDATABASE:-stocksafe}"
ITER=200000

mkdir -p "$dir"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

stamp="$(date +%Y%m%d-%H%M%S)"
final="$dir/stocksafe-$stamp.sql.gz.enc"
part="$final.partial"

echo "[backup $(date '+%F %T')] dumping $name from $host"
pg_dump -h "$host" -U "$user" -d "$name" --no-owner --no-privileges > "$work/dump.sql"
[ -s "$work/dump.sql" ] || { echo "backup FAILED: the dump is empty" >&2; exit 1; }
gzip -9 < "$work/dump.sql" > "$work/dump.sql.gz"
openssl enc -aes-256-cbc -pbkdf2 -iter "$ITER" -salt -pass env:BACKUP_PASSPHRASE -in "$work/dump.sql.gz" -out "$part"

# prove the file can be opened again before keeping it
openssl enc -d -aes-256-cbc -pbkdf2 -iter "$ITER" -pass env:BACKUP_PASSPHRASE -in "$part" > "$work/check.gz"
gzip -t "$work/check.gz"
mv "$part" "$final"
chmod 600 "$final"

# delete old backups (and any half-written leftovers)
find "$dir" -name 'stocksafe-*.sql.gz.enc' -mtime +"$keep" -delete
find "$dir" -name 'stocksafe-*.partial' -mmin +60 -delete

size="$(wc -c < "$final" | tr -d ' ')"
echo "[backup $(date '+%F %T')] OK $(basename "$final") ($size bytes), keeping $keep days"
