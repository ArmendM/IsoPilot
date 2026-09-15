// Das hochgeladene Logo als Bild, für die Vorschau unter /firma.
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

/* Eine eigene Adresse statt einer Daten-URL im HTML: das Bild darf zwei
 * Megabyte gross sein, und als Base64 im Seitenquelltext wären das rund
 * drei, die bei jedem Aufruf der Seite mitgehen.
 *
 * Steht kein eigenes Logo an der Firma, gibt es hier nichts. Die Seite
 * zeigt dann die Wortmarke als Komponente, wie überall sonst in der
 * Oberfläche, und der Bericht nimmt die PNG aus `public/marke`. */
export async function GET() {
  const user = await getSession();
  if (!user) return new Response(null, { status: 401 });

  const c = await db.company.findUnique({
    where: { id: user.companyId },
    select: { logo: true, logoTyp: true },
  });
  if (!c?.logo) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(c.logo), {
    headers: {
      "Content-Type": c.logoTyp ?? "application/octet-stream",
      // Nicht zwischenspeichern: sonst zeigt die Seite nach dem
      // Austauschen weiter das alte Logo, und es sieht aus, als hätte
      // das Hochladen nicht gewirkt.
      "Cache-Control": "no-store",
    },
  });
}
