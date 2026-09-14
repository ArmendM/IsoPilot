import { getSession } from "@/lib/session";
import { berichtBaustellen } from "@/server/auswertung-anfrage";
import { alsExcel } from "@/server/auswertung-antwort";

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return new Response("Nicht angemeldet.", { status: 401 });

  const r = await berichtBaustellen(req, user);
  return r.ok ? alsExcel(r.bericht, r.dateiteile) : r.antwort;
}
