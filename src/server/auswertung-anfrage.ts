/* Was Excel und PDF gemeinsam tun: Abfrageparameter lesen, prüfen,
 * laden und daraus den Bericht bauen. Vier Routen, die das je für sich
 * täten, wären vier Stellen, an denen eine Berechtigung vergessen
 * werden kann. */
import type { SessionUser } from "@/lib/session";
import { zeitraumAus, type ZeitraumArt } from "@/lib/zeitraum";
import {
  auswertungAlleBaustellen,
  auswertungBaustelle,
  auswertungPerson,
} from "@/server/auswertung-read";
import {
  berichtAlleBaustellen,
  berichtBaustelle,
  berichtPerson,
  type Bericht,
} from "@/server/auswertung-blaetter";

export type Ergebnis =
  | { ok: true; bericht: Bericht; dateiteile: (string | null)[] }
  | { ok: false; antwort: Response };

const zeitraumVon = (q: URLSearchParams) =>
  zeitraumAus({
    art: (q.get("art") ?? "monat") as ZeitraumArt,
    monat: q.get("monat"),
    jahr: q.get("jahr"),
    von: q.get("von"),
    bis: q.get("bis"),
  });

export async function berichtMitarbeitende(
  req: Request,
  user: SessionUser,
): Promise<Ergebnis> {
  const q = new URL(req.url).searchParams;
  const zeitraum = zeitraumVon(q);
  if (!zeitraum)
    return { ok: false, antwort: new Response("Kein gültiger Zeitraum.", { status: 400 }) };

  try {
    const a = await auswertungPerson(user, q.get("person") || user.id, zeitraum);
    return {
      ok: true,
      bericht: berichtPerson(a),
      dateiteile: ["Auswertung", a.person.name, a.zeitraum.bezeichnung],
    };
  } catch {
    return {
      ok: false,
      antwort: new Response("Dafür fehlt dir die Berechtigung.", { status: 403 }),
    };
  }
}

export async function berichtBaustellen(
  req: Request,
  user: SessionUser,
): Promise<Ergebnis> {
  const q = new URL(req.url).searchParams;
  const zeitraum = zeitraumVon(q);
  if (!zeitraum)
    return { ok: false, antwort: new Response("Kein gültiger Zeitraum.", { status: 400 }) };

  const siteId = q.get("baustelle") || "alle";

  try {
    if (siteId === "alle") {
      const zeilen = await auswertungAlleBaustellen(user, zeitraum);
      return {
        ok: true,
        bericht: berichtAlleBaustellen(zeilen, zeitraum),
        dateiteile: ["Auswertung", "Baustellen", zeitraum.bezeichnung],
      };
    }
    const a = await auswertungBaustelle(user, siteId, zeitraum);
    return {
      ok: true,
      bericht: berichtBaustelle(a),
      dateiteile: ["Auswertung", a.baustelle.bezeichnung, a.zeitraum.bezeichnung],
    };
  } catch {
    return {
      ok: false,
      antwort: new Response("Dafür fehlt dir die Berechtigung.", { status: 403 }),
    };
  }
}
