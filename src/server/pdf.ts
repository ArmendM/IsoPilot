/* PDF-Ausgabe für die Auswertungen.
 *
 * Gerendert wird dieselbe Beschreibung wie für Excel, siehe
 * auswertung-blaetter.ts. Ein zweiter Bau für dieselben Tabellen ergäbe
 * früher oder später andere Zahlen, und niemand merkte es, weil niemand
 * beide Dateien nebeneinander legt.
 *
 * pdfkit statt eines Browsers: auf zwei vCPU und 4 GB RAM ist ein
 * Headless-Chrome je Bericht kein Werkzeug, sondern ein Risiko. pdfkit
 * schreibt direkt in einen Puffer.
 *
 * Aufbau und Masse stammen aus dem Markenhandbuch und aus der gelieferten
 * Vorlage `docs/marke/vorlagen/briefpapier-vordruck.html`. Wo beide sich
 * widersprechen, gilt die Vorlage: sie ist das Blatt, das alle gesehen
 * haben. Der einzige Fall ist der Seitenrand, 18 Millimeter im Handbuch
 * gegen 20 in der Vorlage. */
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { Bildmass } from "@/lib/bildmass";
import type { Blatt, Zelle } from "@/server/excel";
import type { Bericht } from "@/server/auswertung-blaetter";

export type Firmenkopf = {
  name: string;
  strasse: string;
  ort: string;
  mwst: string | null;
  telefon: string | null;
  mail: string | null;
  /** Bild als Bytes, hochgeladen unter /firma oder die Wortmarke aus
   *  `public/marke`. Fehlt es, bleibt der Platz leer und der Kopf steht
   *  trotzdem. */
  logo: Buffer | null;
  /** Format und Masse dazu, aus den Bytes gelesen. pdfkit kommt hier
   *  ohne aus, es passt mit `fit` selbst ein. Excel braucht beides. */
  logoMass: Bildmass | null;
};

/** Millimeter in Punkt, die Einheit von PDF. */
const mm = (n: number) => (n * 72) / 25.4;

/* Masse aus der Vorlage. Sie stehen hier als Millimeter, damit sie sich
 * gegen das Blatt prüfen lassen, statt als Punktzahlen, die niemand
 * nachmisst. */
const RAND = mm(20);
const OBEN = mm(16);
const UNTEN = mm(12);
const LOGO_HOEHE = mm(11);
const LOGO_BREITE = mm(72.59);

const TIEFBLAU = "#0A4A7C";
const TINTE = "#131C24";
const GRAU = "#5D6B78";
const LINIE = "#DCE0E4";

const LEISTUNGEN = "Wärme · Kälte · Lüftungsisolationen · Brandschutz";

/* Archivo für Titel, Barlow für alles andere, beide eingebettet. pdfkit
 * bringt nur Helvetica mit, und `next/font` legt die Dateien unter
 * `.next` ab, worauf sich ein Bericht nicht verlassen kann. Sie liegen
 * deshalb im Verzeichnis, und das Dockerfile kopiert `public` in den
 * Containerstamm. */
const SCHRIFTEN = {
  titel: "Archivo-ExtraBold.ttf",
  text: "Barlow-Regular.ttf",
  fett: "Barlow-SemiBold.ttf",
} as const;

const TITEL = "titel";
const TEXT = "text";
const FETT = "fett";

/** Ab wie vielen Spalten ein Blatt quer gedruckt wird. Neun Spalten auf
 *  A4 hoch sind unlesbar, und die Übersicht hat neun. */
const QUER_AB = 6;

const schweiz = (n: number, stellen: number) =>
  n.toLocaleString("de-CH", {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  });

/** Eine Zelle als Text, in derselben Schreibweise wie die Oberfläche. */
function alsText(wert: Zelle, art: string | undefined): string {
  if (wert === null || wert === undefined) return "";
  if (typeof wert === "number") {
    if (art === "franken") return schweiz(wert, 2);
    if (art === "stunden") return schweiz(wert, 2);
    return schweiz(wert, Number.isInteger(wert) ? 0 : 2);
  }
  if (art === "datum" && /^\d{4}-\d{2}-\d{2}$/.test(wert))
    return wert.split("-").reverse().join(".");
  return wert;
}

