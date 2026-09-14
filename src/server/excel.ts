/* Excel-Ausgabe für die Auswertungen.
 *
 * Eine Stelle für beide Auswertungen. Zwei getrennte Bauten für dieselbe
 * Mappe laufen auseinander, sobald jemand eine Spalte anders formatiert,
 * und dann sieht die eine Auswertung anders aus als die andere.
 *
 * Kein React und kein Prisma: die Beschreibung ist gewöhnliche Daten,
 * die Auswertungen füllen sie, diese Datei macht daraus eine Datei. */
import ExcelJS from "exceljs";

export type Spaltenart = "text" | "zahl" | "stunden" | "franken" | "datum";

export type Spalte = {
  titel: string;
  art?: Spaltenart;
  breite?: number;
};

export type Zelle = string | number | null;

export type Blatt = {
  name: string;
  /** Zeilen über der Tabelle: Titel, Person oder Baustelle, Zeitraum. */
  kopf?: string[];
  spalten: Spalte[];
  zeilen: Zelle[][];
  /** Fusszeile, fett und mit Linie darüber. */
  summe?: Zelle[];
};

/* Schweizer Schreibweise, Apostroph als Tausendertrennung. Stunden mit
 * zwei Stellen, nicht als Uhrzeit: 8,25 Stunden sind keine 8 Uhr 25. */
const FORMAT: Record<Spaltenart, string | undefined> = {
  text: undefined,
  zahl: "#,##0.##",
  stunden: "#,##0.00",
  franken: "#,##0.00",
  datum: "dd.mm.yyyy",
};

const BREITE: Record<Spaltenart, number> = {
  text: 24,
  zahl: 12,
  stunden: 12,
  franken: 14,
  datum: 12,
};

/** Ein Blattname darf in Excel weder leer noch länger als 31 Zeichen
 *  sein und keines von : \ / ? * [ ] enthalten. Mehrfache Leerzeichen
 *  werden zusammengezogen: aus "Baustelle: 2026" würden sonst zwei. */
export function blattname(roh: string): string {
  const sauber = roh
    .replace(/[:\\/?*[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31)
    .trim();
  return sauber || "Blatt1";
}

/**
 * Ein Dateiname, der auf jedem Betriebssystem ankommt: ohne Umlaute,
 * ohne Leerzeichen, ohne Zeichen, die ein Dateisystem nicht mag.
 */
export function dateiname(teile: (string | null | undefined)[]): string {
  const roh = teile.filter(Boolean).join("_");
  return (
    roh
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
      .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "Auswertung"
  );
}

/** Aus der Beschreibung eine .xlsx-Datei machen. */
export async function mappe(blaetter: Blatt[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "IsoPilot";
  wb.created = new Date();

  for (const b of blaetter) {
    const ws = wb.addWorksheet(blattname(b.name));

    for (const zeile of b.kopf ?? []) {
      const r = ws.addRow([zeile]);
      r.getCell(1).font = { bold: true };
    }
    if (b.kopf?.length) ws.addRow([]);

    const kopfzeile = ws.addRow(b.spalten.map((s) => s.titel));
    kopfzeile.font = { bold: true };
    kopfzeile.eachCell((z) => {
      z.border = { bottom: { style: "thin" } };
    });

    for (const zeile of b.zeilen) ws.addRow(zeile);

    if (b.summe) {
      const r = ws.addRow(b.summe);
      r.font = { bold: true };
      r.eachCell((z) => {
        z.border = { top: { style: "thin" } };
      });
    }

    /* Format und Breite je Spalte. ExcelJS zählt ab 1, und die Spalten
     * werden erst nach dem Befüllen gesetzt: vorher gibt es sie nicht. */
    b.spalten.forEach((s, i) => {
      const art = s.art ?? "text";
      const spalte = ws.getColumn(i + 1);
      spalte.width = s.breite ?? BREITE[art];
      const fmt = FORMAT[art];
      if (fmt) spalte.numFmt = fmt;
      if (art !== "text") spalte.alignment = { horizontal: "right" };
    });

    // Die Kopfzeile der Tabelle bleibt beim Blättern stehen.
    const oberhalb = (b.kopf?.length ?? 0) + (b.kopf?.length ? 1 : 0) + 1;
    ws.views = [{ state: "frozen", ySplit: oberhalb }];
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
