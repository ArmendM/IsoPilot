import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { pdf, type Firmenkopf } from "@/server/pdf";
import type { Bericht } from "@/server/auswertung-blaetter";

/* Das PDF wird erzeugt und der Text wieder herausgelesen. Ein Bericht,
 * der eine kaputte Datei schreibt oder die Umlaute verliert, fällt sonst
 * erst beim Öffnen auf. */

const firma: Firmenkopf = {
  name: "Isoteam Suljejmani GmbH",
  strasse: "Gerliswilstrasse 68",
  ort: "6020 Emmenbrücke",
  mwst: "CHE-190.604.537",
  telefon: null,
  mail: null,
  logo: null,
};

const bericht: Bericht = {
  titel: "Auswertung Mitarbeitende: Liridon",
  untertitel: ["Zeitraum: September 2026"],
  blaetter: [
    {
      name: "Übersicht",
      spalten: [
        { titel: "Kennzahl", breite: 34 },
        { titel: "Wert", art: "zahl" },
      ],
      zeilen: [
        ["Nettostunden", 168.5],
        ["Ferientage", 2],
      ],
      summe: ["Zusammen", 170.5],
    },
  ],
};

/**
 * Der lesbare Text eines PDF.
 *
 * Zwei Schritte: pdfkit komprimiert die Inhaltsströme, und der Text
 * steht darin nicht als Klartext, sondern als Hexfolgen in TJ-Feldern,
 * durch die Unterschneidung in Stücke zerlegt. Beides wird hier
 * rückgängig gemacht.
 *
 * Die Kompression fürs Testen abzuschalten wäre der bequemere Weg und
 * würde etwas anderes prüfen als das, was ausgeliefert wird.
 */
function textVon(b: Buffer): string {
  const roh = b.toString("latin1");
  let text = roh;
  const muster = /stream\r?\n/g;
  let treffer: RegExpExecArray | null;
  while ((treffer = muster.exec(roh)) !== null) {
    const start = treffer.index + treffer[0].length;
    const ende = roh.indexOf("endstream", start);
    if (ende < 0) continue;
    let inhalt: string;
    try {
      inhalt = inflateSync(Buffer.from(roh.slice(start, ende), "latin1")).toString("latin1");
    } catch {
      continue; // kein Flate-Strom, etwa eine eingebettete Schrift
    }
    // Die Hexstücke in ihrer Reihenfolge aneinanderhängen: ein durch
    // Unterschneidung zerteiltes Wort wird so wieder eines.
    text += (inhalt.match(/<[0-9a-fA-F]+>/g) ?? [])
      .map((h) => Buffer.from(h.slice(1, -1), "hex").toString("latin1"))
      .join("");
  }
  return text;
}

describe("pdf", () => {
  it("erzeugt eine Datei, die als PDF beginnt und endet", async () => {
    const b = await pdf(bericht, firma);

    expect(b.subarray(0, 5).toString()).toBe("%PDF-");
    expect(textVon(b)).toContain("%%EOF");
    expect(b.length).toBeGreaterThan(800);
  });

  it("trägt Firmenzeile, Titel und Blattnamen", async () => {
    const t = textVon(await pdf(bericht, firma));

    expect(t).toContain("Isoteam Suljejmani GmbH");
    expect(t).toContain("CHE-190.604.537");
    expect(t).toContain("Auswertung Mitarbeitende: Liridon");
    expect(t).toContain("Zeitraum: September 2026");
    expect(t).toContain("bersicht"); // "Übersicht", das Ü steht kodiert
  });

  it("schreibt Zahlen in Schweizer Schreibweise", async () => {
    const t = textVon(await pdf(bericht, firma));

    // 168.5 wird zu 168.50 mit zwei Stellen, 2 bleibt ganzzahlig.
    expect(t).toContain("168.50");
  });

  /* Helvetica deckt die Umlaute über WinAnsi ab. Ginge das schief, wäre
   * die Ausgabe leer oder der Lauf bräche ab. */
  it("kommt mit Umlauten und dem Mittelpunkt zurecht", async () => {
    const mitUmlaut: Bericht = {
      ...bericht,
      blaetter: [
        {
          ...bericht.blaetter[0],
          zeilen: [["Kautschuk 13mm DN25 · Bögen, Grösse", 1]],
          summe: undefined,
        },
      ],
    };

    const b = await pdf(mitUmlaut, firma);
    expect(b.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("kommt mit einem Blatt ohne Zeilen zurecht", async () => {
    const leer: Bericht = {
      ...bericht,
      blaetter: [{ name: "Leer", spalten: [{ titel: "Nichts" }], zeilen: [] }],
    };

    const t = textVon(await pdf(leer, firma));
    expect(t).toContain("Keine Eintr"); // "Keine Einträge in diesem Zeitraum."
  });

  /* Eine lange Tabelle muss umbrechen, und der Kopf gehört auf jede
   * Seite: ein Blatt Papier ohne Firmenzeile lässt sich nicht zuordnen. */
  it("bricht eine lange Tabelle um und wiederholt den Kopf", async () => {
    const lang: Bericht = {
      ...bericht,
      blaetter: [
        {
          name: "Einzelpositionen",
          spalten: [{ titel: "Datum" }, { titel: "Wert", art: "zahl" }],
          zeilen: Array.from({ length: 120 }, (_, i) => [`2026-09-${(i % 30) + 1}`, i]),
        },
      ],
    };

    /* Nicht die Zahl der Seiten prüfen: pdfkit bricht von sich aus um,
     * sobald der Text unten ankommt, und das täte es auch ohne eigene
     * Umbruchlogik. Gemeint ist der Kopf auf jeder Seite, also wird
     * gezählt, wie oft der Titel im Text vorkommt. */
    const t = textVon(await pdf(lang, firma));
    const titel = t.split("Auswertung Mitarbeitende: Liridon").length - 1;

    expect(titel).toBeGreaterThan(1);
  });

  it("wiederholt auch die Titelzeile der Tabelle nach einem Umbruch", async () => {
    const lang: Bericht = {
      ...bericht,
      blaetter: [
        {
          name: "Einzelpositionen",
          spalten: [{ titel: "Buchungsdatum" }, { titel: "Wert", art: "zahl" }],
          zeilen: Array.from({ length: 120 }, (_, i) => [`2026-09-${(i % 30) + 1}`, i]),
        },
      ],
    };

    const t = textVon(await pdf(lang, firma));
    expect(t.split("Buchungsdatum").length - 1).toBeGreaterThan(1);
  });

  /* Ein Logo, das nicht lesbar ist, darf den Bericht nicht verhindern:
   * sonst steht jemand vor einer leeren Seite, weil eine Datei fehlt. */
  it("übergeht ein unbrauchbares Logo, statt abzubrechen", async () => {
    const b = await pdf(bericht, { ...firma, logo: Buffer.from("kein Bild") });
    expect(b.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
