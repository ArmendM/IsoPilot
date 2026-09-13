import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { firma, person, sitzung } from "./hilfen";

/* Der Excel-Import in den Katalog, M3d. Die Testdateien werden hier
 * erzeugt, damit keine Beispieldatei im Repo mitgeschleppt wird und die
 * Spaltenaufbauten im Test selbst sichtbar sind. */

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => {
    if (!sitzung.user) throw new Error("UNAUTHENTICATED");
    return sitzung.user;
  },
  getSession: async () => sitzung.user,
}));

const { importVorschau, importAusfuehren } = await import("@/server/material-import");

async function datei(zeilen: unknown[][], name = "liste.xlsx"): Promise<File> {
  const mappe = new ExcelJS.Workbook();
  const blatt = mappe.addWorksheet("Katalog");
  for (const z of zeilen) blatt.addRow(z);
  const puffer = await mappe.xlsx.writeBuffer();
  return new File([puffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const formular = (f: File) => {
  const fd = new FormData();
  fd.append("datei", f);
  return fd;
};

const KOPF = ["Artikelnummer", "Bezeichnung", "Kategorie", "Einheit", "Preis"];

async function aufbau() {
  const c = await firma();
  const daut = await person(c.id, "Daut", "ADMIN");
  const liridon = await person(c.id, "Liridon");
  const kategorie = await db.category.create({ data: { companyId: c.id, name: "Armaflex" } });
  const artikel = await db.material.create({
    data: {
      companyId: c.id,
      categoryId: kategorie.id,
      sku: "AF-19",
      name: "Armaflex AF 19 mm",
      unit: "M2",
      price: "12.50",
      stock: "80",
      minStock: "10",
    },
  });
  sitzung.user = daut.alsSitzung();
  return { c, daut, liridon, kategorie, artikel };
}

beforeEach(() => {
  sitzung.user = null;
});

describe("Vorschau", () => {
  it("zählt, was geschehen würde, und schreibt nichts", async () => {
    const { artikel } = await aufbau();
    const f = await datei([
      KOPF,
      ["AF-19", "Armaflex AF 19 mm", "Armaflex", "m2", "13.90"],
      ["NEU-1", "Rockwool EI 30", "Brandschutz", "Stk.", "42.00"],
    ]);

    const r = await importVorschau(formular(f));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.zusammenfassung).toEqual({
      aktualisieren: 1,
      anlegen: 1,
      uneindeutig: 0,
      fehlerhaft: 0,
    });

    // Nichts darf sich geändert haben.
    expect(await db.material.count()).toBe(1);
    const unveraendert = await db.material.findUniqueOrThrow({ where: { id: artikel.id } });
    expect(Number(unveraendert.price)).toBe(12.5);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("nennt Spalten, die in der Datei fehlen", async () => {
    await aufbau();
    const r = await importVorschau(formular(await datei([["Bezeichnung", "Preis"], ["Etwas", "1"]])));
    expect(r.ok && r.fehlendeSpalten).toContain("Artikelnummer");
    expect(r.ok && r.fehlendeSpalten).toContain("Kategorie");
  });

  it("bricht ab, wenn die Bezeichnungsspalte fehlt", async () => {
    await aufbau();
    const r = await importVorschau(formular(await datei([["Menge", "Lager"], [1, 2]])));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Bezeichnung/);
  });

  it("weist eine Datei ab, die keine xlsx-Datei ist", async () => {
    await aufbau();
    const f = new File(["Artikel;Preis"], "liste.csv", { type: "text/csv" });
    const r = await importVorschau(formular(f));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/\.xlsx/);
  });
});

describe("Import ausführen", () => {
  it("aktualisiert den Preis, ohne einen zweiten Artikel anzulegen", async () => {
    const { artikel } = await aufbau();
    const f = await datei([KOPF, ["AF-19", "Armaflex AF 19 mm", "Armaflex", "m2", "13.90"]]);

    const r = await importAusfuehren(formular(f));
    expect(r).toEqual({ ok: true, aktualisiert: 1, angelegt: 0, uebersprungen: 0 });

    expect(await db.material.count()).toBe(1);
    const nachher = await db.material.findUniqueOrThrow({ where: { id: artikel.id } });
    expect(Number(nachher.price)).toBe(13.9);
  });

  /* Die Regel aus CLAUDE.md: Lager und Mindestbestand gehören nicht in
   * den Import, die sind Handarbeit im Betrieb. */
  it("lässt Lagerbestand und Mindestbestand unberührt", async () => {
    const { artikel } = await aufbau();
    await importAusfuehren(
      formular(await datei([KOPF, ["AF-19", "Armaflex AF 19 mm", "Armaflex", "m2", "13.90"]])),
    );

    const nachher = await db.material.findUniqueOrThrow({ where: { id: artikel.id } });
    expect(Number(nachher.stock)).toBe(80);
    expect(Number(nachher.minStock)).toBe(10);
  });

  it("legt einen neuen Artikel nur an, wenn keine Regel trifft", async () => {
    await aufbau();
    const r = await importAusfuehren(
      formular(
        await datei([
          KOPF,
          ["AF-19", "Armaflex AF 19 mm", "Armaflex", "m2", "13.90"],
          ["NEU-1", "Rockwool EI 30", "Brandschutz", "Stk.", "42.00"],
        ]),
      ),
    );
    expect(r).toEqual({ ok: true, aktualisiert: 1, angelegt: 1, uebersprungen: 0 });

    const neu = await db.material.findFirstOrThrow({ where: { sku: "NEU-1" } });
    expect(neu.name).toBe("Rockwool EI 30");
    expect(neu.unit).toBe("STK");
    expect(Number(neu.price)).toBe(42);
  });

  it("gleicht auch ohne Artikelnummer über Kategorie und Name ab", async () => {
    const { artikel } = await aufbau();
    await importAusfuehren(
      formular(await datei([["Bezeichnung", "Kategorie", "Preis"], ["Armaflex AF 19 mm", "Armaflex", "20.00"]])),
    );

    expect(await db.material.count()).toBe(1);
    expect(Number((await db.material.findUniqueOrThrow({ where: { id: artikel.id } })).price)).toBe(20);
  });

  /* Ein leeres Preisfeld heisst "unverändert", nicht "null". Sonst setzte
   * eine halb gefüllte Spalte den halben Katalog auf null. */
  it("lässt bei leerem Preisfeld den bisherigen Preis stehen", async () => {
    const { artikel } = await aufbau();
    await importAusfuehren(
      formular(await datei([KOPF, ["AF-19", "Armaflex AF 19 mm", "Armaflex", "m2", ""]])),
    );

    expect(Number((await db.material.findUniqueOrThrow({ where: { id: artikel.id } })).price)).toBe(12.5);
  });

  it("überspringt uneindeutige Zeilen, statt zu raten", async () => {
    const { c } = await aufbau();
    const zweite = await db.category.create({ data: { companyId: c.id, name: "Dämmung" } });
    await db.material.create({
      data: { companyId: c.id, name: "Rockwool", unit: "M2", price: "5.00" },
    });
    await db.material.create({
      data: { companyId: c.id, categoryId: zweite.id, name: "Rockwool", unit: "M2", price: "6.00" },
    });

    const r = await importAusfuehren(
      formular(await datei([["Bezeichnung", "Preis"], ["Rockwool", "99.00"]])),
    );
    expect(r).toEqual({ ok: true, aktualisiert: 0, angelegt: 0, uebersprungen: 1 });

    const preise = (await db.material.findMany({ where: { name: "Rockwool" } })).map((m) =>
      Number(m.price),
    );
    expect(preise.sort()).toEqual([5, 6]);
  });

  it("ordnet eine bestehende Kategorie über den Namen zu", async () => {
    const { kategorie } = await aufbau();
    await importAusfuehren(
      formular(await datei([KOPF, ["NEU-2", "Armaflex AF 32 mm", "armaflex", "m2", "18.00"]])),
    );

    const neu = await db.material.findFirstOrThrow({ where: { sku: "NEU-2" } });
    expect(neu.categoryId).toBe(kategorie.id);
  });

  it("schreibt für jede Änderung einen Protokolleintrag", async () => {
    await aufbau();
    await importAusfuehren(
      formular(
        await datei([
          KOPF,
          ["AF-19", "Armaflex AF 19 mm", "Armaflex", "m2", "13.90"],
          ["NEU-1", "Rockwool EI 30", "Brandschutz", "Stk.", "42.00"],
        ]),
      ),
    );

    expect(await db.auditLog.count({ where: { entity: "Material", action: "UPDATE" } })).toBe(1);
    expect(await db.auditLog.count({ where: { entity: "Material", action: "CREATE" } })).toBe(1);
  });

  it("greift nicht auf den Katalog einer anderen Firma", async () => {
    await aufbau();
    const fremd = await firma("Flüma Klima AG");
    const fremderArtikel = await db.material.create({
      data: { companyId: fremd.id, sku: "AF-19", name: "Armaflex AF 19 mm", unit: "M2", price: "99.00" },
    });

    await importAusfuehren(
      formular(await datei([KOPF, ["AF-19", "Armaflex AF 19 mm", "Armaflex", "m2", "13.90"]])),
    );

    expect(
      Number((await db.material.findUniqueOrThrow({ where: { id: fremderArtikel.id } })).price),
    ).toBe(99);
  });
});

/* Der Fehler aus dem Betrieb: PRUEF-1 wurde nach dem ersten Testimport
 * stillgelegt. Beim zweiten Lauf fehlte er im Abgleich, der Import wollte
 * ihn anlegen und lief in Material_companyId_sku_key. */
describe("Stillgelegte Artikel", () => {
  it("aktualisiert einen stillgelegten Artikel, statt am Anlegen zu scheitern", async () => {
    const { c } = await aufbau();
    const still = await db.material.create({
      data: {
        companyId: c.id, sku: "PRUEF-1", name: "Prüfartikel",
        unit: "M2", price: "7.70", isActive: false,
      },
    });

    const r = await importAusfuehren(
      formular(await datei([KOPF, ["PRUEF-1", "Prüfartikel", "", "m2", "9.90"]])),
    );

    expect(r).toEqual({ ok: true, aktualisiert: 1, angelegt: 0, uebersprungen: 0 });
    expect(await db.material.count({ where: { sku: "PRUEF-1" } })).toBe(1);
    expect(Number((await db.material.findUniqueOrThrow({ where: { id: still.id } })).price)).toBe(9.9);
  });

  /* Stilllegen ist ein Entscheid im Betrieb, keine Frage der
   * Lieferantenliste. Der Import weckt ihn nicht wieder auf. */
  it("legt einen stillgelegten Artikel durch den Import nicht wieder frei", async () => {
    const { c } = await aufbau();
    const still = await db.material.create({
      data: {
        companyId: c.id, sku: "PRUEF-1", name: "Prüfartikel",
        unit: "M2", price: "7.70", isActive: false,
      },
    });

    await importAusfuehren(
      formular(await datei([KOPF, ["PRUEF-1", "Prüfartikel", "", "m2", "9.90"]])),
    );

    expect((await db.material.findUniqueOrThrow({ where: { id: still.id } })).isActive).toBe(false);
  });
});

describe("Doppelte Artikelnummern in der Datei", () => {
  it("schreibt nichts und überspringt beide Zeilen", async () => {
    await aufbau();
    const r = await importAusfuehren(
      formular(
        await datei([
          KOPF,
          ["DOPP-1", "Erster", "", "m2", "1.00"],
          ["DOPP-1", "Zweiter", "", "m2", "2.00"],
        ]),
      ),
    );

    expect(r).toEqual({ ok: true, aktualisiert: 0, angelegt: 0, uebersprungen: 2 });
    expect(await db.material.count({ where: { sku: "DOPP-1" } })).toBe(0);
  });
});

describe("Berechtigung", () => {
  it("lässt eine mitarbeitende Person weder vorschauen noch importieren", async () => {
    const { liridon } = await aufbau();
    sitzung.user = liridon.alsSitzung();
    const f = await datei([KOPF, ["AF-19", "Armaflex AF 19 mm", "Armaflex", "m2", "13.90"]]);

    expect((await importVorschau(formular(f))).ok).toBe(false);
    expect((await importAusfuehren(formular(await datei([KOPF, ["AF-19", "x", "y", "m2", "1"]])))).ok).toBe(
      false,
    );
    expect(await db.auditLog.count()).toBe(0);
  });
});
