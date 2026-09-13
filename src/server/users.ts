"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { istLetzterVorgesetzter } from "./users-read";

export type ActionResult = { ok: true } | { ok: false; error: string };

const Zugang = z.object({
  id: z.string().min(1),
  role: z.enum(["EMPLOYEE", "ADMIN"]),
  isActive: z.boolean(),
});

const Lagerrecht = z.object({
  id: z.string().min(1),
  canManageStock: z.boolean(),
});

const Stammdaten = z.object({
  id: z.string().min(1),
  vacationDays: z.number().int().min(0).max(60),
  regieTariff: z.enum(["A", "B"]),
  employedFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  employedUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

const tag = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);

/**
 * Freigabe und Rolle. Zwei Schranken, die verhindern, dass sich jemand
 * selbst oder die ganze Firma aussperrt.
 */
export async function setZugang(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return { ok: false, error: "Nur ein Vorgesetzter verwaltet Konten." };

  const parsed = Zugang.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const i = parsed.data;

  // Am eigenen Zugang schraubt niemand. Sonst nimmt sich jemand mit einem
  // Fehlklick die Rolle oder sperrt sich aus.
  if (i.id === user.id)
    return {
      ok: false,
      error: "Am eigenen Konto kannst du Rolle und Freigabe nicht ändern. Das muss die andere vorgesetzte Person tun.",
    };

  try {
    const before = await db.user.findUnique({ where: { id: i.id } });
    if (!before || before.companyId !== user.companyId)
      return { ok: false, error: "Person nicht gefunden." };

    // Die letzte freigegebene vorgesetzte Person darf nicht wegfallen,
    // sonst kann niemand mehr jemanden freigeben.
    const verliertAdmin =
      before.role === "ADMIN" &&
      before.isActive &&
      (i.role !== "ADMIN" || !i.isActive);

    if (verliertAdmin && (await istLetzterVorgesetzter(user.companyId, i.id)))
      return {
        ok: false,
        error: "Das ist die letzte freigegebene vorgesetzte Person. Setze zuerst jemand anderen als Vorgesetzten ein.",
      };

    await db.$transaction(async (tx) => {
      const after = await tx.user.update({
        where: { id: i.id },
        data: { role: i.role, isActive: i.isActive },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action:
            !before.isActive && i.isActive
              ? "USER_APPROVED"
              : before.isActive && !i.isActive
                ? "USER_BLOCKED"
                : "USER_ROLE_CHANGED",
          entity: "User",
          entityId: i.id,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/personen");
    return { ok: true };
  } catch (e) {
    return fehler(e);
  }
}

/**
 * Lagerberechtigung, bewusst als eigene Aktion neben setZugang.
 *
 * Zusammen mit Rolle und Freigabe in einem Aufruf hiesse, dass jeder
 * Rollenwechsel das Merkmal mitschickt und ein vergessenes Feld es
 * lautlos zurücksetzt. Und im Protokoll steht so, was tatsächlich
 * geschah, statt eines allgemeinen "Rolle geändert".
 *
 * Am eigenen Konto ist es erlaubt: anders als bei Rolle und Freigabe
 * kann sich damit niemand aussperren, und ein Vorgesetzter hat das Recht
 * ohnehin schon über die Rolle.
 */
export async function setLagerrecht(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return { ok: false, error: "Nur ein Vorgesetzter verwaltet Konten." };

  const parsed = Lagerrecht.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const i = parsed.data;

  try {
    const before = await db.user.findUnique({ where: { id: i.id } });
    if (!before || before.companyId !== user.companyId)
      return { ok: false, error: "Person nicht gefunden." };

    await db.$transaction(async (tx) => {
      const after = await tx.user.update({
        where: { id: i.id },
        data: { canManageStock: i.canManageStock },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: i.canManageStock ? "USER_STOCK_GRANTED" : "USER_STOCK_REVOKED",
          entity: "User",
          entityId: i.id,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/personen");
    revalidatePath("/material");
    revalidatePath("/lager");
    return { ok: true };
  } catch (e) {
    return fehler(e);
  }
}

/** Ferienanspruch, Regieansatz, Ein- und Austritt. */
export async function setStammdaten(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return { ok: false, error: "Nur ein Vorgesetzter verwaltet Konten." };

  const parsed = Stammdaten.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const i = parsed.data;

  if (i.employedFrom && i.employedUntil && i.employedUntil < i.employedFrom)
    return { ok: false, error: "Das Austrittsdatum liegt vor dem Eintritt." };

  try {
    const before = await db.user.findUnique({ where: { id: i.id } });
    if (!before || before.companyId !== user.companyId)
      return { ok: false, error: "Person nicht gefunden." };

    await db.$transaction(async (tx) => {
      const after = await tx.user.update({
        where: { id: i.id },
        data: {
          vacationDays: i.vacationDays,
          regieTariff: i.regieTariff,
          employedFrom: tag(i.employedFrom),
          employedUntil: tag(i.employedUntil),
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "USER_UPDATED",
          entity: "User",
          entityId: i.id,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/personen");
    revalidatePath("/absenzen");
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
