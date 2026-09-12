#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# IsoPilot — Dateien anlegen, Teil 1: Infrastruktur und Repo
#
#   chmod +x scaffold-1-infra.sh && ./scaffold-1-infra.sh
#
# Legt nur an, was noch nicht existiert. Bestehende Dateien bleiben
# unberührt, damit ein zweiter Lauf nichts überschreibt.
# ══════════════════════════════════════════════════════════════
set -euo pipefail

DOMAIN="cockpit.isoteam-suljejmani.ch"
GHREPO="armendm/isopilot"       # ghcr.io verlangt Kleinschreibung

w() { # w <pfad>  — Inhalt von stdin, nur wenn Datei fehlt
  if [ -e "$1" ]; then echo "  übersprungen (existiert): $1"; cat >/dev/null; return; fi
  mkdir -p "$(dirname "$1")"; cat > "$1"; echo "  angelegt: $1"
}

echo "IsoPilot Dateien anlegen, Domain: $DOMAIN"

# ──────────────────────────────────────────────────────────────
w .gitignore <<'EOF'
node_modules/
.next/
out/
build/
dist/

# Geheimnisse und echte Daten
.env
.env.*
!.env.example
secrets/
uploads/
backup/
*.dump
*.dump.age
*.sql

# Werkzeuge
.DS_Store
*.log
coverage/
.vscode/
!.vscode/extensions.json
EOF

# ──────────────────────────────────────────────────────────────
w .env.example <<'EOF'
# Datenbank (lokal: Postgres via Homebrew, Server: nativ auf dem Host)
DATABASE_URL="postgresql://isopilot:devpassword@localhost:5432/isopilot?schema=public"

APP_URL="http://localhost:3000"
TZ="Europe/Zurich"

# openssl rand -base64 32
SESSION_SECRET=""
TOTP_ENC_KEY=""
# openssl rand -base64 24
CRON_SECRET=""

# Infomaniak als IdP
# Manager → Cloud Computing → Auth → neue Anwendung
OIDC_ISSUER="https://login.infomaniak.com"
OIDC_CLIENT_ID=""
OIDC_CLIENT_SECRET=""
OIDC_REDIRECT_URI="http://localhost:3000/api/auth/callback"

# Mailversand über den Infomaniak Mail Service
SMTP_HOST="mail.infomaniak.com"
SMTP_PORT="587"
SMTP_USER="rechnung@isoteam-suljejmani.ch"
SMTP_PASS=""
MAIL_FROM="IsoTeam <rechnung@isoteam-suljejmani.ch>"
MAIL_REPLY_TO="isoteam.daut@gmail.com"

# Lokal stattdessen Mailpit:
# SMTP_HOST="localhost"
# SMTP_PORT="1025"

HOLIDAY_SUBDIVISION="CH-LU"
EOF

# ──────────────────────────────────────────────────────────────
w .github/workflows/ci.yml <<'EOF'
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports: ["5432:5432"]

    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/test
      SESSION_SECRET: ci-nur-zum-bauen
      TOTP_ENC_KEY: MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npx prisma validate
      - run: npx prisma migrate deploy
      - run: npx prisma generate
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test --if-present
      - run: npm run build
EOF

# ──────────────────────────────────────────────────────────────
w .github/workflows/deploy.yml <<'EOF'
name: Deploy

# Bewusst nicht bei jedem Push. Entweder von Hand oder über einen Tag.
on:
  workflow_dispatch:
  push:
    tags: ["v*"]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:${{ github.sha }}
            ghcr.io/${{ github.repository }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # Der Server holt das Image selbst. Die CI bekommt dadurch weder
      # Datenbankzugriff noch Rootrechte auf dem Server.
      - name: Auf dem Server ausrollen
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: sudo /opt/isopilot/deploy.sh
EOF

# ──────────────────────────────────────────────────────────────
w .github/dependabot.yml <<'EOF'
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
    groups:
      minor-und-patch:
        update-types: ["minor", "patch"]

  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: monthly }
EOF

# ──────────────────────────────────────────────────────────────
w Dockerfile <<'EOF'
# In next.config.ts nötig:  output: "standalone"

FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Zurich
RUN apk add --no-cache tzdata wget openssl && \
    addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
EOF

# ──────────────────────────────────────────────────────────────
# nginx: Zonen und Map gehören in den http-Kontext (conf.d)
# ──────────────────────────────────────────────────────────────
w deploy/nginx/conf.d/isopilot-limits.conf <<'EOF'
limit_req_zone  $binary_remote_addr zone=login:10m   rate=10r/m;
limit_req_zone  $binary_remote_addr zone=api:10m     rate=120r/m;
limit_req_zone  $binary_remote_addr zone=general:10m rate=600r/m;
limit_req_status 429;

limit_conn_zone $binary_remote_addr zone=perip:10m;

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
EOF

w deploy/nginx/snippets/proxy.conf <<'EOF'
proxy_http_version 1.1;
proxy_set_header   Connection        "";
proxy_set_header   Host              $host;
proxy_set_header   X-Real-IP         $remote_addr;
proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header   X-Forwarded-Proto $scheme;
proxy_set_header   X-Forwarded-Host  $host;

proxy_connect_timeout 5s;
proxy_send_timeout    60s;
proxy_read_timeout    60s;

proxy_set_header Upgrade    $http_upgrade;
proxy_set_header Connection $connection_upgrade;
EOF

w deploy/nginx/snippets/security-headers.conf <<'EOF'
# Achtung: add_header vererbt sich nicht in location-Blöcke, die selbst
# ein add_header enthalten. Deshalb dieses Snippet in jedem Block einbinden.
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options    "nosniff"                              always;
add_header X-Frame-Options           "DENY"                                 always;
add_header Referrer-Policy           "strict-origin-when-cross-origin"      always;
add_header Permissions-Policy        "geolocation=(), camera=(), microphone=()" always;

add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://login.infomaniak.com" always;
EOF

w deploy/nginx/snippets/tls.conf <<'EOF'
# Mozilla-Profil "intermediate"
ssl_protocols             TLSv1.2 TLSv1.3;
ssl_ciphers               ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_prefer_server_ciphers off;
ssl_session_timeout       1d;
ssl_session_cache         shared:SSL:10m;
ssl_session_tickets       off;
ssl_stapling              on;
ssl_stapling_verify       on;
resolver                  9.9.9.9 149.112.112.112 valid=300s;
resolver_timeout          5s;
EOF

w "deploy/nginx/sites-available/$DOMAIN.conf" <<EOF
upstream isopilot_app {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen      80;
    listen      [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen      443 ssl;
    listen      [::]:443 ssl;
    http2       on;
    server_name $DOMAIN;

    ssl_certificate         /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key     /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/$DOMAIN/chain.pem;
    include                 /etc/nginx/snippets/tls.conf;

    access_log /var/log/nginx/isopilot.access.log;
    error_log  /var/log/nginx/isopilot.error.log warn;

    client_max_body_size 2m;
    client_body_timeout  20s;
    limit_conn perip 20;
    server_tokens off;

    include /etc/nginx/snippets/security-headers.conf;

    # Anmeldung streng begrenzen
    location ^~ /api/auth/ {
        limit_req zone=login burst=5 nodelay;
        include /etc/nginx/snippets/security-headers.conf;
        include /etc/nginx/snippets/proxy.conf;
        proxy_pass http://isopilot_app;
    }

    # Cron nur vom Server selbst
    location ^~ /api/cron/ {
        allow 127.0.0.1; allow ::1; deny all;
        include /etc/nginx/snippets/proxy.conf;
        proxy_pass http://isopilot_app;
    }

    # Statische Dateien tragen einen Hash im Namen
    location /_next/static/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        include /etc/nginx/snippets/proxy.conf;
        proxy_pass http://isopilot_app;
    }

    location ^~ /api/ {
        limit_req zone=api burst=30 nodelay;
        include /etc/nginx/snippets/security-headers.conf;
        include /etc/nginx/snippets/proxy.conf;
        proxy_pass http://isopilot_app;
    }

    location / {
        limit_req zone=general burst=60 nodelay;
        include /etc/nginx/snippets/security-headers.conf;
        include /etc/nginx/snippets/proxy.conf;
        proxy_pass http://isopilot_app;
    }

    location ~ /\\. { deny all; }
}
EOF

