/* Format und Masse eines Bildes, gelesen aus den ersten Bytes.
 *
 * Ohne Prisma und ohne React, damit es in tests/einheit ohne Datenbank
 * geprüft werden kann.
 *
 * Es gibt dafür Bibliotheken. Eine weitere Abhängigkeit für zwei
 * Kopfdaten lohnt aber nicht, und sie löst das eigentliche Problem
 * nicht: geprüft werden muss, was in der Datei steht, nicht was der
 * Browser als Typ mitschickt. Der Typ aus dem Formular ist eine Angabe
 * des Absenders, die Kennung am Dateianfang ist die Datei selbst.
 *
 * Gelesen werden nur PNG und JPEG, und das ist keine Sparsamkeit,
 * sondern die Grenze der Ausgabe: pdfkit kennt genau diese beiden und
 * wirft bei allem anderen "Unknown image format", und exceljs will die
 * Endung wissen. Eine SVG, die sich im Browser tadellos anzeigt, käme
 * im Bericht als Abbruch an.
 */

export type Bildtyp = "image/png" | "image/jpeg";

export type Bildmass = {
  typ: Bildtyp;
  breite: number;
  hoehe: number;
};

const PNG_KENNUNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/* Die Rahmen, die Breite und Höhe tragen. SOF0 bis SOF15, ohne DHT
 * (C4), DNL (C8) und DAC (CC): die stehen mitten in derselben Reihe und
 * haben mit den Massen nichts zu tun. */
const SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

const zahl32 = (d: Uint8Array, i: number) =>
  (d[i] << 24 | d[i + 1] << 16 | d[i + 2] << 8 | d[i + 3]) >>> 0;

const zahl16 = (d: Uint8Array, i: number) => (d[i] << 8) | d[i + 1];

/**
 * Typ, Breite und Höhe, oder null, wenn es keine lesbare PNG oder JPEG
 * ist. Ein null heisst "damit kann der Bericht nichts anfangen" und ist
 * die einzige Prüfung, die beim Hochladen zählt.
 */
export function bildmasse(daten: Uint8Array): Bildmass | null {
  return png(daten) ?? jpeg(daten);
}

function png(d: Uint8Array): Bildmass | null {
  // Kennung, dann IHDR: Länge, Typ, Breite, Höhe. Der Kopf ist immer der
  // erste Abschnitt, ein PNG ohne IHDR an Position 8 ist keines.
  if (d.length < 24) return null;
  if (PNG_KENNUNG.some((b, i) => d[i] !== b)) return null;
  if (String.fromCharCode(d[12], d[13], d[14], d[15]) !== "IHDR") return null;

  const breite = zahl32(d, 16);
  const hoehe = zahl32(d, 20);
  if (breite < 1 || hoehe < 1) return null;
  return { typ: "image/png", breite, hoehe };
}

function jpeg(d: Uint8Array): Bildmass | null {
  if (d.length < 4 || d[0] !== 0xff || d[1] !== 0xd8) return null;

  /* Von Rahmen zu Rahmen springen, bis einer die Masse trägt. Die Länge
   * eines Rahmens zählt sich selbst mit, deshalb zwei Bytes weniger
   * weit springen, als man denkt. */
  let i = 2;
  while (i + 3 < d.length) {
    if (d[i] !== 0xff) return null; // aus dem Takt, also keine brauchbare Datei

    // Auffüllbytes zwischen zwei Rahmen sind erlaubt und zählen nicht.
    let kennung = d[i + 1];
    let k = i + 1;
    while (kennung === 0xff && k + 1 < d.length) kennung = d[++k];
    i = k;

    // Rahmen ohne Rumpf: Anfang, Ende, Neustart, TEM. Kein Längenfeld
    // dahinter, also nur um den Rahmen selbst weiterrücken.
    if (kennung === 0x01 || (kennung >= 0xd0 && kennung <= 0xd9)) {
      i += 1;
      continue;
    }

    const laenge = zahl16(d, i + 1);
    if (laenge < 2) return null;

    if (SOF.has(kennung)) {
      // Nach Länge und Genauigkeit stehen erst die Höhe, dann die Breite.
      if (i + 8 >= d.length) return null;
      const hoehe = zahl16(d, i + 4);
      const breite = zahl16(d, i + 6);
      if (breite < 1 || hoehe < 1) return null;
      return { typ: "image/jpeg", breite, hoehe };
    }

    i += 1 + laenge;
  }
  return null;
}

/**
 * Ein Bild in eine Box einpassen, ohne es zu verzerren.
 *
 * Excel setzt das Logo in eine Box aus Punkten und richtet sich nicht
 * selbst nach dem Bild. Ohne diese Rechnung wird eine quadratische Marke
 * zur breitgezogenen Wortmarke, und es fällt erst auf dem ausgedruckten
 * Blatt auf. pdfkit kann dasselbe von sich aus, mit `fit`.
 */
export function einpassen(
  mass: { breite: number; hoehe: number },
  box: { breite: number; hoehe: number },
): { breite: number; hoehe: number } {
  const faktor = Math.min(box.breite / mass.breite, box.hoehe / mass.hoehe);
  return {
    breite: Math.round(mass.breite * faktor),
    hoehe: Math.round(mass.hoehe * faktor),
  };
}
