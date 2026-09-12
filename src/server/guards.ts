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

/** Erlaubte Statuswechsel einer Baustelle. Kein freies Springen. */
export const NEXT_STATUS: Record<string, string[]> = {
  OFFERTE: ["AUFTRAG", "VERLOREN", "STORNIERT"],
  AUFTRAG: ["GEPLANT", "PAUSIERT", "STORNIERT"],
  GEPLANT: ["IN_ARBEIT", "AUFTRAG", "PAUSIERT", "STORNIERT"],
  IN_ARBEIT: ["AUSGEFUEHRT", "PAUSIERT"],
  AUSGEFUEHRT: ["VERRECHNET", "IN_ARBEIT"],
  VERRECHNET: ["ABGESCHLOSSEN", "AUSGEFUEHRT"],
  ABGESCHLOSSEN: [],
  VERLOREN: ["OFFERTE"],
  PAUSIERT: ["AUFTRAG", "GEPLANT", "IN_ARBEIT", "STORNIERT"],
  STORNIERT: [],
};

const LINE = ["OFFERTE","AUFTRAG","GEPLANT","IN_ARBEIT","AUSGEFUEHRT","VERRECHNET","ABGESCHLOSSEN"];

/** Rückschritte und Abbrüche verlangen eine Begründung. */
export function needsReason(from: string, to: string): boolean {
  if (["VERLOREN", "STORNIERT", "PAUSIERT"].includes(to)) return true;
  const a = LINE.indexOf(from), b = LINE.indexOf(to);
  return a >= 0 && b >= 0 && b < a;
}

export function assertTransition(from: string, to: string, reason?: string) {
  if (!(NEXT_STATUS[from] ?? []).includes(to)) throw new Error("BAD_TRANSITION");
  if (needsReason(from, to) && !reason?.trim()) throw new Error("REASON_REQUIRED");
}

/** Zeit buchen ab Auftrag, Material bereits in der Offertphase. */
export const canBookTime = (s: string) => ["AUFTRAG", "GEPLANT", "IN_ARBEIT"].includes(s);
export const canBookMaterial = (s: string) =>
  ["OFFERTE", "AUFTRAG", "GEPLANT", "IN_ARBEIT", "AUSGEFUEHRT"].includes(s);
