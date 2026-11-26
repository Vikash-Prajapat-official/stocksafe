#!/bin/sh
# The backup container: one backup shortly after it starts (so a fresh install is protected straight away),
# then one every night at BACKUP_HOUR (default 02:00 India time). It refuses to start without a passphrase.
set -eu

pass="${BACKUP_PASSPHRASE:-}"
if [ "${#pass}" -lt 12 ]; then
  echo "BACKUP_PASSPHRASE is missing or shorter than 12 characters. Set a strong passphrase in .env and keep a copy somewhere safe." >&2
  exit 1
fi

hour="${BACKUP_HOUR:-2}"
case "$hour" in *[!0-9]*|"") echo "BACKUP_HOUR must be a number from 0 to 23" >&2; exit 1 ;; esac
[ "$hour" -le 23 ] || { echo "BACKUP_HOUR must be a number from 0 to 23" >&2; exit 1; }

run() { /backup/backup.sh || echo "[backup $(date '+%F %T')] FAILED, will try again at the next scheduled time" >&2; }

echo "[backup] started: first backup in 45 seconds, then daily at ${hour}:00 ($TZ), keeping ${BACKUP_KEEP_DAYS:-14} days"
sleep 45
run

while true; do
  # seconds until the next HH:00 (busybox sh has no 10# arithmetic, so strip leading zeros first)
  h="$(date +%H | sed 's/^0//')"; m="$(date +%M | sed 's/^0//')"; s="$(date +%S | sed 's/^0//')"
  now=$(( ${h:-0} * 3600 + ${m:-0} * 60 + ${s:-0} ))
  wait=$(( hour * 3600 - now ))
  [ "$wait" -le 60 ] && wait=$(( wait + 86400 ))
  sleep "$wait"
  run
done
