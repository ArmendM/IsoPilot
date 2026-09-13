# Claude-Code-Aufgaben

Stand: 2026-09-13. Grundlage: aktueller Branch `fix/auftraggeber-sichtbar`,
`CLAUDE.md`, `docs/BETRIEB.md`, `docs/lifecycle.md`, Git-Historie und
`.next/dev/logs/next-development.log`.

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

### P1, Materialkatalog und VSI-Buchungen als M3 fertigstellen

Quelle: M3 in `CLAUDE.md`. Das Prisma-Schema enthaelt `Material`,
`MaterialBooking`, Lagerbewegungen und VSI-Tarife, aber es gibt keine
produktive Materialroute, keine Buchungs-Server-Action und keine Oberflaeche.
Der Seed meldet selbst, dass VSI-Tarife noch fehlen.

Betroffen: `src/app`, `src/components`, `src/server`, `prisma/seed.ts` und
Migrationen fuer die Buchungsregeln.

Akzeptanzkriterien:

- Kategorien, Artikel, Lagerbestand und Mindestbestand koennen durch
  Vorgesetzte verwaltet werden.
- Excel-Import gleicht in der Reihenfolge Artikelnummer, Kategorie plus Name,
  dann Name ab und erzeugt keine Duplikate.
- Katalogbuchungen frieren den Preis ein, reduzieren den Bestand atomar und
  protokollieren die Lagerbewegung.
- VSI-Buchungen reduzieren den Lagerbestand nicht; der Standardrabatt ist
  0 Prozent und kann pro Baustelle und Buchung gesetzt werden.
- Mitarbeitende sehen nur eigene Buchungen, Vorgesetzte alle der Firma.
- Soft Delete, Monatsabschluss und Audit-Transaktion gelten auch fuer
  Buchungen.
- Die neun Werte fuer PIR 80 mm werden vor dem Seed gegen das Original geprueft
  und nicht stillschweigend falsch zugeordnet.

Validierung: Import-, Berechtigungs-, Bestands- und Preis-Freeze-Tests sowie
`npm run typecheck`, `npm run lint`.

### P1, Auswertungen und Exporte aus M4 umsetzen

Quelle: Auswertungen in `CLAUDE.md`. Es gibt keine getrennten Auswertungsseiten
fuer Mitarbeitende und Baustellen, keine Excel-/PDF-Exporte und keine
Firmeneinstellungen fuer Logo und Firmenzeile.

Akzeptanzkriterien:

- Mitarbeitenden-Auswertung waehlt genau eine Person und bietet Monat, Jahr
  oder freie Zeitspanne mit Nettostunden, Pausen, Ferien und Krankheit.
- Vorgesetzte sind auswaehlbar; Mitarbeitende koennen fremde Daten weder
  laden noch exportieren.
- Baustellenauswertung kann eine Baustelle oder eine Gesamtuebersicht zeigen
  und enthaelt Soll, Ist, Differenz, Materialkosten, VSI, Partner und Zeitraum.
- Excel und PDF enthalten die gleichen geprueften Werte; PDF enthaelt Logo und
  Firmenangaben.
- Geld bleibt `Decimal`, Berechtigungen liegen in Server Actions.

Validierung: Berechtigungs- und Summen-Tests sowie ein Export-Smoke-Test.

### P1, Aufbewahrung fuer Login-Protokolle vervollstaendigen

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

## Bewusst zurueckgestellt

- M6a bis M6c und M7a bis M7c aus `docs/lifecycle.md`, bis M3/M4 abgeschlossen
  und der einmonatige Parallelbetrieb nachgewiesen ist.
- QR-Rechnung, Offerten, Rechnungen und Mahnwesen, solange die in
  `docs/lifecycle.md` genannten offenen Geschaeftsentscheidungen nicht geklaert
  sind.

## Pruefprotokoll

- `npm run typecheck`: bestanden am 2026-09-13.
- `npm run lint`: bestanden am 2026-09-13.
- `.next/dev/logs/next-development.log`: nur erfolgreiche Kompilierungen und
  React-DevTools-Hinweise, keine ungeloeste Exception im gelesenen Verlauf.
