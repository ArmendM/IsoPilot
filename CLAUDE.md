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
- **Der Lagerbestand geht nie ins Minus, gebucht wird trotzdem immer.**
  Wer auf der Baustelle Material verbaut hat, muss das erfassen können,
  auch wenn das Lager im System nicht nachgeführt war. Was das Lager nicht
  deckt, landet als **Fehlmenge** am Artikel (`Material.shortfall`).
- **Bestellbedarf = Fehlmenge + was bis zum Mindestbestand fehlt.** Genau
  die Menge, mit der die Baustellen gedeckt sind und der Mindestbestand
  wieder steht. Der Katalog zeigt sie oben als Liste und je Artikel.
- Bestand und Fehlmenge sind **nie zugleich grösser als null**: wer sieben
  schuldet, hat die fünf im Lager längst verbraucht. Alles rechnet
  deshalb über einen einzigen Saldo, siehe `src/lib/lagerdeckung.ts`.
  Ohne das heben sich Verbrauch und Rückgabe nicht mehr auf.
- Die **Lagerbewegung** einer Buchung hält die tatsächliche
  Bestandsänderung fest, nicht die gebuchte Menge. Deckt das Lager gar
  nichts, entsteht folgerichtig auch keine Bewegung, nur die Fehlmenge
  wächst. **Wareneingang und Inventur folgen dieser Regel bewusst nicht**,
  siehe den Abschnitt "Offen: zwei Konventionen im Lagerverlauf".
- **Wareneingang** unter `/material`: gelieferte Ware einbuchen, mit
  `StockReason.DELIVERY` und optionaler Lieferscheinnummer. Tilgt zuerst
  eine offene Fehlmenge, erst dann wächst der Bestand.
- **Der Bestand ist nirgends von Hand schreibbar.** Er bewegt sich nur
  über Wareneingang, Buchung, Rückgabe und **Inventur**, jede mit einer
  Zeile im Verlauf. Zwei Wege zur selben Zahl laufen auseinander, und ein
  Sprung ohne Zeile lässt sich später von niemandem mehr erklären. Im
  Artikelformular steht der Bestand deshalb nur noch beim **Anlegen**, als
  Anfangsbestand, und auch der bekommt eine Bewegung.
- **Die Inventur zählt den Bestand, nicht die Differenz.** Auf dem
  Lagerplatz zählt man Stücke, das Rechnen macht die Maschine. Was gezählt
  ist, ist da: eine offene Fehlmenge gilt damit als erledigt, sonst
  stünden Bestand und Fehlmenge zugleich über null.
- **Lagerverlauf** unter `/lager`, eine eigene Seite: jede Bewegung mit
  Datum, Menge, Vorgang, Ziel und Person, filterbar nach Artikel und
  Baustelle. Die Baustelle hängt als Verknüpfung an `StockMovement`, nicht
  als Satzteil in `note`: der Verlauf soll auch dann sagen können, wohin
  die Ware ging, wenn die Baustelle später umbenannt wird.
- Anfangsbestände stehen im Seed, damit nicht jede erste Buchung in eine
  Fehlmenge läuft. Sie stehen nur im `create`-Zweig: ein erneuter Seed darf
  einen gewachsenen Bestand niemals zurücksetzen.
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
- Wareneingang und Lagerverlauf sehen Vorgesetzte und wer die
  **Lagerberechtigung** hat (`User.canManageStock`, zugewiesen unter
  `/personen`). Bewusst eine Berechtigung neben der Rolle, nicht eine
  dritte Rolle: ein Lagerist soll deswegen nicht die Zeiten der anderen
  sehen. Die Regel steht an einer Stelle, `darfLager` in
  `src/lib/berechtigung.ts`. Den Katalog pflegen und importieren bleibt
  beim Vorgesetzten.

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
- **Immer von `main` abzweigen**, also `git checkout main && git pull`
  als eigenen Schritt vor `git checkout -b`. Wird von einem anderen
  Feature-Branch abgezweigt, schleppt der neue Zweig dessen Commits mit,
  und ein Squash-Merge bringt sie ungeprüft auf `main`. Genau so ist der
  Excel-Import aus M3d vor seinem Klicktest gelandet, siehe #34. Vor dem
  Erstellen eines PR mit `git log main..HEAD --oneline` gegenprüfen, dass
  nur die eigenen Commits drin sind.
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

