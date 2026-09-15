/* Sollarbeitszeit und Zeitsaldo als Rechnung, ohne Prisma und ohne
 * React. Damit ist sie in tests/einheit ohne Datenbank zu prüfen.
 *
 * Die Vorgabe sind 42 Stunden je Woche, `Company.weeklyHours`. Wer
 * weniger arbeitet, bekommt ein eigenes Pensum, nicht eine Ausnahme im
 * Code.
 *
 * **Das Tagessoll ist gleichmässig**, 42 geteilt durch 5 sind 8.4
 * Stunden an jedem Werktag. Ein Wochenmuster, freitags kürzer, gibt es
 * bewusst nicht: es bräuchte fünf Zahlen je Person, und Teilzeit ist so
 * dieselbe Rechnung mit einer kleineren Wochenzahl.
 *
 * Nicht zu verwechseln mit `workingDays` in `lib/dates.ts`. Das zählt,
 * wie viele Ferientage eine Absenz verbraucht, liest dabei die
 * Systemzeitzone und darf dafür nicht angefasst werden. Hier wird auf
 * Kalendertagen als Zeichenkette gerechnet, "2026-09-14", wie im
 * Zeitraum und in der Auswertung.
 */

/** Werktage je Woche. Montag bis Freitag, das Soll verteilt sich darauf. */
export const WERKTAGE_JE_WOCHE = 5;

/** Ein Pensum ab einem Stichtag. `validFrom` als "yyyy-mm-dd". */
export type Pensum = {
  validFrom: string;
  weeklyHours: number;
};

/**
 * Die Wochenstunden, die an diesem Tag galten.
 *
 * Gilt das jüngste Pensum, dessen Stichtag nicht nach dem Tag liegt.
 * Steht für einen Tag keines, gilt die Vorgabe der Firma: eine Person
 * ohne eigenes Pensum arbeitet Vollzeit, und niemand muss ihr dafür
 * eine Zeile anlegen.
 *
 * **Gefragt wird, was an diesem Tag galt, nicht was heute gilt.** Steigt
 * jemand im Mai von 100 auf 80 Prozent, schuldet er bis April weiterhin
 * 42 Stunden. Genau deshalb braucht der Monatsabschluss den Saldo nicht
 * einzufrieren: die Vergangenheit rechnet sich immer gleich.
 */
export function wochenstundenAm(
  tag: string,
  pensen: Pensum[],
  vorgabe: number,
): number {
  let gilt = vorgabe;
  let bestes = "";
  for (const p of pensen) {
    if (p.validFrom <= tag && p.validFrom >= bestes) {
      gilt = p.weeklyHours;
      bestes = p.validFrom;
    }
  }
  return gilt;
}

/** Was an einem Tag über die Person bekannt ist. */
export type Tagesumstand = {
  wochenende: boolean;
  feiertag: boolean;
  /** 0 für keine Absenz, 0.5 für einen halben Tag, 1 für einen ganzen. */
  absenzAnteil: number;
  /** Liegt der Tag im Arbeitsverhältnis? */
  beschaeftigt: boolean;
  wochenstunden: number;
};

/**
 * Das Soll eines einzelnen Tages.
 *
 * Die ganze Regel an einer Stelle, damit sie nicht in der Leseschicht
 * ausgeschrieben steht und dort beim nächsten Zusatz auseinanderläuft.
 *
 * - **Wochenende und Feiertag tragen kein Soll.** Wer am Samstag
 *   arbeitet, und das kommt vor, schreibt seine Stunden voll dem Saldo
 *   gut. Eine Sperre gibt es nicht und soll es nicht geben.
 * - **Ferien, Krankheit und übrige Absenzen senken das Soll**, ein
 *   halber Tag zur Hälfte. Ohne das baute jeder in den Ferien Minus auf.
 * - **Ausserhalb des Arbeitsverhältnisses gibt es kein Soll.** Wer am
 *   1. Mai eintritt, schuldet für den April nichts.
 */
export function tagessoll(u: Tagesumstand): number {
  if (!u.beschaeftigt || u.wochenende || u.feiertag) return 0;
  const voll = u.wochenstunden / WERKTAGE_JE_WOCHE;
  return voll * (1 - begrenzt(u.absenzAnteil));
}

/** Ein Absenzanteil liegt zwischen 0 und 1. Alles andere wäre ein Fehler
 *  weiter oben, und ein negatives Soll ist keine sinnvolle Antwort. */
const begrenzt = (anteil: number) => Math.min(1, Math.max(0, anteil));

/**
 * Der Zeitsaldo: was mitgebracht wurde, plus geleistet, minus geschuldet.
 *
 * Der Anfangssaldo kommt aus dem alten Vorgehen und wird für den
 * Parallelbetrieb einmal eingetragen. Ohne ihn fienge beim Umstieg jeder
 * bei null an und die bisherigen Überstunden wären weg.
 */
export function saldo(anfang: number, ist: number, soll: number): number {
  return runde(anfang + ist - soll);
}

/**
 * Stunden auf zwei Stellen.
 *
 * 42 geteilt durch 5 ist 8.4, und 8.4 lässt sich binär nicht genau
 * darstellen: über zweihundert Werktage summiert sich der Rest sonst
 * sichtbar auf.
 *
 * Die `+ 0` ist kein Zierrat. Ein Saldo, der auf null aufgeht, kommt aus
 * dem Runden eines winzigen negativen Rests als **minus null** heraus,
 * und in der Auswertung stünde dann "-0.00 h". Das sieht nach einem
 * Fehler aus, wo gerade alles aufgeht.
 */
export const runde = (n: number): number => Math.round(n * 100) / 100 + 0;
