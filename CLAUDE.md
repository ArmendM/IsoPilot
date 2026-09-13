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

**Offen: der Zustimmungsdialog erscheint bei jeder Anmeldung.** Infomaniak
zeigt vor jeder Weiterleitung "Request for connection authorisation" mit
"Access your profile email address" und "View your user profile", und es
muss jedes Mal "Authorise" angeklickt werden. Für vier Personen, die sich
täglich anmelden, ist das lästig.

Geprüft und ausgeschlossen, dass es an IsoPilot liegt:

- `src/app/api/auth/login/route.ts` schickt **keinen `prompt`-Parameter**.
  Wir erzwingen den Dialog also nicht, es gibt bei uns nichts abzuschalten.
- Die Scopes sind `openid email profile`, genau die zwei Zeilen im Dialog.
  Nichts Überflüssiges, `phone` wäre möglich und wird nicht angefragt.
- Das Discovery-Dokument nennt **kein `prompt_values_supported`**. Ob
  `prompt=none` unterstützt wird, ist damit nicht zugesichert.

Damit liegt der Hebel beim IdP, nicht bei uns. Zu klären, in dieser
Reihenfolge:

1. Im Infomaniak Manager bei der Anwendung nachsehen, ob es eine
   Einstellung für gespeicherte Zustimmung oder eine als vertrauenswürdig
   markierte Anwendung gibt.
2. Wenn nicht, `prompt=none` versuchen. Das hilft aber nur, wenn
   Infomaniak die Zustimmung überhaupt speichert. Tut es das nicht, kommt
   `interaction_required` zurück statt eines Codes, und es braucht einen
   Rückfall auf die normale Anmeldung. Ohne Rückfall wäre die Anmeldung
   danach kaputt, also nicht ungeprüft einbauen.
3. Sonst Infomaniak fragen. Ein Verdacht, der zur bereits dokumentierten
   Beobachtung passt: Infomaniak gibt einen öffentlichen Client ohne
   Secret aus. Einem Client, der sich nicht ausweisen kann, jede
   Anmeldung erneut zustimmen zu lassen, wäre eine nachvollziehbare
   Entscheidung auf deren Seite und dann nichts, was sich abstellen lässt.

## Fachliche Regeln

**Arbeitszeit**
- Erfassung ist manuell, die Stempeluhr ist die Ausnahme
- Mehrere Einträge pro Person und Tag erlaubt (zwei Baustellen am selben Tag)
- Überschneidungen werden serverseitig verhindert
- Pause standardmässig **0 Minuten**, Auswertungen rechnen mit Nettostunden
- Baustelle ist ein **freiwilliges** Feld, Werkstatt- und Bürotage gibt es
- **An Wochenenden und Feiertagen wird gebucht wie an jedem anderen Tag.**
  Es gibt keine Sperre und soll keine geben, Samstagsarbeit kommt vor.
  Der Feiertag erscheint in der Tagesansicht nur als Hinweis.
- **Sollarbeitszeit 42 Stunden je Woche**, anpassbar je Firma und je
  Person. Wer weniger arbeitet, bekommt ein eigenes Soll, nicht eine
  Ausnahme im Code.

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
- **Objektrabatt standardmässig 0 %**, pro Baustelle und pro Erfassung
  anpassbar. Gilt auch im Schema: `VsiList.defaultDiscount` steht auf 0.
  Die dort früher stehenden 50 waren eine Altlast aus einer alten Liste
  und sind entfernt.
- **Gilt immer die neuste Fassung einer Liste.** Die Listen tragen ein
  `validFrom`, und gelesen wird die jüngste, deren Datum nicht in der
  Zukunft liegt. Für Brandschutz heisst das: die Werte von 2022, nicht die
  von 2018.
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

## Tests