Stand 14.09.2026. Dieser Abschnitt ist die Antwort auf "wo stehen wir und
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

**M3 Baustellen und Material — fast fertig, offen ist nur M3e**

- M3a `/baustellen` mit Soll-Ist, Status und Auftraggeber: **fertig**
- M3b `/material` Katalog mit Lager, Mindestbestand, Kategorien: **fertig**
- M3c Materialbuchung auf eine Baustelle: **fertig**
- M3d Excel-Import in den Katalog: **fertig**
- M3e VSI-Tarifmatrix: **als Nächstes**, blockiert, siehe unten
- M3f Materialbuchung verbessern, Kategoriefilter und Ändern: **fertig**
- M3g Lager: Fehlmenge, Bestellbedarf, Wareneingang, Lagerverlauf: **fertig**
- M3h Lagerberechtigung als eigenes Merkmal an `User`: **fertig**
- M3i Bestand nur noch über Bewegungen, Inventur: **fertig**

**M4 Auswertung — angefangen**

- M4a Auswertung Mitarbeitende, Ansicht: **fertig**
- M4b Auswertung Baustellen, Ansicht: **fertig**
- M4c Export Excel und PDF für beide: **fertig**
- M4d Firmeneinstellungen mit Logo-Upload: **als Nächstes**. Das PDF
  trägt die Firmenzeile bereits aus `Company`, es fehlt nur das Bild.
- M4e Aufbewahrungsjob für Login-Protokolle: offen

Dazu **Sollstunden und Zeitsaldo**, siehe den eigenen Abschnitt weiter
unten: dafür fehlt das Datenmodell noch ganz, und es stehen fachliche
Entscheide an. Die Auswertung Mitarbeitende ist der Ort, an dem der Saldo
später als Spalte dazukommt.

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
wie bei der Zeiterfassung.

**Nachträglich geändert:** M3c liess einen negativen Lagerbestand bewusst
zu, es gab nur den Mindestbestand-Hinweis im Katalog. Das ist verworfen.
Der Bestand geht nicht mehr ins Minus, was nicht gedeckt ist, steht als
Fehlmenge, siehe "Material" oben. Der Auslöser war der Testbetrieb: weil
der Seed keine Anfangsbestände setzte, standen nach wenigen Buchungen
sieben Artikel bei bis zu -115. Ein Hardstop, der die Buchung abweist,
war zwischenzeitlich gebaut und wieder verworfen: er hätte jemanden auf
der Baustelle daran gehindert, tatsächlich verbautes Material zu
erfassen, und dafür einen Anruf beim Vorgesetzten verlangt.

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

### M3e, VSI-Tarifmatrix: blockiert, nicht durch Code

Das Schema steht vollständig (`VsiList`, `VsiRate`), im Seed sind **null
Tarife**, dort steht nur "Offen: VSI-Tarife importieren". M3e heisst, eine
Preismatrix von DN 10 bis DN 300 über sechs Dicken und mehrere Positionen
für zwei Listen zu erfassen, also mehrere hundert Werte.

**Was fehlt, ist keine Software, sondern die geprüften Zahlen.** Offen ist
genau ein Punkt: bei 80 mm PIR sind nur neun Werte vorhanden, aktuell
rechtsbündig ab DN 50 zugeordnet. Das gehört gegen das Original geprüft,
bevor irgendetwas geseedet wird, so verlangt es auch
`docs/CLAUDE-CODE-TASKS.md`.

Geklärt sind dagegen: der Objektrabatt steht auf 0, und es gilt je Liste
immer die neuste Fassung, für Brandschutz also 2022.

