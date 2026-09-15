import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { blattname, dateiname, mappe } from "@/server/excel";

/* Die erzeugte Mappe wieder einlesen. Die Umleitung über `unknown` ist
 * nötig, weil `Buffer` in @types/node inzwischen über seinen Speicher
 * parametrisiert ist und exceljs ein `Buffer<ArrayBuffer>` erwartet,
 * während `Buffer.from` ein `Buffer<ArrayBufferLike>` zurückgibt. Zur
 * Laufzeit ist es dasselbe Objekt. */
async function laden(bytes: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

/* Die Mappe selbst wird erzeugt und wieder gelesen: ein Export, der eine
 * kaputte Datei schreibt, fällt sonst erst beim Öffnen auf, und das tut
 * niemand in einem Test. */

describe("blattname", () => {
  it("wirft die Zeichen weg, die Excel nicht zulässt", () => {
    expect(blattname("Je Baustelle: 2026/09")).toBe("Je Baustelle 2026 09");
  });

  it("kürzt auf 31 Zeichen", () => {
    expect(blattname("x".repeat(40))).toHaveLength(31);
  });

  it("gibt nie einen leeren Namen zurück", () => {
    expect(blattname("///")).toBe("Blatt1");
    expect(blattname("  ")).toBe("Blatt1");
  });
});

describe("dateiname", () => {
  it("schreibt Umlaute aus", () => {
    expect(dateiname(["Auswertung", "Jürg Müller"])).toBe("Auswertung_Juerg-Mueller");
  });

  it("lässt leere Teile weg", () => {
    expect(dateiname(["Auswertung", null, "2026"])).toBe("Auswertung_2026");
  });

  it("behält Punkt und Bindestrich, wirft den Rest weg", () => {
    expect(dateiname(["a.b", "c/d", "e:f"])).toBe("a.b_c-d_e-f");
  });

  it("gibt nie einen leeren Namen zurück", () => {
    expect(dateiname([])).toBe("Auswertung");
    expect(dateiname(["///"])).toBe("Auswertung");
  });
});

describe("mappe", () => {
  const blatt = {
    name: "Übersicht",
    kopf: ["Auswertung Mitarbeitende: Liridon", "Zeitraum: September 2026"],
    spalten: [
      { titel: "Kennzahl", breite: 30 },
      { titel: "Wert", art: "zahl" as const },
    ],
    zeilen: [
      ["Nettostunden", 168.5],
      ["Werktage", 22],
    ],
    summe: ["Zusammen", 190.5],
  };

  it("erzeugt eine lesbare Datei", async () => {
    const buf = await mappe([blatt]);
    // Eine .xlsx ist ein ZIP und beginnt mit "PK".
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("schreibt Kopf, Titelzeile, Werte und Summe in dieser Reihenfolge", async () => {
    const wb = await laden(await mappe([blatt]));
    const ws = wb.getWorksheet("Übersicht")!;

    expect(ws.getCell("A1").value).toBe("Auswertung Mitarbeitende: Liridon");
    expect(ws.getCell("A2").value).toBe("Zeitraum: September 2026");
    // Leerzeile, dann die Titelzeile, nach der Vorlage in Versalien.
    expect(ws.getCell("A4").value).toBe("KENNZAHL");
    expect(ws.getCell("A5").value).toBe("Nettostunden");
    expect(ws.getCell("B5").value).toBe(168.5);
    expect(ws.getCell("A7").value).toBe("Zusammen");
  });

  /* Zahlen müssen Zahlen bleiben, sonst lässt sich in Excel nicht damit
   * weiterrechnen, und genau dafür wird die Mappe geholt. */
  it("legt Zahlen als Zahlen ab, nicht als Text", async () => {
    const wb = await laden(await mappe([blatt]));
    const ws = wb.getWorksheet("Übersicht")!;

    expect(typeof ws.getCell("B5").value).toBe("number");
  });

  /* Die Marke in der Mappe: Wortmarke und Firmenzeile über der Tabelle,
   * Titelzeile in Tiefblau auf Weiss. Ohne Firmenangaben entsteht
   * dieselbe Mappe ohne Kopf, eine Auswertung soll nicht daran
   * scheitern, dass ein Logo fehlt. */
  const firma = {
    name: "IsoTeam Suljejmani GmbH",
    strasse: "Gerliswilstrasse 68",
    ort: "6020 Emmenbrücke",
    mwst: "CHE-305.978.601",
    telefon: null,
    mail: null,
    logo: null,
  };

  it("setzt Firmenzeile über die Tabelle und schiebt sie nach unten", async () => {
    const wb = await laden(await mappe([blatt], firma));
    const ws = wb.getWorksheet("Übersicht")!;

    expect(ws.getCell("A2").value).toBe("IsoTeam Suljejmani GmbH");
    expect(ws.getCell("A3").value).toBe("Gerliswilstrasse 68, 6020 Emmenbrücke");
    // Zeile 1 bleibt für die Wortmarke frei, danach Kopfzeilen und Tabelle.
    expect(ws.getCell("A5").value).toBe("Auswertung Mitarbeitende: Liridon");
    expect(ws.getCell("A8").value).toBe("KENNZAHL");
  });

  it("färbt die Titelzeile in Tiefblau auf Weiss", async () => {
    const wb = await laden(await mappe([blatt], firma));
    const zelle = wb.getWorksheet("Übersicht")!.getCell("A8");

    expect(zelle.fill).toMatchObject({ fgColor: { argb: "FF0A4A7C" } });
    expect(zelle.font).toMatchObject({ color: { argb: "FFFFFFFF" }, bold: true });
  });

  it("kommt ohne Firmenangaben aus", async () => {
    const wb = await laden(await mappe([blatt]));
    const ws = wb.getWorksheet("Übersicht")!;

    expect(ws.getCell("A1").value).toBe("Auswertung Mitarbeitende: Liridon");
  });

  it("nimmt mehrere Blätter auf", async () => {
    const wb = await laden(
      await mappe([blatt, { ...blatt, name: "Je Baustelle", summe: undefined }]),
    );

    expect(wb.worksheets.map((w) => w.name)).toEqual(["Übersicht", "Je Baustelle"]);
  });

  it("kommt mit einem Blatt ohne Zeilen zurecht", async () => {
    const buf = await mappe([
      { name: "Leer", spalten: [{ titel: "Nichts" }], zeilen: [] },
    ]);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});
