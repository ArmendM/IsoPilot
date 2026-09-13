"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertMonthOpen, assertOwnerOrAdmin, assertSameCompany } from "./guards";

export type ActionResult = { ok: true } | { ok: false; error: string };

const Input = z.object({
  siteId: z.string().min(1),
  userId: z.string().min(1),
  materialId: z.string().min(1),
  menge: z.number().positive().max(1_000_000),
  bookedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Material aus dem Katalog auf eine Baustelle buchen. Der Preis wird hier
 * als eigener Wert übernommen, nicht als Verweis auf den Artikel: ein
 * späterer Preisimport darf diese Buchung nicht rückwirkend ändern.
 * Buchung, Lagerbewegung und Protokolleintrag gehören in eine Transaktion.
 */
export async function saveMaterialBooking(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Artikel, Menge und Datum werden gebraucht." };
  const i = parsed.data;

  try {
    assertOwnerOrAdmin(user, i.userId);
    await assertSameCompany(user.companyId, i.userId);

    const bookedOn = new Date(`${i.bookedOn}T00:00:00Z`);
    await assertMonthOpen(user.companyId, bookedOn);

    const site = await db.site.findUnique({ where: { id: i.siteId } });
    if (!site || site.companyId !== user.companyId)
      return { ok: false, error: "Baustelle nicht gefunden." };

    const material = await db.material.findUnique({ where: { id: i.materialId } });
    if (!material || material.companyId !== user.companyId || !material.isActive)
      return { ok: false, error: "Artikel nicht gefunden." };

    await db.$transaction(async (tx) => {
      const booking = await tx.materialBooking.create({
        data: {
          siteId: site.id,
          userId: i.userId,
          kind: "CATALOG",
          materialId: material.id,
          quantity: i.menge,
          unit: material.unit,
          unitPrice: material.price,
          bookedOn,
        },
      });

      await tx.material.update({
        where: { id: material.id },
        data: { stock: { decrement: i.menge } },
      });

      await tx.stockMovement.create({
        data: {
          materialId: material.id,
          userId: user.id,
          delta: -i.menge,
          reason: "BOOKING",
          note: `Buchung auf ${site.name ?? site.street}`,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "CREATE",
          entity: "MaterialBooking",
          entityId: booking.id,
          after: JSON.parse(JSON.stringify(booking)),
        },
      });
    });

    revalidatePath("/baustellen");
    revalidatePath("/material");
    return { ok: true };
  } catch (e) {
    return fehler(e);
  }
}

/**
 * Rückgängig machen bucht die Menge zurück ins Lager. Ein Soft Delete,
 * damit die ursprüngliche Buchung im Protokoll nachvollziehbar bleibt.
 */
export async function deleteMaterialBooking(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (typeof id !== "string" || !id) return { ok: false, error: "Ungültige Eingabe." };

  try {
    const before = await db.materialBooking.findUnique({
      where: { id },
      include: { site: true },
    });
    if (!before || before.deletedAt) return { ok: false, error: "Buchung nicht gefunden." };
    if (before.site.companyId !== user.companyId)
      return { ok: false, error: "Buchung nicht gefunden." };

    assertOwnerOrAdmin(user, before.userId);
    await assertMonthOpen(user.companyId, before.bookedOn);

    await db.$transaction(async (tx) => {
      const after = await tx.materialBooking.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      if (before.kind === "CATALOG" && before.materialId) {
        await tx.material.update({
          where: { id: before.materialId },
          data: { stock: { increment: before.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            materialId: before.materialId,
            userId: user.id,
            delta: before.quantity,
            reason: "RETURN",
            note: "Buchung rückgängig gemacht",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "DELETE",
          entity: "MaterialBooking",
          entityId: id,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/baustellen");
    revalidatePath("/material");
    return { ok: true };
  } catch (e) {
    return fehler(e);
  }
}

function fehler(e: unknown): ActionResult {
  const m = e instanceof Error ? e.message : "";
  if (m.startsWith("MONTH_LOCKED"))
    return {
      ok: false,
      error: "Dieser Monat ist abgeschlossen und kann nicht mehr geändert werden.",
    };
  if (m === "FORBIDDEN") return { ok: false, error: "Dafür fehlt dir die Berechtigung." };
  console.error(e);
  return { ok: false, error: "Speichern fehlgeschlagen." };
}