# ──────────────────────────────────────────────────────────────
w deploy/systemd/isopilot.container <<EOF
# Quadlet, nach /etc/containers/systemd/ kopieren
# Danach: systemctl daemon-reload && systemctl start isopilot

[Unit]
Description=IsoPilot Anwendung
After=postgresql.service network-online.target
Wants=postgresql.service

[Container]
Image=ghcr.io/$GHREPO:latest
ContainerName=isopilot-app
Network=host
EnvironmentFile=/etc/isopilot/app.env
Volume=/var/lib/isopilot/uploads:/app/uploads:Z
HealthCmd=wget -qO- http://localhost:3000/api/health || exit 1
HealthInterval=30s
HealthRetries=3
AutoUpdate=registry
NoNewPrivileges=true
DropCapability=ALL

[Service]
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

w deploy/systemd/isopilot-backup.service <<'EOF'
[Unit]
Description=IsoPilot Datenbanksicherung

[Service]
Type=oneshot
ExecStart=/opt/isopilot/backup.sh
EOF

w deploy/systemd/isopilot-backup.timer <<'EOF'
[Unit]
Description=IsoPilot Sicherung täglich

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

w deploy/systemd/isopilot-cron.service <<'EOF'
[Unit]
Description=IsoPilot Hintergrundjobs

[Service]
Type=oneshot
EnvironmentFile=/etc/isopilot/app.env
ExecStart=/usr/bin/curl -fsS -X POST -H "x-cron-secret: ${CRON_SECRET}" http://127.0.0.1:3000/api/cron/retention
ExecStart=/usr/bin/curl -fsS -X POST -H "x-cron-secret: ${CRON_SECRET}" http://127.0.0.1:3000/api/cron/sessions
EOF

w deploy/systemd/isopilot-cron.timer <<'EOF'
[Unit]
Description=IsoPilot Hintergrundjobs täglich

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

# ──────────────────────────────────────────────────────────────
w deploy/scripts/deploy.sh <<EOF
#!/bin/bash
# Nach /opt/isopilot/deploy.sh kopieren, chmod 750, Eigentümer root
set -euo pipefail

IMAGE="ghcr.io/$GHREPO:latest"

echo "[1/5] Sicherung vor der Migration"
/opt/isopilot/backup.sh

echo "[2/5] Neues Image holen"
podman pull "\$IMAGE"

echo "[3/5] Migrationen einspielen"
podman run --rm --network=host --env-file /etc/isopilot/app.env \\
  "\$IMAGE" npx prisma migrate deploy

echo "[4/5] Dienst neu starten"
systemctl restart isopilot

