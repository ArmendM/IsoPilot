import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { artikel, baustelle, firma, person, sitzung } from "./hilfen";
import { zeitraumAus } from "@/lib/zeitraum";

/* Auswertung Baustellen. Nur für Vorgesetzte: hier stehen die Stunden
 * aller Beteiligten und die Kosten der Baustelle. */

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => {
    if (!sitzung.user) throw new Error("UNAUTHENTICATED");
    return sitzung.user;
  },
  getSession: async () => sitzung.user,
}));

const { auswertungBaustelle, auswertungAlleBaustellen } = await import(
  "@/server/auswertung-read"
);

const september = zeitraumAus({ art: "monat", monat: "2026-09" })!;

async function aufbau() {
  const c = await firma();
  const daut = await person(c.id, "Daut", "ADMIN");
  const liridon = await person(c.id, "Liridon");
  const site = await baustelle(c.id);
  const material = await artikel(c.id); // Preis 12.50, Lager 100
  await db.site.update({ where: { id: site.id }, data: { targetHours: "100" } });
  sitzung.user = daut.alsSitzung();
  return { c, daut, liridon, site, material };
}

async function zeit(
  userId: string,
  siteId: string | null,
  tag: string,
  vonH: number,
  bisH: number,
) {
  return db.timeEntry.create({
    data: {
      userId,
      createdById: userId,
      siteId,
      workDate: new Date(`${tag}T00:00:00Z`),
      startedAt: new Date(`${tag}T${String(vonH).padStart(2, "0")}:00:00Z`),
      endedAt: new Date(`${tag}T${String(bisH).padStart(2, "0")}:00:00Z`),
      breakMinutes: 0,
    },
  });
}

async function buchung(
  siteId: string,
  userId: string,
  materialId: string | null,
  menge: number,
  preis: string,
  tag: string,
  kind: "CATALOG" | "VSI" = "CATALOG",
  rabatt = 0,
) {
  return db.materialBooking.create({
    data: {
      siteId,
      userId,
      kind,
      materialId,
      label: kind === "VSI" ? "Kautschuk 13mm DN25 · Bogen 90°" : null,
      quantity: menge,
      unit: "M2",
      unitPrice: preis,
      discountPct: rabatt,
      bookedOn: new Date(`${tag}T00:00:00Z`),
    },
  });
}

beforeEach(() => {
  sitzung.user = null;
});

describe("Eine Baustelle", () => {
  it("nennt Adresse, Auftraggeber und Status", async () => {
    const { c, daut, site } = await aufbau();
    const partner = await db.partner.create({
      data: { companyId: c.id, name: "Flüma Klima AG", street: "Industriestrasse 8", zip: "6030", city: "Ebikon" },
    });
    await db.site.update({ where: { id: site.id }, data: { partnerId: partner.id } });

    const a = await auswertungBaustelle(daut.alsSitzung(), site.id, september);

    expect(a.baustelle.bezeichnung).toBe("Testobjekt");
    expect(a.baustelle.partner).toBe("Flüma Klima AG");
    expect(a.baustelle.status).toBe("OPEN");
  });

  /* Der Kern: das Soll gilt für die ganze Baustelle, die Stunden werden
   * über den Zeitraum gezählt. Beide Zahlen stehen nebeneinander, sonst
   * verglichen wir einen Monat mit einer ganzen Baustelle. */
  it("trennt Ist im Zeitraum von Ist gesamt", async () => {
    const { daut, liridon, site } = await aufbau();
    await zeit(liridon.id, site.id, "2026-08-20", 7, 17); // ausserhalb
    await zeit(liridon.id, site.id, "2026-09-01", 7, 17); // im Zeitraum

    const a = await auswertungBaustelle(daut.alsSitzung(), site.id, september);

    expect(a.istImZeitraum).toBe(10);
    expect(a.istGesamt).toBe(20);
    expect(a.soll).toBe(100);
    expect(a.differenz).toBe(80); // gegen Ist gesamt, nicht gegen den Monat
  });

  it("zählt Stunden je Person", async () => {
    const { c, daut, liridon, site } = await aufbau();
    const islom = await person(c.id, "Islom");
    await zeit(liridon.id, site.id, "2026-09-01", 7, 17);
    await zeit(islom.id, site.id, "2026-09-01", 7, 12);

    const a = await auswertungBaustelle(daut.alsSitzung(), site.id, september);

    expect(a.proPerson.map((p) => [p.name, p.stunden])).toEqual([
      ["Liridon", 10],
      ["Islom", 5],
    ]);
  });

  it("lässt Stunden einer anderen Baustelle weg", async () => {
    const { c, daut, liridon, site } = await aufbau();
    const zweite = await baustelle(c.id);
    await zeit(liridon.id, site.id, "2026-09-01", 7, 17);
    await zeit(liridon.id, zweite.id, "2026-09-02", 7, 17);
    await zeit(liridon.id, null, "2026-09-03", 7, 17); // Werkstatt

    const a = await auswertungBaustelle(daut.alsSitzung(), site.id, september);

    expect(a.istGesamt).toBe(10);
  });
});

