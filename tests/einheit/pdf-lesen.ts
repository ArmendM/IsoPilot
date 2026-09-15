/* Ein PDF wieder auslesen, so weit es für Tests nötig ist.
 *
 * Nötig, weil eine eingebettete Schrift im Inhaltsstrom nicht mehr
 * Zeichen ablegt, sondern Glyphennummern der zusammengestrichenen
 * Schrift. Jede Schrift zählt dabei ab eins, drei Schriften ergeben also
 * drei Nummernkreise. Wer sie in eine Tabelle wirft, überschreibt sich
 * gegenseitig und liest Unsinn.
 *
 * Deshalb hier der kurze Weg über den Objektbaum: Schriftname im
 * Inhaltsstrom auf Schriftobjekt, Schriftobjekt auf seine
 * ToUnicode-Tabelle. Das ist im Kleinen, was jedes Auslesewerkzeug tut.
 *
 * Nur für Tests. Ohne das prüft kein Test die Anordnung, und genau dort
 * lag ein Fehler, der inhaltlich unsichtbar war: die Titelzeile stand
 * mitten in der Überschrift.
 */
import { inflateSync } from "node:zlib";

export type Stelle = {
  x: number;
  y: number;
  text: string;
  /** Die wievielte Seite, ab 1. Jede Seite hat einen eigenen Inhaltsstrom. */
  seite: number;
};

type Objekt = { nummer: number; kopf: string; strom: string | null };

/**
 * Alle Objekte des PDF, mit ausgepacktem Strom, sofern vorhanden.
 *
 * Die Länge des Stroms kommt aus `/Length` im Objektkopf, nicht aus der
 * Suche nach `endstream`. Ein gepackter Strom ist Binärdaten, und darin
 * kann die Zeichenfolge `endstream` oder `endobj` zufällig vorkommen.
 * Wer danach sucht, schneidet früher oder später mitten in einer Datei
 * ab, und das fällt erst bei der einen Schrift auf, die es trifft.
 *
 * Gelesen wird in latin1, dort entspricht ein Zeichen einem Byte, die
 * Stellen stimmen also mit denen der Datei überein.
 */
function objekte(b: Buffer): Objekt[] {
  const roh = b.toString("latin1");
  const gefunden: Objekt[] = [];
  const muster = /(\d+) 0 obj/g;
  let treffer: RegExpExecArray | null;

  while ((treffer = muster.exec(roh)) !== null) {
    const start = treffer.index + treffer[0].length;
    const kopf = woerterbuch(roh, start);

    /* Ein Strom gehört nur dann zu diesem Objekt, wenn das Schlüsselwort
     * unmittelbar hinter dem Wörterbuch steht. Wer stattdessen im Umkreis
     * sucht, findet den Strom des nächsten Objekts, ordnet ihn dem
     * falschen zu und überspringt beim Weiterlesen alles dazwischen. */
    const danach = roh.slice(start + kopf.length, start + kopf.length + 20);
    const anfang = /^\s*stream\r?\n/.exec(danach);

    let strom: string | null = null;
    if (anfang) {
      const laenge = /\/Length (\d+)/.exec(kopf);
      const von = start + kopf.length + anfang[0].length;
      const bis = laenge ? von + Number(laenge[1]) : roh.indexOf("endstream", von);
      try {
        strom = inflateSync(Buffer.from(roh.slice(von, bis), "latin1")).toString("latin1");
      } catch {
        strom = null; // kein Flate-Strom, etwa eine Schriftdatei
      }
      // Hinter dem Strom weitersuchen, sonst wird in Binärdaten gelesen.
      if (bis > von) muster.lastIndex = bis;
    }
    gefunden.push({ nummer: Number(treffer[1]), kopf, strom });
  }
  return gefunden;
}

/**
 * Das Wörterbuch eines Objekts, also `<< ... >>` mit richtiger
 * Verschachtelung. Ein einfaches Suchen nach dem ersten `>>` läge bei
 * jedem verschachtelten Eintrag daneben, und davon hat eine Schrift
 * mehrere.
 */
function woerterbuch(roh: string, start: number): string {
  const auf = roh.indexOf("<<", start);
  if (auf < 0 || auf > start + 40) return roh.slice(start, start + 400);
  let tiefe = 0;
  for (let i = auf; i < roh.length - 1; i++) {
    if (roh[i] === "<" && roh[i + 1] === "<") {
      tiefe++;
      i++;
    } else if (roh[i] === ">" && roh[i + 1] === ">") {
      tiefe--;
      i++;
      if (tiefe === 0) return roh.slice(start, i + 1);
    }
  }
  return roh.slice(start, start + 400);
}

/** Ein Hexwert aus einer ToUnicode-Tabelle als Zeichen. */
function zeichen(roh: string): string {
  const h = roh.replace(/[<>]/g, "");
  let text = "";
  for (let i = 0; i + 4 <= h.length; i += 4)
    text += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
  return text;
}

