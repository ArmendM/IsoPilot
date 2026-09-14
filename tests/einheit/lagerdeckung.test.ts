import { describe, expect, it } from "vitest";
import {
  type Deckung,
  aendere,
  bestellbedarf,
  gibZurueck,
  verbrauche,
  zaehldifferenz,
  zaehle,
} from "@/lib/lagerdeckung";

const d = (bestand: number, fehlmenge = 0): Deckung => ({ bestand, fehlmenge });

describe("Verbrauchen", () => {
  it("nimmt aus dem Lager, solange etwas da ist", () => {
    expect(verbrauche(d(100), 30)).toEqual({ bestand: 70, fehlmenge: 0 });
  });

  it("leert das Lager genau auf null", () => {
    expect(verbrauche(d(30), 30)).toEqual({ bestand: 0, fehlmenge: 0 });
  });

  /* Der Kern: der Bestand geht nie ins Minus, aber die Buchung gelingt
   * trotzdem. Was fehlt, steht als Fehlmenge da und muss bestellt werden. */
  it("geht nie ins Minus und merkt sich, was fehlt", () => {
    expect(verbrauche(d(20), 50)).toEqual({ bestand: 0, fehlmenge: 30 });
  });

  it("schreibt bei leerem Lager die ganze Menge als Fehlmenge", () => {
    expect(verbrauche(d(0), 12)).toEqual({ bestand: 0, fehlmenge: 12 });
  });

  it("addiert zu einer bestehenden Fehlmenge dazu", () => {
    expect(verbrauche(d(0, 30), 20)).toEqual({ bestand: 0, fehlmenge: 50 });
  });

  it("rundet auf zwei Nachkommastellen", () => {
    expect(verbrauche(d(0.3), 0.1)).toEqual({ bestand: 0.2, fehlmenge: 0 });
  });
});

describe("Zurückgeben", () => {
  it("legt ins Lager, wenn keine Fehlmenge offen ist", () => {
    expect(gibZurueck(d(70), 30)).toEqual({ bestand: 100, fehlmenge: 0 });
  });

  /* Zuerst die Fehlmenge tilgen: sonst stünde Ware im Lager und
   * gleichzeitig eine Bestellung offen, die es nicht mehr braucht. */
  it("tilgt zuerst die Fehlmenge", () => {
    expect(gibZurueck(d(0, 30), 10)).toEqual({ bestand: 0, fehlmenge: 20 });
  });

  it("tilgt die Fehlmenge und legt den Rest ins Lager", () => {
    expect(gibZurueck(d(0, 30), 50)).toEqual({ bestand: 20, fehlmenge: 0 });
  });

  it("tilgt genau auf null", () => {
    expect(gibZurueck(d(0, 30), 30)).toEqual({ bestand: 0, fehlmenge: 0 });
  });
});

/* Beide Zahlen zugleich grösser als null gibt es nicht: wer sieben
 * schuldet, hat die fünf im Lager längst verbraucht. Deshalb stehen hier
 * nur gültige Ausgangslagen. */
describe("Verbrauchen und Zurückgeben heben sich auf", () => {
  it.each([
    [100, 0, 30],
    [20, 0, 50],
    [0, 0, 12],
    [0, 30, 20],
    [0, 7, 9],
    [5, 0, 9],
  ])("bestand %i, fehlmenge %i, menge %i", (bestand, fehlmenge, menge) => {
    const start = d(bestand, fehlmenge);
    expect(gibZurueck(verbrauche(start, menge), menge)).toEqual(start);
  });

  it("bringt einen unmöglichen Zustand in Ordnung, statt ihn fortzuschleppen", () => {
    // 5 an Lager und zugleich 7 fehlend gibt es nicht, das sind netto -2.
    expect(verbrauche(d(5, 7), 0)).toEqual({ bestand: 0, fehlmenge: 2 });
  });
});

