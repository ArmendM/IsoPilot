# IsoPilot

**Stunden, Material, Ausmass. Alles auf einer Baustelle.**

Betriebssoftware für die Isoteam Suljejmani GmbH. Zeiterfassung, Absenzen,
Baustellen mit Soll-Ist, Materialkatalog mit Lager, VSI-Ausmasstarife,
Auswertungen als Excel und PDF.

## Kontext

**Firma:** Isoteam Suljejmani GmbH, Gerliswilstrasse 68, 6020 Emmenbrücke,
MwSt. CHE-190.604.537. Isolation von Lüftungs- und Heizungsleitungen,
Brandschutz.

**Nutzende:** vier Personen, alle mit Infomaniak-Konto.

| Person | Rolle |
|---|---|
| Daut | Admin / Vorgesetzter |
| Qail | Admin / Vorgesetzter |
| Liridon | Mitarbeitender |
| Islom | Mitarbeitender |

**Auftraggeber:** Flüma Klima AG (Industriestrasse 8, 6030 Ebikon),
Air Five AG (Parkstrasse 1a, 6214 Schenkon).

**Sprache:** Schweizer Hochdeutsch in der gesamten Oberfläche.

## Stack

- Next.js App Router, TypeScript, Tailwind
- Prisma 7, PostgreSQL 17 **nativ installiert, nicht im Container**.
  Seit Prisma 7 steht die Verbindung in `prisma.config.ts`, nicht im Schema,
  und die Anwendung verbindet über den pg-Adapter in `src/lib/db.ts`.
- Podman rootless, Quadlet als systemd-Unit, nur für die App
- nginx als Reverse Proxy mit certbot
- Ein VPS, Debian 13, 2 vCPU, 4 GB RAM
- Erreichbar unter `cockpit.isoteam-suljejmani.ch`, eine Subdomain der
  Firmendomain. Eine eigene Domain gibt es nicht.
- Lokal auf macOS: Postgres und Mailpit über Homebrew

## Anmeldung

**Infomaniak als IdP über OIDC**, Authorization Code mit PKCE.
Alle vier Personen haben ein Infomaniak-Konto, der zweite Faktor liegt dort.

**Der IdP besitzt die Identität, IsoPilot nur die Berechtigung.**
Mailadressen werden in IsoPilot nicht gepflegt. Es gibt kein `email`-Feld an
`User`, nur `oidcSub` als Schlüssel und `oidcEmail` als nachgeführte Anzeige.
Name und Adresse kommen bei jeder Anmeldung aus dem Token.

- Die erste Anmeldung legt das Konto an, aber **gesperrt** (`isActive`).
  Ein Vorgesetzter gibt frei und setzt die Rolle, vorher sieht die Person
  nur einen Hinweis. In IsoPilot wird also ausschliesslich die Rolle
  vergeben: Mitarbeitender oder Vorgesetzter.
- **Bootstrap:** ist die Benutzertabelle leer, wird die erste Anmeldung
  automatisch Vorgesetzter und ist frei. Sonst könnte niemand freigeben.
- Wer überhaupt bis zur Anmeldung kommt, entscheidet der IdP. Deshalb ist
  im Infomaniak Manager "Zugriff auf Nutzer meiner Organisation
  beschränken" gesetzt.
- Rollen stehen in unserer Datenbank, nicht beim IdP. Der `groups`-Claim
  wird bewusst nicht ausgewertet.
- Ein lokales Notfallkonto mit Passwort und TOTP bleibt bestehen
  (`isBreakGlass`), falls der IdP ausfällt

**Infomaniak Auth gibt einen öffentlichen Client aus, es gibt kein Client
Secret.** Getestet mit den Typen "Web Front-End" und "Anwendung", beide
Male dasselbe: eine Anfrage an den Token-Endpunkt ohne jede
Client-Authentisierung wird akzeptiert (`invalid_grant` statt
`invalid_client`). Deshalb schickt der Callback kein `client_secret`, und
`.env` kennt die Variable nicht.

Der Schutz ruht damit auf drei Dingen: PKCE mit S256, die beim IdP
hinterlegte Weiterleitungs-URL, und der Verifier, der in einem
httpOnly-Cookie liegt und den Server nie verlässt. Zusätzlich prüft
`verifyIdToken` Issuer, Audience und Nonce.

