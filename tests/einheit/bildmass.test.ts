import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bildmasse, einpassen } from "@/lib/bildmass";

/* Was hier geprüft wird, ist die einzige Schranke beim Hochladen eines
 * Logos: der gemeldete Typ aus dem Formular zählt nicht, nur was in der
 * Datei steht. Eine als PNG angekündigte SVG käme sonst erst im Bericht
 * als Abbruch an, und zwar bei jemand anderem. */

/** Eine PNG mit frei wählbaren Massen, nur der Kopf, der Rest fehlt. */
function png(breite: number, hoehe: number) {
  const d = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(d, 0);
  d.writeUInt32BE(13, 8);
  d.write("IHDR", 12, "ascii");
  d.writeUInt32BE(breite, 16);
  d.writeUInt32BE(hoehe, 20);
  return d;
}

/**
 * Eine JPEG mit einem Rahmen davor, den es zu überspringen gilt.
 * `vorab` ist die Länge dieses Rahmens, damit sich prüfen lässt, dass
 * wirklich gesprungen und nicht geraten wird.
 */
function jpeg(breite: number, hoehe: number, vorab = 16, kennung = 0xc0) {
  const rahmen = Buffer.alloc(vorab);
  rahmen.writeUInt16BE(vorab, 0);

  const sof = Buffer.alloc(9);
  sof.writeUInt16BE(9, 0); // Länge, zählt sich selbst mit
  sof.writeUInt8(8, 2); // Genauigkeit
  sof.writeUInt16BE(hoehe, 3);
  sof.writeUInt16BE(breite, 5);

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // Anfang
    Buffer.from([0xff, 0xe0]), // APP0, ein Rahmen ohne Masse
    rahmen,
    Buffer.from([0xff, kennung]),
    sof,
  ]);
}

describe("bildmasse", () => {
  it("liest Typ und Masse einer PNG", () => {
    expect(bildmasse(png(2000, 303))).toEqual({
      typ: "image/png",
      breite: 2000,
      hoehe: 303,
    });
  });

  it("liest die gelieferte Wortmarke", () => {
    const datei = readFileSync(
      join(process.cwd(), "public", "marke", "wortmarke", "isoteam-wortmarke-farbig-2000.png"),
    );
    const m = bildmasse(datei);
    expect(m?.typ).toBe("image/png");
    expect(m?.breite).toBe(2000);
  });

  it("liest Typ und Masse einer JPEG und springt über den Rahmen davor", () => {
    expect(bildmasse(jpeg(1200, 400))).toEqual({
      typ: "image/jpeg",
      breite: 1200,
      hoehe: 400,
    });
    // Ein längerer Rahmen davor darf am Ergebnis nichts ändern: wird die
    // Länge nicht gelesen, landet der Zeiger mitten in den Daten.
    expect(bildmasse(jpeg(1200, 400, 120))).toEqual({
      typ: "image/jpeg",
      breite: 1200,
      hoehe: 400,
    });
  });

  it("liest auch eine fortschreitende JPEG, SOF2", () => {
    expect(bildmasse(jpeg(800, 600, 16, 0xc2))?.breite).toBe(800);
  });

  it("nimmt DHT nicht für einen Rahmen mit Massen", () => {
    // C4 steht in derselben Reihe wie die SOF-Rahmen und trägt keine
    // Masse. Wer die ganze Reihe nimmt, liest hier Unsinn.
    expect(bildmasse(jpeg(800, 600, 16, 0xc4))).toBeNull();
  });

  it("weist zurück, was keine PNG und keine JPEG ist", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(bildmasse(svg)).toBeNull();
    // Eine .xlsx, also eine Mappe: fängt mit der ZIP-Kennung an.
    expect(bildmasse(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toBeNull();
    expect(bildmasse(Buffer.alloc(0))).toBeNull();
  });

  it("weist eine abgeschnittene PNG zurück", () => {
    expect(bildmasse(png(2000, 303).subarray(0, 18))).toBeNull();
  });

  it("weist eine PNG ohne IHDR an der richtigen Stelle zurück", () => {
    const d = png(2000, 303);
    d.write("IDAT", 12, "ascii");
    expect(bildmasse(d)).toBeNull();
  });

  it("weist ein Bild ohne Fläche zurück", () => {
    expect(bildmasse(png(0, 303))).toBeNull();
  });

  it("läuft bei einer JPEG ohne Massenrahmen nicht endlos", () => {
    // Nur Anfang und ein Rahmen, der nirgends hinführt.
    const rahmen = Buffer.alloc(8);
    rahmen.writeUInt16BE(8, 0);
    expect(bildmasse(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), rahmen]))).toBeNull();
  });
});

describe("einpassen", () => {
  it("behält das Seitenverhältnis, breit", () => {
    // Die Wortmarke ist breiter als die Box, sie wird an der Breite
    // begrenzt und die Höhe folgt.
    expect(einpassen({ breite: 2000, hoehe: 300 }, { breite: 200, hoehe: 30 })).toEqual({
      breite: 200,
      hoehe: 30,
    });
  });

  it("behält das Seitenverhältnis, hochkant", () => {
    // Ein quadratisches Logo darf nicht auf die volle Breite gezogen
    // werden: genau das tat Excel mit einem festen Mass.
    expect(einpassen({ breite: 500, hoehe: 500 }, { breite: 200, hoehe: 30 })).toEqual({
      breite: 30,
      hoehe: 30,
    });
  });

  it("vergrössert ein kleines Bild auf die Box", () => {
    expect(einpassen({ breite: 100, hoehe: 10 }, { breite: 200, hoehe: 30 })).toEqual({
      breite: 200,
      hoehe: 20,
    });
  });
});
