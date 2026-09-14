/* Die Marke als Zahlen und Regeln, ohne React und ohne Prisma.
 *
 * Verbindlich ist das Markenhandbuch unter `docs/marke`. Was hier steht,
 * ist die Umsetzung davon, nicht eine zweite Meinung dazu. */

export const FARBEN = {
  /** Wortmarke, Kachel des Symbols, Linien im Briefkopf. */
  tiefblau: "#0A4A7C",
  /** Flächen und Zustände in IsoPilot, im Logo selbst kommt es nicht vor. */
  blau: "#0F6FB8",
  /** Wärme, nur die rechte Ringhälfte. */
  rot: "#D0342A",
  /** Text und Einfarbfassung. */
  anthrazit: "#131C24",
  /** Heller Grund. */
  papier: "#F5F6F7",
} as const;

export type Fassung = "farbig" | "negativ-rot" | "negativ-weiss" | "schwarz";

export type Logofarben = {
  /** Wortmarke und linke Ringhälfte. */
  schrift: string;
  /** Rechte Ringhälfte. */
  waerme: string;
};

/**
 * Welche Farben eine Fassung trägt.
 *
 * Als eigene Funktion, damit die vier Fassungen an einer Stelle stehen
 * und in tests/einheit festzunageln sind. In der Komponente
 * ausgeschrieben wäre es eine verschachtelte Bedingung, die beim
 * nächsten Zusatz still falsch wird.
 */
export function logofarben(fassung: Fassung): Logofarben {
  switch (fassung) {
    case "negativ-rot":
      return { schrift: "#FFFFFF", waerme: FARBEN.rot };
    case "negativ-weiss":
      return { schrift: "#FFFFFF", waerme: "#FFFFFF" };
    case "schwarz":
      return { schrift: FARBEN.anthrazit, waerme: FARBEN.anthrazit };
    default:
      return { schrift: FARBEN.tiefblau, waerme: FARBEN.rot };
  }
}

/**
 * Welche Fassung auf einen Grund gehört.
 *
 * Die eine Regel aus dem Handbuch, die man nicht sieht und deshalb
 * falsch macht: Rot und Tiefblau haben fast dieselbe Helligkeit. Auf
 * blauem Grund gehört deshalb die ganz weisse Fassung, nie die mit rotem
 * Halbring, sonst verschwindet der halbe Ring.
 */
export function fassungFuer(grund: "hell" | "dunkel" | "blau"): Fassung {
  if (grund === "blau") return "negativ-weiss";
  if (grund === "dunkel") return "negativ-rot";
  return "farbig";
}

/** Seitenverhältnis der Wortmarke, 4692 zu 711 aus dem viewBox. */
export const WORTMARKE_VERHAELTNIS = 4692 / 711;

/**
 * Mindestbreite am Bildschirm in Pixeln, aus dem Handbuch. Darunter
 * läuft der Ring zu und die Schrift bricht weg.
 */
export const WORTMARKE_MINDESTBREITE = 90;

/** Ist diese Höhe noch zulässig, gemessen an der Mindestbreite? */
export const hoeheReicht = (hoehe: number): boolean =>
  hoehe * WORTMARKE_VERHAELTNIS >= WORTMARKE_MINDESTBREITE;
