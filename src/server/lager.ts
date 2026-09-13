"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { darfLager } from "@/lib/berechtigung";
import { gibZurueck } from "@/lib/lagerdeckung";

/* Wareneingang. Bisher wurde ein Bestand über "Bearbeiten" am Artikel
 * überschrieben: umständlich, und im Lagerverlauf blieb keine Spur. Wer
 * später fragt, warum der Bestand sprang, fand nichts.
 *
 * Eine Lieferung tilgt zuerst eine offene Fehlmenge, erst dann wächst der
 * Bestand. Das ist dieselbe Regel wie beim Rückgängigmachen einer Buchung
 * und steht in lib/lagerdeckung.ts. */

export type ActionResult = { ok: true } | { ok: false; error: string };

const Eingang = z.object({
  materialId: z.string().min(1),
  menge: z.number().positive().max(1_000_000),
  note: z.string().max(200).nullable(),
});

export async function bucheWareneingang(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  // Vorgesetzte, und wer die Lagerberechtigung hat: eine Lieferung soll
  // annehmen können, wer gerade da ist.
  if (!darfLager(user))
    return {
      ok: false,
      error: "Dafür braucht es die Lagerberechtigung. Ein Vorgesetzter gibt sie unter „Personen“ frei.",
    };

  const parsed = Eingang.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Artikel und Menge werden gebraucht." };
  const i = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      const m = await tx.material.findUnique({ where: { id: i.materialId } });
      if (!m || m.companyId !== user.companyId) throw new Error("MATERIAL_NOT_FOUND");

      const vorher = { bestand: Number(m.stock), fehlmenge: Number(m.shortfall) };
      const nachher = gibZurueck(vorher, i.menge);

      await tx.material.update({
        where: { id: m.id },
        data: { stock: nachher.bestand, shortfall: nachher.fehlmenge },
      });

      /* Die Bewegung trägt die gelieferte Menge, nicht nur den Teil, der
       * im Lager landet. Beim Wareneingang ist die Lieferung selbst das
       * Ereignis, und getilgte Fehlmenge ist ebenfalls angekommene Ware. */
      const bewegung = await tx.stockMovement.create({
        data: {
          materialId: m.id,
          userId: user.id,
          delta: i.menge,
          reason: "DELIVERY",
          note: i.note?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "CREATE",
          entity: "StockMovement",
          entityId: bewegung.id,
          after: JSON.parse(JSON.stringify(bewegung)),
        },
      });
    });

    revalidatePath("/material");
    revalidatePath("/lager");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "MATERIAL_NOT_FOUND") return { ok: false, error: "Artikel nicht gefunden." };
    console.error(e);
    return { ok: false, error: "Der Wareneingang liess sich nicht erfassen." };
  }
}
