"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { darfLager } from "@/lib/berechtigung";
import { gibZurueck, zaehldifferenz, zaehle } from "@/lib/lagerdeckung";

/* Wareneingang. Bisher wurde ein Bestand über "Bearbeiten" am Artikel
 * überschrieben: umständlich, und im Lagerverlauf blieb keine Spur. Wer
 * später fragt, warum der Bestand sprang, fand nichts.
 *
 * Eine Lieferung tilgt zuerst eine offene Fehlmenge, erst dann wächst der
 * Bestand. Das ist dieselbe Regel wie beim Rückgängigmachen einer Buchung
 * und steht in lib/lagerdeckung.ts. */

export type ActionResult = { ok: true } | { ok: false; error: string };

const Zaehlung = z.object({
  materialId: z.string().min(1),
  gezaehlt: z.number().min(0).max(1_000_000),
  note: z.string().max(200).nullable(),
});

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

/* Inventur. Bis hierher war der Bestand im Artikelformular direkt
 * schreibbar, und im Verlauf blieb von diesem Sprung nichts übrig: wer
 * später fragte, warum aus 42 plötzlich 38 wurden, fand keine Zeile.
 *
 * Jetzt gibt es dafür eine eigene Handlung, und der Bestand ändert sich
 * nur noch über Bewegungen.
 *
 * Gezählt wird der Bestand, nicht die Differenz: auf dem Lagerplatz
 * zählt man Stücke, und das Rechnen soll nicht die Person machen. */
export async function inventur(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!darfLager(user))
    return {
      ok: false,
      error: "Dafür braucht es die Lagerberechtigung. Ein Vorgesetzter gibt sie unter „Personen“ frei.",
    };

  const parsed = Zaehlung.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: "Artikel und gezählter Bestand werden gebraucht." };
  const i = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      const m = await tx.material.findUnique({ where: { id: i.materialId } });
      if (!m || m.companyId !== user.companyId) throw new Error("MATERIAL_NOT_FOUND");

      const vorher = { bestand: Number(m.stock), fehlmenge: Number(m.shortfall) };
      const differenz = zaehldifferenz(vorher, i.gezaehlt);
      const nachher = zaehle(i.gezaehlt);

      await tx.material.update({
        where: { id: m.id },
        data: { stock: nachher.bestand, shortfall: nachher.fehlmenge },
      });

      /* Bestätigt die Zählung, was in den Büchern steht, entsteht keine
       * Bewegung: eine Zeile mit null wäre nur Rauschen. Der Artikel
       * selbst ändert sich dann auch nicht. */
      if (differenz !== 0) {
        const bewegung = await tx.stockMovement.create({
          data: {
            materialId: m.id,
            userId: user.id,
            delta: differenz,
            reason: "CORRECTION",
            note: [`Inventur, gezählt ${i.gezaehlt}`, i.note?.trim()]
              .filter(Boolean)
              .join(", ")
              .slice(0, 200),
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
      }
    });

    revalidatePath("/material");
    revalidatePath("/lager");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "MATERIAL_NOT_FOUND") return { ok: false, error: "Artikel nicht gefunden." };
    console.error(e);
    return { ok: false, error: "Die Inventur liess sich nicht erfassen." };
  }
}