Nächster Schritt ist deshalb nicht Code, sondern die beiden Papierlisten
mit Daut oder Qail durchzugehen.

### M3h, Lagerberechtigung als eigenes Merkmal (fertig)

`User.canManageStock`, zugewiesen unter `/personen`. Eine Lieferung nimmt
an, wer gerade da ist, ohne deswegen Vorgesetzter zu sein.

**Als Berechtigung neben der Rolle, nicht als dritte Rolle.** Mit einer
dritten Rolle müsste für jede bestehende Prüfung neu entschieden werden,
wo sie einzuordnen ist. Als eigenes Merkmal ist es eine Zeile je Prüfung.

Entschieden beim Bauen:

- **Die Regel steht einmal**, als `darfLager` in
  `src/lib/berechtigung.ts`, ohne Prisma und ohne React, festgenagelt in
  `tests/einheit/berechtigung.test.ts`. Eine Prüfung, die an vier Stellen
  von Hand ausgeschrieben wird, läuft irgendwann an einer davon
  auseinander.
- **Ein Vorgesetzter darf es immer**, das Merkmal nimmt ihm nichts weg.
  Sonst müsste es ihm einzeln gesetzt werden und ein Vergessen sperrte ihn
  aus dem eigenen Lager aus. Der Knopf erscheint deshalb nur bei einer
  mitarbeitenden Person.
- **Eigene Server Action `setLagerrecht`**, nicht als weiteres Feld in
  `setZugang`. Sonst schickt jeder Rollenwechsel das Merkmal mit, und ein
  vergessenes Feld setzt es lautlos zurück. Im Protokoll steht so
  ausserdem `USER_STOCK_GRANTED` statt eines allgemeinen "Rolle geändert".
  Ein Test hält fest, dass ein Rollenwechsel die Berechtigung stehen
  lässt.
- **Am eigenen Konto erlaubt**, anders als Rolle und Freigabe: damit kann
  sich niemand aussperren, und wer die Seite überhaupt sieht, ist
  Vorgesetzter und hat das Recht ohnehin.
- **Nur Wareneingang und Lagerverlauf hängen daran.** Den Katalog pflegen
  und der Excel-Import bleiben beim Vorgesetzten: das sind Preise und
  Stammdaten, nicht die Annahme einer Lieferung.

### M3i, Bestand nur noch über Bewegungen (fertig)

Der Bestand war im Artikelformular direkt schreibbar, und im Verlauf blieb
von diesem Sprung nichts übrig. Jetzt gibt es dafür die **Inventur**,
`inventur` in `src/server/lager.ts`, je Artikel unter `/material`.

- **Gezählt wird der Bestand**, nicht die Differenz, und der gezählte Wert
  steht in der Notiz der Bewegung.
- **Anfangsbestand nur beim Anlegen**, und mit einer Bewegung. Sonst
  stünde gleich zu Beginn eine Menge im Lager, die im Verlauf nirgends
  herkommt.
- **Wer zählen darf, hängt an der Lagerberechtigung**, nicht an der Rolle:
  zählen tut, wer am Lagerplatz steht. Den Katalog pflegen bleibt beim
  Vorgesetzten.
- **Die Vorschau im Formular rechnet mit derselben Funktion wie der
  Server** (`zaehldifferenz`). Zwei Rechnungen für dieselbe Zahl gehen
  irgendwann auseinander, und dann zeigt die Vorschau etwas anderes an,
  als nachher im Verlauf steht.

**Nebenbei gefunden und behoben: der Seed setzte nie einen
Anfangsbestand.** Jede Zeile in `prisma/seed.ts` trug Bestand und
Mindestbestand als siebte und achte Spalte, die Schleife las aber nur
sechs Werte aus, und `create` kannte weder `stock` noch `minStock`. Die
Angabe in diesem Dokument, die Anfangsbestände stünden im Seed, stimmte
also nicht. Das ist die wahrscheinliche Ursache dafür, dass im Testbetrieb
sieben Artikel bei bis zu -115 standen. Beides steht jetzt im
`create`-Zweig, ein erneuter Seed setzt einen gewachsenen Bestand nicht
zurück. Eine Bewegung entsteht dazu nicht: `StockMovement` braucht eine
Person, und beim Seed gibt es noch keine.

