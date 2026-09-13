/* Lagerbestand und Fehlmenge. Reine Rechenlogik, ohne Prisma.
 *
 * Zwei Zahlen statt einer:
 *
 *   `bestand`   was physisch da ist, nie unter 0
 *   `fehlmenge` was auf Baustellen gebucht wurde, ohne dass das Lager es
 *               decken konnte, also was nachbestellt werden muss
 *
 * Ein negativer Bestand wäre dieselbe Information in unleserlich: er
 * vermischt "nichts mehr da" mit "so viel fehlt". Getrennt lässt sich
 * beides anzeigen und der Bestellbedarf sauber ausrechnen.
 *
 * **Nie sind beide zugleich grösser als null.** Wer sieben schuldet, hat
 * die fünf im Lager längst verbraucht. Deshalb rechnet alles hier über
 * einen einzigen Saldo und teilt erst am Schluss wieder auf. Ohne das
 * heben sich Verbrauch und Rückgabe nicht mehr auf: eine bestehende
 * Fehlmenge schluckte die Rückgabe, und das Lager bliebe leer, obwohl
 * Ware zurückkam.
 */

export type Deckung = {
  bestand: number;
  fehlmenge: number;
};

/** Mengen liegen im Schema auf zwei Nachkommastellen. */
const runde = (n: number): number => Math.round(n * 100) / 100;

/** Der Saldo: was da ist, abzüglich dessen, was fehlt. */
export const saldo = (d: Deckung): number => runde(d.bestand - d.fehlmenge);

/** Aus einem Saldo wieder Bestand und Fehlmenge machen. */
export const ausSaldo = (n: number): Deckung => ({
  bestand: Math.max(0, runde(n)),
  fehlmenge: Math.max(0, runde(-n)),
});

/**
 * Menge verbrauchen. Das Lager gibt her, was es hat, der Rest wird zur
 * Fehlmenge. Die Buchung selbst gelingt immer: wer auf der Baustelle
 * Material verbaut hat, muss das erfassen können, auch wenn der
 * Lagerbestand im System nicht nachgeführt war.
 */
export const verbrauche = (d: Deckung, menge: number): Deckung =>
  ausSaldo(saldo(d) - menge);

/** Menge zurückgeben, etwa beim Rückgängigmachen einer Buchung. Tilgt
 *  zuerst eine offene Fehlmenge, erst dann wächst der Bestand. */
export const gibZurueck = (d: Deckung, menge: number): Deckung =>
  ausSaldo(saldo(d) + menge);

/**
 * Was bestellt werden muss, damit wieder alles gedeckt ist: die
 * Fehlmenge von den Baustellen plus das, was bis zum Mindestbestand
 * fehlt.
 */
export const bestellbedarf = (d: Deckung, mindestbestand: number): number =>
  runde(d.fehlmenge + Math.max(0, mindestbestand - d.bestand));

/** Die Änderung einer Buchung ist eine Rückgabe der alten Menge und ein
 *  Verbrauch der neuen. Auf demselben Artikel bleibt bei gleicher Menge
 *  alles, wie es war, bei einem Artikelwechsel trifft es zwei Artikel. */
export const aendere = (d: Deckung, alteMenge: number, neueMenge: number): Deckung =>
  ausSaldo(saldo(d) + alteMenge - neueMenge);
