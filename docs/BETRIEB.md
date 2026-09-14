# Betrieb

Server: Debian 13, ein VPS. Postgres nativ, App als Podman-Container
über Quadlet, nginx als Reverse Proxy.

## Ersteinrichtung

```bash
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
ln -s /etc/nginx/sites-available/cockpit.isoteam-suljejmani.ch.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Die Adresse hier ist der Empfänger der Ablaufwarnungen von Let's
# Encrypt, nicht die Firmenadresse aus dem Markenhandbuch. Sie bleibt
# bewusst auf dem Gmail-Konto, bis info@isoteam-suljejmani.ch wirklich
# gelesen wird: eine Warnung, die ins Leere geht, merkt man erst, wenn
# das Zertifikat abgelaufen ist.
certbot certonly --webroot -w /var/www/certbot -d cockpit.isoteam-suljejmani.ch \
  --email isoteam.daut@gmail.com --agree-tos --no-eff-email

printf '#!/bin/sh\nsystemctl reload nginx\n' \
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
```

## Erste Anmeldung, einmalig und wichtig

**Wer sich als Erster anmeldet, wird Vorgesetzter.** Ist die Benutzertabelle
leer, legt der Callback das Konto als `ADMIN` an und gibt es sofort frei.
Jede weitere Anmeldung landet gesperrt im Warteraum und muss von einem
Vorgesetzten freigegeben werden.

Die Reihenfolge ist deshalb kein Zufall, sondern ein Schritt der
Inbetriebnahme:

1. Auth-Anwendung im Infomaniak Manager prüfen, **bevor** die URL jemand
   bekommt: `./scripts/check-oidc.sh /etc/isopilot/app.env`. Erwartet wird
   `Weiterleitungs-URL: hinterlegt` und `invalid_grant`.
2. `npm run db:seed` auf dem Server. Legt Firma, Partner, Kategorien und
   Artikel an, aber bewusst keine Personen.
3. **Daut meldet sich als Erster an** und ist damit Vorgesetzter.
4. Erst danach bekommen Qail, Liridon und Islom die Adresse. Sie landen im
   Warteraum, Daut gibt sie frei und setzt die Rolle.

Geht Schritt 3 schief, weil sich jemand anders zuerst anmeldet, ist die
Rolle bei der falschen Person. Korrigieren lässt sich das dann nur über
`npm run db:studio` oder direkt in Postgres.

Prüfen, ob es geklappt hat:

```bash
psql -d isopilot -c 'SELECT name, role, "isActive" FROM "User";'
psql -d isopilot -c 'SELECT action, "createdAt" FROM "AuditLog" ORDER BY "createdAt";'
```

Erwartet wird eine Person mit `ADMIN` und `isActive = t`, und im Protokoll
`USER_BOOTSTRAP` gefolgt von `LOGIN_OIDC`.

## Alltag

| Aufgabe | Befehl |
|---|---|
| Status | `systemctl status isopilot` |
| Logs | `journalctl -u isopilot -f` |
| Neu ausrollen | `/opt/isopilot/deploy.sh` |
| Sicherung jetzt | `/opt/isopilot/backup.sh` |
| Wiederherstellung prüfen | `/opt/isopilot/restore-test.sh <datei>` |
| Postgres-Version wechseln | `pg_upgradecluster 17 main` |

## Quartalsweise

- Wiederherstellung einer Sicherung üben
- `certbot renew --dry-run`
- Plattenplatz prüfen, `podman system prune -af --filter "until=720h"`

## Jährlich

- Feiertagsliste des Kantons Luzern bestätigen
- Ferienansprüche prüfen
- Zugänge durchgehen, ausgetretene Personen deaktivieren
