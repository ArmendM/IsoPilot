import { describe, expect, it } from "vitest";
import { type Buchungsstand, planeAenderung } from "@/lib/buchungsaenderung";

const ALT: Buchungsstand = { materialId: "m1", menge: 10, einzelpreis: 12.5 };

describe("Preis beim Ändern", () => {
  /* Dieselbe Buchung, nur eine andere Menge: der eingefrorene Preis bleibt.
   * Sonst änderte eine Mengenkorrektur rückwirkend den Preis, und genau
   * das verbietet die Einfrier-Regel aus CLAUDE.md. */
  it("behält den eingefrorenen Preis bei einer Mengenänderung", () => {
    const p = planeAenderung(ALT, { materialId: "m1", menge: 12, heutigerPreis: 99 });
    expect(p.einzelpreis).toBe(12.5);
    expect(p.artikelGewechselt).toBe(false);
  });

  /* Für einen anderen Artikel gibt es keinen ursprünglichen Preis, den man
   * behalten könnte. */
  it("holt den heutigen Preis beim Wechsel auf einen anderen Artikel", () => {
    const p = planeAenderung(ALT, { materialId: "m2", menge: 10, heutigerPreis: 20 });
    expect(p.einzelpreis).toBe(20);
    expect(p.artikelGewechselt).toBe(true);
  });
});

describe("Lager beim Ändern derselben Position", () => {
  it("bucht bei einer Erhöhung nur die Differenz ab", () => {
    const p = planeAenderung(ALT, { materialId: "m1", menge: 12, heutigerPreis: 12.5 });
    expect(p.bewegungen).toEqual([{ materialId: "m1", delta: -2 }]);
  });

  it("bucht bei einer Verringerung nur die Differenz zurück", () => {
    const p = planeAenderung(ALT, { materialId: "m1", menge: 4, heutigerPreis: 12.5 });
    expect(p.bewegungen).toEqual([{ materialId: "m1", delta: 6 }]);
  });

  /* Eine Zeile mit delta 0 im Lagerverlauf wäre nur Rauschen. */
  it("erzeugt ohne Mengenänderung gar keine Bewegung", () => {
    const p = planeAenderung(ALT, { materialId: "m1", menge: 10, heutigerPreis: 12.5 });
    expect(p.bewegungen).toEqual([]);
  });

  it("bucht bei Menge null die volle Menge zurück", () => {
    const p = planeAenderung(ALT, { materialId: "m1", menge: 0, heutigerPreis: 12.5 });
    expect(p.bewegungen).toEqual([{ materialId: "m1", delta: 10 }]);
  });

  /* Ohne Rundung bleibt aus 0.3 minus 0.1 ein Rest wie 0.19999999999999998,
   * und der Lagerverlauf bekommt eine Bewegung, die niemand ausgelöst hat. */
  it("rundet auf zwei Nachkommastellen, wie das Schema", () => {
    const p = planeAenderung(
      { materialId: "m1", menge: 0.3, einzelpreis: 1 },
      { materialId: "m1", menge: 0.1, heutigerPreis: 1 },
    );
    expect(p.bewegungen).toEqual([{ materialId: "m1", delta: 0.2 }]);
  });

  it("erzeugt bei einer Rundungsdifferenz unter einem Rappen keine Bewegung", () => {
    const p = planeAenderung(
      { materialId: "m1", menge: 0.1 + 0.2, einzelpreis: 1 },
      { materialId: "m1", menge: 0.3, heutigerPreis: 1 },
    );
    expect(p.bewegungen).toEqual([]);
  });
});

describe("Lager beim Wechsel des Artikels", () => {
  it("gibt die alte Menge ganz zurück und bucht die neue ganz ab", () => {
    const p = planeAenderung(ALT, { materialId: "m2", menge: 3, heutigerPreis: 20 });
    expect(p.bewegungen).toEqual([
      { materialId: "m1", delta: 10 },
      { materialId: "m2", delta: -3 },
    ]);
  });

  /* Auch bei gleicher Menge: es sind zwei verschiedene Artikel, und beide
   * Bestände müssen stimmen. */
  it("bucht auch bei unveränderter Menge auf beiden Artikeln", () => {
    const p = planeAenderung(ALT, { materialId: "m2", menge: 10, heutigerPreis: 20 });
    expect(p.bewegungen).toEqual([
      { materialId: "m1", delta: 10 },
      { materialId: "m2", delta: -10 },
    ]);
  });
});
