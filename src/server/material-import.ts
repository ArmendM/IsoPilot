"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  type Abgleich,
  type Importzeile,
  type Katalogartikel,
  type Zusammenfassung,
  fasseZusammen,
  findeSpalten,
  gleicheAlleAb,
  leseEinheit,
  lesePreis,
} from "@/lib/materialimport";

/* Excel-Import in den Materialkatalog, M3d.
 *
 * Zwei Schritte: zuerst Vorschau, dann Ausführen. Die Datei wird beide
 * Male hochgeladen und beide Male auf dem Server frisch gelesen und
 * abgeglichen. Das ist ein zweites Hochladen wert: käme der Abgleich vom
 * Browser zurück, liesse sich über das Formular jeder beliebige Artikel
 * überschreiben. Die Vorschau ist damit reine Auskunft, nie eine Vorgabe.
 *
 * Preise werden nur übernommen, Lagerbestand und Mindestbestand nie: die
 * sind Handarbeit im Betrieb, siehe CLAUDE.md. */

export type Vorschau = {
  ok: true;
  zusammenfassung: Zusammenfassung;
  zeilen: Abgleich[];
  /** Spalten, die in der Datei nicht gefunden wurden. */
  fehlendeSpalten: string[];
};

export type ImportErgebnis =
  | { ok: true; aktualisiert: number; angelegt: number; uebersprungen: number }
  | { ok: false; error: string };

export type VorschauErgebnis = Vorschau | { ok: false; error: string };

const MAX_ZEILEN = 5000;

async function nurVorgesetzte() {
  const user = await requireUser();
  return user.role === "ADMIN" ? user : null;
}

/** Eine Zelle als Text. ExcelJS liefert je nach Zelle Objekte für Formeln,
 *  verlinkten Text oder Rich Text. */
function zelle(wert: ExcelJS.CellValue): string | number | null {
  if (wert === null || wert === undefined) return null;
  if (typeof wert === "number" || typeof wert === "string") return wert;
  if (wert instanceof Date) return wert.toISOString();
  if (typeof wert === "object") {
    if ("result" in wert && wert.result !== undefined) return zelle(wert.result as ExcelJS.CellValue);
    if ("text" in wert && typeof wert.text === "string") return wert.text;
    if ("richText" in wert && Array.isArray(wert.richText))
      return wert.richText.map((t) => t.text).join("");
    if ("hyperlink" in wert && "text" in wert) return String(wert.text);
  }
  return String(wert);
}

async function leseDatei(
  daten: ArrayBuffer,
): Promise<{ zeilen: Importzeile[]; fehlendeSpalten: string[] } | { fehler: string }> {
  const mappe = new ExcelJS.Workbook();
  try {
    await mappe.xlsx.load(daten);
  } catch {
    return { fehler: "Die Datei lässt sich nicht als Excel-Datei lesen." };
  }

  const blatt = mappe.worksheets[0];
  if (!blatt || blatt.rowCount < 2)
    return { fehler: "Die Datei enthält keine Zeilen unter der Kopfzeile." };

  const kopf: (string | number | null)[] = [];
  blatt.getRow(1).eachCell({ includeEmpty: true }, (c, i) => {
    kopf[i - 1] = zelle(c.value);
  });

  const spalten = findeSpalten(kopf);
  if (spalten.name === -1)
    return {
      fehler:
        "In der ersten Zeile fehlt eine Spalte mit der Bezeichnung. " +
        "Erwartet wird eine Kopfzeile mit Spalten wie Bezeichnung, Artikelnummer, Kategorie, Einheit und Preis.",
    };

  const fehlendeSpalten = (["sku", "kategorie", "einheit", "preis", "brandschutz"] as const)
    .filter((s) => spalten[s] === -1)
    .map((s) => ({
      sku: "Artikelnummer",
      kategorie: "Kategorie",
      einheit: "Einheit",
      preis: "Preis",
      brandschutz: "Brandschutz",
    })[s]);

  const text = (row: ExcelJS.Row, index: number): string | null => {
    if (index === -1) return null;
    const v = zelle(row.getCell(index + 1).value);
    const s = v === null ? "" : String(v).trim();
    return s === "" ? null : s;
  };

  const zeilen: Importzeile[] = [];
  for (let nr = 2; nr <= blatt.rowCount && zeilen.length < MAX_ZEILEN; nr++) {
    const row = blatt.getRow(nr);
    const name = text(row, spalten.name);
    const sku = text(row, spalten.sku);
    // Eine ganz leere Zeile ist keine fehlerhafte Zeile, sondern gar keine.
    if (!name && !sku) continue;

    zeilen.push({
      zeile: nr,
      sku,
      name: name ?? "",
      kategorie: text(row, spalten.kategorie),
      einheit: leseEinheit(text(row, spalten.einheit)),
      preis: lesePreis(spalten.preis === -1 ? null : zelle(row.getCell(spalten.preis + 1).value)),
      brandschutz: text(row, spalten.brandschutz),
    });
  }

  return { zeilen, fehlendeSpalten };
}