describe("Buchung ändern", () => {
  it("bucht bei einer Erhöhung nur die Differenz ab", () => {
    expect(aendere(d(90), 10, 12)).toEqual({ bestand: 88, fehlmenge: 0 });
  });

  it("gibt bei einer Verringerung nur die Differenz zurück", () => {
    expect(aendere(d(90), 10, 4)).toEqual({ bestand: 96, fehlmenge: 0 });
  });

  it("ändert ohne Mengenänderung nichts", () => {
    expect(aendere(d(90), 10, 10)).toEqual({ bestand: 90, fehlmenge: 0 });
    expect(aendere(d(0, 5), 10, 10)).toEqual({ bestand: 0, fehlmenge: 5 });
  });

  /* Erhöhen über den Bestand hinaus: das Lager wird leer, der Rest wird
   * zur Fehlmenge, und die Änderung gelingt. */
  it("lässt eine Erhöhung über den Bestand hinaus zu", () => {
    expect(aendere(d(5), 10, 40)).toEqual({ bestand: 0, fehlmenge: 25 });
  });

  it("baut die Fehlmenge ab, wenn die Menge verringert wird", () => {
    expect(aendere(d(0, 30), 50, 20)).toEqual({ bestand: 0, fehlmenge: 0 });
  });
});

describe("Bestellbedarf", () => {
  it("ist null, wenn Bestand über dem Mindestbestand liegt", () => {
    expect(bestellbedarf(d(100), 30)).toBe(0);
  });

  it("füllt bis zum Mindestbestand auf", () => {
    expect(bestellbedarf(d(10), 30)).toBe(20);
  });

  /* Genau die Zahl, nach der gefragt war: so viel, dass die Baustellen
   * gedeckt sind und der Mindestbestand wieder steht. */
  it("deckt Fehlmenge und Mindestbestand zusammen", () => {
    expect(bestellbedarf(d(0, 115), 30)).toBe(145);
  });

  it("rechnet ohne Mindestbestand nur die Fehlmenge", () => {
    expect(bestellbedarf(d(0, 115), 0)).toBe(115);
  });

  it("bleibt bei vollem Lager ohne Fehlmenge bei null", () => {
    expect(bestellbedarf(d(50), 0)).toBe(0);
  });
});

/* Die Inventur: gezählt wird der Bestand, und was gezählt ist, ist da.
 * Eine offene Fehlmenge ist damit erledigt. */
describe("zaehle", () => {
  it("setzt den Bestand auf das Gezählte", () => {
    expect(zaehle(38)).toEqual({ bestand: 38, fehlmenge: 0 });
  });

  it("tilgt eine offene Fehlmenge, sobald etwas gezählt wird", () => {
    expect(zaehle(10)).toEqual({ bestand: 10, fehlmenge: 0 });
  });

  /* Auch eine Zählung auf null räumt die Fehlmenge weg: gezählt ist
   * gezählt, und der Bestellbedarf kommt danach aus dem Mindestbestand. */
  it("lässt bei null nichts stehen", () => {
    expect(zaehle(0)).toEqual({ bestand: 0, fehlmenge: 0 });
  });
});

describe("zaehldifferenz", () => {
  it("nennt die Differenz zum Bestand, wenn nichts fehlt", () => {
    expect(zaehldifferenz({ bestand: 42, fehlmenge: 0 }, 38)).toBe(-4);
  });

  /* Der Kern: über den Bestand allein wären es +10, und die getilgten 30
   * verschwänden lautlos aus dem Verlauf. */
  it("rechnet eine getilgte Fehlmenge mit", () => {
    expect(zaehldifferenz({ bestand: 0, fehlmenge: 30 }, 10)).toBe(40);
  });

  it("ist null, wenn die Zählung den Bestand bestätigt", () => {
    expect(zaehldifferenz({ bestand: 42, fehlmenge: 0 }, 42)).toBe(0);
  });

  /* Auch das ist eine Berichtigung, obwohl der Bestand bei null bleibt. */
  it("ist nicht null, wenn nur die Fehlmenge wegfällt", () => {
    expect(zaehldifferenz({ bestand: 0, fehlmenge: 30 }, 0)).toBe(30);
  });
});
