import { getSession } from "@/lib/session";
import { zeitraumAus, type ZeitraumArt } from "@/lib/zeitraum";
import {
  auswertungAlleBaustellen,
  auswertungBaustelle,
  type MaterialPosition,
} from "@/server/auswertung-read";
import { type Blatt, dateiname, mappe } from "@/server/excel";

/* Die Mappe zur Auswertung Baustellen, eine Baustelle oder alle.
 * Dieselben Abfrageparameter wie die Seite, damit beide zwingend
 * dieselben Zahlen zeigen. */

const positionsblatt = (
  name: string,
  kopf: string[],
  positionen: MaterialPosition[],
  summe: number,
): Blatt => ({
  name,
  kopf,
  spalten: [
    { titel: "Datum", art: "datum" },
    { titel: "Bezeichnung", breite: 44 },
    { titel: "Menge", art: "zahl" },
    { titel: "Einheit", breite: 10 },
    { titel: "Einzelpreis", art: "franken" },
    { titel: "Rabatt in Prozent", art: "zahl" },
    { titel: "Betrag", art: "franken" },
    { titel: "Erfasst von", breite: 20 },
  ],
  zeilen: positionen.map((p) => [
    p.datum,
    p.bezeichnung,
    p.menge,
    p.einheit,
    p.einzelpreis,
    p.rabattPct,
    p.betrag,
    p.person,
  ]),
  summe: ["Zusammen", null, null, null, null, null, summe, null],
});

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

  const siteId = q.get("baustelle") || "alle";

  try {
    if (siteId === "alle") {
      const zeilen = await auswertungAlleBaustellen(user, zeitraum);
      const blatt: Blatt = {
        name: "Baustellen",
        kopf: [
          "Auswertung Baustellen, Übersicht",
          `Zeitraum: ${zeitraum.bezeichnung}`,
          "Soll, Ist gesamt und Differenz gelten für die ganze Laufzeit, nicht für den Zeitraum.",
        ],
        spalten: [
          { titel: "Baustelle", breite: 40 },
          { titel: "Auftraggeber", breite: 24 },
          { titel: "Status", breite: 14 },
          { titel: "Ist im Zeitraum", art: "stunden" },
          { titel: "Soll gesamt", art: "stunden" },
          { titel: "Ist gesamt", art: "stunden" },
          { titel: "Differenz", art: "stunden" },
          { titel: "Materialkosten", art: "franken" },
          { titel: "VSI-Ausmass", art: "franken" },
        ],
        zeilen: zeilen.map((b) => [
          b.bezeichnung,
          b.partner,
          b.status,
          b.istImZeitraum,
          b.soll,
          b.istGesamt,
          b.differenz,
          b.materialkosten,
          b.vsiBetrag,
        ]),
        summe: [
          "Zusammen",
          null,
          null,
          runde(zeilen.reduce((s, b) => s + b.istImZeitraum, 0)),
          runde(zeilen.reduce((s, b) => s + b.soll, 0)),
          runde(zeilen.reduce((s, b) => s + b.istGesamt, 0)),
          runde(zeilen.reduce((s, b) => s + b.differenz, 0)),
          runde(zeilen.reduce((s, b) => s + b.materialkosten, 0)),
          runde(zeilen.reduce((s, b) => s + b.vsiBetrag, 0)),
        ],
      };

      return datei([blatt], ["Auswertung", "Baustellen", zeitraum.bezeichnung]);
    }

    const a = await auswertungBaustelle(user, siteId, zeitraum);
    const kopf = [`${a.baustelle.bezeichnung}, ${a.zeitraum.bezeichnung}`];

    const uebersicht: Blatt = {
      name: "Übersicht",
      kopf: [
        `Auswertung Baustelle: ${a.baustelle.bezeichnung}`,
        a.baustelle.adresse,
        `Zeitraum: ${a.zeitraum.bezeichnung}`,
      ],
      spalten: [
        { titel: "Kennzahl", breite: 34 },
        { titel: "Wert", art: "zahl" },
      ],
      zeilen: [
        ["Auftraggeber", a.baustelle.partner ?? "keiner erfasst"],
        ["Status", a.baustelle.status],
        ["Ist im Zeitraum in Stunden", a.istImZeitraum],
        ["Soll gesamt in Stunden", a.soll],
        ["Ist gesamt in Stunden", a.istGesamt],
        ["Differenz gesamt in Stunden", a.differenz],
        ["Materialkosten im Zeitraum", a.materialkosten],
        ["VSI-Ausmass im Zeitraum", a.vsiBetrag],
      ],
    };

    const jePerson: Blatt = {
      name: "Je Person",
      kopf,
      spalten: [
        { titel: "Person", breite: 24 },
        { titel: "Nettostunden", art: "stunden" },
      ],
      zeilen: a.proPerson.map((p) => [p.name, p.stunden]),
      summe: ["Zusammen", a.istImZeitraum],
    };

    return datei(
      [
        uebersicht,
        jePerson,
        positionsblatt("Material", kopf, a.materialPositionen, a.materialkosten),
        positionsblatt("VSI-Ausmass", kopf, a.vsiPositionen, a.vsiBetrag),
      ],
      ["Auswertung", a.baustelle.bezeichnung, a.zeitraum.bezeichnung],
    );
  } catch {
    return new Response("Dafür fehlt dir die Berechtigung.", { status: 403 });
  }
}

const runde = (n: number) => Math.round(n * 100) / 100;

async function datei(blaetter: Blatt[], name: (string | null)[]) {
  const bytes = await mappe(blaetter);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${dateiname(name)}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
