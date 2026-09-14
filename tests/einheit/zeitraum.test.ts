import { describe, expect, it } from "vitest";
import {
  istTag,
  istWochenende,
  monatsEnde,
  tageIn,
  zeitraumAus,
} from "@/lib/zeitraum";

describe("zeitraumAus, Monat", () => {
  it("spannt den ganzen Monat auf", () => {
    expect(zeitraumAus({ art: "monat", monat: "2026-09" })).toEqual({
      art: "monat",
      von: "2026-09-01",
      bis: "2026-09-30",
      bezeichnung: "September 2026",
    });
  });

  it("trifft den Februar in einem Schaltjahr", () => {
    expect(zeitraumAus({ art: "monat", monat: "2028-02" })?.bis).toBe("2028-02-29");
  });

  it("trifft den Februar in einem gewöhnlichen Jahr", () => {
    expect(zeitraumAus({ art: "monat", monat: "2026-02" })?.bis).toBe("2026-02-28");
  });

  it("gibt ohne Monat nichts zurück", () => {
    expect(zeitraumAus({ art: "monat" })).toBeNull();
  });

  it("weist einen Monat ausserhalb von eins bis zwölf ab", () => {
    expect(zeitraumAus({ art: "monat", monat: "2026-13" })).toBeNull();
  });
});

describe("zeitraumAus, Jahr", () => {
  it("spannt das ganze Jahr auf", () => {
    expect(zeitraumAus({ art: "jahr", jahr: "2026" })).toEqual({
      art: "jahr",
      von: "2026-01-01",
      bis: "2026-12-31",
      bezeichnung: "2026",
    });
  });

  it("weist eine unsinnige Jahreszahl ab", () => {
    expect(zeitraumAus({ art: "jahr", jahr: "12" })).toBeNull();
    expect(zeitraumAus({ art: "jahr", jahr: "abc" })).toBeNull();
  });
});

describe("zeitraumAus, freie Zeitspanne", () => {
  it("nimmt von und bis, wie sie dastehen", () => {
    expect(zeitraumAus({ art: "spanne", von: "2026-03-01", bis: "2026-04-15" })).toEqual({
      art: "spanne",
      von: "2026-03-01",
      bis: "2026-04-15",
      bezeichnung: "01.03.2026 bis 15.04.2026",
    });
  });

  it("nennt einen einzelnen Tag nur einmal", () => {
    expect(zeitraumAus({ art: "spanne", von: "2026-03-01", bis: "2026-03-01" })?.bezeichnung)
      .toBe("01.03.2026");
  });

  /* Stillschweigend zu tauschen wäre schlimmer als nichts zu zeigen: die
   * Auswertung zeigte dann etwas anderes an, als in den Feldern steht. */
  it("dreht einen umgedrehten Zeitraum nicht um", () => {
    expect(zeitraumAus({ art: "spanne", von: "2026-04-15", bis: "2026-03-01" })).toBeNull();
  });

  it("weist ein Datum ab, das es nicht gibt", () => {
    expect(zeitraumAus({ art: "spanne", von: "2026-02-30", bis: "2026-03-01" })).toBeNull();
  });
});

describe("zeitraumAus, Vorgabe", () => {
  /* Die Seite wird ohne Angaben aufgerufen. Dann gilt Monat, und es
   * fehlt nur noch der Monat selbst. */
  it("nimmt bei unbekannter Art den Monat an", () => {
    expect(zeitraumAus({ art: "quartal", monat: "2026-09" })?.art).toBe("monat");
    expect(zeitraumAus({ monat: "2026-09" })?.art).toBe("monat");
  });
});

describe("monatsEnde", () => {
  it("kennt die kurzen Monate", () => {
    expect(monatsEnde("2026-04")).toBe("2026-04-30");
    expect(monatsEnde("2026-12")).toBe("2026-12-31");
  });
});

describe("istTag", () => {
  it("nimmt ein gültiges Datum an", () => {
    expect(istTag("2026-09-14")).toBe(true);
  });

  it("weist Unfug ab", () => {
    expect(istTag("2026-09-31")).toBe(false);
    expect(istTag("14.09.2026")).toBe(false);
    expect(istTag(null)).toBe(false);
    expect(istTag("")).toBe(false);
  });
});

describe("tageIn", () => {
  const z = (von: string, bis: string) =>
    zeitraumAus({ art: "spanne", von, bis })!;

  it("zählt beide Ränder mit", () => {
    expect(tageIn(z("2026-09-01", "2026-09-03"))).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("gibt bei einem einzelnen Tag genau einen zurück", () => {
    expect(tageIn(z("2026-09-01", "2026-09-01"))).toEqual(["2026-09-01"]);
  });

  it("läuft über einen Monatswechsel", () => {
    expect(tageIn(z("2026-01-30", "2026-02-02"))).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
  });

  it("zählt ein volles Jahr", () => {
    expect(tageIn(zeitraumAus({ art: "jahr", jahr: "2026" })!)).toHaveLength(365);
  });

  it("hört bei der Obergrenze auf", () => {
    expect(tageIn(z("2026-01-01", "2026-12-31"), 10)).toHaveLength(10);
  });
});

describe("istWochenende", () => {
  it("erkennt Samstag und Sonntag", () => {
    expect(istWochenende("2026-09-12")).toBe(true);
    expect(istWochenende("2026-09-13")).toBe(true);
  });

  it("lässt die Werktage in Ruhe", () => {
    expect(istWochenende("2026-09-14")).toBe(false);
    expect(istWochenende("2026-09-11")).toBe(false);
  });
});