`npm test` läuft über **Vitest**, `npm run test:watch` beim Entwickeln.
Die CI ruft den Schritt bereits auf, sie hatte `npm test --if-present`
und einen Postgres-Service von Anfang an, nur lief er leer, solange es
kein `test`-Skript gab.

Es braucht **nicht einen Runner, sondern drei Arten von Tests**, mit sehr
verschiedenen Kosten. Sie sind getrennt aufrufbar, sonst wartet man für
eine reine Rechenregel auf eine Datenbank:

| Ordner | Prüft | Braucht | Stand |
|---|---|---|---|
| `tests/einheit` | `lib/dates.ts`, Statusmodell, später Import-Abgleich und Ausmassrechnung | nichts als Node, läuft in Millisekunden | **da**, `npm test` |
| `tests/server` | Transaktion, Lagerbewegung, Berechtigung, Monatsabschluss, Soft Delete | echtes Postgres, eigene Datenbank | **da**, `npm run test:server` |
| `tests/oberflaeche` | Formulare, Anzeige, Wechsel zwischen Datensätzen | Browser und laufende App, Playwright | offen |

Die dritte Art ist die teuerste und zugleich die, die bisher die echten
Fehler gefunden hat: ein Zahlenfeld zeigte `0500` statt 500, und der
Auftraggeber kippte beim Bearbeiten lautlos auf eine andere Firma. Beides
war im Datenpfad nicht sichtbar. Sie ersetzt die ersten beiden nicht, und
umgekehrt genauso wenig.

`tests/server` braucht einmalig eine eigene Datenbank. Sie wird zwischen
den Tests **vollständig geleert**, deshalb steht in `tests/server/env.ts`
eine Bremse: enthält der Datenbankname nicht "test", bricht der Lauf ab,
bevor ein `TRUNCATE` läuft. Einmal einrichten:

```bash
createdb -O isopilot isopilot_test
cp .env.test.example .env.test
DATABASE_URL="postgresql://isopilot:devpassword@localhost:5432/isopilot_test?schema=public" \
  npx prisma migrate deploy
```

`dotenv` muss dort **vor** dem Import von `@/lib/db` laufen, sonst baut
Prisma den Client schon mit der falschen Verbindung. Genau deshalb ist
`tests/server/env.ts` eine eigene Datei und der Aufruf steht nicht im
Rumpf von `setup.ts`.

Die Server Actions ziehen `requireUser` aus `@/lib/session`, das über
`cookies()` geht und ausserhalb eines Requests nicht funktioniert. Die
Tests ersetzen deshalb `@/lib/session` und `next/cache` per `vi.mock`
und setzen die angemeldete Person über `tests/server/hilfen.ts`.

**Die Zeitzone wird in `vitest.config.mts` bewusst nicht festgenagelt.**
Produktion läuft laut Dockerfile auf `Europe/Zurich`, die CI auf UTC. Wer
`TZ` im Test pinnt, versteckt genau den Fehler, den diese Tests finden
sollen. Gegengeprüft wird mit `TZ=UTC npm test`.

Damit reine Logik ohne Datenbank testbar ist, gilt: **eine Datei mit
Rechenregeln importiert kein Prisma.** `src/lib/db.ts` baut den Client
schon beim Import auf, und ein Test, der ihn mitlädt, ist weder schnell
noch verlässlich. Deshalb liegt das Statusmodell in
`src/server/site-lifecycle.ts` und nicht mehr in `guards.ts`, das `db`
braucht.

