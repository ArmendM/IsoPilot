"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { monatLaeuftNoch } from "@/lib/dates";

export type ActionResult = { ok: true } | { ok: false; error: string };

const Input = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  sperren: z.boolean(),
  reason: z.string().max(300).nullable(),
});

export async function setMonthLock(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return { ok: false, error: "Nur ein Vorgesetzter schliesst einen Monat ab." };

  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const i = parsed.data;

  // Ein Monat, der noch läuft, lässt sich nicht abschliessen. Sonst fehlen
  // die Stunden der restlichen Tage und niemand käme mehr an sie heran.
  if (i.sperren && monatLaeuftNoch(i.month))
    return {
      ok: false,
      error: "Dieser Monat läuft noch. Abschliessen geht erst, wenn er vorbei ist.",
    };

  // Ein Monat wieder aufmachen ist eine Ausnahme und gehört begründet.
  if (!i.sperren && !i.reason?.trim())
    return { ok: false, error: "Zum Öffnen brauche ich einen Grund fürs Protokoll." };

  try {
    await db.$transaction(async (tx) => {
      const vorher = await tx.monthLock.findUnique({
        where: { companyId_month: { companyId: user.companyId, month: i.month } },
      });

      const lock = await tx.monthLock.upsert({
        where: { companyId_month: { companyId: user.companyId, month: i.month } },
        update: { isLocked: i.sperren },
        create: { companyId: user.companyId, month: i.month, isLocked: i.sperren },
      });

      await tx.monthLockEvent.create({
        data: {
          monthLockId: lock.id,
          actorId: user.id,
          action: i.sperren ? "LOCKED" : "UNLOCKED",
          reason: i.reason?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: i.sperren ? "MONTH_LOCKED" : "MONTH_UNLOCKED",
          entity: "MonthLock",
          entityId: lock.id,
          before: vorher ? JSON.parse(JSON.stringify(vorher)) : undefined,
          after: JSON.parse(JSON.stringify(lock)),
        },
      });
    });

    revalidatePath("/abschluss");
    revalidatePath("/zeiten");
    revalidatePath("/zeiten/monat");
    revalidatePath("/absenzen");
    return { ok: true };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "FORBIDDEN") return { ok: false, error: "Dafür fehlt dir die Berechtigung." };
    console.error(e);
    return { ok: false, error: "Speichern fehlgeschlagen." };
  }
}
