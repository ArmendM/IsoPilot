import { describe, expect, it } from "vitest";
import {
  type Importzeile,
  type Katalogartikel,
  fasseZusammen,
  findeSpalten,
  gleicheAlleAb,
  leseEinheit,
  lesePreis,
  vergleichbar,
} from "@/lib/materialimport";

/* Der Abgleich einer Excel-Liste gegen den Katalog. Hier entstehen die
 * Duplikate, die CLAUDE.md verbietet, deshalb die Tests vor dem
 * Schreibpfad. */

const zeile = (p: Partial<Importzeile> & { name: string }): Importzeile => ({
  zeile: 2,
  sku: null,
  kategorie: null,
  einheit: null,
  preis: null,
  brandschutz: null,
  ...p,
});

const KATALOG: Katalogartikel[] = [
  { id: "m1", sku: "AF-19", name: "Armaflex AF 19 mm", kategorie: "Armaflex" },
  { id: "m2", sku: "AF-25", name: "Armaflex AF 25 mm", kategorie: "Armaflex" },
  { id: "m3", sku: null, name: "Rockwool", kategorie: "Brandschutz" },
  { id: "m4", sku: null, name: "Rockwool", kategorie: "Dämmung" },
];

describe("Preise aus einer Schweizer Liste", () => {
  it("liest die üblichen Schreibweisen", () => {
    expect(lesePreis("12.50")).toBe(12.5);
    expect(lesePreis(12.5)).toBe(12.5);
    expect(lesePreis("1'234.50")).toBe(1234.5);
    expect(lesePreis("1234,50")).toBe(1234.5);
    expect(lesePreis("CHF 12.50")).toBe(12.5);
    expect(lesePreis("12.-")).toBe(12);
  });

  /* Ein leeres Feld ist kein Fehler: es heisst, dass der Preis dieses
   * Artikels unverändert bleibt. Wäre es 0, würde ein Import mit einer
   * halb gefüllten Spalte den halben Katalog auf null setzen. */
  it("macht aus einem leeren Feld keine Null", () => {
    expect(lesePreis("")).toBeNull();
    expect(lesePreis(null)).toBeNull();
    expect(lesePreis(undefined)).toBeNull();
    expect(lesePreis("   ")).toBeNull();
  });

  it("meldet Unlesbares als leer statt als Null", () => {
    expect(lesePreis("auf Anfrage")).toBeNull();
  });
});

describe("Einheiten", () => {
  it("erkennt die Schreibweisen aus dem Betrieb", () => {
    expect(leseEinheit("m2")).toBe("M2");
    expect(leseEinheit("m²")).toBe("M2");
    expect(leseEinheit("Stk.")).toBe("STK");
    expect(leseEinheit("Stück")).toBe("STK");
    expect(leseEinheit("Laufmeter")).toBe("LFM");
    expect(leseEinheit(" KG ")).toBe("KG");
    expect(leseEinheit("Rolle")).toBe("ROLLE");
  });

  it("gibt null zurück, was sie nicht kennt", () => {
    expect(leseEinheit("Palette")).toBeNull();
    expect(leseEinheit(null)).toBeNull();
  });
});

describe("Vergleichsform", () => {
  it("ignoriert Rand, doppelte Leerzeichen und Grossschreibung", () => {
    expect(vergleichbar("  Armaflex   AF 19 MM ")).toBe("armaflex af 19 mm");
    expect(vergleichbar(null)).toBe("");
  });
});

