/* Die Auswertungen als Beschreibung, einmal für alle Ausgabewege.
 *
 * Excel und PDF sollen dieselben geprüften Werte enthalten. Das ist
 * keine Frage der Sorgfalt, sondern des Aufbaus: baut jeder Weg seine
 * Tabellen selbst, unterscheiden sie sich früher oder später, und
 * niemand merkt es, weil niemand beide nebeneinander legt.
 *
 * Deshalb steht hier die Beschreibung, und `excel.ts` und `pdf.ts`
 * machen daraus nur noch eine Datei. */
import { formatHours } from "@/lib/dates";
import type { Zeitraum } from "@/lib/zeitraum";
import type { Blatt } from "@/server/excel";
import type {
  BaustellenAuswertung,
  BaustellenZeile,
  MaterialPosition,
  PersonAuswertung,
} from "@/server/auswertung-read";

export type Bericht = {
  /** Überschrift auf dem Papier und Grundlage des Dateinamens. */
  titel: string;
  untertitel: string[];
  blaetter: Blatt[];
};

const STATUS: Record<string, string> = {
  OPEN: "offen",
  PAUSED: "pausiert",
  DONE: "abgeschlossen",
};

const runde = (n: number) => Math.round(n * 100) / 100;

/** "2026-01-01" als "01.01.2026". Ohne Stichtag ein Strich, damit die
 *  Zeile nicht "per null" heisst. */
const datumDE = (iso: string | null) =>
  iso ? iso.split("-").reverse().join(".") : "Eintritt";

/* ── Auswertung Mitarbeitende ──────────────────────────────── */

export function berichtPerson(a: PersonAuswertung): Bericht {
  const kopf = [`${a.person.name}, ${a.zeitraum.bezeichnung}`];

  const uebersicht: Blatt = {
    name: "Übersicht",
    spalten: [
      { titel: "Kennzahl", breite: 34 },
      { titel: "Wert", art: "zahl" },
    ],
    zeilen: [
      ["Nettostunden", a.nettostunden],
      ["Als Zeitangabe", formatHours(a.nettostunden)],
      /* Soll und Saldo stehen direkt unter dem Ist, dort wird
       * verglichen. Der Anfangssaldo bleibt eine eigene Zeile: er gehört
       * nicht in diesen Zeitraum, sondern davor. */
      ["Sollstunden im Zeitraum", a.soll.sollstunden],
      ["Saldo im Zeitraum, Ist minus Soll", a.soll.saldoZeitraum],
      ...(a.soll.anfangssaldo !== null
        ? [
            [
              `Anfangssaldo per ${datumDE(a.soll.anfangssaldoAb)}`,
              a.soll.anfangssaldo,
            ] as (string | number)[],
          ]
        : []),
      ["Sollarbeitszeit je Woche", a.soll.wochenstunden],
      ["Werktage im Zeitraum", a.werktage],
      ["Tage mit Erfassung", a.tageMitErfassung],
      ["Werktage ohne Eintrag und ohne Absenz", a.offeneTage],
      ["Pausen in Minuten", a.pausenMinuten],
      ["Ferientage", a.ferientage],
      ["Krankheitstage", a.krankheitstage],
      ["Übrige Absenztage", a.uebrigeAbsenztage],
      ["Feiertage im Zeitraum", a.feiertage],
    ],
  };

  const jeBaustelle: Blatt = {
    name: "Je Baustelle",
    kopf,
    spalten: [
      { titel: "Baustelle", breite: 40 },
      { titel: "Nettostunden", art: "stunden" },
    ],
    zeilen: a.proBaustelle.map((b) => [b.label, b.stunden]),
    summe: ["Zusammen", a.nettostunden],
  };

  const positionen: Blatt = {
    name: "Einzelpositionen",
    kopf,
    spalten: [
      { titel: "Datum", art: "datum" },
      { titel: "Von", breite: 8 },
      { titel: "Bis", breite: 8 },
      { titel: "Pause", art: "zahl", breite: 10 },
      { titel: "Netto", art: "stunden", breite: 10 },
      { titel: "Baustelle", breite: 34 },
      { titel: "Verrechnung", breite: 12 },
      { titel: "Notiz", breite: 30 },
    ],
    zeilen: a.positionen.map((p) => [
      p.datum,
      p.von,
      p.bis,
      p.pause,
      p.netto,
      p.baustelle ?? "Werkstatt oder Büro",
      p.istRegie ? "Regie" : "Pauschal",
      p.notiz,
    ]),
    summe: ["Zusammen", null, null, a.pausenMinuten, a.nettostunden, null, null, null],
  };

  return {
    titel: `Auswertung Mitarbeitende: ${a.person.name}`,
    untertitel: [`Zeitraum: ${a.zeitraum.bezeichnung}`],
    blaetter: [uebersicht, jeBaustelle, positionen],
  };
}

/* ── Auswertung Baustellen ─────────────────────────────────── */