**Gefunden und offen gelassen:** `workingDays` in `src/lib/dates.ts`
rechnet über `eachDayOfInterval` und `isWeekend`, beide lesen die
Systemzeitzone. Mit UTC-Mitternacht als Eingabe stimmt das nur, solange
die Verschiebung nicht negativ ist. In `Europe/Zurich` und UTC geht es
auf, in `America/New_York` zählt es einen Samstag als Arbeitstag. Für
IsoPilot ist das folgenlos, beide Laufzeiten sind nicht negativ. Es hängt
aber die Ferienberechnung daran, deshalb wurde es nicht nebenbei in einem
Test-Paket geändert. Wer es anfasst: über `utcToZurich` rechnen und im
Filter `format(d, "yyyy-MM-dd")` statt `isoDate(d)` verwenden, sonst wird
zweimal umgerechnet.

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
npm test             # reine Logik, tests/einheit, ohne Datenbank
npm run test:watch   # dasselbe beim Entwickeln
npm run test:server  # Server Actions gegen isopilot_test
TZ=UTC npm test      # gegenprüfen wie in der CI
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
- **Nach `npm ci` `npm run db:generate` nachziehen.** `npm ci` wirft
  `node_modules` weg, und es gibt kein `postinstall`, das den Prisma-Client
  neu erzeugt. Ohne diesen Schritt meldet `npm run typecheck` lauter
  `implicitly has an 'any' type` in Dateien, an denen niemand etwas
  geändert hat. Die CI ist nicht betroffen, sie ruft `prisma generate`
  ausdrücklich auf.
- **Nach `npm run db:migrate` den Dev-Server neu starten.** Er hält den
  erzeugten Prisma-Client im Speicher. Sonst ist ein neues Feld still
  `undefined`, ohne Fehlermeldung, und die Anzeige zeigt es einfach nicht.
- **TypeScript bleibt auf 5.x und ESLint auf 9.x**, beides blockiert von
  oben, nicht von unserem Code. TypeScript 7 lehnt `typescript-eslint`
  mit "does not support TS 7.0" ab, und ESLint 10 bricht in
  `eslint-config-next`, das ein `eslint-plugin-react` mitbringt, welches
  die entfernte API `context.getFilename` benutzt. Vor dem nächsten
  Versuch prüfen, ob `eslint-config-next` und `typescript-eslint`
  nachgezogen haben, sonst kostet es nur Zeit.
- **`@types/node` bleibt auf `^22`, passend zu `node:22` im Dockerfile
  und in der CI.** Eine neuere Hauptversion beschreibt APIs, die in der
  Produktion nicht existieren, und der Typecheck liesse sie durch.
  `.github/dependabot.yml` ignoriert deshalb Hauptversionen dieses Pakets.
  Wer Node anhebt, ändert Dockerfile, `ci.yml` und diese Regel zusammen,
  nie nur eines davon.
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
- M3d Excel-Import in den Katalog: **fertig**
- M3e VSI-Tarifmatrix: **als Nächstes**
- M3f Materialbuchung verbessern: Kategoriefilter **fertig**, Ändern offen

**M4 Auswertung**
Auswertung Mitarbeitende, Auswertung Baustellen, Export Excel und PDF,
Firmeneinstellungen mit Logo-Upload, Aufbewahrungsjob. Dazu **Sollstunden
und Zeitsaldo**, siehe den eigenen Abschnitt weiter unten: dafür fehlt
das Datenmodell noch ganz.

**M5 Produktivstart**
Seed mit echten Stammdaten, ein Monat Parallelbetrieb neben dem alten
Vorgehen, Backup-Wiederherstellung geübt, Schulung

**M6 und M7** stehen in `docs/lifecycle.md`, von der Offerte bis zur
bezahlten Rechnung, mit der Reihenfolge M6a bis M7c. Bewusst nach dem
Parallelbetrieb, nicht davor.

### Kein toter Code: das Statusmodell in `site-lifecycle.ts`

`NEXT_STATUS`, `needsReason`, `assertTransition`, `canBookTime` und
`canBookMaterial` in `src/server/site-lifecycle.ts` werden heute nirgends
aufgerufen, sind aber **kein Überbleibsel und nicht zu löschen.**
`tests/einheit/site-lifecycle.test.ts` nagelt sie fest. Sie sind
die vorgezogene Umsetzung des Statusmodells aus `docs/lifecycle.md`, das
dort mit "Erlaubte Übergänge stehen in einer Tabelle im Code" genau diese
Tabelle meint. `docs/CLAUDE-CODE-TASKS.md` führt das als P0 "Baustellenstatus
auf das definierte Lifecycle-Modell heben" und nennt dieselben Funktionen
als vorhandene Grundlage.

