import { describe, expect, it } from "vitest";
import { pdf, type Firmenkopf } from "@/server/pdf";
import type { Bericht } from "@/server/auswertung-blaetter";
import { stellen, textVon } from "./pdf-lesen";

/* Das PDF wird erzeugt und der Text wieder herausgelesen. Ein Bericht,
 * der eine kaputte Datei schreibt oder die Umlaute verliert, fällt sonst
 * erst beim Öffnen auf. */

const firma: Firmenkopf = {
  name: "IsoTeam Suljejmani GmbH",
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

describe("Anordnung", () => {
  const tabelle: Bericht = {
    titel: "Auswertung Mitarbeitende: Test User",
    untertitel: ["Zeitraum: September 2026"],
    blaetter: [
      {
        name: "Einzelpositionen",
        spalten: [
          { titel: "Datum", art: "datum" },
          { titel: "Von", breite: 8 },
          { titel: "Bis", breite: 8 },
          { titel: "Pause", art: "zahl", breite: 10 },
          { titel: "Netto", art: "stunden", breite: 10 },
          { titel: "Baustelle", breite: 34 },
          { titel: "Verrechnung", breite: 12 },
          { titel: "Notiz", breite: 30 },
        ],
        zeilen: [
          ["2026-09-01", "07:00", "17:00", 30, 9.5, "MFH Mattenhof", "Pauschal", null],
          ["2026-09-02", "07:00", "17:00", 30, 9.5, "MFH Mattenhof", "Pauschal", null],
        ],
        summe: ["Zusammen", null, null, 60, 19, null, null, null],
      },
    ],
  };

  /* Der eigentliche Fehler: pdfkit rückt nach jedem Text um die
   * Zeilenhöhe der Schrift vor. Wird das mit einem festen Betrag
   * ausgeglichen statt mit der gemerkten Höhe, wandert jede weitere
   * Zelle nach oben. */
  it("setzt alle Zellen der Titelzeile auf dieselbe Höhe", async () => {
    const gefunden = stellen(await pdf(tabelle, firma));
    // Die Titelzeile steht nach der Vorlage in Versalien.
    const titel = ["DATUM", "VON", "BIS", "PAUSE", "NETTO", "BAUSTELLE", "VERRECHNUNG", "NOTIZ"];
    const hoehen = titel.map((t) => gefunden.find((g) => g.text === t)?.y);

    expect(hoehen.every((h) => h !== undefined)).toBe(true);
    expect(new Set(hoehen).size).toBe(1);
  });

  it("setzt auch die Zellen einer Datenzeile auf dieselbe Höhe", async () => {
    const gefunden = stellen(await pdf(tabelle, firma));
    const hoehen = ["01.09.2026", "MFH Mattenhof"].map(
      (t) => gefunden.find((g) => g.text === t)?.y,
    );

    expect(new Set(hoehen).size).toBe(1);
  });

  /* Von oben nach unten: Firmenzeile, Titel, Blattname, Titelzeile,
   * Datenzeilen, Summe.
   *
   * In den Textmatrizen wird y nach unten kleiner, pdfkit hebt seine
   * eigene Spiegelung innerhalb von BT und ET wieder auf. Weiter oben
   * heisst also grösseres y. */
  it("hält die Reihenfolge von oben nach unten ein", async () => {
    const gefunden = stellen(await pdf(tabelle, firma));
    const y = (t: string) => gefunden.find((g) => g.text.startsWith(t))!.y;
    const ueber = (oben: string, unten: string) =>
      expect(y(oben), `${oben} muss über ${unten} stehen`).toBeGreaterThan(y(unten));

    ueber("IsoTeam Suljejmani GmbH", "Auswertung Mitarbeitende");
    ueber("Auswertung Mitarbeitende", "Zeitraum: September 2026");
    ueber("Zeitraum: September 2026", "Einzelpositionen");
    ueber("Einzelpositionen", "DATUM");
    ueber("DATUM", "01.09.2026");
    ueber("01.09.2026", "02.09.2026");
    ueber("02.09.2026", "Zusammen");
  });

  /* Der Kern des Fehlers aus dem Bericht: die Titelzeile stand nicht
   * mehr unter der Überschrift, sondern mitten darin. Ein Abstand von
   * wenigen Punkten reicht dafür schon. */
  it("lässt zwischen Überschrift und Titelzeile genug Luft", async () => {
    const gefunden = stellen(await pdf(tabelle, firma));
    const y = (t: string) => gefunden.find((g) => g.text.startsWith(t))!.y;

    expect(y("Einzelpositionen") - y("DATUM")).toBeGreaterThan(10);
  });

  it("setzt die Spalten von links nach rechts nebeneinander", async () => {
    const gefunden = stellen(await pdf(tabelle, firma));
    const x = (t: string) => gefunden.find((g) => g.text === t)!.x;

    expect(x("DATUM")).toBeLessThan(x("VON"));
    expect(x("VON")).toBeLessThan(x("BAUSTELLE"));
    expect(x("BAUSTELLE")).toBeLessThan(x("NOTIZ"));
  });
});

describe("Fuss", () => {
  const mitAngaben = {
    ...firma,
    mwst: "CHE-305.978.601",
    telefon: "079 616 89 75 / 076 574 25 82",
    mail: "info@isoteam-suljejmani.ch",
  };

  /* Der Fuss trägt die Angaben, die auf ein Blatt gehören, das aus dem
   * Haus geht. Sie kommen aus Company, nicht aus dem Code. */
  it("nennt Adresse, Kontakt, UID und Bank", async () => {
    const t = textVon(await pdf(bericht, mitAngaben));

    expect(t).toContain("CHE-305.978.601 MWST");
    expect(t).toContain("info@isoteam-suljejmani.ch");
    expect(t).toContain("Raiffeisenbank");
  });

  it("stellt die drei Spalten nebeneinander und nach unten", async () => {
    const gefunden = stellen(await pdf(bericht, mitAngaben));
    const x = (t: string) => gefunden.find((g) => g.text.startsWith(t))!.x;
    const y = (t: string) => gefunden.find((g) => g.text.startsWith(t))!.y;

    // Die Fassung mit Komma steht nur im Fuss, im Kopf steht die Strasse
    // allein. Ohne diese Unterscheidung fände die Suche den Kopf.
    expect(x("079 616")).toBeGreaterThan(x("Gerliswilstrasse 68, 6020"));
    expect(x("CHE-305")).toBeGreaterThan(x("079 616"));
    // Unter der letzten Tabellenzeile, also wirklich am Blattfuss.
    expect(y("CHE-305")).toBeLessThan(y("Nettostunden"));
  });

  /* Ohne Angaben bleibt die Spalte leer, statt "null" zu drucken. */
  it("druckt keine Platzhalter, wenn Angaben fehlen", async () => {
    const t = textVon(await pdf(bericht, { ...firma, mwst: null, telefon: null, mail: null }));

    expect(t).not.toContain("null");
    expect(t).not.toContain("undefined");
  });
});

describe("pdf", () => {
  it("erzeugt eine Datei, die als PDF beginnt und endet", async () => {
    const b = await pdf(bericht, firma);

    expect(b.subarray(0, 5).toString()).toBe("%PDF-");
    expect(textVon(b)).toContain("%%EOF");
    expect(b.length).toBeGreaterThan(800);
  });

  it("trägt Firmenzeile, Titel und Blattnamen", async () => {
    const t = textVon(await pdf(bericht, firma));

    expect(t).toContain("IsoTeam Suljejmani GmbH");
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
    expect(t.split("BUCHUNGSDATUM").length - 1).toBeGreaterThan(1);
  });

  /* Ein Logo, das nicht lesbar ist, darf den Bericht nicht verhindern:
   * sonst steht jemand vor einer leeren Seite, weil eine Datei fehlt. */
  it("übergeht ein unbrauchbares Logo, statt abzubrechen", async () => {
    const b = await pdf(bericht, { ...firma, logo: Buffer.from("kein Bild") });
    expect(b.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

/* Der Berichtskopf mit Logo. Geprüft wird die Anordnung: ein Bild, das
 * den Text überdeckt, ist schlimmer als keines. */
describe("Kopf mit Logo", () => {
  /* Ein winziges gültiges PNG, 1 mal 1 Bildpunkt. Die echte Wortmarke
   * liegt in public/marke und gehört nicht in einen Einheitstest. */
  const einPunkt = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  const bericht: Bericht = {
    titel: "Auswertung Baustelle: MFH Mattenhof",
    untertitel: ["Industriestrasse 8, 6030 Ebikon"],
    blaetter: [
      {
        name: "Übersicht",
        spalten: [{ titel: "Kennzahl" }, { titel: "Wert", art: "zahl" }],
        zeilen: [["Ist im Zeitraum in Stunden", 38]],
      },
    ],
  };

  /* Nach der Vorlage steht die Wortmarke links und die Adresse rechts,
   * unabhängig davon, ob ein Logo da ist. Geprüft wird deshalb nicht mehr
   * ein Versatz gegenüber dem Fall ohne Logo, sondern die Seite: die
   * Adresse gehört in die rechte Blatthälfte, sonst läuft sie ins Logo. */
  it("setzt die Firmenzeile in die rechte Blatthälfte", async () => {
    const mit = stellen(await pdf(bericht, { ...firma, logo: einPunkt }));
    const zeile = mit.find((g) => g.text.startsWith("IsoTeam"))!;

    // A4 hoch ist 595 Punkt breit.
    expect(zeile.x).toBeGreaterThan(595 / 2);
  });

  it("lässt die Firmenzeile auch ohne Logo rechts stehen", async () => {
    const ohne = stellen(await pdf(bericht, firma));
    const zeile = ohne.find((g) => g.text.startsWith("IsoTeam"))!;

    expect(zeile.x).toBeGreaterThan(595 / 2);
  });

  /* Mit Logo braucht der Kopf mehr Höhe. Der Titel darf deswegen nicht
   * ins Bild rutschen. */
  it("schiebt den Titel unter das Logo", async () => {
    const ohne = stellen(await pdf(bericht, firma));
    const mit = stellen(await pdf(bericht, { ...firma, logo: einPunkt }));

    const y = (s: typeof ohne) =>
      s.find((g) => g.text.startsWith("Auswertung Baustelle"))!.y;
    expect(y(mit)).toBeLessThanOrEqual(y(ohne));
  });
});
