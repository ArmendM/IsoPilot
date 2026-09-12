# Lokale Entwicklung auf macOS

Postgres und Mailpit laufen nativ über Homebrew, kein Container nötig.

## Installation

```bash
brew install node postgresql@17 mailpit
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
npm install
npm run db:migrate   # legt die Tabellen an und erzeugt den Client
npm run db:seed      # Firma, vier Personen, zwei Partner, 29 Artikel
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
| `/login?e=token` nach der Anmeldung | Zugangsdaten oder Client-Typ, `./scripts/check-oidc.sh` |
| `/login?e=unknown` | Konto ist nicht in der Benutzertabelle, `npm run db:seed` |

Zeitzonen: immer `date-fns-tz` mit `Europe/Zurich`, nie blankes `new Date()`.
