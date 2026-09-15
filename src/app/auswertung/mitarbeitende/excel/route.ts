import { getSession } from "@/lib/session";
import { berichtMitarbeitende } from "@/server/auswertung-anfrage";
import { alsExcel } from "@/server/auswertung-antwort";

/* Die Mappe zur Auswertung Mitarbeitende. Dieselben Abfrageparameter wie
 * die Ansicht, damit beide zwingend dieselben Zahlen zeigen. Die
 * Berechtigung hängt nicht am Knopf, sondern am Lesezugriff: eine
 * Adresse tippt sich schnell von Hand. */
export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return new Response("Nicht angemeldet.", { status: 401 });

  const r = await berichtMitarbeitende(req, user);
  return r.ok ? alsExcel(r.bericht, r.dateiteile, user) : r.antwort;
}
