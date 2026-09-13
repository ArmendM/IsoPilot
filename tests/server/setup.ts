import "./env";
import { beforeEach } from "vitest";
import { db } from "@/lib/db";

/* Diese Schicht schreibt wirklich in eine Datenbank und leert sie zwischen
 * den Tests. Die Bremse gegen die falsche Datenbank steht in ./env, weil
 * sie vor dem Import von @/lib/db greifen muss. */

/* Reihenfolge egal, CASCADE räumt die Verweise mit ab. Company steht
 * zuletzt, weil alles andere daran hängt. */
const TABELLEN = [
  "AuditLog",
  "StockMovement",
  "MaterialBooking",
  "TimeEntry",
  "Absence",
  "VacationBalance",
  "MonthLockEvent",
  "MonthLock",
  "Holiday",
  "Session",
  "Site",
  "Material",
  "Category",
  "Partner",
  "User",
  "Company",
];

beforeEach(async () => {
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABELLEN.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
});
