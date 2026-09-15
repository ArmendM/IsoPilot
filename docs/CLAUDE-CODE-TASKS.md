# Claude-Code-Aufgaben

Stand: 2026-09-15. Grundlage: `CLAUDE.md`, `docs/BETRIEB.md`,
`docs/lifecycle.md`, Git-Historie und `.next/dev/logs/next-development.log`.

**Die Roadmap und der genaue Stand stehen in `CLAUDE.md`, Abschnitt
"Roadmap und Stand".** Diese Liste ist die Sicht nach Priorität und
Akzeptanzkriterien, nicht die Chronik.

Diese Liste enthaelt nur belegte Abweichungen. M6/M7 bleiben geplante
Erweiterungen und werden erst nach dem empfohlenen Parallelbetrieb umgesetzt.

## Offen

### P0, Baustellenstatus auf das definierte Lifecycle-Modell heben

Quelle: `docs/lifecycle.md`, Abschnitt Status und M6b. `prisma/schema.prisma`
kennt aktuell nur `OPEN`, `PAUSED` und `DONE`; `src/server/sites.ts` nimmt diese
Status direkt an und erlaubt jeden Wechsel. Die bereits vorhandenen Regeln in
`src/server/guards.ts` fuer `OFFERTE` bis `ABGESCHLOSSEN` sind deshalb ungenutzt.

Betroffen: `prisma/schema.prisma`, Migration, `src/server/sites.ts`,
`src/server/guards.ts`, Baustellen-UI und Read-Modelle.

Akzeptanzkriterien:

- Alle Status und Nebenzustaende aus `docs/lifecycle.md` sind modelliert.
- Nur erlaubte Uebergaenge sind serverseitig moeglich.
- Rueckschritte, `PAUSIERT` und `STORNIERT` verlangen einen Grund.
- Jeder Wechsel wird in `SiteStatusEvent` mit Person, Zeitpunkt und Grund
  protokolliert.
- Die erste Zeitbuchung setzt `IN_ARBEIT` automatisch, ohne freie UI-Abkuerzung.
- Pausierte und abgeschlossene Baustellen verweigern unzulaessige Buchungen.
- Tests decken erlaubte, verbotene und begruendungspflichtige Wechsel ab.

Validierung: Migration deployen, Server-Action-Tests ausfuehren,
`npm run typecheck`, `npm run lint`.

### Erledigt, Materialkatalog und Materialbuchungen (war P1)

Stand 14.09.2026 umgesetzt und in `CLAUDE.md` beschrieben: Katalog mit
Kategorien, Lager und Mindestbestand (M3b), Buchung auf eine Baustelle mit
eingefrorenem Preis (M3c), Excel-Import mit Vorschau und ohne Duplikate
(M3d), Kategoriefilter und Ändern einer Buchung (M3f), Fehlmenge,
Bestellbedarf, Wareneingang und Lagerverlauf (M3g), Lagerberechtigung als
Merkmal an `User` (M3h), Bestand nur noch über Bewegungen samt Inventur
(M3i). Gedeckt durch Tests in `tests/einheit` und `tests/server`.

**Offen bleibt daraus:**

- **Zwei Konventionen im Lagerverlauf.** Buchungen tragen die Änderung des
  Bestands, Wareneingang und Inventur die des Saldos. Ein Entscheid, kein
  Fehler, Begründung und Vorschlag stehen in `CLAUDE.md`.

- **VSI-Tarife (M3e).** Schema steht, Seed leer. Blockiert durch die
  ungeklärten neun Werte bei 80 mm PIR, die gegen das Original zu prüfen
  sind, bevor geseedet wird. Objektrabatt 0 Prozent und "je Liste gilt
  die neuste Fassung" sind entschieden.

### Dazugekommen, Tests (war in jeder Aufgabe gefordert, fehlte ganz)

Seit 13.09.2026 gibt es zwei Schichten, beide in der CI:

- `tests/einheit`, reine Logik ohne Datenbank, `npm test`
- `tests/server`, Server Actions gegen ein echtes Postgres,
  `npm run test:server`

Offen bleibt die dritte Schicht, Oberfläche im Browser mit Playwright.
Sie ist die teuerste und hat bisher die echten Fehler gefunden.

### P1, Auswertungen und Exporte aus M4 umsetzen

Quelle: Auswertungen in `CLAUDE.md`. Beide Auswertungen stehen seit M4a
und M4b unter `/auswertung/mitarbeitende` und `/auswertung/baustellen`,
beide mit Excel- und PDF-Ausgabe (M4c). Es fehlen die Firmeneinstellungen,
also der Upload des Logos; die Firmenzeile im PDF kommt bereits aus
`Company`.

Akzeptanzkriterien:

- Mitarbeitenden-Auswertung waehlt genau eine Person und bietet Monat, Jahr
  oder freie Zeitspanne mit Nettostunden, Pausen, Ferien und Krankheit.
  **Erfuellt mit M4a**, gedeckt durch `tests/server/auswertung.test.ts`.
- Vorgesetzte sind auswaehlbar; Mitarbeitende koennen fremde Daten weder
  laden noch exportieren. **Erfuellt fuer das Laden**, der Export fehlt noch.