describe("Abgleich in der vorgeschriebenen Reihenfolge", () => {
  it("trifft zuerst über die Artikelnummer", () => {
    const [a] = gleicheAlleAb([zeile({ sku: "AF-19", name: "Ganz anderer Name" })], KATALOG);
    expect(a).toMatchObject({ art: "aktualisieren", regel: "artikelnummer" });
    expect(a.art === "aktualisieren" && a.treffer.id).toBe("m1");
  });

  /* Die Artikelnummer schlägt den Namen: steht in der Liste eine falsche
   * Bezeichnung zur richtigen Nummer, gewinnt die Nummer. */
  it("lässt die Artikelnummer vor Kategorie und Name gehen", () => {
    const [a] = gleicheAlleAb(
      [zeile({ sku: "AF-19", kategorie: "Armaflex", name: "Armaflex AF 25 mm" })],
      KATALOG,
    );
    expect(a.art === "aktualisieren" && a.treffer.id).toBe("m1");
  });

  it("trifft ohne Artikelnummer über Kategorie und Name", () => {
    const [a] = gleicheAlleAb([zeile({ kategorie: "Brandschutz", name: "Rockwool" })], KATALOG);
    expect(a).toMatchObject({ art: "aktualisieren", regel: "kategorie-und-name" });
    expect(a.art === "aktualisieren" && a.treffer.id).toBe("m3");
  });

  it("trifft zuletzt über den Namen allein", () => {
    const [a] = gleicheAlleAb([zeile({ name: "Armaflex AF 25 mm" })], KATALOG);
    expect(a).toMatchObject({ art: "aktualisieren", regel: "name" });
    expect(a.art === "aktualisieren" && a.treffer.id).toBe("m2");
  });

  it("legt nur an, wenn keine der drei Regeln trifft", () => {
    const [a] = gleicheAlleAb([zeile({ sku: "NEU-1", name: "Ganz neuer Artikel" })], KATALOG);
    expect(a.art).toBe("anlegen");
  });

  it("gleicht unabhängig von Gross- und Kleinschreibung ab", () => {
    const [a] = gleicheAlleAb([zeile({ name: "  ARMAFLEX   AF 19 MM  " })], KATALOG);
    expect(a.art === "aktualisieren" && a.treffer.id).toBe("m1");
  });

  it("nimmt eine leere Artikelnummer nicht als Schlüssel", () => {
    // m3 und m4 haben beide sku null, das darf nicht zusammenfallen.
    const [a] = gleicheAlleAb([zeile({ sku: "", kategorie: "Dämmung", name: "Rockwool" })], KATALOG);
    expect(a.art === "aktualisieren" && a.treffer.id).toBe("m4");
  });
});

/* Der wichtigste Fall: "Rockwool" gibt es zweimal, in zwei Kategorien.
 * Raten wäre schlimmer als stehen lassen, der falsche Artikel bekäme
 * stillschweigend einen neuen Preis. */
describe("Uneindeutige Zeilen", () => {
  it("schreibt nicht, wenn der Name auf mehrere Artikel passt", () => {
    const [a] = gleicheAlleAb([zeile({ name: "Rockwool", preis: 9.9 })], KATALOG);
    expect(a.art).toBe("uneindeutig");
    expect(a.art === "uneindeutig" && a.kandidaten.map((k) => k.id)).toEqual(["m3", "m4"]);
  });

  it("wird eindeutig, sobald die Kategorie dabeisteht", () => {
    const [a] = gleicheAlleAb([zeile({ kategorie: "Dämmung", name: "Rockwool" })], KATALOG);
    expect(a.art === "aktualisieren" && a.treffer.id).toBe("m4");
  });

  /* Ohne Kategorie in der Datei darf "Kategorie plus Name" nicht greifen.
   * Sonst trifft eine leere Kategorie genau den Artikel, der ebenfalls
   * keine hat, und von zwei gleichnamigen wird lautlos einer geändert. */
  it("nimmt eine leere Kategorie nicht als Treffer gegen einen Artikel ohne Kategorie", () => {
    const katalog: Katalogartikel[] = [
      { id: "x1", sku: null, name: "Rockwool", kategorie: null },
      { id: "x2", sku: null, name: "Rockwool", kategorie: "Brandschutz" },
    ];
    const [a] = gleicheAlleAb([zeile({ name: "Rockwool", preis: 99 })], katalog);
    expect(a.art).toBe("uneindeutig");
    expect(a.art === "uneindeutig" && a.regel).toBe("name");
  });

  it("legt eine uneindeutige Zeile nicht als neuen Artikel an", () => {
    const [a] = gleicheAlleAb([zeile({ name: "Rockwool" })], KATALOG);
    expect(a.art).not.toBe("anlegen");
  });
});

