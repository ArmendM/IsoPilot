/* Zeiträume für die Auswertungen: Monat, Jahr oder freie Zeitspanne.
 *
 * Ohne Prisma und ohne React, damit die Randfälle in tests/einheit ohne
 * Datenbank festzunageln sind. Gerechnet wird durchgehend in
 * UTC-Mitternacht, wie es die @db.Date-Spalten zurückgeben: wer hier in
 * eine Zeitzone umrechnet, verschiebt den Tag. */

export type ZeitraumArt = "monat" | "jahr" | "spanne";

export type Zeitraum = {
  art: ZeitraumArt;
  von: string;
  bis: string;
  /** Für Überschrift und später für den Kopf des PDF. */
  bezeichnung: string;
};

export type Zeitraumwahl = {
  art?: string | null;
  monat?: string | null;
  jahr?: string | null;
  von?: string | null;
  bis?: string | null;
};

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const MONAT = /^\d{4}-\d{2}$/;

const MONATSNAMEN = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const datumDE = (s: string) => s.split("-").reverse().join(".");

/** Letzter Tag des Monats, "2026-02" wird zu "2026-02-28". */
export function monatsEnde(monat: string): string {
  const [j, m] = monat.split("-").map(Number);
  return iso(new Date(Date.UTC(j, m, 0)));
}

/** Ist das ein Datum, das es wirklich gibt? "2026-02-30" ist keines. */
export function istTag(s: string | null | undefined): s is string {
  if (!s || !TAG.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && iso(d) === s;
}

/**
 * Aus der Auswahl einen Zeitraum machen. `null` heisst: die Angaben
 * ergeben keinen, dann zeigt die Seite nichts und sagt, was fehlt.
 *
 * Bewusst still bei fehlenden Feldern statt mit einer Fehlermeldung: die
 * Seite wird ohne Auswahl aufgerufen, und "bis fehlt" wäre dort kein
 * Fehler, sondern der Normalzustand vor der ersten Eingabe.
 */
export function zeitraumAus(wahl: Zeitraumwahl): Zeitraum | null {
  const art: ZeitraumArt =
    wahl.art === "jahr" || wahl.art === "spanne" ? wahl.art : "monat";

  if (art === "monat") {
    const monat = wahl.monat;
    if (!monat || !MONAT.test(monat)) return null;
    const [j, m] = monat.split("-").map(Number);
    if (m < 1 || m > 12) return null;
    return {
      art,
      von: `${monat}-01`,
      bis: monatsEnde(monat),
      bezeichnung: `${MONATSNAMEN[m - 1]} ${j}`,
    };
  }

  if (art === "jahr") {
    const jahr = Number(wahl.jahr);
    if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) return null;
    return {
      art,
      von: `${jahr}-01-01`,
      bis: `${jahr}-12-31`,
      bezeichnung: String(jahr),
    };
  }

  const { von, bis } = wahl;
  if (!istTag(von) || !istTag(bis)) return null;
  // Ein umgedrehter Zeitraum ist keiner. Stillschweigend zu tauschen
  // wäre schlimmer: die Auswertung zeigte dann etwas anderes an, als in
  // den Feldern steht.
  if (bis < von) return null;
  return {
    art,
    von,
    bis,
    bezeichnung:
      von === bis ? datumDE(von) : `${datumDE(von)} bis ${datumDE(bis)}`,
  };
}

/**
 * Alle Tage eines Zeitraums als ISO-Datum. Die Auswertungen laufen Tag
 * für Tag durch, wie es die Monatsübersicht schon tut: dieselbe Regel,
 * wann ein Tag zählt, an einer zweiten Stelle nachzubauen ginge
 * irgendwann auseinander.
 *
 * Die Obergrenze fängt eine von Hand zusammengesetzte Adresse ab, nicht
 * den Betrieb: zehn Jahre sind länger als die Aufbewahrungsfrist.
 */
export function tageIn(z: Zeitraum, maxTage = 3700): string[] {
  const tage: string[] = [];
  const ende = new Date(`${z.bis}T00:00:00Z`).getTime();
  const d = new Date(`${z.von}T00:00:00Z`);
  while (d.getTime() <= ende && tage.length < maxTage) {
    tage.push(iso(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return tage;
}

/** Samstag und Sonntag, gerechnet in UTC wie die Datumsspalten. */
export const istWochenende = (tag: string): boolean => {
  const wt = new Date(`${tag}T00:00:00Z`).getUTCDay();
  return wt === 0 || wt === 6;
};