/**
 * Eine ToUnicode-Tabelle lesen.
 *
 * Der Reihe nach statt mit einem Muster über den ganzen Strom: die
 * Listenform `<von> <bis> [<u> <u> ...]` besteht selbst aus Hexwerten,
 * und ein Muster für die Bereichsform greift sonst mitten hinein.
 */
function tabelleAus(strom: string): Map<number, string> {
  const tabelle = new Map<number, string>();
  const hex = (t: string) => parseInt(t.replace(/[<>]/g, ""), 16);

  for (const [, art, inhalt] of strom.matchAll(/begin(bfrange|bfchar)([\s\S]*?)end\1/g)) {
    const teile = inhalt.match(/<[0-9a-fA-F]+>|\[|\]/g) ?? [];
    let i = 0;
    while (i < teile.length) {
      if (art === "bfchar") {
        const code = teile[i++];
        const ziel = teile[i++];
        if (code && ziel) tabelle.set(hex(code), zeichen(ziel));
        continue;
      }
      const von = teile[i++];
      const bis = teile[i++];
      if (!von || !bis) break;
      if (teile[i] === "[") {
        i++;
        for (let k = 0; teile[i] && teile[i] !== "]"; k++, i++)
          tabelle.set(hex(von) + k, zeichen(teile[i]));
        i++;
      } else {
        const erstes = teile[i++];
        if (!erstes) break;
        for (let k = 0; hex(von) + k <= hex(bis); k++)
          tabelle.set(hex(von) + k, String.fromCharCode(hex(erstes) + k));
      }
    }
  }
  return tabelle;
}

/** Schriftname im Inhaltsstrom, etwa "F1", auf seine Zeichentabelle. */
function tabellenJeSchrift(alle: Objekt[]): Map<string, Map<number, string>> {
  const jeObjekt = new Map<number, Map<number, string>>();
  for (const o of alle) {
    const verweis = /\/ToUnicode (\d+) 0 R/.exec(o.kopf);
    if (!verweis) continue;
    const strom = alle.find((a) => a.nummer === Number(verweis[1]))?.strom;
    if (strom) jeObjekt.set(o.nummer, tabelleAus(strom));
  }

  const jeName = new Map<string, Map<number, string>>();
  for (const o of alle)
    for (const [, name, nummer] of o.kopf.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      const tabelle = jeObjekt.get(Number(nummer));
      if (tabelle) jeName.set(name, tabelle);
    }
  return jeName;
}

/** Eine Hexfolge mit der Tabelle der gerade gewählten Schrift auflösen. */
function entziffern(hex: string, tabelle: Map<number, string> | undefined): string {
  const h = hex.replace(/[<>]/g, "");
  // Ohne Tabelle ist es eine eingebaute Schrift, dort steht der Zeichencode selbst.
  if (!tabelle || tabelle.size === 0) return Buffer.from(h, "hex").toString("latin1");
  let text = "";
  for (let i = 0; i + 4 <= h.length; i += 4)
    text += tabelle.get(parseInt(h.slice(i, i + 4), 16)) ?? "";
  return text;
}

/**
 * Wo welcher Text steht.
 *
 * In den Textmatrizen wird y nach unten kleiner, pdfkit hebt seine
 * eigene Spiegelung innerhalb von BT und ET wieder auf. Weiter oben
 * heisst also grösseres y.
 */
export function stellen(b: Buffer): Stelle[] {
  const alle = objekte(b);
  const tabellen = tabellenJeSchrift(alle);
  const gefunden: Stelle[] = [];

  let seite = 0;
  for (const o of alle) {
    if (!o.strom || !o.strom.includes("Tm")) continue;
    seite++;
    let schrift: Map<number, string> | undefined;

    for (const [, x, y, inhalt] of o.strom.matchAll(
      /1 0 0 1 ([\d.]+) ([\d.]+) Tm([\s\S]*?)ET/g,
    )) {
      /* Die Schriftwahl steht im Strom nach der Textmatrix, also
       * innerhalb dieses Blocks. Wer sie davor sucht, findet sie nie und
       * entziffert mit der falschen oder gar keiner Tabelle. Fehlt sie im
       * Block, gilt die zuletzt gewählte weiter. */
      const wahl = /\/(F\d+) [\d.]+ Tf/.exec(inhalt);
      if (wahl) schrift = tabellen.get(wahl[1]);

      const text = (inhalt.match(/<[0-9a-fA-F]+>/g) ?? [])
        .map((h) => entziffern(h, schrift))
        .join("");
      if (text) gefunden.push({ x: Number(x), y: Number(y), text, seite });
    }
  }
  return gefunden;
}

/** Der ganze lesbare Text eines PDF, für einfache Vorhandenprüfungen. */
export const textVon = (b: Buffer): string =>
  b.toString("latin1") + stellen(b).map((s) => s.text).join("\n");