- Baustellenauswertung kann eine Baustelle oder eine Gesamtuebersicht zeigen
  und enthaelt Soll, Ist, Differenz, Materialkosten, VSI, Partner und Zeitraum.
  **Erfuellt mit M4b**, gedeckt durch `tests/server/auswertung-baustellen.test.ts`.
- Excel und PDF enthalten die gleichen geprueften Werte; PDF enthaelt Logo und
  Firmenangaben. **Erfuellt mit M4c**: beide rendern dieselbe Beschreibung aus
  `src/server/auswertung-blaetter.ts`, ein zweiter Bau je Ausgabeweg ist damit
  ausgeschlossen. Das PDF traegt die Firmenangaben; das Logo bleibt leer, bis
  die Firmeneinstellungen es hochladen.
- Geld bleibt `Decimal`, Berechtigungen liegen in Server Actions.

Validierung: Berechtigungs- und Summen-Tests sowie ein Export-Smoke-Test.

### Erledigt, Ausgaben ans Markenhandbuch angeglichen

Quelle: `docs/marke/MARKENHANDBUCH.md` und die gelieferte Vorlage
`docs/marke/vorlagen/briefpapier-vordruck.html`. Umgesetzt in
`src/server/pdf.ts` und `src/server/excel.ts`.

Erfuellt: Raender, Stellung der Adresse, Trennlinie in Tiefblau,
Leistungszeile in Versalien, dreispaltiger Fuss mit Adresse, Kontakt, UID und
Bank aus `Company`, Kopf und Fuss auf jeder Seite. Archivo und Barlow sind als
Schriftdateien unter `public/schriften` eingebettet, samt OFL-Lizenztexten.
Excel traegt Wortmarke, Firmenzeile und eine Titelzeile in Tiefblau auf Weiss.

Es ist ein einziger Briefkopf, derselbe wie auf Brief, Offerte und Rechnung.

Geprueft ueber die Anordnung, nicht nur den Inhalt: `tests/einheit/pdf-lesen.ts`
liest das erzeugte PDF wieder aus, samt ToUnicode-Tabellen je Schrift, und
`tests/einheit/pdf.test.ts` prueft Stellung und Reihenfolge. Dazu Berichte aus
einem Produktionsbuild, von Hand angesehen.

### Erledigt, Aufbewahrung fuer Anmeldeprotokolle (war P1)

Quelle: Aufbewahrung in `CLAUDE.md` und Cron in `docs/BETRIEB.md`.
`src/app/api/cron/[job]/route.ts` bereinigt alte Sitzungen, Zeitdaten und
Krankheitsnotizen, aber nicht Login-Protokolle nach 90 Tagen. Login-Aktionen
landen derzeit im allgemeinen `AuditLog`, der zugleich zehn Jahre aufbewahrt
werden soll.

Akzeptanzkriterien:

- Login-Protokolle sind im Datenmodell eindeutig von zehnjaehrigen Auditdaten
  unterscheidbar oder erhalten eine nachweisbare 90-Tage-Bereinigung.
- Der Retention-Job ist idempotent, protokolliert seine Zaehlung und loescht
  keine fachlichen Auditdaten vor Ablauf ihrer Frist.
- Ein Test belegt die Fristen fuer Login, Krankheitstext und Zeiteintrag.

Validierung: Retention-Tests mit eingefrorener Zeit und Cron-Smoke-Test.

Erledigt in M4f. Die Fristen stehen in `src/lib/aufbewahrung.ts`, der Job
in `src/server/aufbewahrung.ts`. Anmeldeprotokolle sind ueber eine
ausgeschriebene Liste von Audit-Aktionen von den Geschaeftsdaten
getrennt, nicht ueber ein Namensmuster: `LOCKED` und `UNLOCKED` sind
Monatsabschluesse und muessen bleiben.

Der Job wendet nur Loeschpflichten an. Die zehn Jahre nach OR 958f sind
eine Aufbewahrungspflicht: sie sagen, wie lange etwas dableiben muss,
nicht wann es weg soll, und nichts loescht darauf hin. Am Zeiteintrag
steht die Frist als `TimeEntry.keepUntil`, als Auskunft. Sie war bis M4f
gar nicht befuellt, obwohl das Schema sie beschrieb; jetzt ist es eine
generierte Spalte.

## Bewusst zurueckgestellt

- M6a bis M6c und M7a bis M7c aus `docs/lifecycle.md`, bis M3/M4 abgeschlossen
  und der einmonatige Parallelbetrieb nachgewiesen ist.
- QR-Rechnung, Offerten, Rechnungen und Mahnwesen, solange die in
  `docs/lifecycle.md` genannten offenen Geschaeftsentscheidungen nicht geklaert
  sind.

## Pruefprotokoll

- `npm run typecheck`: bestanden am 2026-09-15.
- `npm run lint`: bestanden am 2026-09-15.
- `npm test`: 195 bestanden am 2026-09-15, auch mit `TZ=UTC`.
- `npm run test:server`: 128 bestanden am 2026-09-15.
- `npm run build`: bestanden am 2026-09-15, dazu ein Lauf des Standalone-Servers
  mit eingesetzter Sitzung, alle vier Exportrouten mit 200.
- `.next/dev/logs/next-development.log`: nur erfolgreiche Kompilierungen und
  React-DevTools-Hinweise, keine ungeloeste Exception im gelesenen Verlauf.