describe("Fehlerhafte Zeilen", () => {
  it("weist eine Zeile ohne Bezeichnung ab", () => {
    const [a] = gleicheAlleAb([zeile({ name: "   ", sku: "AF-19" })], KATALOG);
    expect(a).toMatchObject({ art: "fehlerhaft", grund: "Ohne Bezeichnung" });
  });

  it("weist einen negativen Preis ab", () => {
    const [a] = gleicheAlleAb([zeile({ name: "Armaflex AF 19 mm", preis: -5 })], KATALOG);
    expect(a).toMatchObject({ art: "fehlerhaft", grund: "Negativer Preis" });
  });

  it("lässt den Preis null durch, das ist ein zulässiger Wert", () => {
    const [a] = gleicheAlleAb([zeile({ name: "Armaflex AF 19 mm", preis: 0 })], KATALOG);
    expect(a.art).toBe("aktualisieren");
  });
});

describe("Spalten aus der Kopfzeile", () => {
  it("erkennt eine ausgeschriebene Kopfzeile", () => {
    expect(
      findeSpalten(["Artikelnummer", "Bezeichnung", "Kategorie", "Einheit", "Preis"]),
    ).toEqual({ sku: 0, name: 1, kategorie: 2, einheit: 3, preis: 4, brandschutz: -1 });
  });

  it("erkennt Abkürzungen und ungleiche Schreibweise", () => {
    expect(findeSpalten(["ART.-NR.", " bezeichnung ", "EH", "VK"])).toMatchObject({
      sku: 0,
      name: 1,
      einheit: 2,
      preis: 3,
    });
  });

  it("trifft auch eine Spalte mit Zusatz im Titel", () => {
    expect(findeSpalten(["Bezeichnung", "Preis CHF exkl. MwSt."])).toMatchObject({
      name: 0,
      preis: 1,
    });
  });

  it("meldet fehlende Spalten mit minus eins", () => {
    expect(findeSpalten(["Bezeichnung"])).toEqual({
      sku: -1,
      name: 0,
      kategorie: -1,
      einheit: -1,
      preis: -1,
      brandschutz: -1,
    });
  });

  /* "Artikel" kann beides heissen. Fällt es auf dieselbe Spalte, ist es
   * die Bezeichnung: ohne die lässt sich nichts zuordnen. */
  it("gibt bei Doppeldeutigkeit der Bezeichnung den Vorrang", () => {
    const s = findeSpalten(["Artikel", "Preis"]);
    expect(s.name).toBe(0);
    expect(s.sku).toBe(-1);
  });

  it("stolpert nicht über leere Zellen in der Kopfzeile", () => {
    expect(findeSpalten([null, "Bezeichnung", undefined, "Preis"])).toMatchObject({
      name: 1,
      preis: 3,
    });
  });
});

describe("Zusammenfassung für die Vorschau", () => {
  it("zählt jede Art einzeln", () => {
    const abgleiche = gleicheAlleAb(
      [
        zeile({ sku: "AF-19", name: "Armaflex AF 19 mm", preis: 13 }),
        zeile({ sku: "AF-25", name: "Armaflex AF 25 mm", preis: 15 }),
        zeile({ name: "Ganz neu" }),
        zeile({ name: "Rockwool" }),
        zeile({ name: "" }),
      ],
      KATALOG,
    );
    expect(fasseZusammen(abgleiche)).toEqual({
      aktualisieren: 2,
      anlegen: 1,
      uneindeutig: 1,
      fehlerhaft: 1,
    });
  });

  it("kommt mit einer leeren Liste zurecht", () => {
    expect(fasseZusammen(gleicheAlleAb([], KATALOG))).toEqual({
      aktualisieren: 0,
      anlegen: 0,
      uneindeutig: 0,
      fehlerhaft: 0,
    });
  });
});
