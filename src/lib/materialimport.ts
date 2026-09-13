/* Abgleich einer Excel-Liste gegen den Materialkatalog. Reine Logik, ohne
 * Prisma und ohne Dateizugriff, damit sie in tests/einheit prüfbar ist.
 *
 * Die Regel aus CLAUDE.md: Abgleich über Artikelnummer, sonst Kategorie
 * plus Name, sonst Name allein. Nie Duplikate anlegen, nur aktualisieren.
 * Ein neuer Artikel entsteht nur, wenn keine der drei Regeln trifft. */

export type Einheit = "M2" | "LFM" | "STK" | "KG" | "ROLLE";

export type Katalogartikel = {
  id: string;
  sku: string | null;
  name: string;
  kategorie: string | null;
};

export type Importzeile = {
  /** Zeilennummer in der Datei, damit die Vorschau sagen kann, wo es klemmt. */
  zeile: number;
  sku: string | null;
  name: string;
  kategorie: string | null;
  einheit: Einheit | null;
  preis: number | null;
  brandschutz: string | null;
};

export type Regel = "artikelnummer" | "kategorie-und-name" | "name";

export type Abgleich =
  | { art: "aktualisieren"; zeile: Importzeile; treffer: Katalogartikel; regel: Regel }
  | { art: "anlegen"; zeile: Importzeile }
  | { art: "uneindeutig"; zeile: Importzeile; kandidaten: Katalogartikel[]; regel: Regel }
  | { art: "fehlerhaft"; zeile: Importzeile; grund: string };

/** Vergleichsform: ohne Rand, ohne doppelte Leerzeichen, ohne Gross- und
 *  Kleinschreibung. Eine von Hand gepflegte Liste schreibt denselben
 *  Artikel sonst dreimal verschieden. */