const positionsblatt = (
  name: string,
  kopf: string[],
  positionen: MaterialPosition[],
  summe: number,
): Blatt => ({
  name,
  kopf,
  spalten: [
    { titel: "Datum", art: "datum" },
    { titel: "Bezeichnung", breite: 40 },
    { titel: "Menge", art: "zahl", breite: 10 },
    { titel: "Einheit", breite: 9 },
    { titel: "Einzelpreis", art: "franken", breite: 12 },
    { titel: "Rabatt in Prozent", art: "zahl", breite: 10 },
    { titel: "Betrag", art: "franken", breite: 12 },
    { titel: "Erfasst von", breite: 18 },
  ],
  zeilen: positionen.map((p) => [
    p.datum,
    p.bezeichnung,
    p.menge,
    p.einheit,
    p.einzelpreis,
    p.rabattPct,
    p.betrag,
    p.person,
  ]),
  summe: ["Zusammen", null, null, null, null, null, summe, null],
});

export function berichtBaustelle(a: BaustellenAuswertung): Bericht {
  const kopf = [`${a.baustelle.bezeichnung}, ${a.zeitraum.bezeichnung}`];

  const uebersicht: Blatt = {
    name: "Übersicht",
    spalten: [
      { titel: "Kennzahl", breite: 34 },
      { titel: "Wert", art: "zahl" },
    ],
    zeilen: [
      ["Auftraggeber", a.baustelle.partner ?? "keiner erfasst"],
      ["Status", STATUS[a.baustelle.status] ?? a.baustelle.status],
      ["Ist im Zeitraum in Stunden", a.istImZeitraum],
      ["Soll gesamt in Stunden", a.soll],
      ["Ist gesamt in Stunden", a.istGesamt],
      ["Differenz gesamt in Stunden", a.differenz],
      ["Materialkosten im Zeitraum", a.materialkosten],
      ["VSI-Ausmass im Zeitraum", a.vsiBetrag],
    ],
  };

  const jePerson: Blatt = {
    name: "Je Person",
    kopf,
    spalten: [
      { titel: "Person", breite: 24 },
      { titel: "Nettostunden", art: "stunden" },
    ],
    zeilen: a.proPerson.map((p) => [p.name, p.stunden]),
    summe: ["Zusammen", a.istImZeitraum],
  };

  const zeiten: Blatt = {
    name: "Stunden im Einzelnen",
    kopf,
    spalten: [
      { titel: "Datum", art: "datum" },
      { titel: "Person", breite: 18 },
      { titel: "Von", breite: 8 },
      { titel: "Bis", breite: 8 },
      { titel: "Pause", art: "zahl", breite: 10 },
      { titel: "Netto", art: "stunden", breite: 10 },
      { titel: "Verrechnung", breite: 12 },
      { titel: "Notiz", breite: 30 },
    ],
    zeilen: a.zeitPositionen.map((p) => [
      p.datum,
      p.person,
      p.von,
      p.bis,
      p.pause,
      p.netto,
      p.istRegie ? "Regie" : "Pauschal",
      p.notiz,
    ]),
    summe: [
      "Zusammen",
      null,
      null,
      null,
      runde(a.zeitPositionen.reduce((s, p) => s + p.pause, 0)),
      a.istImZeitraum,
      null,
      null,
    ],
  };

  return {
    titel: `Auswertung Baustelle: ${a.baustelle.bezeichnung}`,
    untertitel: [
      a.baustelle.adresse,
      a.baustelle.partner ? `Auftraggeber: ${a.baustelle.partner}` : "Ohne Auftraggeber",
      `Zeitraum: ${a.zeitraum.bezeichnung}`,
    ],
    blaetter: [
      uebersicht,
      jePerson,
      zeiten,
      positionsblatt("Material", kopf, a.materialPositionen, a.materialkosten),
      positionsblatt("VSI-Ausmass", kopf, a.vsiPositionen, a.vsiBetrag),
    ],
  };
}

export function berichtAlleBaustellen(
  zeilen: BaustellenZeile[],
  zeitraum: Zeitraum,
): Bericht {
  const summe = (w: (z: BaustellenZeile) => number) =>
    runde(zeilen.reduce((s, z) => s + w(z), 0));

  const blatt: Blatt = {
    name: "Baustellen",
    spalten: [
      { titel: "Baustelle", breite: 34 },
      { titel: "Auftraggeber", breite: 22 },
      { titel: "Status", breite: 13 },
      { titel: "Ist im Zeitraum", art: "stunden", breite: 12 },
      { titel: "Soll gesamt", art: "stunden", breite: 11 },
      { titel: "Ist gesamt", art: "stunden", breite: 11 },
      { titel: "Differenz", art: "stunden", breite: 11 },
      { titel: "Materialkosten", art: "franken", breite: 13 },
      { titel: "VSI-Ausmass", art: "franken", breite: 13 },
    ],
    zeilen: zeilen.map((b) => [
      b.bezeichnung,
      b.partner,
      STATUS[b.status] ?? b.status,
      b.istImZeitraum,
      b.soll,
      b.istGesamt,
      b.differenz,
      b.materialkosten,
      b.vsiBetrag,
    ]),
    summe: [
      "Zusammen",
      null,
      null,
      summe((z) => z.istImZeitraum),
      summe((z) => z.soll),
      summe((z) => z.istGesamt),
      summe((z) => z.differenz),
      summe((z) => z.materialkosten),
      summe((z) => z.vsiBetrag),
    ],
  };

  return {
    titel: "Auswertung Baustellen, Übersicht",
    untertitel: [
      `Zeitraum: ${zeitraum.bezeichnung}`,
      "Soll, Ist gesamt und Differenz gelten für die ganze Laufzeit, nicht für den Zeitraum.",
    ],
    blaetter: [blatt],
  };
}
