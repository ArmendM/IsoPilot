#!/bin/bash
# Einmal pro Quartal ausführen. Ein ungetestetes Backup ist eine Vermutung.
set -euo pipefail

FILE="${1:?Verwendung: restore-test.sh <datei.dump.age>}"

age -d -i ~/.age/key.txt "$FILE" > /tmp/restore.dump
sudo -u postgres dropdb --if-exists isopilot_test
sudo -u postgres createdb isopilot_test
sudo -u postgres pg_restore -d isopilot_test /tmp/restore.dump

echo "Zeiteinträge:"
sudo -u postgres psql -t isopilot_test -c 'SELECT count(*) FROM "TimeEntry";'
echo "Letzter Eintrag:"
sudo -u postgres psql -t isopilot_test -c 'SELECT max("workDate") FROM "TimeEntry";'

sudo -u postgres dropdb isopilot_test
rm /tmp/restore.dump
echo "Wiederherstellung erfolgreich geprüft."