/**
 * Die Schriften anmelden.
 *
 * Fehlt eine Datei, bleibt es bei Helvetica: ein Bericht, der wegen
 * einer Schrift gar nicht erst entsteht, ist schlechter als einer in der
 * falschen Schrift. Zurückgegeben wird, ob es geklappt hat, damit der
 * Aufbau die richtigen Namen nimmt.
 */
function schriftenAnmelden(doc: PDFKit.PDFDocument): boolean {
  try {
    for (const [name, datei] of Object.entries(SCHRIFTEN))
      doc.registerFont(name, join(process.cwd(), "public", "schriften", datei));
    return true;
  } catch {
    return false;
  }
}

export async function pdf(bericht: Bericht, firma: Firmenkopf): Promise<Buffer> {
  const doc = new PDFDocument({ autoFirstPage: false, margin: RAND });
  const teile: Buffer[] = [];
  doc.on("data", (d: Buffer) => teile.push(d));
  const fertig = new Promise<Buffer>((auf) =>
    doc.on("end", () => auf(Buffer.concat(teile))),
  );

  const eigen = schriftenAnmelden(doc);
  const schrift = eigen
    ? { titel: TITEL, text: TEXT, fett: FETT }
    : { titel: "Helvetica-Bold", text: "Helvetica", fett: "Helvetica-Bold" };

  for (const blatt of bericht.blaetter) {
    const quer = blatt.spalten.length > QUER_AB;
    doc.addPage({ size: "A4", layout: quer ? "landscape" : "portrait", margin: RAND });
    kopfzeile(doc, bericht, firma, blatt, schrift);
    fusszeile(doc, firma, schrift);
    tabelle(doc, blatt, bericht, firma, schrift);
  }

  doc.end();
  return fertig;
}

export type Schriftsatz = { titel: string; text: string; fett: string };

/**
 * Der Fuss, dreispaltig: Adresse, Kontakt, UID und Bank.
 *
 * Steht auf jeder Seite und wird vor der Tabelle gezeichnet, damit sein
 * Platz feststeht, bevor der erste Umbruch gerechnet wird. Die Angaben
 * kommen aus `Company`, nicht aus dem Code: eine berichtigte UID soll
 * nicht in einer Datei stehen, die niemand mehr anschaut.
 */
function fusszeile(doc: PDFKit.PDFDocument, firma: Firmenkopf, schrift: Schriftsatz) {
  /* Zwei Dinge merken und am Ende zurücksetzen.
   *
   * Die Schreibhöhe, weil pdfkit eine einzige laufende Höhe führt und
   * die Tabelle sonst dort anfinge, wo der Fuss aufhört.
   *
   * Und den unteren Rand: pdfkit fängt von sich aus eine neue Seite an,
   * sobald Text unter den unteren Rand geriete. Ein Fuss steht aber
   * genau dort. Ohne das landet er oben auf einem leeren Blatt, und im
   * Bericht steht hinter jeder Seite eine zweite, fast leere. */
  const merk = doc.y;
  const randUnten = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const rechts = doc.page.width - RAND;
  const breite = (rechts - RAND - mm(16)) / 3;
  const y = doc.page.height - UNTEN - mm(9);

  doc.moveTo(RAND, y).lineTo(rechts, y).strokeColor(LINIE).lineWidth(mm(0.2)).stroke();

  const spalte = (i: number, fett: string, mager: string) => {
    const x = RAND + i * (breite + mm(8));
    doc.font(schrift.fett).fontSize(8).fillColor(TINTE);
    doc.text(fett, x, y + mm(3), { width: breite, lineBreak: false });
    doc.font(schrift.text).fontSize(8).fillColor(GRAU);
    doc.text(mager, x, doc.y, { width: breite, lineBreak: false });
  };

  spalte(0, firma.name, `${firma.strasse}, ${firma.ort}`);
  spalte(1, firma.telefon ?? "", firma.mail ?? "");
  spalte(2, firma.mwst ? `${firma.mwst} MWST` : "", "Raiffeisenbank Emmenbrücke");

  doc.page.margins.bottom = randUnten;
  doc.y = merk;
}

