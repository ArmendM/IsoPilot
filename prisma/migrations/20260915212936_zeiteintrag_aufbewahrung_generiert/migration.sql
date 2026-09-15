-- Die Zehnjahresfrist für Zeiteinträge hat nie gegriffen.
--
-- `prisma/schema.prisma` beschreibt `TimeEntry.deleteAfter` seit dem
-- ersten Tag als generierte Spalte und nennt sogar das SQL dafür. In der
-- Migration stand aber nur eine gewöhnliche Spalte, und gesetzt hat sie
-- nie jemand: `is_generated` war NEVER und der Wert auf jeder Zeile NULL.
-- Der Aufbewahrungsjob las damit eine Bedingung, die auf nichts zutraf,
-- und löschte still nichts.
--
-- Als generierte Spalte braucht es dafür keine Schreibdisziplin: der Wert
-- ergibt sich aus `workDate`, auch für die Zeilen, die schon da sind, und
-- auch für jede, die ein späterer Pfad anlegt. Umstellen geht in Postgres
-- nur über Weg und neu, das ist hier folgenlos: die Spalte war leer.
ALTER TABLE "TimeEntry" DROP COLUMN "deleteAfter";

ALTER TABLE "TimeEntry" ADD COLUMN "deleteAfter" date
  GENERATED ALWAYS AS (("workDate" + INTERVAL '10 years')::date) STORED;

-- Der Index fällt mit der Spalte und wird unter demselben Namen neu
-- angelegt: `@@index([deleteAfter])` im Schema erwartet genau diesen.
CREATE INDEX "TimeEntry_deleteAfter_idx" ON "TimeEntry"("deleteAfter");
