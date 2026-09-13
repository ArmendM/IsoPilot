import { db } from "@/lib/db";
import { monthKey } from "@/lib/dates";
import type { SessionUser } from "@/lib/session";

/** Der Monatsabschluss gilt auch für Vorgesetzte. Sonst ist er wertlos. */
export async function assertMonthOpen(companyId: string, date: Date) {
  const lock = await db.monthLock.findUnique({
    where: { companyId_month: { companyId, month: monthKey(date) } },
  });
  if (lock?.isLocked) throw new Error(`MONTH_LOCKED:${monthKey(date)}`);
}

/** Mitarbeitende nur eigene Daten, Vorgesetzte alle der eigenen Firma.
 *  Daut und Qail sehen einander ausdrücklich. */
export function assertOwnerOrAdmin(user: SessionUser, ownerId: string) {
  if (user.role !== "ADMIN" && user.id !== ownerId) throw new Error("FORBIDDEN");
}

export async function assertSameCompany(companyId: string, userId: string) {
  const t = await db.user.findUnique({ where: { id: userId } });
  if (!t || t.companyId !== companyId) throw new Error("FORBIDDEN");
}