### Offen: zwei Konventionen im Lagerverlauf

Beim Bauen der Inventur aufgefallen, und es ist ein Entscheid, kein Fehler
im Code. Die Bewegungen tragen heute **zwei verschiedene Zahlen**:

| Vorgang | `delta` ist |
|---|---|
| Buchung, Rückgabe, Berichtigung | die Änderung des **Bestands** |
| Wareneingang, Inventur | die Änderung des **Saldos**, also Bestand minus Fehlmenge |

Beide sind begründet. Für die Buchung steht der Grund oben: die Bewegung
soll den echten Abgang zeigen. Für den Wareneingang steht er in M3g: die
Lieferung selbst ist das Ereignis, und getilgte Fehlmenge ist ebenfalls
angekommene Ware. Für die Inventur ist es zwingend: wer bei Bestand 0 und
Fehlmenge 30 zehn Stück zählt, ändert den Bestand um 10 und die Bücher um
40, und über den Bestand allein bliebe die getilgte Fehlmenge genau so
ohne Spur, wie es vorher der ganze Sprung war.

Solange beide Konventionen nebeneinander stehen, gilt **nicht**, dass die
Summe der Bewegungen mit dem Bestand aufgeht. Was aufginge, wäre die Summe
mit dem **Saldo**, wenn alle Vorgänge die Saldoänderung trügen: eine
Buchung von 120 auf ein Lager mit 100 stünde dann als -120 statt als -100.

**Vorschlag, zu entscheiden bevor jemand aus dem Verlauf rechnet:** auf
die Saldokonvention gehen. Sie zeigt in jeder Zeile die Zahl, die im
Betrieb wirklich vorkommt, die verbaute Menge und die gelieferte Menge,
und sie stimmt als einzige über alle Vorgänge. Betroffen sind drei
Stellen in `src/server/bookings.ts` und zwei festgenagelte Tests in
`tests/server/bookings.test.ts`. Vor dem Produktivstart ist die Tabelle
leer, später wäre es eine Umrechnung alter Zeilen.

### M4a, Auswertung Mitarbeitende (fertig)

`/auswertung/mitarbeitende`. Eine Person und ein Zeitraum, nie alle
zugleich. Die Auswertung Baustellen bleibt ein eigener Bereich.

- **Der Zeitraum liegt in `src/lib/zeitraum.ts`**, ohne Prisma und ohne
  React: Monat, Jahr und freie Zeitspanne, samt Schaltjahr und
  Monatsende. Gerechnet wird durchgehend in UTC-Mitternacht wie die
  `@db.Date`-Spalten, `workingDays` aus `lib/dates.ts` wird bewusst nicht
  benutzt, weil es die Systemzeitzone liest.
- **Ein umgedrehter Zeitraum wird nicht stillschweigend getauscht.** Die
  Auswertung zeigte dann etwas anderes an, als in den Feldern steht.
- **Gezählt wird Tag für Tag**, mit derselben Regel wie die
  Monatsübersicht: am Wochenende und am Feiertag wird kein Ferientag
  verbraucht, ein halber Tag zählt halb, ein halber Absenztag ohne
  Eintrag bleibt offen. An einem Samstag gebuchte Stunden zählen
  trotzdem voll, er ist nur kein Werktag.
- **Zwei verschiedene Tageszahlen, beide benannt:** Werktage im Zeitraum
  und Tage mit Erfassung. "Arbeitstage" allein wäre zweideutig.
