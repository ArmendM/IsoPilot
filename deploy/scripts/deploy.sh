#!/bin/bash
# Nach /opt/isopilot/deploy.sh kopieren, chmod 750, Eigentümer root
set -euo pipefail

IMAGE="ghcr.io/armendm/isopilot:latest"

echo "[1/5] Sicherung vor der Migration"
/opt/isopilot/backup.sh

echo "[2/5] Neues Image holen"
podman pull "$IMAGE"

echo "[3/5] Migrationen einspielen"
podman run --rm --network=host --env-file /etc/isopilot/app.env \
  "$IMAGE" npx prisma migrate deploy

echo "[4/5] Dienst neu starten"
systemctl restart isopilot

echo "[5/5] Warten auf Gesundheitsprüfung"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "läuft"; exit 0
  fi
  sleep 2
done

echo "Start fehlgeschlagen. journalctl -u isopilot -n 100" >&2
exit 1
