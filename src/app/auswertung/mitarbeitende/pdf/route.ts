import { getSession } from "@/lib/session";
import { berichtMitarbeitende } from "@/server/auswertung-anfrage";
import { alsPdf } from "@/server/auswertung-antwort";

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return new Response("Nicht angemeldet.", { status: 401 });

  const r = await berichtMitarbeitende(req, user);
  return r.ok ? alsPdf(r.bericht, r.dateiteile, user) : r.antwort;
}
