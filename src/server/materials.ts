"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; error: string };

const Artikel = z.object({
  id: z.string().optional(),
  sku: z.string().max(40).nullable(),
  name: z.string().min(1).max(160),
  categoryId: z.string().nullable(),
  unit: z.enum(["M2", "LFM", "STK", "KG", "ROLLE"]),
  preis: z.number().min(0).max(1000000),
  lager: z.number().min(0).max(1000000),
  mindestbestand: z.number().min(0).max(1000000),
  fireClass: z.string().max(20).nullable(),
});

const Kategorie = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().min(0).max(999),
});

async function nurVorgesetzte() {
  const user = await requireUser();
  if (user.role !== "ADMIN") return null;
  return user;
}

export async function saveMaterial(raw: unknown): Promise<ActionResult> {
  const user = await nurVorgesetzte();
  if (!user) return { ok: false, error: "Nur ein Vorgesetzter pflegt den Katalog." };

  const parsed = Artikel.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Name, Einheit und Preis werden gebraucht." };
  const i = parsed.data;

  try {
    if (i.categoryId) {
      const k = await db.category.findUnique({ where: { id: i.categoryId } });
      if (!k || k.companyId !== user.companyId)
        return { ok: false, error: "Diese Kategorie gehört nicht zur Firma." };
    }

    const daten = {
      sku: i.sku?.trim() || null,
      name: i.name.trim(),
      categoryId: i.categoryId || null,
      unit: i.unit,
      price: i.preis,
      stock: i.lager,
      minStock: i.mindestbestand,
      fireClass: i.fireClass?.trim() || null,
    };

    await db.$transaction(async (tx) => {
      const before = i.id ? await tx.material.findUnique({ where: { id: i.id } }) : null;
      if (i.id && (!before || before.companyId !== user.companyId))
        throw new Error("FORBIDDEN");

      /* Wird der Lagerbestand tatsächlich geändert, ist das eine Zählung.
       * Eine offene Fehlmenge gilt damit als erledigt, sonst bliebe ein
       * Bestellbedarf stehen, den es nach der Inventur nicht mehr gibt.
       * Bleibt die Zahl gleich, etwa weil nur der Preis geändert wurde,
       * wird die Fehlmenge nicht angerührt. Gefüllt wird sie sonst
       * ausschliesslich über Buchungen und den Wareneingang. */
      const gezaehlt = before !== null && Number(before.stock) !== i.lager;

      const after = i.id
        ? await tx.material.update({
            where: { id: i.id },
            data: gezaehlt ? { ...daten, shortfall: 0 } : daten,
          })
        : await tx.material.create({ data: { ...daten, companyId: user.companyId } });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: before ? "UPDATE" : "CREATE",
          entity: "Material",
          entityId: after.id,
          before: before ? JSON.parse(JSON.stringify(before)) : undefined,
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/material");
    return { ok: true };
  } catch (e) {
    return fehler(e, "doppelt");
  }
}

/** Artikel werden stillgelegt statt gelöscht: sie hängen an Buchungen. */
export async function setMaterialAktiv(
  id: string,
  aktiv: boolean,
): Promise<ActionResult> {
  const user = await nurVorgesetzte();
  if (!user) return { ok: false, error: "Nur ein Vorgesetzter pflegt den Katalog." };

  try {
    const before = await db.material.findUnique({ where: { id } });
    if (!before || before.companyId !== user.companyId)
      return { ok: false, error: "Artikel nicht gefunden." };

    await db.$transaction(async (tx) => {
      const after = await tx.material.update({
        where: { id },
        data: { isActive: aktiv },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: aktiv ? "MATERIAL_ACTIVATED" : "MATERIAL_DEACTIVATED",
          entity: "Material",
          entityId: id,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/material");
    return { ok: true };
  } catch (e) {
    return fehler(e);
  }
}

/** Anlegen oder umbenennen. Ein Umbenennen wirkt auf alle Artikel der
 *  Kategorie, weil die Artikel auf die Zeile zeigen und nicht auf den Text. */
export async function saveKategorie(raw: unknown): Promise<ActionResult> {
  const user = await nurVorgesetzte();
  if (!user) return { ok: false, error: "Nur ein Vorgesetzter pflegt den Katalog." };

  const parsed = Kategorie.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Der Name wird gebraucht." };
  const i = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      const before = i.id ? await tx.category.findUnique({ where: { id: i.id } }) : null;
      if (i.id && (!before || before.companyId !== user.companyId))
        throw new Error("FORBIDDEN");

      const after = i.id
        ? await tx.category.update({
            where: { id: i.id },
            data: { name: i.name.trim(), sortOrder: i.sortOrder },
          })
        : await tx.category.create({
            data: {
              companyId: user.companyId,
              name: i.name.trim(),
              sortOrder: i.sortOrder,
            },
          });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: before ? "UPDATE" : "CREATE",
          entity: "Category",
          entityId: after.id,
          before: before ? JSON.parse(JSON.stringify(before)) : undefined,
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/material");
    return { ok: true };
  } catch (e) {
    return fehler(e, "doppelt");
  }
}

function fehler(e: unknown, art?: "doppelt"): ActionResult {
  const m = e instanceof Error ? e.message : "";
  if (m === "FORBIDDEN") return { ok: false, error: "Dafür fehlt dir die Berechtigung." };
  if (art === "doppelt" && m.includes("Unique constraint"))
    return {
      ok: false,
      error: "Diese Artikelnummer oder diese Kombination aus Kategorie und Name gibt es schon.",
    };
  console.error(e);
  return { ok: false, error: "Speichern fehlgeschlagen." };
}
