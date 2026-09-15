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

/* **Ab wann rechnet IsoPilot?**
 *
 * Das kann nur der Stichtag des Anfangssaldos beantworten,
 * `User.balanceFrom`. Er ist die Aussage "ab hier sind die Stunden in
 * IsoPilot vollständig, alles davor steckt im mitgebrachten Saldo".
 *
 * Es ist verlockend, ersatzweise den Eintritt zu nehmen oder den ersten
 * Pensumstart. Beides ist falsch, und der zweite Anlauf hat es gezeigt:
 *
 * - **Der Eintritt** sagt nur, seit wann jemand angestellt ist, nicht
 *   seit wann er erfasst. Ein Konto mit Eintritt am 01.01.2026 stand im
 *   September bei minus 1486.8 Stunden, weil 177 Werktage Soll gegen
 *   null erfasste Stunden standen: IsoPilot lief im ersten Halbjahr noch
 *   gar nicht.
 * - **Der erste Pensumstart** trennt die beiden Fälle nicht, die sich
 *   trennen müssten. Er kann heissen "ab hier wird diese Person erfasst",
 *   er kann aber genauso eine Änderung sein: wer seit Jahren erfasst
 *   wird und im Oktober auf 80 Prozent geht, schuldet im September
 *   weiterhin die vollen Stunden. Aus den Pensumszeilen allein ist nicht
 *   zu erkennen, welcher der beiden Fälle vorliegt.
 *
 * Deshalb: **ohne Stichtag kein laufender Saldo.** Eine fehlende Zahl
 * mit dem Hinweis, was zu setzen ist, ist besser als eine erfundene, die
 * niemand nachrechnen kann. Die Auswertung über einen selbst gewählten
 * Zeitraum bleibt davon unberührt: dort ist der Zeitraum ausdrücklich
 * gefragt, und das Soll darin ist eine wohldefinierte Antwort.
 */

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

/** Ein Tag mit allem, was das Soll bestimmt, ausser dem Pensum. */
export type Tagesangabe = Omit<Tagesumstand, "wochenstunden"> & { tag: string };

/**
 * Das Soll über viele Tage.
 *
 * Zwei Stellen fragen danach: die Auswertung über ihren Zeitraum und die
 * Tagesansicht über den laufenden Saldo. **Beide summieren hier**, nicht
 * jede in ihrer eigenen Schleife: die Regel ist dieselbe, und zwei
 * Summen über dieselben Tage laufen früher oder später auseinander.
 */
export function sollSumme(
  tage: Tagesangabe[],
  pensen: Pensum[],
  vorgabe: number,
): number {
  let summe = 0;
  for (const t of tage)
    summe += tagessoll({ ...t, wochenstunden: wochenstundenAm(t.tag, pensen, vorgabe) });
  return runde(summe);
}

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
