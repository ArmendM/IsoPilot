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
- **Datum und Uhrzeit:** immer `DatumFeld` oder `ZeitFeld` aus
  `components/ui/eingabefelder`, nie ein rohes `<input type="date">`,
  `type="month"` oder `type="time"`. Die Auswahl öffnet beim Klick ins
  Feld und nicht erst über das kleine Symbol am Rand, das Tippen bleibt
  unverändert möglich. Monatsfelder über `DatumFeld` mit `typ="month"`.
- **Häufige Zahlenwerte** bekommen Schnellwahltasten neben dem Feld, etwa
  die Pause mit 0, 15, 30, 45 und 60 Minuten. Das Feld selbst bleibt frei
  beschreibbar. Bei einem Zahlenfeld gehört `step` dabei auf 1: mit
  `step={15}` wäre eine getippte 20 nach HTML-Regeln ungültig und das
  Formular liesse sich nicht absenden.

  Der Grund für beides: auf der Baustelle wird ein Wert eher angetippt als
  eingetippt, im Büro eher eingetippt. Beides muss gehen.
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
npm run db:migrate -- --name kurzer_name   # Migration, erzeugt den Client mit
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
- **Vor der Arbeit abzweigen, nicht danach.** Nach einem Merge steht man
  auf `main`, und dort gehört kein Commit hin.
- **Nach `npm run db:migrate` den Dev-Server neu starten.** Er hält den
  erzeugten Prisma-Client im Speicher. Sonst ist ein neues Feld still
  `undefined`, ohne Fehlermeldung, und die Anzeige zeigt es einfach nicht.
- **Den Abschluss eines CI-Laufs direkt auslesen**, mit
  `gh run view <id> --json conclusion`. Bei `gh run watch … | tail; echo $?`
  liest man den Status von `tail` und hält einen roten Lauf für grün.

## Roadmap und Stand

Stand 13.09.2026. Dieser Abschnitt ist die Antwort auf "wo stehen wir und
was kommt als Nächstes". Er wird bei jedem abgeschlossenen Stück
nachgeführt.

**M1 Fundament — fertig**
Next.js 16, Prisma 7, Schema, Anmeldung über Infomaniak mit Warteraum,
Sitzung und Rollenprüfung, Audit-Log, Benutzerverwaltung unter
`/personen`. Offen bleibt nur das Aufsetzen des Servers und das erste
Deployment, dafür steht `docs/BETRIEB.md` bereit.

**M2 Zeiterfassung — fertig**
`/zeiten` Tagesansicht, `/zeiten/monat` Monatskalender mit offenen Tagen,
`/absenzen` mit Antrag, Bewilligung, halben Tagen und Ferienanspruch
anteilig mit Übertrag, Feiertagsjob gegen OpenHolidays mit lokalem
Rückfall, `/abschluss` Monatsabschluss.

**M3 Baustellen und Material — angefangen**

- M3a `/baustellen` mit Soll-Ist, Status und Auftraggeber: **fertig**
- M3b `/material` Katalog mit Lager, Mindestbestand, Kategorien: **fertig**
- M3c Materialbuchung auf eine Baustelle: **fertig**
- M3d Excel-Import in den Katalog: **als Nächstes**
- M3e VSI-Tarifmatrix: offen

**M4 Auswertung**
Auswertung Mitarbeitende, Auswertung Baustellen, Export Excel und PDF,
Firmeneinstellungen mit Logo-Upload, Aufbewahrungsjob

**M5 Produktivstart**
Seed mit echten Stammdaten, ein Monat Parallelbetrieb neben dem alten
Vorgehen, Backup-Wiederherstellung geübt, Schulung

### M3c, Materialbuchung (fertig, PR #20)

Material aus dem Katalog auf eine Baustelle buchen. Das Schema stand
bereits vollständig, es brauchte **keine Migration**:

- `MaterialBooking` hat `unitPrice` mit dem Kommentar "Preis zum
  Buchungszeitpunkt, eingefroren". Genau das ist die Regel aus diesem
  Dokument: ein späterer Preisimport darf abgeschlossene Baustellen nicht
  rückwirkend ändern. Die Buchung schreibt den Preis als eigenen Wert und
  verweist nicht auf den Artikel.
- `BookingKind` unterscheidet `CATALOG` (reduziert das Lager) von `VSI`
  (berührt das Lager nicht). Für M3c zählt nur `CATALOG`.
- `StockMovement` mit `StockReason` nimmt die Lagerbewegung auf.

Buchung, Lagerbewegung und Protokolleintrag laufen in `saveMaterialBooking`
(`src/server/bookings.ts`) in einer Transaktion, geprüft über
`assertMonthOpen` wie bei Zeiten und Absenzen. `deleteMaterialBooking` ist
ein Soft Delete, der die Menge zurück ins Lager bucht (`StockReason.RETURN`)
statt eine Korrektur der ursprünglichen Menge zuzulassen: das hält den
Schreibpfad klein und bleibt im Protokoll nachvollziehbar.

UI: ein Abschnitt "Material buchen" je Baustellen-Karte in
`/baustellen` (`src/components/baustellen/material-buchung.tsx`), sichtbar
für alle, nicht nur Vorgesetzte. Mitarbeitende sehen und buchen nur eigene
Buchungen, Vorgesetzte alle und können auch für eine andere Person buchen,
wie bei der Zeiterfassung. Absichtlich kein Hardstop bei negativem Lager,
nur der bestehende Mindestbestand-Hinweis im Materialkatalog.

### Als Nächstes: M3d, Excel-Import in den Katalog

Eine Excel-Liste einlesen und den Materialkatalog aktualisieren, ohne
Duplikate anzulegen. Die Regel steht schon oben unter "Material":

- Abgleich in dieser Reihenfolge: erst über die Artikelnummer (`sku`),
  dann über Kategorie plus Name, dann über den Namen allein.
- **Nie ein neues Material anlegen, wenn eine der drei Regeln trifft,
  nur aktualisieren.** Nur wenn keine trifft, entsteht ein neuer Artikel.
- Betrifft vor allem `price`, ggf. `unit` und `fireClass`. `stock` und
  `minStock` gehören nicht in den Import, die sind Handarbeit im Betrieb.
- Noch offen und zu klären, bevor mit dem Code begonnen wird: welche
  Bibliothek liest die `.xlsx`-Datei ein (im Projekt bisher keine
  vorhanden), wie die Datei hochgeladen wird (Formular mit
  Datei-Upload gibt es in IsoPilot bisher nicht), und ob ein
  Vorschau-Schritt vor dem eigentlichen Import gezeigt wird, damit ein
  falscher Spaltenaufbau nicht den ganzen Katalog verändert.
- Wie bei M3c: Schreiben und Audit-Log in einer Transaktion, nur ein
  Vorgesetzter darf importieren (wie bei `saveMaterial`).

## Offene Punkte

Fachliche Entscheide, die niemand aus dem Code ableiten kann:

- **Übertrag der Ferientage ist nicht begrenzt.** Wer ein Jahr lang keine
  Ferien nimmt, trägt die vollen 25 Tage ins Folgejahr. Ob das so gewollt
  ist oder eine Obergrenze braucht, ist eine Absprache.
- **`employedFrom` muss bei jeder neuen Person gesetzt werden**, sonst
  gilt das Eintrittsjahr als voll und der Ferienanspruch wird nicht
  anteilig gekürzt. Bei Daut und Armend steht der 01.01.2026.
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
