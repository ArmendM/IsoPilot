-- Die Aufbewahrungsfrist als Regel, nicht als Spalte.
--
-- M4f hat `TimeEntry.keepUntil` als generierte Spalte angelegt, damit die
-- Frist am Eintrag steht. Das hat einen Preis, der erst beim naechsten
-- `prisma migrate dev` sichtbar wurde: Prisma kennt generierte Spalten
-- nicht, sieht beim Abgleich einen Unterschied, wo keiner ist, und
-- schreibt in jede weitere Migration ein
--   ALTER TABLE "TimeEntry" ALTER COLUMN "keepUntil" DROP DEFAULT;
-- das an einer generierten Spalte scheitert. Jede kuenftige Migration
-- haette von Hand nachbearbeitet werden muessen.
--
-- Der Wert ist ohnehin eine reine Rechnung, workDate plus zehn Jahre, und
-- gelesen hat ihn niemand: geloescht wird darauf bewusst nicht. Als
-- Funktion `aufbewahrenBis` in src/lib/aufbewahrung.ts steht dieselbe
-- Auskunft ueberall zur Verfuegung, kostet nichts und legt sich nicht
-- mit dem Werkzeug an.
DROP INDEX IF EXISTS "TimeEntry_keepUntil_idx";

ALTER TABLE "TimeEntry" DROP COLUMN "keepUntil";