Geprüft wird das ohne Browser mit `./scripts/check-oidc.sh`:
`invalid_grant` heisst Zugangsdaten in Ordnung, `invalid_client` heisst
Client-ID falsch oder es wird unnötig ein Secret mitgeschickt.

Bestätigt: Issuer ist `https://login.infomaniak.com`, die Endpunkte kommen
aus der Discovery, ein `end_session_endpoint` gibt es dort nicht, der
Logout wirkt also nur bei uns. Der IdP liefert die Claims `sub`, `email`,
`email_verified`, `name` und `groups`.

## Fachliche Regeln

**Arbeitszeit**
- Erfassung ist manuell, die Stempeluhr ist die Ausnahme
- Mehrere Einträge pro Person und Tag erlaubt (zwei Baustellen am selben Tag)
- Überschneidungen werden serverseitig verhindert
- Pause standardmässig **0 Minuten**, Auswertungen rechnen mit Nettostunden
- Baustelle ist ein **freiwilliges** Feld, Werkstatt- und Bürotage gibt es

**Ferien und Absenzen**
- Ferienanspruch pro Person, standardmässig 25 Tage
- Arbeitstage ohne Wochenenden und Feiertage
- Feiertage Kanton Luzern aus der OpenHolidays API, nächtlicher Job,
  Fallback auf lokale Berechnung, bestätigte Einträge werden nie überschrieben

**Monatsabschluss**
- Vorgesetzte sperren einen Monat, danach keine Änderungen mehr
- Gilt auch für Vorgesetzte selbst, sonst ist die Sperre wertlos
- Sperren und Öffnen landen mit Name und Datum im Protokoll

**Baustellen**
- Objektname optional, Adresse mit Hausnummer und PLZ sind Pflicht
- Soll-Stunden pro Baustelle, Ist ergibt sich aus den Nettostunden
- Status: offen, pausiert, abgeschlossen
- Abgeschlossene verschwinden aus der Auswahl, bleiben in Auswertungen

**Material**
- Katalog mit Artikelnummer, Kategorie, Einheit, Preis, Lager, Mindestbestand
- Kategorien sind verwaltbar, Umbenennen wirkt auf alle Artikel
- Excel-Import: Abgleich über Artikelnummer, sonst Kategorie plus Name,
  sonst Name. **Nie Duplikate anlegen, nur aktualisieren.**
- Buchung auf eine Baustelle reduziert den Lagerbestand
- Preise werden bei der Buchung eingefroren, ein Preisimport ändert
  abgeschlossene Baustellen nicht rückwirkend

**VSI-Ausmasstarife**
- Zwei Listen: Synthetischer Kautschuk (6, 9, 13, 19, 25, 32 mm) und
  PIR-Hartschaum mit Hart-PVC (20, 30, 40, 50, 60, 80 mm)
- Preis je Nennweite DN 10 bis DN 300 und Position
- **Objektrabatt standardmässig 0 %**, pro Baustelle und pro Erfassung anpassbar
- VSI-Buchungen berühren den Lagerbestand nicht
- Offen: Bei 80 mm PIR sind nur neun Werte vorhanden, aktuell rechtsbündig
  ab DN 50 zugeordnet. Gegen das Original prüfen.

## Sichtbarkeit und Berechtigungen

- Mitarbeitende sehen nur ihre eigenen Zeiten, Absenzen und Buchungen
- Vorgesetzte sehen alle, **einschliesslich der jeweils anderen vorgesetzten
  Person**. Daut sieht Qails Zeiten und umgekehrt.
- Der Kalender mit Ferien und Feiertagen ist für alle sichtbar,
  das ist Planungsgrundlage
- Jede Berechtigungsprüfung gehört serverseitig in die Server Action

## Auswertungen

Zwei getrennte Bereiche, nicht vermischen:

**Auswertung Mitarbeitende**
- Eine Person auf einmal, ausgewählt aus einer Liste. **Nicht alle gleichzeitig.**
- Vorgesetzte sind ebenfalls auswählbar
- Zeitraum: Monat, Jahr oder freie Zeitspanne
- Inhalt: Arbeitstage, Nettostunden, Pausen, Ferientage, Krankheitstage,
  wahlweise mit Einzelpositionen

**Auswertung Baustellen**
- Eine Baustelle auf einmal oder alle als Übersicht
- Inhalt: Soll, Ist, Differenz, Materialkosten, VSI-Positionen,
  Partnerfirma, Zeitraum
- Ausgabe als Excel und PDF, PDF mit Firmenlogo und Firmenzeile

