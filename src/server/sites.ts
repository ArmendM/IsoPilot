"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; error: string };

const Input = z.object({
  id: z.string().optional(),
  // Objektname ist freiwillig, Adresse mit Hausnummer und PLZ sind Pflicht.
  name: z.string().max(120).nullable(),
  street: z.string().min(1).max(120),
  zip: z.string().min(4).max(10),
  city: z.string().min(1).max(80),
  partnerId: z.string().nullable(),
  targetHours: z.number().min(0).max(100000),
  discountPct: z.number().int().min(0).max(100),
});

const Status = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "PAUSED", "DONE"]),
});

export async function saveSite(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return { ok: false, error: "Nur ein Vorgesetzter legt Baustellen an." };

  const parsed = Input.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      error: "Strasse mit Hausnummer, Postleitzahl und Ort werden gebraucht.",
    };
  const i = parsed.data;

  try {
    if (i.partnerId) {
      const partner = await db.partner.findUnique({ where: { id: i.partnerId } });
      if (!partner || partner.companyId !== user.companyId)
        return { ok: false, error: "Dieser Auftraggeber gehört nicht zur Firma." };
    }

    const daten = {
      name: i.name?.trim() || null,
      street: i.street.trim(),
      zip: i.zip.trim(),
      city: i.city.trim(),
      partnerId: i.partnerId || null,
      targetHours: i.targetHours,
      discountPct: i.discountPct,
    };

    await db.$transaction(async (tx) => {
      const before = i.id ? await tx.site.findUnique({ where: { id: i.id } }) : null;
      if (i.id && (!before || before.companyId !== user.companyId))
        throw new Error("FORBIDDEN");

      const after = i.id
        ? await tx.site.update({ where: { id: i.id }, data: daten })
        : await tx.site.create({ data: { ...daten, companyId: user.companyId } });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: before ? "UPDATE" : "CREATE",
          entity: "Site",
          entityId: after.id,
          before: before ? JSON.parse(JSON.stringify(before)) : undefined,
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/baustellen");
    revalidatePath("/zeiten");
    return { ok: true };
  } catch (e) {
    return fehler(e);
  }
}

/** Offen, pausiert oder abgeschlossen. Gelöscht wird eine Baustelle nie,
 *  sie muss in den Auswertungen auffindbar bleiben. */
export async function setSiteStatus(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return { ok: false, error: "Nur ein Vorgesetzter ändert den Status." };

  const parsed = Status.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const i = parsed.data;

  try {
    const before = await db.site.findUnique({ where: { id: i.id } });
    if (!before || before.companyId !== user.companyId)
      return { ok: false, error: "Baustelle nicht gefunden." };
    if (before.status === i.status) return { ok: true };

    await db.$transaction(async (tx) => {
      const after = await tx.site.update({
        where: { id: i.id },
        data: {
          status: i.status,
          // doneAt hält fest, wann geschlossen wurde, und wird beim
          // Wiedereröffnen zurückgesetzt.
          doneAt: i.status === "DONE" ? new Date() : null,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: `SITE_${i.status}`,
          entity: "Site",
          entityId: i.id,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/baustellen");
    revalidatePath("/zeiten");
    return { ok: true };
  } catch (e) {
    return fehler(e);
  }
}

function fehler(e: unknown): ActionResult {
  const m = e instanceof Error ? e.message : "";
  if (m === "FORBIDDEN") return { ok: false, error: "Dafür fehlt dir die Berechtigung." };
  console.error(e);
  return { ok: false, error: "Speichern fehlgeschlagen." };
}
