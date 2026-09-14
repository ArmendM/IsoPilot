import { describe, expect, it } from "vitest";
import {
  FARBEN,
  WORTMARKE_VERHAELTNIS,
  fassungFuer,
  hoeheReicht,
  logofarben,
} from "@/lib/marke";

/* Die Regeln aus dem Markenhandbuch. Sie stehen hier, weil man sie nicht
 * sieht, wenn man sie falsch macht: eine weisse Wortmarke auf weissem
 * Grund fällt sofort auf, ein roter Halbring auf Blau erst im Druck. */

describe("logofarben", () => {
  it("nimmt auf hellem Grund Tiefblau und Rot", () => {
    expect(logofarben("farbig")).toEqual({ schrift: "#0A4A7C", waerme: "#D0342A" });
  });

  it("lässt auf dunklem Grund das Rot stehen", () => {
    expect(logofarben("negativ-rot")).toEqual({ schrift: "#FFFFFF", waerme: "#D0342A" });
  });

  it("macht für Blau und Stickerei alles weiss", () => {
    expect(logofarben("negativ-weiss")).toEqual({ schrift: "#FFFFFF", waerme: "#FFFFFF" });
  });

  it("nimmt für den Einfarbdruck zweimal Anthrazit", () => {
    expect(logofarben("schwarz")).toEqual({ schrift: "#131C24", waerme: "#131C24" });
  });
});

describe("fassungFuer", () => {
  /* Die eine Regel, die man nicht sieht: Rot und Tiefblau haben fast
   * dieselbe Helligkeit. Auf blauem Grund verschwindet der halbe Ring,
   * wenn die Fassung mit Rot genommen wird. */
  it("nimmt auf blauem Grund die ganz weisse Fassung, nicht die mit Rot", () => {
    expect(fassungFuer("blau")).toBe("negativ-weiss");
  });

  it("nimmt auf dunklem, neutralem Grund die Fassung mit Rot", () => {
    expect(fassungFuer("dunkel")).toBe("negativ-rot");
  });

  it("nimmt auf hellem Grund die farbige", () => {
    expect(fassungFuer("hell")).toBe("farbig");
  });
});

describe("Masse", () => {
  it("kennt das Seitenverhältnis der Wortmarke", () => {
    expect(WORTMARKE_VERHAELTNIS).toBeCloseTo(6.599, 3);
  });

  /* Aus dem Handbuch: am Bildschirm nicht unter 90 Pixel Breite. Bei 32
   * Pixel Höhe sind es 211, bei 13 nur 86. */
  it("lässt 32 Pixel Höhe zu und weist 13 ab", () => {
    expect(hoeheReicht(32)).toBe(true);
    expect(hoeheReicht(13)).toBe(false);
  });

  it("trifft die Grenze genau", () => {
    expect(hoeheReicht(90 / WORTMARKE_VERHAELTNIS)).toBe(true);
  });
});

describe("FARBEN", () => {
  /* Blau ist nicht Tiefblau. Die beiden zu verwechseln hiesse, eine
   * Farbe ins Logo zu tragen, die dort nicht vorkommt. */
  it("hält Blau und Tiefblau auseinander", () => {
    expect(FARBEN.blau).not.toBe(FARBEN.tiefblau);
    expect(FARBEN.tiefblau).toBe("#0A4A7C");
    expect(FARBEN.blau).toBe("#0F6FB8");
  });
});