## Technische Konventionen

- **Zeitzonen:** immer `date-fns-tz` mit `Europe/Zurich`, nie blankes `new Date()`
- **Geld:** `Decimal`, niemals `Float`
- **Schreiben und Audit-Log** immer in derselben Transaktion
- **Soft Delete** für Zeiteinträge, Absenzen und Buchungen (`deletedAt`)
- `components/` kennt kein Prisma, `server/` kennt kein React
- Keine Selbstregistrierung, keine impliziten Rechte

## Aufbewahrung

| Daten | Frist |
|---|---|
| Zeiteinträge, Ferien, Audit-Log | 10 Jahre (OR 958f) |
| Absenz "krank" als Tatsache | 10 Jahre |
| Notiz oder Grund zur Krankheit | 18 Monate, danach automatisch geleert |
| Sitzungen und Login-Protokolle | 90 Tage |

Krankheitsnotizen sind besonders schützenswerte Personendaten nach revDSG
und werden deshalb kürzer aufbewahrt als der Absenzeintrag selbst.

## Sprache und Formulierung in der Oberfläche

- Schweizer Hochdeutsch, **kein ß**, immer `ss`
- Keine Gedankenstriche als Einschub, stattdessen Komma, Doppelpunkt
  oder eigener Satz
- Fachbegriffe wie im Betrieb: Ausmass, Rapport, Nennweite, Isolierdicke,
  Objektrabatt, Nettostunden
- Fehlermeldungen sagen, was zu tun ist, nicht was schiefging

## Befehle

```bash
npm run dev          # Next.js lokal
npm run db:migrate   # prisma migrate dev, erzeugt den Client gleich mit
npm run db:generate  # nur den Client neu erzeugen
npm run db:studio    # Daten ansehen
npm run db:seed      # Stammdaten
npm run typecheck    # tsc --noEmit
npm run lint
```

Postgres und Mailpit laufen über `brew services`.
Mailpit-Oberfläche: http://localhost:8025

## Arbeitsweise

- `main` ist geschützt, kein direkter Commit
- Für jede Aufgabe ein Branch: `feat/`, `fix/`, `chore/`
- Merge nur über Pull Request mit grüner CI
- Commits auf Deutsch: `feat: Ferienantrag mit Arbeitstagsberechnung`
- Deployment nur manuell oder per Tag, nie automatisch bei jedem Push
- Vor jeder Migration auf dem Server ein Backup, im Skript verankert

## Roadmap

**M1 Fundament**
Next.js, Prisma, Schema, OIDC-Anmeldung, Session und Rollenprüfung,
Audit-Log, Server aufsetzen, erstes Deployment

**M2 Zeiterfassung**
Zeiteinträge, Monatskalender mit offenen Tagen, Absenzen, Ferienanspruch,
Feiertagsjob, Monatsabschluss

**M3 Baustellen und Material**
Partnerfirmen, Baustellen, Materialkatalog mit Import, Lager, VSI-Tarife

**M4 Auswertung**
Auswertung Mitarbeitende, Auswertung Baustellen, Export Excel und PDF,
Firmeneinstellungen mit Logo-Upload, Aufbewahrungsjob

**M5 Produktivstart**
Seed mit echten Stammdaten, ein Monat Parallelbetrieb neben dem alten
Vorgehen, Backup-Wiederherstellung geübt, Schulung

## Offene Punkte

- Namensrechte prüfen: nic.ch, zefix.ch, swissreg.ch
- Schriftliche Regelung mit Daut und Qail, wem der Code gehört.
  Vorschlag: Armend behält die Rechte, IsoTeam erhält ein unbefristetes,
  kostenloses Nutzungsrecht
- SPF, DKIM und DMARC für isoteam-suljejmani.ch setzen, bevor Rechnungen
  versendet werden
- Objektrabatt PIR: Titel nennt 50 %, handschriftlich steht 40 %. Klären.
- Preisunterschiede Brandschutz zwischen der Liste von 2018 und 2022.
  Aktuell gelten die Werte von 2022. Kundenspezifische Preislisten wären
  ein späterer Ausbauschritt.

## Was nicht gebaut wird

- Kubernetes oder mehrere Server
- Selbstregistrierung
- Mandantenfähigkeit als Feature, das Schema ist aber bereits
  auf `companyId` ausgelegt
- Offerten und Rechnungen vor M5. Das Datenmodell soll sie später
  aufnehmen können, aber nicht jetzt.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
