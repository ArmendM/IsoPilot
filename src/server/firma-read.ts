// Die Firmenangaben für den Kopf eines Berichts.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import type { Firmenkopf } from "@/server/pdf";

/* Die Wortmarke aus `public/marke`, solange unter `Company.logoPath`
 * nichts anderes steht. Das Dockerfile kopiert `public` in den
 * Containerstamm und der Server läuft von dort, der Pfad trägt also in
 * Entwicklung und Betrieb.
 *
 * Bewusst die PNG und nicht die SVG: pdfkit kennt nur PNG und JPEG und
 * wirft bei einer SVG "Unknown image format". Siehe
 * `public/marke/EINBAU.md`. */
const WORTMARKE = join(
  process.cwd(),
  "public", "marke", "wortmarke", "isoteam-wortmarke-farbig-2000.png",
);

/**
 * Firmenzeile und Logo.
 *
 * Solange kein eigenes Logo hochgeladen ist, nimmt der Bericht die
 * Wortmarke aus dem Verzeichnis. Steht an der Firma ein Pfad, gilt
 * dieser: eine zweite Firma soll ihr eigenes Logo tragen können, ohne
 * dass jemand hier etwas ändert.
 *
 * Fehlt die Datei oder ist sie unbrauchbar, steht der Kopf trotzdem. Ein
 * fehlendes Bild ist kein Grund, einen Bericht zu verweigern: sonst
 * stünde jemand vor einer leeren Seite, weil eine Datei verschoben wurde.
 * Das deckt auch den Fall ab, dass die Marke noch nicht im Zweig liegt.
 */
export async function firmenkopf(user: SessionUser): Promise<Firmenkopf> {
  const c = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });

  let logo: Buffer | null = null;
  try {
    logo = await readFile(c.logoPath || WORTMARKE);
  } catch {
    logo = null;
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
