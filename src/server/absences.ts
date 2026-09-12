"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { monthKey, workingDays } from "@/lib/dates";
import { holidaySet } from "@/lib/holidays";
import { assertMonthOpen, assertOwnerOrAdmin, assertSameCompany } from "./guards";

const Input = z.object({
  id: z.string().optional(),
  userId: z.string(),
  type: z.enum(["VACATION", "SICK", "OTHER"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isHalfDay: z.boolean().default(false),
  note: z.string().max(500).nullable(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

const tag = (s: string) => new Date(`${s}T00:00:00Z`);

/** Jeden berührten Monat prüfen, nicht nur Anfang und Ende: eine Absenz
 *  über den Jahreswechsel spannt drei Monate. */
async function assertMonateOffen(companyId: string, von: Date, bis: Date) {
  const gesehen = new Set<string>();
  const d = new Date(von);
  while (d <= bis) {
    const k = monthKey(d);
    if (!gesehen.has(k)) {
      gesehen.add(k);
      await assertMonthOpen(companyId, new Date(d));
    }
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
  }
  await assertMonthOpen(companyId, bis);
}

export async function saveAbsence(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const i = parsed.data;

  try {
    assertOwnerOrAdmin(user, i.userId);
    await assertSameCompany(user.companyId, i.userId);

    const von = tag(i.startDate);
    const bis = tag(i.endDate);
    if (bis < von)
      return { ok: false, error: "Das Enddatum liegt vor dem Startdatum." };
    if (i.isHalfDay && i.startDate !== i.endDate)
      return { ok: false, error: "Ein halber Tag geht nur an einem einzelnen Tag." };

    await assertMonateOffen(user.companyId, von, bis);

    // Feiertage und Wochenenden zählen nicht als Ferientage.
    const feiertage = await holidaySet(user.companyId, von, bis);
    const tage = workingDays(von, bis, feiertage);
    if (tage === 0)
      return {
        ok: false,
        error: "In diesem Zeitraum liegt kein Arbeitstag, es gibt nichts zu erfassen.",
      };
    const umfang = i.isHalfDay ? 0.5 : tage;

    const ueberschneidung = await db.absence.findFirst({
      where: {
        userId: i.userId,
        deletedAt: null,
        status: { in: ["PENDING", "APPROVED"] },
        id: i.id ? { not: i.id } : undefined,
        startDate: { lte: bis },
        endDate: { gte: von },
      },
    });
    if (ueberschneidung)
      return { ok: false, error: "Für diesen Zeitraum ist schon eine Absenz erfasst." };

    // Krank gilt sofort. Ferien und übrige Absenzen brauchen eine Freigabe.
    const status = i.type === "SICK" ? "APPROVED" : "PENDING";

    // Gesundheitsdaten nach revDSG: Notiz zu Krankheit nach 18 Monaten leeren.
    const noteClearAt =
      i.type === "SICK" && i.note
        ? new Date(Date.UTC(bis.getUTCFullYear(), bis.getUTCMonth() + 18, bis.getUTCDate()))
        : null;

    const data = {
      userId: i.userId,
      type: i.type,
      startDate: von,
      endDate: bis,
      isHalfDay: i.isHalfDay,
      workingDays: umfang,
      status: status as "PENDING" | "APPROVED",
      note: i.note,
      noteClearAt,
      decidedById: i.type === "SICK" ? user.id : null,
      decidedAt: i.type === "SICK" ? new Date() : null,
    };

    await db.$transaction(async (tx) => {
      const before = i.id ? await tx.absence.findUnique({ where: { id: i.id } }) : null;
      const after = i.id
        ? await tx.absence.update({ where: { id: i.id }, data })
        : await tx.absence.create({ data });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: before ? "UPDATE" : "CREATE",
          entity: "Absence",
          entityId: after.id,
          before: before ? JSON.parse(JSON.stringify(before)) : undefined,
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/absenzen");
    revalidatePath("/zeiten/monat");
    return { ok: true };
  } catch (e) {
    return fehler(e, "Speichern fehlgeschlagen.");
  }
}

/** Genehmigen oder ablehnen. Nur Vorgesetzte. */
export async function decideAbsence(
  id: string,
  entscheid: "APPROVED" | "DENIED",
): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return { ok: false, error: "Nur ein Vorgesetzter entscheidet über Absenzen." };
  if (entscheid !== "APPROVED" && entscheid !== "DENIED")
    return { ok: false, error: "Ungültige Eingabe." };

  try {
    const before = await db.absence.findUnique({ where: { id } });
    if (!before || before.deletedAt) return { ok: false, error: "Absenz nicht gefunden." };
    await assertSameCompany(user.companyId, before.userId);
    await assertMonateOffen(user.companyId, before.startDate, before.endDate);

    await db.$transaction(async (tx) => {
      const after = await tx.absence.update({
        where: { id },
        data: { status: entscheid, decidedById: user.id, decidedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          // Eigene Ferien selbst freigeben ist bei vier Personen normal,
          // soll aber im Protokoll unterscheidbar sein.
          action:
            before.userId === user.id
              ? `ABSENCE_SELF_${entscheid}`
              : `ABSENCE_${entscheid}`,
          entity: "Absence",
          entityId: id,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/absenzen");
    revalidatePath("/zeiten/monat");
    return { ok: true };
  } catch (e) {
    return fehler(e, "Entscheid fehlgeschlagen.");
  }
}

/** Soft Delete, damit ein Antrag nachvollziehbar bleibt. */
export async function deleteAbsence(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const before = await db.absence.findUnique({ where: { id } });
    if (!before || before.deletedAt) return { ok: false, error: "Absenz nicht gefunden." };

    assertOwnerOrAdmin(user, before.userId);
    await assertSameCompany(user.companyId, before.userId);
    await assertMonateOffen(user.companyId, before.startDate, before.endDate);

    // Einen bereits genehmigten Antrag zurückzuziehen ist Sache der
    // vorgesetzten Person, nicht der betroffenen.
    if (before.status === "APPROVED" && before.userId === user.id && user.role !== "ADMIN")
      return {
        ok: false,
        error: "Diese Absenz ist bewilligt. Melde dich bei Daut oder Qail, wenn sie weg soll.",
      };

    await db.$transaction(async (tx) => {
      const after = await tx.absence.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "DELETE",
          entity: "Absence",
          entityId: id,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/absenzen");
    revalidatePath("/zeiten/monat");
    return { ok: true };
  } catch (e) {
    return fehler(e, "Löschen fehlgeschlagen.");
  }
}

function fehler(e: unknown, fallback: string): ActionResult {
  const m = e instanceof Error ? e.message : "";
  if (m.startsWith("MONTH_LOCKED"))
    return {
      ok: false,
      error: "Der betroffene Monat ist abgeschlossen und kann nicht mehr geändert werden.",
    };
  if (m === "FORBIDDEN") return { ok: false, error: "Dafür fehlt dir die Berechtigung." };
  console.error(e);
  return { ok: false, error: fallback };
}