- **Die Firma wird mitgeprüft**, nicht nur die Rolle. `assertOwnerOrAdmin`
  in `guards.ts` prüft die Firma nicht, ein Vorgesetzter käme damit über
  eine fremde Kennung in der Adresse an fremde Zahlen. Ein Test hält das
  fest.
- **Tage ohne Baustelle stehen als eigene Zeile**, nicht unter dem Tisch:
  Werkstatt- und Bürotage soll es ausdrücklich geben.

Offen daran: Excel und PDF, das ist M4c, und die Sollstunden.

### M4b und M4c, Auswertung Baustellen und Excel (fertig)

`/auswertung/baustellen`, eine Baustelle auf einmal oder alle als
Übersicht. Beide Auswertungen haben einen Knopf "Als Excel
herunterladen".

- **Nur für Vorgesetzte.** Eine Baustellenauswertung führt die Stunden
  aller Beteiligten und die Kosten zusammen, und Mitarbeitende sehen nur
  ihre eigenen Zeiten und Buchungen. Die Auswertung Mitarbeitende ist
  dagegen für alle da, jede Person sieht dort sich selbst.
- **Ist im Zeitraum und Ist gesamt stehen nebeneinander.** Das Soll gilt
  für die ganze Baustelle, die Stunden werden über den gewählten Zeitraum
  gezählt. Die Differenz gegen einen Monat zu rechnen wäre nichtssagend
  und sähe trotzdem nach einer Aussage aus, deshalb geht sie gegen Ist
  gesamt, und beide Zahlen sind benannt.
- **Gerechnet wird mit dem eingefrorenen Preis der Buchung**, nie mit dem
  heutigen Katalogpreis. Ein Test hält fest, dass ein Preisimport eine
  abgeschlossene Baustelle nicht rückwirkend verteuert.
- **Der Rabatt der Position wird abgezogen**, dieselbe Rechnung für
  Material und VSI.

**Die Excel-Mechanik liegt in `src/server/excel.ts`** und beschreibt ein
Blatt als gewöhnliche Daten: Kopfzeilen, Spalten mit Art, Zeilen, Summe.
Beide Auswertungen benutzen dieselbe Stelle, zwei getrennte Bauten liefen
auseinander, sobald jemand eine Spalte anders formatiert.

- **Der Knopf trägt dieselben Abfrageparameter wie die Ansicht.** Der
  Export rechnet damit über denselben Weg. Eine zweite Rechnung für den
  Export wäre die sicherste Art, zwei verschiedene Ergebnisse zu bekommen.
- **Die Berechtigung hängt nicht am Knopf**, sondern am Lesezugriff: eine
  Adresse tippt sich schnell von Hand.
- **Zahlen bleiben Zahlen, nicht Text.** In der Mappe soll weitergerechnet
  werden können, genau dafür wird sie geholt. Stunden stehen als
  Dezimalzahl und nicht als Uhrzeit, 8,25 Stunden sind keine 8 Uhr 25.
- **Die Einzelpositionen sind überall dabei.** In der Auswertung
  Mitarbeitende ist das Kästchen ab Werk angehakt und bleibt abwählbar,
  die Auswertung Baustellen zeigt die einzelnen Zeiteinträge mit Person
  und Tag zusätzlich zur Summe je Person. Excel und PDF enthalten sie
  immer, auch wenn die Ansicht sie ausblendet: eine Datei wird abgelegt
  und später hervorgeholt, und dann ist die Frage nach dem einzelnen Tag
  längst gestellt.
- Ein leeres Kästchen schickt über GET nichts mit. Das Formular trägt
  deshalb ein verstecktes Feld, sonst liesse sich "noch nichts gewählt"
  nicht von "abgewählt" unterscheiden und das Kästchen wäre nicht
  abwählbar.

