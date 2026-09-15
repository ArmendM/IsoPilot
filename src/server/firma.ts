"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { bildmasse } from "@/lib/bildmass";
import { FIRMENFELDER } from "@/server/firma-read";

/* Die Firmeneinstellungen, M4e.
 *
 * Bisher setzte diese Angaben nur der Seed. Sie stehen aber auf jedem
 * Bericht und später auf jeder Offerte und jeder Rechnung: eine
 * berichtigte Telefonnummer darf keinen Entwickler brauchen.
 *
 * Ein Kanton steht bewusst nicht im Formular. Er ist keine Anschrift,
 * sondern die Quelle der Feiertage: ein Wechsel müsste die bereits
 * geholten Feiertage mitziehen, und dann ist es keine Einstellung mehr,
 * sondern ein Vorgang mit eigenen Fragen. */

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Ein Textfeld, das leer sein darf. Leer heisst null, nicht "". */
const text = (max: number) =>
  z.string().trim().max(max).transform((s) => s || null);

const Firmendaten = z.object({
  name: z.string().trim().min(1).max(120),
  street: z.string().trim().min(1).max(120),
  zip: z.string().trim().regex(/^\d{4}$/),
  city: z.string().trim().min(1).max(120),
  vatNumber: text(40),
  phone: text(60),
  email: z.union([z.literal(""), z.string().trim().email().max(120)]).transform((s) => s || null),
  iban: text(40),
  defaultVacationDays: z.number().int().min(0).max(60),
  regieRateA: betrag(),
  regieRateB: betrag(),
  regieValidFrom: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .transform((s) => (s ? new Date(`${s}T00:00:00Z`) : null)),
});

/** Ein Stundenansatz als Text, leer erlaubt. Geld bleibt Decimal, die
 *  Umrechnung macht Prisma aus der Zeichenkette. */
function betrag() {
  return z
    .union([z.literal(""), z.string().regex(/^\d{1,6}(\.\d{1,2})?$/)])
    .transform((s) => s || null);
}

async function nurVorgesetzte() {
  const user = await requireUser();
  return user.role === "ADMIN" ? user : null;
}

/** Anschrift, Kontakt, Bank und die Vorgaben, die bisher im Seed standen. */
export async function setFirmendaten(raw: unknown): Promise<ActionResult> {
  const user = await nurVorgesetzte();
  if (!user)
    return { ok: false, error: "Nur ein Vorgesetzter ändert die Firmenangaben." };

  const parsed = Firmendaten.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      error:
        "Name, Strasse, PLZ und Ort sind Pflicht, die PLZ vierstellig. Mailadresse und Ansätze müssen gültig sein.",
    };
  const i = parsed.data;

  try {
    const before = await db.company.findUniqueOrThrow({
      where: { id: user.companyId },
      select: FIRMENFELDER,
    });

    await db.$transaction(async (tx) => {
      const after = await tx.company.update({
        where: { id: user.companyId },
        data: i,
        select: FIRMENFELDER,
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "COMPANY_UPDATED",
          entity: "Company",
          entityId: user.companyId,
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

/* Zwei Megabyte. Ein Logo für einen Briefkopf ist ein Strich und zwei
 * Farben, nicht ein Foto: darüber ist es fast sicher ein Bild aus der
 * Kamera, das im Bericht auf elf Millimeter Höhe schrumpft und nur die
 * Datei aufbläht. Die Server Action nimmt laut next.config.ts vier
 * Megabyte an, die Grenze hier liegt also darunter und meldet sich mit
 * einem verständlichen Satz statt mit einem Abbruch. */
const MAX_BYTES = 2 * 1024 * 1024;

/* Unter dieser Breite wird die Wortmarke im Bericht körnig. 600 Pixel
 * auf 72 Millimeter Breite sind gut 210 dpi, das trägt im Druck. */
const MIN_BREITE = 600;

/**
 * Das Logo für Briefkopf, Bericht und Beleg.
 *
 * Geprüft wird, was in der Datei steht, nicht was der Browser als Typ
 * mitschickt: `bildmasse` liest die Kennung am Dateianfang. Eine als
 * `image/png` angekündigte SVG käme sonst erst im Bericht als Abbruch
 * an, und zwar bei jemand anderem.
 */
export async function setLogo(formData: FormData): Promise<ActionResult> {
  const user = await nurVorgesetzte();
  if (!user)
    return { ok: false, error: "Nur ein Vorgesetzter ändert das Logo." };

  const datei = formData.get("datei");
  if (!(datei instanceof File) || datei.size === 0)
    return { ok: false, error: "Zuerst eine Bilddatei auswählen." };
  if (datei.size > MAX_BYTES)
    return {
      ok: false,
      error: "Die Datei ist grösser als 2 MB. Für einen Briefkopf reicht ein kleineres Bild.",
    };

  const bytes = Buffer.from(await datei.arrayBuffer());
  const mass = bildmasse(bytes);
  if (!mass)
    return {
      ok: false,
      error: "Gelesen werden PNG und JPEG. Eine SVG lässt sich im Bericht nicht setzen, aus dem Grafikprogramm als PNG speichern.",
    };
  if (mass.breite < MIN_BREITE)
    return {
      ok: false,
      error: `Das Bild ist ${mass.breite} Pixel breit und wird im Druck körnig. Mindestens ${MIN_BREITE} Pixel breit speichern.`,
    };

  try {
    await db.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: user.companyId },
        data: { logo: bytes, logoTyp: mass.typ, logoName: datei.name.slice(0, 120) },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "COMPANY_LOGO_SET",
          entity: "Company",
          entityId: user.companyId,
          /* Nur die Angaben zum Bild, nie die Bytes: `after` ist JSON,
           * und ein Bild darin stünde als Zahlenreihe mit
           * hunderttausend Einträgen im Protokoll. */
          after: { name: datei.name, typ: mass.typ, breite: mass.breite, hoehe: mass.hoehe },
        },
      });
    });

    nachfuehren();
    return { ok: true };
  } catch (e) {
    return fehler(e);
  }
}

/** Zurück zur Wortmarke aus `public/marke`. */
export async function entferneLogo(): Promise<ActionResult> {
  const user = await nurVorgesetzte();
  if (!user)
    return { ok: false, error: "Nur ein Vorgesetzter ändert das Logo." };

  try {
    const before = await db.company.findUniqueOrThrow({
      where: { id: user.companyId },
      select: { logoName: true, logoTyp: true },
    });

    await db.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: user.companyId },
        data: { logo: null, logoTyp: null, logoName: null },
      });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          actorId: user.id,
          action: "COMPANY_LOGO_REMOVED",
          entity: "Company",
          entityId: user.companyId,
          before,
        },
      });
    });

    nachfuehren();
    return { ok: true };
  } catch (e) {
    return fehler(e);
  }
}

/* Die Firmenangaben stehen im Kopf jedes Berichts und die Vorgabe für
 * die Ferientage hängt am Anlegen eines Kontos. Die Auswertungen bauen
 * ihre Dateien bei jedem Abruf neu, dort ist nichts nachzuführen. */
function nachfuehren() {
  revalidatePath("/firma");
  revalidatePath("/personen");
}

function fehler(e: unknown): ActionResult {
  const m = e instanceof Error ? e.message : "";
  if (m === "FORBIDDEN") return { ok: false, error: "Dafür fehlt dir die Berechtigung." };
  console.error(e);
  return { ok: false, error: "Speichern fehlgeschlagen." };
}