Ungenutzt sind sie, weil das `SiteStatus`-Enum in `prisma/schema.prisma`
erst OPEN, PAUSED und DONE kennt und `setSiteStatus` in
`src/server/sites.ts` jeden Wechsel frei erlaubt. Das aufzulösen ist M6b
und braucht Migration, `SiteStatusEvent` und Oberfläche, also mehr als ein
Aufräumen.

Wer hier aufräumen will, prüft bitte zuerst `docs/lifecycle.md`. Ein
früherer Anlauf hat die Funktionen als toten Code eingestuft, allein weil
`grep` keine Verwendung fand.

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

### Nachträglich an M3c gefunden und behoben

Aus einer späteren Durchsicht, alle vier in einem Zug behoben:

- **Abgeschlossene und pausierte Baustellen nahmen Material an.**
  `saveMaterialBooking` prüfte Existenz und Firma, nie `site.status`, und
  die Oberfläche zeigte den Abschnitt auch bei `DONE`. Damit liessen sich
  Materialkosten einer abgeschlossenen Baustelle nachträglich verändern,
  genau gegen die Einfrier-Regel. Jetzt nimmt nur `OPEN` neue Buchungen
  an. **Rückgängig machen bleibt erlaubt**, auch auf einer
  abgeschlossenen Baustelle: das korrigiert einen Fehler, statt einen
  neuen anzulegen, und der Monatsabschluss begrenzt es ohnehin.
- **Doppeltes Rückgängigmachen konnte das Lager zweimal gutschreiben.**
  Die Bedingung stand im Code statt im `WHERE`. Jetzt
  `updateMany({ where: { id, deletedAt: null } })` mit Abbruch bei
  `count === 0`.
- **Artikel und Preis wurden vor der Transaktion gelesen.** Jetzt
  innerhalb, damit der Preisimport aus M3d nicht dazwischenkommt.
- **`isoUtc` in `bookings-read.ts` duplizierte `isoDate`** mit anderer
  Logik. Ersetzt durch `isoDate` aus `lib/dates.ts`.

Alle vier sind inzwischen in `tests/server/bookings.test.ts` abgedeckt.
Gegengeprüft, indem jede Behebung einzeln zurückgenommen wurde: ohne die
Statusprüfung fallen zwei Tests, ohne die `WHERE`-Bedingung einer.

### Offen: Sollstunden und Zeitsaldo

Heute rechnet IsoPilot nur Ist-Stunden zusammen. Es gibt **kein Soll**,
also auch keine Antwort auf "wer hat Überstunden und wer ist im Minus".
Weder `User` noch `Company` haben ein Feld dafür, `Company` kennt bisher
nur `defaultVacationDays`.

Gewollt ist: 42 Stunden je Woche als Vorgabe, anpassbar, daraus je Person
ein laufender Saldo aus Soll und Ist.

**Erst nicht verwechseln:** `workingDays` in `src/lib/dates.ts` zählt
Arbeitstage **ohne Wochenenden und Feiertage** und rechnet damit, wie
viele Ferientage eine Absenz verbraucht. Das muss so bleiben, niemand
verbraucht am Sonntag einen Ferientag. Dass an einem Samstag gebucht
werden darf, ist eine andere Frage und heute bereits erfüllt:
`saveTimeEntry` kennt keine Wochenend- oder Feiertagssperre. Wer das
"flexibel machen" will, darf `workingDays` nicht anfassen.

Zu entscheiden, bevor mit dem Code begonnen wird:

- **Wo steht das Soll?** Naheliegend im Muster, das schon da ist:
  `Company.weeklyHours` mit 42 als Vorgabe und `User.weeklyHours` als
  Ausnahme je Person, genau wie `defaultVacationDays` und `vacationDays`.
- **Wie wird ein Tagessoll daraus?** 42 geteilt durch 5 sind 8,4 Stunden.
  Gilt das für jeden Werktag gleich, oder gibt es ein Wochenmuster, etwa
  freitags kürzer? Bei Teilzeit dieselbe Frage.
- **Was zählt als erfüllt?** Ein Feiertag, ein Ferientag und ein
  Krankheitstag senken das Soll, sonst baut jeder in den Ferien Minus auf.
  Ein halber Ferientag entsprechend halb.
- **Ab wann wird gerechnet?** Ab `employedFrom`, oder gibt es je Person
  einen **Anfangssaldo**? Für den Parallelbetrieb in M5 braucht es fast
  sicher einen: die vier bringen einen Saldo aus dem alten Vorgehen mit.
- **Was passiert bei einer Änderung?** Steigt jemand von 100 auf 80
  Prozent, darf das vergangene Monate nicht rückwirkend verändern. Das
  Soll braucht also ein Gültigkeitsdatum, wie `regieValidFrom` es bei den
  Regietarifen schon hat. Siehe auch `docs/lifecycle.md`: "Eine
  Tariferhöhung darf alte Baustellen nicht rückwirkend verändern."
- **Was macht der Monatsabschluss?** Ein gesperrter Monat sollte seinen
  Saldo festhalten, sonst verschiebt eine spätere Sollkorrektur die
  Vergangenheit.
- **Wo steht der Saldo?** Vorschlag: als Zeile in `/zeiten` für einen
  selbst, und in der Auswertung Mitarbeitende je Person mit Soll, Ist und
  Differenz über den gewählten Zeitraum. Vorgesetzte sehen alle, wie
  überall sonst.

Gehört der Sache nach zu M4, die Auswertung Mitarbeitende ist der Ort, wo
der Saldo sichtbar wird. Das Datenmodell dafür fehlt aber noch ganz und
braucht eine Migration.

### M3f, Materialbuchung verbessern (offen)

Zwei Dinge stören im Betrieb, beide aus dem Klicktest an M3c:

**Kategorie zuerst wählen: fertig.** Vor dem Artikel-Dropdown steht jetzt
eine Kategoriewahl, vorbelegt mit der ersten Kategorie, nicht mit "Alle":
sonst wäre nichts gewonnen. "Alle Kategorien" steht als letzter Eintrag
zur Verfügung. Die Kategoriewahl erscheint erst ab zwei Kategorien.

Die Filterlogik liegt in `src/lib/materialwahl.ts`, ohne React und ohne
Prisma, und ist in `tests/einheit/materialwahl.test.ts` geprüft. Zwei
Dinge, die dort festgenagelt sind:

- `Material.categoryId` ist **optional**. Artikel ohne Kategorie bekommen
  einen eigenen Topf "Ohne Kategorie", sonst wären sie über die
  Kategoriewahl gar nicht mehr erreichbar.
- Nach einem Kategoriewechsel zeigt die bisherige Auswahl auf einen
  Artikel der alten Kategorie. Gebucht wird dann der erste sichtbare,
  sonst bucht das Formular etwas anderes, als im Dropdown steht.

**Buchung ändern statt nur rückgängig machen.** Heute gibt es zu einer
Buchung ausschliesslich "Rückgängig". Wer sich bei der Menge vertippt,
muss löschen und neu erfassen, und im Protokoll stehen dann drei Vorgänge
statt einem. Menge, Datum und Artikel sollen sich ändern lassen.

Das war in M3c eine bewusste Vereinfachung, siehe den Abschnitt darüber.
Sie fallen zu lassen wirft zwei Fragen auf, die vor dem Code zu klären
sind:

- **Was passiert mit dem Lager?** Eine geänderte Menge darf keine zweite
  Abgangsbuchung erzeugen, sondern nur die Differenz. `StockMovement`
  braucht dafür einen eigenen `StockReason`, sonst liest sich der
  Lagerverlauf später falsch.
- **Was passiert mit dem eingefrorenen Preis?** Wird beim Ändern der Menge
  der ursprüngliche `unitPrice` behalten, oder der heutige Katalogpreis
  genommen? Beim Wechsel auf einen anderen Artikel gibt es keinen
  ursprünglichen Preis mehr. Vorschlag: Menge und Datum behalten den
  eingefrorenen Preis, ein Artikelwechsel holt den aktuellen. Das ist ein
  fachlicher Entscheid, kein technischer.

Wie bei M3c: Schreiben und Audit-Log in einer Transaktion, `assertMonthOpen`,
und Mitarbeitende ändern nur eigene Buchungen.

### M3d, Excel-Import in den Katalog (fertig)

Eine `.xlsx`-Liste einlesen und den Katalog nachführen, ohne Duplikate.

**Entscheide, die getroffen wurden**

- **`exceljs`** liest die Datei. `xlsx` (SheetJS) wird auf npm seit Jahren
  nicht gepflegt.
- **Upload über eine Server Action**, die Datei wird nur im Speicher
  gelesen und nie auf die Platte geschrieben. `next.config.ts` hebt
  `serverActions.bodySizeLimit` auf 4 MB: die Vorgabe von 1 MB reicht für
  eine Materialliste, eine exportierte Mappe mit Formatierung liegt aber
  schnell darüber und die Fehlermeldung wäre nichtssagend.
- **Der Vorschau-Schritt ist verbindlich.** Erst zeigen, was geschähe,
  dann ein zweiter Klick. Die Datei wird dabei **zweimal** hochgeladen und
  auf dem Server beide Male neu gelesen und abgeglichen. Das ist ein
  zweites Hochladen wert: käme der Abgleich aus dem Browser zurück, liesse
  sich über das Formular jeder beliebige Artikel überschreiben. Die
  Vorschau ist damit Auskunft, nie Vorgabe.

**Was der Import anfasst:** `price`, `unit` und `fireClass`, und auch die
nur, wenn in der Datei etwas steht. `stock` und `minStock` nie, die sind
Handarbeit im Betrieb. Ein leeres Preisfeld heisst "unverändert" und
nicht "null", sonst setzte eine halb gefüllte Spalte den halben Katalog
auf null.

**Abgleich** in `src/lib/materialimport.ts`, ohne Prisma und ohne React,
geprüft in `tests/einheit/materialimport.test.ts`. Drei Dinge, die dort
festgenagelt sind und beim Bauen erst durch die Tests auffielen:

- **Kategorie plus Name greift nur, wenn in der Datei wirklich eine
  Kategorie steht.** Sonst ist die Regel eine versteckte Sonderregel für
  Artikel ohne Kategorie und erwischt unter zwei gleichnamigen lautlos
  den einen. Fehlt die Kategorie, läuft die Zeile über den Namen und
  fällt dort als uneindeutig auf.
- **Uneindeutige Zeilen werden übersprungen, nie geraten.** Passen zwei
  Artikel auf eine Zeile, bekäme sonst der falsche stillschweigend einen
  neuen Preis, und niemand würde es merken.
- **Bei der Spaltenerkennung zählt ein Präfix nur, wenn danach kein
  Buchstabe folgt.** Sonst schnappt sich das Kürzel "EI" für Brandschutz
  die Spalte "Einheit". "Preis CHF exkl. MwSt." trifft weiterhin, dort
  folgt ein Leerzeichen.

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
- Kundenspezifische Preislisten wären ein späterer Ausbauschritt. Heute
  gilt je Liste eine Fassung für alle Auftraggeber.

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