**Das PDF liegt in `src/server/pdf.ts` und rendert dieselbe
Beschreibung.** `src/server/auswertung-blaetter.ts` baut sie einmal,
Excel und PDF machen daraus nur noch eine Datei. Das ist keine Frage der
Sorgfalt, sondern des Aufbaus: baute jeder Weg seine Tabellen selbst,
unterschieden sie sich früher oder später, und niemand merkte es, weil
niemand beide Dateien nebeneinander legt. Genau das verlangt auch
`docs/CLAUDE-CODE-TASKS.md` mit "Excel und PDF enthalten die gleichen
geprueften Werte".

- **pdfkit statt eines Browsers.** Auf zwei vCPU und 4 GB RAM ist ein
  Headless-Chrome je Bericht kein Werkzeug, sondern ein Risiko. pdfkit
  schreibt in einen Puffer und bringt Helvetica mit, das die Umlaute über
  WinAnsi deckt. Eine Schriftdatei braucht es nicht.
- **`serverExternalPackages: ["pdfkit"]` in `next.config.ts`.** pdfkit
  liest seine Schriftmetriken zur Laufzeit als `.afm`-Dateien aus dem
  eigenen Paket, gebündelt fände es sie nicht mehr. Auf der Liste, die
  Next von sich aus ausnimmt, steht es nicht.
- **Ab sieben Spalten wird quer gedruckt.** Die Baustellenübersicht hat
  neun, auf A4 hoch wäre sie unlesbar.
- **Der Kopf steht auf jeder Seite**, Firmenzeile, Titel und Blattname,
  dazu die Titelzeile der Tabelle nach jedem Umbruch. Ein Blatt Papier
  ohne Firmenzeile lässt sich nicht zuordnen.
- **Alle Zellen einer Zeile werden gegen dieselbe gemerkte Höhe
  gezeichnet.** pdfkit rückt nach jedem `text` um die Zeilenhöhe der
  Schrift vor, und die ist nicht die Zeilenhöhe der Tabelle. Wer das mit
  einem festen Betrag ausgleicht, verschiebt jede weitere Zelle um die
  Differenz, und die Zeile läuft über die Spalten hinweg schräg aus dem
  Raster. Genau so stand die Titelzeile einmal mitten in der Überschrift.

**Geprüft wird die Anordnung, nicht nur der Inhalt.**
`tests/einheit/pdf.test.ts` liest die Textmatrizen aus dem Inhaltsstrom
aus und prüft, dass alle Zellen einer Zeile dieselbe Höhe haben, dass die
Blöcke in der richtigen Reihenfolge von oben nach unten stehen und dass
zwischen Überschrift und Titelzeile Luft bleibt. Ein Test, der nur fragt,
ob ein Text vorkommt, hätte den schrägen Kopf nie gefunden: inhaltlich
war alles da, im Bericht stand es übereinander. In den Textmatrizen wird
`y` nach unten kleiner, weiter oben heisst also grösseres `y`.
- **Das Logo ist die Wortmarke aus `public/marke`**, solange unter
  `Company.logoPath` nichts steht. Steht dort ein Pfad, gilt dieser: eine
  zweite Firma soll ihr eigenes Logo tragen können, ohne dass jemand im
  Code etwas ändert. Eine fehlende oder unlesbare Datei übergeht der
  Bericht, statt abzubrechen: sonst steht jemand vor einer leeren Seite,
  weil ein Bild fehlt. **Ins PDF geht die PNG**, pdfkit kennt nur PNG und
  JPEG und wirft bei einer SVG "Unknown image format". Das Übrige steht
  in `public/marke/EINBAU.md`.

Geprüft wurde nicht nur mit Vitest, sondern gegen einen
**Produktionsbuild mit `output: "standalone"`** und einer eingesetzten
Sitzung: alle vier Routen liefern 200 mit dem richtigen Inhaltstyp, ohne
Sitzung 307, bei unsinnigem Zeitraum 400, bei fremder Kennung 403. Der
Bündelungsfehler mit den `.afm`-Dateien wäre in keinem Vitest-Lauf
aufgefallen.

### Offen: alte Lagerbewegungen kennen ihre Baustelle nicht