echo "[5/5] Warten auf Gesundheitsprüfung"
for i in \$(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "läuft"; exit 0
  fi
  sleep 2
done

echo "Start fehlgeschlagen. journalctl -u isopilot -n 100" >&2
exit 1
EOF
chmod +x deploy/scripts/deploy.sh 2>/dev/null || true

w deploy/scripts/backup.sh <<'EOF'
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
EOF
chmod +x deploy/scripts/backup.sh 2>/dev/null || true

w deploy/scripts/restore-test.sh <<'EOF'
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
EOF
chmod +x deploy/scripts/restore-test.sh 2>/dev/null || true

# ──────────────────────────────────────────────────────────────
w docs/SETUP-MACOS.md <<'EOF'
# Lokale Entwicklung auf macOS

Postgres und Mailpit laufen nativ über Homebrew, kein Container nötig.

## Installation

```bash
brew install postgresql@17 mailpit
brew services start postgresql@17
brew services start mailpit

echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc
exec zsh
```

Mailpit-Oberfläche: http://localhost:8025

## Datenbank anlegen

```bash
psql postgres <<'SQL'
CREATE ROLE isopilot WITH LOGIN PASSWORD 'devpassword';
CREATE DATABASE isopilot OWNER isopilot;
ALTER ROLE isopilot CREATEDB;   -- Prisma braucht eine Shadow-Datenbank
SQL
```

## Loslegen

```bash
cp .env.example .env        # Werte eintragen
npx prisma migrate dev --name init
npm run dev
open http://localhost:3000/api/health     # {"ok":true}
```

## Stolpersteine

| Meldung | Ursache |
|---|---|
| `psql: command not found` | PATH-Zeile fehlt |
| `role isopilot does not exist` | noch in der eigenen Datenbank, `psql postgres` |
| `P3014 shadow database` | `ALTER ROLE isopilot CREATEDB;` fehlt |
| Port 5432 belegt | altes Postgres läuft, `lsof -i :5432` |

Zeitzonen: immer `date-fns-tz` mit `Europe/Zurich`, nie blankes `new Date()`.
EOF

# ──────────────────────────────────────────────────────────────
w docs/BETRIEB.md <<EOF
# Betrieb

Server: Debian 13, ein VPS. Postgres nativ, App als Podman-Container
über Quadlet, nginx als Reverse Proxy.

## Ersteinrichtung

\`\`\`bash
apt install postgresql nginx certbot podman age rclone curl
mkdir -p /var/www/certbot /etc/isopilot /var/lib/isopilot/uploads /opt/isopilot

# Datenbank
sudo -u postgres psql -c "CREATE ROLE isopilot WITH LOGIN PASSWORD 'STARKES_PASSWORT';"
sudo -u postgres psql -c "CREATE DATABASE isopilot OWNER isopilot;"

# postgresql.conf: listen_addresses = 'localhost', shared_buffers = 512MB,
# effective_cache_size = 2GB, work_mem = 16MB, timezone = 'Europe/Zurich'
# pg_hba.conf: nur local und 127.0.0.1, scram-sha-256

# nginx
cp deploy/nginx/conf.d/*.conf      /etc/nginx/conf.d/
cp deploy/nginx/snippets/*.conf    /etc/nginx/snippets/
cp deploy/nginx/sites-available/*  /etc/nginx/sites-available/
ln -s /etc/nginx/sites-available/$DOMAIN.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

certbot certonly --webroot -w /var/www/certbot -d $DOMAIN \\
  --email isoteam.daut@gmail.com --agree-tos --no-eff-email

printf '#!/bin/sh\\nsystemctl reload nginx\\n' \\
  > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
nginx -t && systemctl reload nginx

# Anwendung
cp deploy/systemd/isopilot.container /etc/containers/systemd/
cp deploy/systemd/isopilot-*.service /etc/systemd/system/
cp deploy/systemd/isopilot-*.timer   /etc/systemd/system/
cp deploy/scripts/*.sh /opt/isopilot/ && chmod 750 /opt/isopilot/*.sh
# /etc/isopilot/app.env mit den produktiven Werten befüllen, chmod 600

systemctl daemon-reload
systemctl enable --now isopilot isopilot-backup.timer isopilot-cron.timer

# Firewall
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
\`\`\`

## Alltag

| Aufgabe | Befehl |
|---|---|
| Status | \`systemctl status isopilot\` |
| Logs | \`journalctl -u isopilot -f\` |
| Neu ausrollen | \`/opt/isopilot/deploy.sh\` |
| Sicherung jetzt | \`/opt/isopilot/backup.sh\` |
| Wiederherstellung prüfen | \`/opt/isopilot/restore-test.sh <datei>\` |
| Postgres-Version wechseln | \`pg_upgradecluster 17 main\` |

## Quartalsweise

- Wiederherstellung einer Sicherung üben
- \`certbot renew --dry-run\`
- Plattenplatz prüfen, \`podman system prune -af --filter "until=720h"\`

## Jährlich

- Feiertagsliste des Kantons Luzern bestätigen
- Ferienansprüche prüfen
- Zugänge durchgehen, ausgetretene Personen deaktivieren
EOF

# ──────────────────────────────────────────────────────────────
echo
echo "Fertig. Als Nächstes:"
echo "  1. GHREPO und die Domain im Skript prüfen"
echo "  2. cp .env.example .env und Werte eintragen"
echo "  3. Teil 2 für den Anwendungscode ausführen"
