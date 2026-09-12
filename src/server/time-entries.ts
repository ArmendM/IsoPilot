"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { zurichToUtc } from "@/lib/dates";
import { assertMonthOpen, assertOwnerOrAdmin, assertSameCompany } from "./guards";

const Input = z.object({
  id: z.string().optional(),
  userId: z.string(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  breakMinutes: z.number().int().min(0).max(480),
  siteId: z.string().nullable(),
  isRegie: z.boolean().default(false),
  note: z.string().max(500).nullable(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveTimeEntry(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const i = parsed.data;

  try {
    assertOwnerOrAdmin(user, i.userId);
    await assertSameCompany(user.companyId, i.userId);
    // Nur Vorgesetzte entscheiden über Regie
    if (i.isRegie && user.role !== "ADMIN")
      return { ok: false, error: "Regie darf nur ein Vorgesetzter setzen." };

    const workDate = new Date(`${i.workDate}T00:00:00Z`);
    await assertMonthOpen(user.companyId, workDate);

    const startedAt = zurichToUtc(i.workDate, i.start);
    const endedAt = zurichToUtc(i.workDate, i.end);
    if (endedAt <= startedAt) return { ok: false, error: "Die Endzeit muss nach der Startzeit liegen." };
    if ((+endedAt - +startedAt) / 3_600_000 - i.breakMinutes / 60 <= 0)
      return { ok: false, error: "Die Pause ist länger als die Arbeitszeit." };

    // Mehrere Einträge pro Tag sind erlaubt, Überschneidungen nicht
    const clash = await db.timeEntry.findFirst({
      where: {
        userId: i.userId, workDate, deletedAt: null,
        id: i.id ? { not: i.id } : undefined,
        startedAt: { lt: endedAt }, endedAt: { gt: startedAt },
      },
    });
    if (clash)
      return { ok: false, error: "Diese Zeit überschneidet sich mit einem bestehenden Eintrag." };

    const data = {
      userId: i.userId, siteId: i.siteId, workDate, startedAt, endedAt,
      breakMinutes: i.breakMinutes, note: i.note,
      billingMode: i.isRegie ? ("REGIE" as const) : ("PAUSCHAL" as const),
      source: "MANUAL" as const, createdById: user.id,
    };

    // Schreiben und Protokollieren in einer Transaktion: es darf keine
    // Änderung ohne Protokolleintrag geben.
    await db.$transaction(async (tx) => {
      const before = i.id ? await tx.timeEntry.findUnique({ where: { id: i.id } }) : null;
      if (before) await assertMonthOpen(user.companyId, before.workDate);

      const after = i.id
        ? await tx.timeEntry.update({ where: { id: i.id }, data })
        : await tx.timeEntry.create({ data });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId, actorId: user.id,
          action: before ? "UPDATE" : "CREATE",
          entity: "TimeEntry", entityId: after.id,
          before: before ? JSON.parse(JSON.stringify(before)) : undefined,
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/");
    revalidatePath("/zeiten");
    return { ok: true };
  } catch (e) {
    return fehler(e, "Speichern fehlgeschlagen.");
  }
}

/** Löschen ist ein Soft Delete. Korrekturen müssen nachvollziehbar
 *  bleiben, ein Eintrag verschwindet nie wirklich. */
export async function deleteTimeEntry(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (typeof id !== "string" || !id) return { ok: false, error: "Ungültige Eingabe." };

  try {
    const before = await db.timeEntry.findUnique({ where: { id } });
    if (!before || before.deletedAt) return { ok: false, error: "Eintrag nicht gefunden." };

    assertOwnerOrAdmin(user, before.userId);
    await assertSameCompany(user.companyId, before.userId);
    await assertMonthOpen(user.companyId, before.workDate);

    await db.$transaction(async (tx) => {
      const after = await tx.timeEntry.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "DELETE",
          entity: "TimeEntry",
          entityId: id,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/");
    revalidatePath("/zeiten");
    return { ok: true };
  } catch (e) {
    return fehler(e, "Löschen fehlgeschlagen.");
  }
}

/** Technische Ursachen bleiben im Serverprotokoll, der Browser bekommt
 *  einen Satz, der sagt was zu tun ist. */
function fehler(e: unknown, fallback: string): ActionResult {
  const m = e instanceof Error ? e.message : "";
  if (m.startsWith("MONTH_LOCKED"))
    return { ok: false, error: "Dieser Monat ist abgeschlossen und kann nicht mehr geändert werden." };
  if (m === "FORBIDDEN") return { ok: false, error: "Dafür fehlt dir die Berechtigung." };
  console.error(e);
  return { ok: false, error: fallback };
}