`StockMovement.siteId` kam erst mit M3g. Bewegungen von davor tragen die
Baustelle nur als Text in `note` ("Buchung auf MFH Mattenhof") und
erscheinen im Verlauf unter "Lager". Rückwirkend zuordnen hiesse über
einen Namensvergleich raten. Bei den wenigen Testbewegungen lohnt es
nicht, vor dem Produktivstart ist die Tabelle ohnehin leer.

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

### M3f, Materialbuchung verbessern (fertig)

**Kategorie zuerst wählen.** Vor dem Artikel-Dropdown steht eine
Kategoriewahl, vorbelegt mit der ersten Kategorie, nicht mit "Alle":
sonst wäre nichts gewonnen. "Alle Kategorien" steht als letzter Eintrag
zur Verfügung, die Kategoriewahl erscheint erst ab zwei Kategorien.

Die Filterlogik liegt in `src/lib/materialwahl.ts`, ohne React und ohne
Prisma. Zwei Dinge sind dort festgenagelt: `Material.categoryId` ist
**optional**, solche Artikel bekommen einen Topf "Ohne Kategorie", sonst
wären sie über die Kategoriewahl nicht erreichbar. Und nach einem
Kategoriewechsel wird der erste sichtbare Artikel gebucht, sonst bucht
das Formular etwas anderes, als im Dropdown steht.

**Buchung ändern statt nur rückgängig machen.** Menge, Datum und Artikel
lassen sich an Ort und Stelle in der Liste ändern. Die Rechenlogik dazu
steht in `src/lib/buchungsaenderung.ts`, geprüft in `tests/einheit`:

- **Der Preis bleibt eingefroren, solange der Artikel derselbe ist.** Eine
  Mengenkorrektur ist dieselbe Buchung, ein zwischenzeitlicher Preisimport
  darf sie nicht rückwirkend verändern. Ein **Artikelwechsel** holt den
  heutigen Katalogpreis: für den neuen Artikel gibt es keinen
  ursprünglichen Preis, den man behalten könnte. Die Oberfläche sagt das
  an, sobald ein anderer Artikel gewählt ist.
- **Ins Lager geht nur die Differenz.** Wer 10 auf 12 korrigiert, erzeugt
  eine Bewegung von -2, nicht eine zweite von -12. Beim Artikelwechsel
  geht die alte Menge ganz zurück und die neue ganz ab, das sind zwei
  Bewegungen auf zwei Artikeln. Ohne Mengenänderung entsteht gar keine
  Bewegung, eine Zeile mit delta 0 wäre nur Rauschen.
- Dafür gibt es **`StockReason.BOOKING_CHANGE`**, bewusst getrennt von
  `CORRECTION`: dort steht eine Inventurdifferenz, hier eine berichtigte
  Buchung. Im Lagerverlauf muss beides auseinanderzuhalten sein.

**Geändert wird nur auf einer offenen Baustelle**, genau wie beim Buchen:
eine Änderung verschiebt die Materialkosten. Rückgängig machen bleibt
dagegen überall erlaubt, das nimmt nur weg. Und fällt das neue Datum in
einen anderen Monat, müssen **beide** Monate offen sein, sonst liesse
sich ein Eintrag aus einem gesperrten Monat herausschieben.

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
- **Stillgelegte Artikel gehören in den Abgleich.** Sie bleiben in der
  Datenbank, und die Artikelnummer ist eindeutig. Wer sie übergeht,
  versucht anzulegen und scheitert an `Material_companyId_sku_key`. Genau
  so ist der erste Import im Betrieb fehlgeschlagen. Der Import weckt sie
  aber nicht wieder auf: Stilllegen ist ein Entscheid im Betrieb, keine
  Frage der Lieferantenliste.
- **Dieselbe Artikelnummer zweimal in einer Datei** macht beide Zeilen
  fehlerhaft. Die erste legte an, die zweite liefe in dieselbe Bedingung.
  Lieber in der Vorschau benennen als beim Schreiben scheitern.
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
