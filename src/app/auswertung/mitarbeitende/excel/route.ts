import { getSession } from "@/lib/session";
import { formatHours } from "@/lib/dates";
import { zeitraumAus, type ZeitraumArt } from "@/lib/zeitraum";
import { auswertungPerson } from "@/server/auswertung-read";
import { type Blatt, dateiname, mappe } from "@/server/excel";

/* Die Mappe zur Auswertung Mitarbeitende.
 *
 * Dieselben Abfrageparameter wie die Seite, damit der Knopf schlicht die
 * Adresse der Ansicht mit angehängtem /excel ist und beide zwingend
 * dieselben Zahlen zeigen. Eine zweite Rechnung für den Export wäre die
 * sicherste Art, zwei verschiedene Ergebnisse zu erhalten.
 *
 * Die Berechtigung hängt nicht am Knopf, sondern an auswertungPerson:
 * eine Adresse tippt sich schnell von Hand. */
export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return new Response("Nicht angemeldet.", { status: 401 });

  const q = new URL(req.url).searchParams;
  const zeitraum = zeitraumAus({
    art: (q.get("art") ?? "monat") as ZeitraumArt,
    monat: q.get("monat"),
    jahr: q.get("jahr"),
    von: q.get("von"),
    bis: q.get("bis"),
  });
  if (!zeitraum) return new Response("Kein gültiger Zeitraum.", { status: 400 });

  const personId = q.get("person") || user.id;

  let a;
  try {
    a = await auswertungPerson(user, personId, zeitraum);
  } catch {
    return new Response("Dafür fehlt dir die Berechtigung.", { status: 403 });
  }

  const uebersicht: Blatt = {
    name: "Übersicht",
    kopf: [
      `Auswertung Mitarbeitende: ${a.person.name}`,
      `Zeitraum: ${a.zeitraum.bezeichnung}`,
    ],
    spalten: [
      { titel: "Kennzahl", breite: 30 },
      { titel: "Wert", art: "zahl" },
    ],
    zeilen: [
      ["Nettostunden", a.nettostunden],
      ["Als Zeitangabe", formatHours(a.nettostunden)],
      ["Werktage im Zeitraum", a.werktage],
      ["Tage mit Erfassung", a.tageMitErfassung],
      ["Werktage ohne Eintrag und ohne Absenz", a.offeneTage],
      ["Pausen in Minuten", a.pausenMinuten],
      ["Ferientage", a.ferientage],
      ["Krankheitstage", a.krankheitstage],
      ["Übrige Absenztage", a.uebrigeAbsenztage],
      ["Feiertage im Zeitraum", a.feiertage],
    ],
  };

  const jeBaustelle: Blatt = {
    name: "Je Baustelle",
    kopf: [`${a.person.name}, ${a.zeitraum.bezeichnung}`],
    spalten: [
      { titel: "Baustelle", breite: 40 },
      { titel: "Nettostunden", art: "stunden" },
    ],
    zeilen: a.proBaustelle.map((b) => [b.label, b.stunden]),
    summe: ["Zusammen", a.nettostunden],
  };

  const positionen: Blatt = {
    name: "Einzelpositionen",
    kopf: [`${a.person.name}, ${a.zeitraum.bezeichnung}`],
    spalten: [
      { titel: "Datum", art: "datum" },
      { titel: "Von", breite: 8 },
      { titel: "Bis", breite: 8 },
      { titel: "Pause in Minuten", art: "zahl" },
      { titel: "Nettostunden", art: "stunden" },
      { titel: "Baustelle", breite: 40 },
      { titel: "Verrechnung", breite: 12 },
      { titel: "Notiz", breite: 40 },
    ],
    zeilen: a.positionen.map((p) => [
      p.datum,
      p.von,
      p.bis,
      p.pause,
      p.netto,
      p.baustelle ?? "Werkstatt oder Büro",
      p.istRegie ? "Regie" : "Pauschal",
      p.notiz,
    ]),
    summe: [
      "Zusammen",
      null,
      null,
      a.pausenMinuten,
      a.nettostunden,
      null,
      null,
      null,
    ],
  };

  /* Die Einzelpositionen sind immer dabei, anders als in der Ansicht.
   * Eine Mappe wird abgelegt und später wieder hervorgeholt, und dann
   * ist die Frage nach dem einzelnen Tag längst gestellt. */
  const datei = await mappe([uebersicht, jeBaustelle, positionen]);
  const name = dateiname([
    "Auswertung",
    a.person.name,
    a.zeitraum.bezeichnung.replace(/ /g, "-"),
  ]);

  return new Response(new Uint8Array(datei), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