/**
 * Der Briefkopf nach der Vorlage: Wortmarke links, Adresse rechtsbündig,
 * Trennlinie in Tiefblau, darunter die Leistungszeile in Versalien.
 * Darunter Titel und Blattname des Berichts.
 *
 * Es ist derselbe Kopf wie auf Brief, Offerte und Rechnung. Einen
 * zweiten für die Auswertungen zu bauen hiesse, dass zwei Blätter aus
 * demselben Haus verschieden aussehen.
 */
function kopfzeile(
  doc: PDFKit.PDFDocument,
  bericht: Bericht,
  firma: Firmenkopf,
  blatt: Blatt,
  schrift: Schriftsatz,
) {
  const rechts = doc.page.width - RAND;
  let y = OBEN;

  if (firma.logo) {
    try {
      doc.image(firma.logo, RAND, y, { fit: [LOGO_BREITE, LOGO_HOEHE] });
    } catch {
      // Ein unlesbares Logo darf den Bericht nicht verhindern.
    }
  }

  /* Die Adresse rechtsbündig auf derselben Höhe wie die Wortmarke. Der
   * Firmenname in Tinte, der Rest in Grau, wie in der Vorlage. */
  const adressbreite = mm(60);
  doc.font(schrift.fett).fontSize(9).fillColor(TINTE);
  doc.text(firma.name, rechts - adressbreite, y, {
    width: adressbreite,
    align: "right",
  });
  doc.font(schrift.text).fontSize(9).fillColor(GRAU);
  doc.text(firma.strasse, rechts - adressbreite, doc.y, {
    width: adressbreite,
    align: "right",
  });
  doc.text(firma.ort, rechts - adressbreite, doc.y, {
    width: adressbreite,
    align: "right",
  });

  y = Math.max(doc.y, OBEN + LOGO_HOEHE) + mm(5);

  // Trennlinie in Tiefblau, 0.55 Millimeter wie in der Vorlage.
  doc
    .moveTo(RAND, y)
    .lineTo(rechts, y)
    .strokeColor(TIEFBLAU)
    .lineWidth(mm(0.55))
    .stroke();

  y += mm(2.4);
  doc.font(schrift.fett).fontSize(7).fillColor(GRAU);
  doc.text(LEISTUNGEN.toUpperCase(), RAND, y, {
    width: rechts - RAND,
    characterSpacing: 0.9,
    lineBreak: false,
  });

  y = doc.y + mm(6);
  doc.font(schrift.titel).fontSize(15).fillColor(TINTE).text(bericht.titel, RAND, y);
  doc.font(schrift.text).fontSize(9).fillColor(GRAU);
  for (const u of bericht.untertitel) doc.text(u, RAND, doc.y + 1);

  doc.font(schrift.fett).fontSize(10).fillColor(TINTE).text(blatt.name, RAND, doc.y + mm(3));
  doc.y += 4;
}

