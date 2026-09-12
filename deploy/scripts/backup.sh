#!/bin/bash
# Nach /opt/isopilot/backup.sh kopieren
set -euo pipefail

DIR=/var/backups/isopilot
STAMP=$(date +%F-%H%M)
OUT="$DIR/isopilot-$STAMP.dump"
: "${AGE_PUBKEY:?AGE_PUBKEY fehlt}"

mkdir -p "$DIR"
sudo -u postgres pg_dump -Fc isopilot > "$OUT"
age -r "$AGE_PUBKEY" "$OUT" > "$OUT.age"
rm "$OUT"

rclone copy "$OUT.age" "backup:isopilot/" || echo "WARNUNG: Kopie an den zweiten Ort fehlgeschlagen" >&2

find "$DIR" -name '*.age' -mtime +7 -delete
rclone delete "backup:isopilot/" --min-age 90d || true

echo "Sicherung: $OUT.age"