export const vergleichbar = (s: string | null | undefined): string =>
  (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const EINHEITEN: Record<string, Einheit> = {
  "m2": "M2",
  "m²": "M2",
  "qm": "M2",
  "quadratmeter": "M2",
  "lfm": "LFM",
  "m": "LFM",
  "laufmeter": "LFM",
  "lm": "LFM",
  "stk": "STK",
  "stk.": "STK",
  "stück": "STK",
  "stueck": "STK",
  "st": "STK",
  "kg": "KG",
  "kilogramm": "KG",
  "rolle": "ROLLE",
  "rollen": "ROLLE",
  "rl": "ROLLE",
};

export function leseEinheit(roh: unknown): Einheit | null {
  if (roh === null || roh === undefined) return null;
  return EINHEITEN[vergleichbar(String(roh))] ?? null;
}

/** Schweizer Schreibweisen: 1'234.50, 1234,50, "CHF 12.-". Ein leeres Feld
 *  ist kein Fehler, es heisst nur, dass der Preis unverändert bleibt. */
export function lesePreis(roh: unknown): number | null {
  if (roh === null || roh === undefined || roh === "") return null;
  if (typeof roh === "number") return Number.isFinite(roh) ? roh : null;

  // Apostroph als Tausendertrennzeichen, gerade wie typografisch.
  let s = String(roh)
    .trim()
    .replace(/chf|fr\.?|sfr/gi, "")
    .replace(/['’\s]/g, "");
  // "12.-" und "12,-" meinen 12.00
  s = s.replace(/[.,]-$/, "");
  // Komma als Dezimaltrennzeichen, aber nur wenn kein Punkt daneben steht
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type Spalte = "sku" | "name" | "kategorie" | "einheit" | "preis" | "brandschutz";

/* Wie die Kopfzeile heissen darf. Von Hand gepflegte Listen schreiben
 * dasselbe Feld verschieden, und niemand tippt zweimal gleich. */
const KOPFZEILEN: Record<Spalte, string[]> = {
  sku: ["artikelnummer", "artikel-nr", "artikel nr", "art.-nr.", "art-nr", "art nr", "nummer", "nr", "sku"],
  name: ["bezeichnung", "name", "artikel", "beschreibung", "artikelbezeichnung"],
  kategorie: ["kategorie", "gruppe", "warengruppe", "materialgruppe"],
  einheit: ["einheit", "eh", "me", "mengeneinheit"],
  preis: ["preis", "preis chf", "vk", "verkaufspreis", "ep", "einzelpreis", "chf"],
  brandschutz: ["brandschutz", "ei", "ei-klasse", "ei klasse", "feuerwiderstand", "vkf"],
};

/* Ein Präfix zählt nur, wenn danach kein Buchstabe mehr folgt. Sonst
 * schnappt sich "ei" die Spalte "Einheit" und "nr" jede Spalte, die mit
 * diesen Buchstaben anfängt. "Preis CHF exkl. MwSt." trifft weiterhin,
 * dort folgt ein Leerzeichen. */
const beginntMit = (kopf: string, name: string): boolean =>
  kopf.startsWith(name) && !/[\p{L}\p{N}]/u.test(kopf.charAt(name.length));

/**
 * Die Kopfzeile den Spalten zuordnen. Gibt je Spalte den Index zurück
 * oder -1.
 *
 * Ohne `name` lässt sich gar nichts zuordnen, das muss der Aufrufer
 * abfangen: lieber abbrechen als eine Liste mit verrutschten Spalten
 * über den ganzen Katalog laufen lassen.
 */
export function findeSpalten(kopfzeile: unknown[]): Record<Spalte, number> {
  const kopf = kopfzeile.map((z) => vergleichbar(z === null || z === undefined ? "" : String(z)));
  const gefunden = {} as Record<Spalte, number>;

  for (const spalte of Object.keys(KOPFZEILEN) as Spalte[]) {
    // Erst genau, dann als Anfang: "Preis CHF exkl. MwSt." soll noch treffen.
    const namen = KOPFZEILEN[spalte];
    let index = kopf.findIndex((k) => k !== "" && namen.includes(k));
    if (index === -1)
      index = kopf.findIndex((k) => k !== "" && namen.some((n) => beginntMit(k, n)));
    gefunden[spalte] = index;
  }

  /* "Artikel" steht in beiden Listen: als Bezeichnung und als
   * Artikelnummer. Fällt beides auf dieselbe Spalte, ist es die
   * Bezeichnung, denn ohne die geht gar nichts. */
  if (gefunden.sku === gefunden.name && gefunden.name !== -1) gefunden.sku = -1;
  return gefunden;
}

type Schluessel = {
  sku: Map<string, Katalogartikel[]>;
  katName: Map<string, Katalogartikel[]>;
  name: Map<string, Katalogartikel[]>;
};

export function indiziere(katalog: Katalogartikel[]): Schluessel {
  const s: Schluessel = { sku: new Map(), katName: new Map(), name: new Map() };
  const rein = (m: Map<string, Katalogartikel[]>, k: string, a: Katalogartikel) => {
    if (!k.trim()) return;
    m.set(k, [...(m.get(k) ?? []), a]);
  };
  for (const a of katalog) {
    rein(s.sku, vergleichbar(a.sku), a);
    rein(s.katName, `${vergleichbar(a.kategorie)} ${vergleichbar(a.name)}`, a);
    rein(s.name, vergleichbar(a.name), a);
  }
  return s;
}

/**
 * Eine Zeile gegen den Katalog halten.
 *
 * Trifft eine Regel auf **mehrere** Artikel, wird die Zeile als
 * uneindeutig gemeldet und nicht geschrieben. Raten wäre hier schlimmer
 * als stehen lassen: der falsche Artikel bekäme stillschweigend einen
 * neuen Preis, und niemand würde es merken.
 */
export function gleicheAb(zeile: Importzeile, schluessel: Schluessel): Abgleich {
  if (!zeile.name.trim()) return { art: "fehlerhaft", zeile, grund: "Ohne Bezeichnung" };
  if (zeile.preis !== null && zeile.preis < 0)
    return { art: "fehlerhaft", zeile, grund: "Negativer Preis" };

  const versuche: { regel: Regel; treffer: Katalogartikel[] }[] = [
    {
      regel: "artikelnummer",
      treffer: zeile.sku ? (schluessel.sku.get(vergleichbar(zeile.sku)) ?? []) : [],
    },
    {
      /* Nur wenn in der Datei wirklich eine Kategorie steht. Sonst wäre
       * "Kategorie plus Name" mit leerer Kategorie eine versteckte
       * Sonderregel, die unter zwei gleichnamigen Artikeln lautlos genau
       * den ohne Kategorie erwischt. Fehlt die Kategorie, läuft die Zeile
       * über den Namen und fällt dort als uneindeutig auf. */
      regel: "kategorie-und-name",
      treffer: vergleichbar(zeile.kategorie)
        ? (schluessel.katName.get(
            `${vergleichbar(zeile.kategorie)} ${vergleichbar(zeile.name)}`,
          ) ?? [])
        : [],
    },
    { regel: "name", treffer: schluessel.name.get(vergleichbar(zeile.name)) ?? [] },
  ];

  for (const { regel, treffer } of versuche) {
    if (treffer.length === 1) return { art: "aktualisieren", zeile, treffer: treffer[0], regel };
    if (treffer.length > 1) return { art: "uneindeutig", zeile, kandidaten: treffer, regel };
  }
  return { art: "anlegen", zeile };
}

export function gleicheAlleAb(zeilen: Importzeile[], katalog: Katalogartikel[]): Abgleich[] {
  const schluessel = indiziere(katalog);
  return zeilen.map((z) => gleicheAb(z, schluessel));
}

export type Zusammenfassung = {
  aktualisieren: number;
  anlegen: number;
  uneindeutig: number;
  fehlerhaft: number;
};

export const fasseZusammen = (abgleiche: Abgleich[]): Zusammenfassung =>
  abgleiche.reduce<Zusammenfassung>(
    (z, a) => ({ ...z, [a.art]: z[a.art] + 1 }),
    { aktualisieren: 0, anlegen: 0, uneindeutig: 0, fehlerhaft: 0 },
  );