/** Die Tabelle, mit Seitenumbruch und wiederholter Titelzeile. */
function tabelle(
  doc: PDFKit.PDFDocument,
  blatt: Blatt,
  bericht: Bericht,
  firma: Firmenkopf,
  schrift: Schriftsatz,
) {
  const rechts = doc.page.width - RAND;
  const nutzbar = rechts - RAND;

  /* Die Breiten aus der Beschreibung sind Excel-Spaltenbreiten. Sie
   * dienen hier nur noch als Verhältnis: die Tabelle wird auf die
   * Seitenbreite gestreckt, damit rechts nichts abgeschnitten wird. */
  const roh = blatt.spalten.map((s) => s.breite ?? (s.art && s.art !== "text" ? 12 : 24));
  const summe = roh.reduce((a, b) => a + b, 0);
  const breiten = roh.map((r) => (r / summe) * nutzbar);
  const x = breiten.map((_, i) => RAND + breiten.slice(0, i).reduce((a, b) => a + b, 0));

  const zeilenhoehe = 14;
  /* Über dem Fuss aufhören, nicht erst am Blattrand: sonst liefe die
   * letzte Zeile in die Firmenangaben. */
  const untenGrenze = doc.page.height - UNTEN - mm(12) - zeilenhoehe;

  /* Eine Zeile, alle Zellen auf derselben Höhe.
   *
   * Entscheidend ist, dass `oben` einmal gemerkt und vor jeder Zelle
   * wiederhergestellt wird. pdfkit rückt nach jedem `text` um die
   * Zeilenhöhe der Schrift vor, und die ist nicht die Zeilenhöhe dieser
   * Tabelle. Wer stattdessen einen festen Betrag abzieht, verschiebt
   * jede Zelle um die Differenz, und die Zeile läuft über die Spalten
   * hinweg schräg nach oben aus dem Raster. Genau so lief die Titelzeile
   * in die Überschrift. */
  const zeile = (werte: Zelle[], fett: boolean) => {
    doc.font(fett ? schrift.fett : schrift.text).fontSize(8).fillColor(TINTE);
    const oben = doc.y;
    blatt.spalten.forEach((s, i) => {
      doc.y = oben;
      doc.text(alsText(werte[i] ?? null, s.art), x[i], oben, {
        width: breiten[i] - 4,
        align: s.art && s.art !== "text" ? "right" : "left",
        lineBreak: false,
        ellipsis: true,
      });
    });
    doc.y = oben + zeilenhoehe;
  };

  /* Titelzeile wie in der Vorlage: Versalien in Grau, darunter eine
   * Linie in Tiefblau. Sie hebt die Tabelle vom Fliesstext ab, ohne
   * einen grauen Balken zu setzen, der im Druck schmutzig wirkt. */
  const titelzeile = () => {
    const oben = doc.y;
    doc.font(schrift.fett).fontSize(7).fillColor(GRAU);
    blatt.spalten.forEach((sp, i) => {
      doc.y = oben;
      doc.text(sp.titel.toUpperCase(), x[i], oben, {
        width: breiten[i] - 4,
        align: sp.art && sp.art !== "text" ? "right" : "left",
        characterSpacing: 0.4,
        lineBreak: false,
      });
    });
    doc.y = oben + zeilenhoehe - 3;
    doc
      .moveTo(RAND, doc.y)
      .lineTo(rechts, doc.y)
      .strokeColor(TIEFBLAU)
      .lineWidth(mm(0.4))
      .stroke();
    doc.y += 3;
  };

  doc.y += 4;
  titelzeile();

  for (const z of blatt.zeilen) {
    if (doc.y > untenGrenze) {
      doc.addPage({
        size: "A4",
        layout: blatt.spalten.length > QUER_AB ? "landscape" : "portrait",
        margin: RAND,
      });
      kopfzeile(doc, bericht, firma, blatt, schrift);
      fusszeile(doc, firma, schrift);
      doc.y += 4;
      titelzeile();
    }
    zeile(z, false);
  }

  if (blatt.zeilen.length === 0) {
    doc.font(schrift.text).fontSize(8).fillColor(GRAU);
    doc.text("Keine Einträge in diesem Zeitraum.", RAND, doc.y + 2);
    doc.y += zeilenhoehe;
  }

  if (blatt.summe) {
    doc.moveTo(RAND, doc.y).lineTo(rechts, doc.y).strokeColor(LINIE).lineWidth(mm(0.2)).stroke();
    doc.y += 3;
    zeile(blatt.summe, true);
  }
}
