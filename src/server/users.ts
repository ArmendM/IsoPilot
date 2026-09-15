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

const Pensum = z.object({
  id: z.string().min(1),
  weeklyHours: z.number().min(0).max(80),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const PensumWeg = z.object({
  id: z.string().min(1),
  pensumId: z.string().min(1),
});

const Anfangssaldo = z.object({
  id: z.string().min(1),
  startBalance: z.number().min(-2000).max(2000).nullable(),
  balanceFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

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

    // Der Austritt begrenzt das Soll, die Tagesansicht zeigt es an.
    nachfuehren();
    revalidatePath("/absenzen");
    return { ok: true };
  } catch (e) {
    return fehler(e);
  }
}

/**
 * Ein Pensum ab einem Stichtag.
 *
 * **Eine eigene Zeile je Änderung, kein Feld an der Person.** Steigt
 * jemand im Mai von 100 auf 80 Prozent, darf das die Monate davor nicht
 * rückwirkend verändern. Mit einem einzelnen Feld wäre der alte Wert
 * weg, und der Saldo vergangener Monate verschöbe sich still.
 *
 * Zwei Pensen am selben Stichtag wären nicht entscheidbar. Ein zweites
 * überschreibt das erste, statt an der Eindeutigkeit zu scheitern: wer
 * eine Zahl berichtigt, tippt denselben Stichtag noch einmal.
 */
export async function setPensum(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return { ok: false, error: "Nur ein Vorgesetzter setzt das Pensum." };

  const parsed = Pensum.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: "Wochenstunden zwischen 0 und 80, dazu ein Stichtag." };
  const i = parsed.data;

  try {
    const person = await db.user.findUnique({ where: { id: i.id } });
    if (!person || person.companyId !== user.companyId)
      return { ok: false, error: "Person nicht gefunden." };

    await db.$transaction(async (tx) => {
      const nachher = await tx.workload.upsert({
        where: { userId_validFrom: { userId: i.id, validFrom: tag(i.validFrom)! } },
        update: { weeklyHours: i.weeklyHours, createdById: user.id },
        create: {
          userId: i.id,
          validFrom: tag(i.validFrom)!,
          weeklyHours: i.weeklyHours,
          createdById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "USER_WORKLOAD_SET",
          entity: "Workload",
          entityId: nachher.id,
          after: { userId: i.id, validFrom: i.validFrom, weeklyHours: i.weeklyHours },
        },
      });
    });

    nachfuehren();
    return { ok: true };
  } catch (e) {
    return fehler(e);
  }
}

/**
 * Ein Pensum wieder entfernen.
 *
 * Für den Fall, dass eines mit falschem Stichtag angelegt wurde. Fällt
 * das letzte weg, gilt wieder die Vorgabe der Firma. **Auf die Vorgabe
 * zurückzukehren ist dagegen eine neue Zeile mit dem Vorgabewert**, nicht
 * das Löschen der alten: sonst verschöbe sich rückwirkend auch die Zeit,
 * in der das alte Pensum galt.
 */
export async function loeschePensum(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return { ok: false, error: "Nur ein Vorgesetzter setzt das Pensum." };

  const parsed = PensumWeg.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const i = parsed.data;

  try {
    const person = await db.user.findUnique({ where: { id: i.id } });
    if (!person || person.companyId !== user.companyId)
      return { ok: false, error: "Person nicht gefunden." };

    await db.$transaction(async (tx) => {
      // Die Person steht im WHERE, nicht nur in der Prüfung davor: sonst
      // liesse sich über eine fremde Kennung ein beliebiges Pensum
      // entfernen.
      const weg = await tx.workload.deleteMany({
        where: { id: i.pensumId, userId: i.id },
      });
      if (weg.count === 0) throw new Error("NICHT_GEFUNDEN");
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "USER_WORKLOAD_REMOVED",
          entity: "Workload",
          entityId: i.pensumId,
          before: { userId: i.id },
        },
      });
    });

    nachfuehren();
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message === "NICHT_GEFUNDEN")
      return { ok: false, error: "Dieses Pensum gibt es nicht mehr." };
    return fehler(e);
  }
}

/**
 * Der Zeitsaldo aus dem alten Vorgehen, für den Parallelbetrieb in M5.
 *
 * Ohne ihn fängt beim Umstieg jeder bei null an und die bisherigen
 * Überstunden sind weg. Ab dem Stichtag rechnet IsoPilot selbst: die
 * Zeit davor steckt im Saldo und wird nicht noch einmal gezählt.
 */
export async function setAnfangssaldo(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return { ok: false, error: "Nur ein Vorgesetzter setzt den Anfangssaldo." };

  const parsed = Anfangssaldo.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: "Ein Datum, und wahlweise ein Saldo in Stunden." };
  const i = parsed.data;

  /* **Der Stichtag allein reicht, der mitgebrachte Saldo ist freiwillig.**
   * Wer bei null anfängt, soll nicht erst eine Null in ein Feld namens
   * "Anfangssaldo" tippen müssen, nur damit IsoPilot zu rechnen beginnt.
   * Genau daran ist im Betrieb jemand hängengeblieben: er setzte den
   * Stichtag, das Formular verlangte stillschweigend auch einen Saldo,
   * und es wurde gar nichts gespeichert.
   *
   * Umgekehrt geht es nicht: ein Saldo ohne Stichtag wüsste nicht, ab
   * wann IsoPilot selbst rechnet. */
  if (i.startBalance !== null && i.balanceFrom === null)
    return {
      ok: false,
      error:
        "Ohne Datum lässt sich ein mitgebrachter Saldo nicht einordnen. Trage ein, ab wann IsoPilot rechnet.",
    };

  try {
    const before = await db.user.findUnique({ where: { id: i.id } });
    if (!before || before.companyId !== user.companyId)
      return { ok: false, error: "Person nicht gefunden." };

    await db.$transaction(async (tx) => {
      const after = await tx.user.update({
        where: { id: i.id },
        data: { startBalance: i.startBalance, balanceFrom: tag(i.balanceFrom) },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "USER_BALANCE_SET",
          entity: "User",
          entityId: i.id,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    nachfuehren();
    return { ok: true };
  } catch (e) {
    return fehler(e);
  }
}

/* Wo Pensum und Anfangssaldo hinwirken.
 *
 * **`/zeiten` gehört dazu**, und das Vergessen war ein gemeldeter
 * Fehler: die Saldozeile dort kam später dazu als diese Liste. Wer den
 * Stichtag unter `/personen` setzte, sah ihn in der Auswertung sofort,
 * in der Tagesansicht aber weiter den Hinweis, es fehle einer. Von
 * aussen sah das aus, als würde der Stichtag nicht erkannt.
 *
 * Wer hier eine Seite ergänzt, die den Saldo zeigt, trägt sie hier ein.
 * Eine Seite, die eine Zahl zeigt und nicht nachgeführt wird, zeigt sie
 * irgendwann falsch, und niemand sucht den Grund im Zwischenspeicher. */
function nachfuehren() {
  revalidatePath("/personen");
  revalidatePath("/zeiten");
  revalidatePath("/auswertung/mitarbeitende");
}

function fehler(e: unknown): ActionResult {
  const m = e instanceof Error ? e.message : "";
  if (m === "FORBIDDEN") return { ok: false, error: "Dafür fehlt dir die Berechtigung." };
  console.error(e);
  return { ok: false, error: "Speichern fehlgeschlagen." };
}
