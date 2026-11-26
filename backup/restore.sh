#!/bin/sh
# Restores a backup into a NEW database. It never writes over an existing database, so a mistake cannot
# destroy live data.
#
#   docker compose exec backup /backup/restore.sh /backups/stocksafe-20261127-020000.sql.gz.enc stocksafe_restored
#
# Then look at the restored data (for example with psql), and, to go live on it, point DATABASE_URL at the new
# database or rename databases while the app is stopped. See ADMIN_GUIDE.md.
set -eu

file="${1:-}"
target="${2:-}"
if [ -z "$file" ] || [ -z "$target" ]; then
  echo "usage: restore.sh <backup-file> <new-database-name>" >&2
  exit 2
fi
[ -f "$file" ] || { echo "no such file: $file" >&2; exit 2; }
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
case "$target" in
  *[!a-zA-Z0-9_]*|"") echo "the database name may only contain letters, digits and _" >&2; exit 2 ;;
esac

export PGPASSWORD="${POSTGRES_PASSWORD:-}"
host="${PGHOST:-db}"
user="${PGUSER:-stocksafe}"

exists="$(psql -h "$host" -U "$user" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$target'")"
if [ "$exists" = "1" ]; then
  echo "refusing: database \"$target\" already exists. Choose a new name." >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$file" > "$work/dump.sql.gz" \
  || { echo "could not decrypt: wrong BACKUP_PASSPHRASE, or the file is damaged" >&2; exit 1; }
gzip -t "$work/dump.sql.gz"
gunzip -c "$work/dump.sql.gz" > "$work/dump.sql"

createdb -h "$host" -U "$user" "$target"
psql -h "$host" -U "$user" -d "$target" -v ON_ERROR_STOP=1 -q -f "$work/dump.sql" > /dev/null
echo "restored into database \"$target\":"
psql -h "$host" -U "$user" -d "$target" -tAc "SELECT 'items: ' || count(*) FROM item UNION ALL SELECT 'batches: ' || count(*) FROM batch UNION ALL SELECT 'stock movements: ' || count(*) FROM stock_movement UNION ALL SELECT 'users: ' || count(*) FROM \"user\""
