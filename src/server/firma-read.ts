// Die Firmenangaben für den Kopf eines Berichts.
import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import type { Firmenkopf } from "@/server/pdf";

/**
 * Firmenzeile und Logo.
 *
 * Das Logo liegt als Pfad an der Firma und wird erst mit den
 * Firmeneinstellungen hochgeladen. Solange keines da ist, steht der Kopf
 * trotzdem: ein fehlendes Bild ist kein Grund, einen Bericht zu
 * verweigern. Dasselbe gilt für eine Datei, die nicht mehr liegt, wo der
 * Pfad sagt.
 */
export async function firmenkopf(user: SessionUser): Promise<Firmenkopf> {
  const c = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });

  let logo: Buffer | null = null;
  if (c.logoPath) {
    try {
      logo = await readFile(c.logoPath);
    } catch {
      logo = null;
    }
  }

  return {
    name: c.name,
    strasse: c.street,
    ort: `${c.zip} ${c.city}`,
    mwst: c.vatNumber,
    telefon: c.phone,
    mail: c.email,
    logo,
  };
}
