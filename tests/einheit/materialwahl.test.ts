import { describe, expect, it } from "vitest";
import {
  ALLE_KATEGORIEN,
  OHNE_KATEGORIE,
  kategorienAus,
  nachKategorie,
} from "@/lib/materialwahl";

const a = (kategorieId: string | null, kategorie: string | null, name: string) => ({
  kategorieId,
  kategorie,
  name,
});

const KATALOG = [
  a("k1", "Armaflex", "AF 19 mm"),
  a("k1", "Armaflex", "AF 25 mm"),
  a("k2", "Brandschutz", "Rockwool EI 30"),
  a(null, null, "Restposten ohne Kategorie"),
];

describe("Kategorien aus dem Katalog", () => {
  it("nennt jede Kategorie einmal, in der Reihenfolge der Artikel", () => {
    expect(kategorienAus(KATALOG)).toEqual([
      { id: "k1", name: "Armaflex" },
      { id: "k2", name: "Brandschutz" },
      { id: OHNE_KATEGORIE, name: "Ohne Kategorie" },
    ]);
  });

  it("nennt keine Kategorie, in der es keinen Artikel gibt", () => {
    expect(kategorienAus([a("k2", "Brandschutz", "Rockwool")])).toEqual([
      { id: "k2", name: "Brandschutz" },
    ]);
  });

  it("kommt mit einem leeren Katalog zurecht", () => {
    expect(kategorienAus([])).toEqual([]);
  });
});

describe("Artikel nach Kategorie", () => {
  it("zeigt nur die Artikel der gewählten Kategorie", () => {
    expect(nachKategorie(KATALOG, "k1").map((x) => x.name)).toEqual([
      "AF 19 mm",
      "AF 25 mm",
    ]);
  });

  /* categoryId ist im Schema optional. Ohne eigenen Topf wären solche
   * Artikel über die Kategoriewahl nicht mehr erreichbar. */
  it("erreicht auch Artikel ohne Kategorie", () => {
    expect(nachKategorie(KATALOG, OHNE_KATEGORIE).map((x) => x.name)).toEqual([
      "Restposten ohne Kategorie",
    ]);
  });

  it("zeigt bei Alle den ganzen Katalog", () => {
    expect(nachKategorie(KATALOG, ALLE_KATEGORIEN)).toHaveLength(4);
  });

  it("gibt nichts zurück für eine Kategorie ohne Artikel", () => {
    expect(nachKategorie(KATALOG, "k9")).toEqual([]);
  });
});

/* Die Falle beim Kategoriewechsel: der zuvor gewählte Artikel gehört nicht
 * mehr zur sichtbaren Liste. Das Formular muss dann den ersten sichtbaren
 * buchen, sonst bucht es etwas anderes, als im Dropdown steht. */
describe("Artikel nach einem Kategoriewechsel", () => {
  const gewaehlt = (alle: typeof KATALOG, kategorieId: string, vorher: string) => {
    const sichtbar = nachKategorie(alle, kategorieId);
    return sichtbar.some((x) => x.name === vorher) ? vorher : (sichtbar[0]?.name ?? "");
  };

  it("behält die Wahl, solange sie in der Kategorie bleibt", () => {
    expect(gewaehlt(KATALOG, "k1", "AF 25 mm")).toBe("AF 25 mm");
  });

  it("springt auf den ersten Artikel der neuen Kategorie", () => {
    expect(gewaehlt(KATALOG, "k2", "AF 25 mm")).toBe("Rockwool EI 30");
  });

  it("bleibt leer, wenn die Kategorie nichts enthält", () => {
    expect(gewaehlt(KATALOG, "k9", "AF 25 mm")).toBe("");
  });
});
