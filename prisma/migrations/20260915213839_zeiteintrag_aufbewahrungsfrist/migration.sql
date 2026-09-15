-- Zehn Jahre sind eine Aufbewahrungsfrist, keine Löschfrist.
--
-- OR 958f sagt, wie lange Geschäftsunterlagen dableiben *müssen*, nicht
-- wann sie weg *sollen*. Ein Job, der nach zehn Jahren löscht, erfindet
-- eine Pflicht, die es nicht gibt, und tut es unwiederbringlich. Bei
-- Krankheitsnotizen und Anmeldeprotokollen ist es umgekehrt: das sind
-- Löschpflichten nach revDSG, und dort löscht der Job weiterhin.
--
-- Die Spalte bleibt, sie sagt, bis wann ein Eintrag aufzubewahren ist.
-- Sie heisst nur nicht mehr so, als wäre sie ein Auftrag zum Löschen:
-- genau dieser Name hat dazu geführt, dass ein Job darauf gelöscht hat.
-- Der Ausdruck hängt an "workDate" und übersteht das Umbenennen.
ALTER TABLE "TimeEntry" RENAME COLUMN "deleteAfter" TO "keepUntil";

ALTER INDEX "TimeEntry_deleteAfter_idx" RENAME TO "TimeEntry_keepUntil_idx";