async function katalogVon(companyId: string): Promise<Katalogartikel[]> {
  const rows = await db.material.findMany({
    where: { companyId, isActive: true },
    select: { id: true, sku: true, name: true, category: { select: { name: true } } },
  });
  return rows.map((m) => ({ id: m.id, sku: m.sku, name: m.name, kategorie: m.category?.name ?? null }));
}

async function abgleichen(companyId: string, datei: unknown) {
  if (!(datei instanceof File) || datei.size === 0)
    return { fehler: "Zuerst eine Excel-Datei auswählen." };
  if (!datei.name.toLowerCase().endsWith(".xlsx"))
    return { fehler: "Es werden Dateien im Format .xlsx gelesen. Aus Excel als .xlsx speichern." };

  const gelesen = await leseDatei(await datei.arrayBuffer());
  if ("fehler" in gelesen) return gelesen;

  const katalog = await katalogVon(companyId);
  return { abgleiche: gleicheAlleAb(gelesen.zeilen, katalog), fehlendeSpalten: gelesen.fehlendeSpalten };
}

/** Schritt eins: zeigen, was der Import täte. Schreibt nichts. */
export async function importVorschau(formData: FormData): Promise<VorschauErgebnis> {
  const user = await nurVorgesetzte();
  if (!user) return { ok: false, error: "Nur ein Vorgesetzter pflegt den Katalog." };

  try {
    const r = await abgleichen(user.companyId, formData.get("datei"));
    if ("fehler" in r) return { ok: false, error: r.fehler };
    return {
      ok: true,
      zusammenfassung: fasseZusammen(r.abgleiche),
      zeilen: r.abgleiche,
      fehlendeSpalten: r.fehlendeSpalten,
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Die Datei liess sich nicht lesen." };
  }
}

/**
 * Schritt zwei: ausführen. Liest die Datei noch einmal und gleicht noch
 * einmal ab, statt der Vorschau zu glauben.
 *
 * Uneindeutige und fehlerhafte Zeilen werden übersprungen, nie geraten.
 * Ein leeres Preisfeld lässt den bisherigen Preis stehen: sonst setzte
 * eine halb gefüllte Spalte den halben Katalog auf null.
 */
export async function importAusfuehren(formData: FormData): Promise<ImportErgebnis> {
  const user = await nurVorgesetzte();
  if (!user) return { ok: false, error: "Nur ein Vorgesetzter pflegt den Katalog." };

  try {
    const r = await abgleichen(user.companyId, formData.get("datei"));
    if ("fehler" in r) return { ok: false, error: r.fehler };

    const zuTun = r.abgleiche.filter((a) => a.art === "aktualisieren" || a.art === "anlegen");
    const uebersprungen = r.abgleiche.length - zuTun.length;
    if (zuTun.length === 0)
      return { ok: true, aktualisiert: 0, angelegt: 0, uebersprungen };

    let aktualisiert = 0;
    let angelegt = 0;

    await db.$transaction(async (tx) => {
      // Kategorien einmal einlesen, damit ein Name aus der Datei einer
      // bestehenden Kategorie zugeordnet werden kann.
      const kategorien = await tx.category.findMany({ where: { companyId: user.companyId } });
      const nachName = new Map(kategorien.map((k) => [k.name.trim().toLowerCase(), k.id]));

      for (const a of zuTun) {
        const z = a.zeile;
        const categoryId = z.kategorie ? (nachName.get(z.kategorie.trim().toLowerCase()) ?? null) : null;

        if (a.art === "aktualisieren") {
          const before = await tx.material.findUniqueOrThrow({ where: { id: a.treffer.id } });
          const after = await tx.material.update({
            where: { id: a.treffer.id },
            data: {
              // Nur setzen, was in der Datei auch dasteht. Lager und
              // Mindestbestand bleiben unberührt, das ist Handarbeit.
              ...(z.preis !== null ? { price: z.preis } : {}),
              ...(z.einheit !== null ? { unit: z.einheit } : {}),
              ...(z.brandschutz !== null ? { fireClass: z.brandschutz } : {}),
            },
          });
          aktualisiert++;
          await tx.auditLog.create({
            data: {
              companyId: user.companyId,
              actorId: user.id,
              action: "UPDATE",
              entity: "Material",
              entityId: after.id,
              before: JSON.parse(JSON.stringify(before)),
              after: JSON.parse(JSON.stringify(after)),
            },
          });
        } else {
          const after = await tx.material.create({
            data: {
              companyId: user.companyId,
              categoryId,
              sku: z.sku,
              name: z.name.trim(),
              unit: z.einheit ?? "M2",
              price: z.preis ?? 0,
              fireClass: z.brandschutz,
            },
          });
          angelegt++;
          await tx.auditLog.create({
            data: {
              companyId: user.companyId,
              actorId: user.id,
              action: "CREATE",
              entity: "Material",
              entityId: after.id,
              after: JSON.parse(JSON.stringify(after)),
            },
          });
        }
      }
    });

    revalidatePath("/material");
    return { ok: true, aktualisiert, angelegt, uebersprungen };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Der Import ist fehlgeschlagen, es wurde nichts geändert." };
  }
}
