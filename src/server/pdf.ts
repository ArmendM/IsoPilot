/* PDF-Ausgabe für die Auswertungen.
 *
 * Gerendert wird dieselbe Beschreibung wie für Excel, siehe
 * auswertung-blaetter.ts. Ein zweiter Bau für dieselben Tabellen ergäbe
 * früher oder später andere Zahlen, und niemand merkte es, weil niemand
 * beide Dateien nebeneinander legt.
 *
 * pdfkit statt eines Browsers: auf zwei vCPU und 4 GB RAM ist ein
 * Headless-Chrome je Bericht kein Werkzeug, sondern ein Risiko. pdfkit
 * schreibt direkt in einen Puffer und bringt Helvetica mit, das die
 * Umlaute deckt. Eine Schriftdatei braucht es deshalb nicht. */
import PDFDocument from "pdfkit";
import type { Blatt, Zelle } from "@/server/excel";
import type { Bericht } from "@/server/auswertung-blaetter";

export type Firmenkopf = {
  name: string;
  strasse: string;
  ort: string;
  mwst: string | null;
  telefon: string | null;
  mail: string | null;
  /** Bild als Bytes. Der Upload kommt mit den Firmeneinstellungen, bis
   *  dahin bleibt der Platz leer und der Kopf steht trotzdem. */
  logo: Buffer | null;
};

const RAND = 40;
const GRAU = "#555555";
const LINIE = "#999999";

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

export async function pdf(bericht: Bericht, firma: Firmenkopf): Promise<Buffer> {
  const doc = new PDFDocument({ autoFirstPage: false, margin: RAND });
  const teile: Buffer[] = [];
  doc.on("data", (d: Buffer) => teile.push(d));
  const fertig = new Promise<Buffer>((auf) =>
    doc.on("end", () => auf(Buffer.concat(teile))),
  );

  for (const blatt of bericht.blaetter) {
    const quer = blatt.spalten.length > QUER_AB;
    doc.addPage({ size: "A4", layout: quer ? "landscape" : "portrait", margin: RAND });
    kopfzeile(doc, bericht, firma, blatt);
    tabelle(doc, blatt, bericht, firma);
  }

  doc.end();
  return fertig;
}

/** Firmenzeile, Titel und Blattname. Steht auf jeder Seite. */
function kopfzeile(
  doc: PDFKit.PDFDocument,
  bericht: Bericht,
  firma: Firmenkopf,
  blatt: Blatt,
) {
  const rechts = doc.page.width - RAND;
  let y = RAND;

  if (firma.logo) {
    try {
      doc.image(firma.logo, RAND, y, { fit: [120, 40] });
    } catch {
      // Ein unlesbares Logo darf den Bericht nicht verhindern.
    }
  }

  doc.font("Helvetica-Bold").fontSize(10).fillColor("black");
  doc.text(firma.name, firma.logo ? RAND + 132 : RAND, y);
  doc.font("Helvetica").fontSize(8).fillColor(GRAU);
  const zeilen = [
    `${firma.strasse}, ${firma.ort}`,
    [firma.mwst, firma.telefon, firma.mail].filter(Boolean).join(" · "),
  ].filter(Boolean);
  for (const z of zeilen) doc.text(z, firma.logo ? RAND + 132 : RAND, doc.y);

  y = Math.max(doc.y, RAND + (firma.logo ? 44 : 0)) + 10;

  doc.moveTo(RAND, y).lineTo(rechts, y).strokeColor(LINIE).lineWidth(0.5).stroke();
  y += 12;

  doc.font("Helvetica-Bold").fontSize(13).fillColor("black").text(bericht.titel, RAND, y);
  doc.font("Helvetica").fontSize(9).fillColor(GRAU);
  for (const u of bericht.untertitel) doc.text(u, RAND, doc.y + 1);

  doc.font("Helvetica-Bold").fontSize(10).fillColor("black").text(blatt.name, RAND, doc.y + 8);
  doc.y += 4;
}

/** Die Tabelle, mit Seitenumbruch und wiederholter Titelzeile. */
function tabelle(
  doc: PDFKit.PDFDocument,
  blatt: Blatt,
  bericht: Bericht,
  firma: Firmenkopf,
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
  const untenGrenze = doc.page.height - RAND - zeilenhoehe;

  const titelzeile = () => {
    doc.font("Helvetica-Bold").fontSize(8).fillColor("black");
    blatt.spalten.forEach((s, i) => {
      doc.text(s.titel, x[i], doc.y, {
        width: breiten[i] - 4,
        align: s.art && s.art !== "text" ? "right" : "left",
        lineBreak: false,
      });
      if (i < blatt.spalten.length - 1) doc.y -= zeilenhoehe;
    });
    doc.y += 2;
    doc.moveTo(RAND, doc.y).lineTo(rechts, doc.y).strokeColor(LINIE).lineWidth(0.5).stroke();
    doc.y += 3;
  };

  const zeile = (werte: Zelle[], fett: boolean) => {
    doc.font(fett ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor("black");
    const oben = doc.y;
    blatt.spalten.forEach((s, i) => {
      doc.text(alsText(werte[i] ?? null, s.art), x[i], oben, {
        width: breiten[i] - 4,
        align: s.art && s.art !== "text" ? "right" : "left",
        lineBreak: false,
        ellipsis: true,
      });
      if (i < blatt.spalten.length - 1) doc.y = oben;
    });
    doc.y = oben + zeilenhoehe;
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
      kopfzeile(doc, bericht, firma, blatt);
      doc.y += 4;
      titelzeile();
    }
    zeile(z, false);
  }

  if (blatt.zeilen.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRAU);
    doc.text("Keine Einträge in diesem Zeitraum.", RAND, doc.y + 2);
    doc.y += zeilenhoehe;
  }

  if (blatt.summe) {
    doc.moveTo(RAND, doc.y).lineTo(rechts, doc.y).strokeColor(LINIE).lineWidth(0.5).stroke();
    doc.y += 3;
    zeile(blatt.summe, true);
  }
}