describe("Kosten", () => {
  it("rechnet mit dem eingefrorenen Preis, nicht mit dem heutigen", async () => {
    const { daut, liridon, site, material } = await aufbau();
    await buchung(site.id, liridon.id, material.id, 10, "12.50", "2026-09-01");
    // Preisimport nachher: die Buchung darf sich nicht rückwirkend ändern.
    await db.material.update({ where: { id: material.id }, data: { price: "99.00" } });

    const a = await auswertungBaustelle(daut.alsSitzung(), site.id, september);

    expect(a.materialkosten).toBe(125);
  });

  it("zieht den Rabatt einer Position ab", async () => {
    const { daut, liridon, site, material } = await aufbau();
    await buchung(site.id, liridon.id, material.id, 10, "12.50", "2026-09-01", "CATALOG", 50);

    const a = await auswertungBaustelle(daut.alsSitzung(), site.id, september);

    expect(a.materialkosten).toBe(62.5);
  });

  it("hält Material und VSI auseinander", async () => {
    const { daut, liridon, site, material } = await aufbau();
    await buchung(site.id, liridon.id, material.id, 10, "12.50", "2026-09-01");
    await buchung(site.id, liridon.id, null, 4, "30.00", "2026-09-02", "VSI");

    const a = await auswertungBaustelle(daut.alsSitzung(), site.id, september);

    expect(a.materialkosten).toBe(125);
    expect(a.vsiBetrag).toBe(120);
    expect(a.materialPositionen).toHaveLength(1);
    expect(a.vsiPositionen[0].bezeichnung).toBe("Kautschuk 13mm DN25 · Bogen 90°");
  });

  it("übergeht eine zurückgenommene Buchung", async () => {
    const { daut, liridon, site, material } = await aufbau();
    const b = await buchung(site.id, liridon.id, material.id, 10, "12.50", "2026-09-01");
    await db.materialBooking.update({
      where: { id: b.id },
      data: { deletedAt: new Date() },
    });

    const a = await auswertungBaustelle(daut.alsSitzung(), site.id, september);

    expect(a.materialkosten).toBe(0);
  });

  it("lässt Buchungen ausserhalb des Zeitraums weg", async () => {
    const { daut, liridon, site, material } = await aufbau();
    await buchung(site.id, liridon.id, material.id, 10, "12.50", "2026-08-31");

    const a = await auswertungBaustelle(daut.alsSitzung(), site.id, september);

    expect(a.materialkosten).toBe(0);
  });
});

describe("Übersicht über alle Baustellen", () => {
  it("nimmt auch abgeschlossene Baustellen auf", async () => {
    const { c, daut } = await aufbau();
    const fertig = await baustelle(c.id, "DONE");

    const zeilen = await auswertungAlleBaustellen(daut.alsSitzung(), september);

    expect(zeilen.map((z) => z.id)).toContain(fertig.id);
  });

  it("rechnet je Zeile dieselben Zahlen wie die Einzelansicht", async () => {
    const { daut, liridon, site, material } = await aufbau();
    await zeit(liridon.id, site.id, "2026-08-20", 7, 17);
    await zeit(liridon.id, site.id, "2026-09-01", 7, 17);
    await buchung(site.id, liridon.id, material.id, 10, "12.50", "2026-09-01");

    const [einzeln, zeilen] = await Promise.all([
      auswertungBaustelle(daut.alsSitzung(), site.id, september),
      auswertungAlleBaustellen(daut.alsSitzung(), september),
    ]);
    const zeile = zeilen.find((z) => z.id === site.id)!;

    expect(zeile.istImZeitraum).toBe(einzeln.istImZeitraum);
    expect(zeile.istGesamt).toBe(einzeln.istGesamt);
    expect(zeile.differenz).toBe(einzeln.differenz);
    expect(zeile.materialkosten).toBe(einzeln.materialkosten);
  });

  it("lässt Baustellen einer anderen Firma weg", async () => {
    const { daut } = await aufbau();
    const fremd = await firma("Flüma Klima AG");
    const fremdeBaustelle = await baustelle(fremd.id);

    const zeilen = await auswertungAlleBaustellen(daut.alsSitzung(), september);

    expect(zeilen.map((z) => z.id)).not.toContain(fremdeBaustelle.id);
  });
});

describe("Sichtbarkeit", () => {
  it("lässt eine mitarbeitende Person nicht an die Baustellenauswertung", async () => {
    const { liridon, site } = await aufbau();
    sitzung.user = liridon.alsSitzung();

    await expect(
      auswertungBaustelle(liridon.alsSitzung(), site.id, september),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      auswertungAlleBaustellen(liridon.alsSitzung(), september),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("lässt einen Vorgesetzten nicht an eine Baustelle einer anderen Firma", async () => {
    const { daut } = await aufbau();
    const fremd = await firma("Air Five AG");
    const fremdeBaustelle = await baustelle(fremd.id);

    await expect(
      auswertungBaustelle(daut.alsSitzung(), fremdeBaustelle.id, september),
    ).rejects.toThrow("FORBIDDEN");
  });
});
