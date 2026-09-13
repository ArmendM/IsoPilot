import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { artikel, baustelle, firma, lager, person, sitzung } from "./hilfen";

/* Wareneingang und Lagerverlauf. */

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => {
    if (!sitzung.user) throw new Error("UNAUTHENTICATED");
    return sitzung.user;
  },
  getSession: async () => sitzung.user,
}));

const { bucheWareneingang } = await import("@/server/lager");
const { lagerverlauf } = await import("@/server/lager-read");
const { saveMaterialBooking } = await import("@/server/bookings");

async function aufbau() {
  const c = await firma();
  const daut = await person(c.id, "Daut", "ADMIN");
  const liridon = await person(c.id, "Liridon");
  const site = await baustelle(c.id);
  const material = await artikel(c.id); // Preis 12.50, Lager 100
  sitzung.user = daut.alsSitzung();
  return { c, daut, liridon, site, material };
}

const deckung = async (id: string) => {
  const m = await db.material.findUniqueOrThrow({ where: { id } });
  return { bestand: Number(m.stock), fehlmenge: Number(m.shortfall) };
};

beforeEach(() => {
  sitzung.user = null;
});

describe("Wareneingang", () => {
  it("erhöht den Bestand und hält die Lieferung fest", async () => {
    const { material } = await aufbau();

    expect(await bucheWareneingang({ materialId: material.id, menge: 50, note: "LS 4711" })).toEqual({ ok: true });

    expect(await lager(material.id)).toBe(150);
    const b = await db.stockMovement.findFirstOrThrow();
    expect(b.reason).toBe("DELIVERY");
    expect(Number(b.delta)).toBe(50);
    expect(b.note).toBe("LS 4711");
  });

  /* Dieselbe Regel wie beim Rückgängigmachen: zuerst die Fehlmenge
   * tilgen, sonst stünde Ware im Lager und gleichzeitig eine Bestellung
   * offen, die es nicht mehr braucht. */
  it("tilgt zuerst eine offene Fehlmenge", async () => {
    const { material } = await aufbau();
    await db.material.update({ where: { id: material.id }, data: { stock: "0", shortfall: "30" } });

    await bucheWareneingang({ materialId: material.id, menge: 50, note: null });

    expect(await deckung(material.id)).toEqual({ bestand: 20, fehlmenge: 0 });
  });

  it("tilgt nur teilweise, wenn die Lieferung nicht reicht", async () => {
    const { material } = await aufbau();
    await db.material.update({ where: { id: material.id }, data: { stock: "0", shortfall: "30" } });

    await bucheWareneingang({ materialId: material.id, menge: 12, note: null });

    expect(await deckung(material.id)).toEqual({ bestand: 0, fehlmenge: 18 });
  });

  it("schreibt einen Protokolleintrag", async () => {
    const { material } = await aufbau();
    await bucheWareneingang({ materialId: material.id, menge: 5, note: null });

    expect(await db.auditLog.count({ where: { entity: "StockMovement", action: "CREATE" } })).toBe(1);
  });

  it("nimmt eine leere Notiz als keine Notiz", async () => {
    const { material } = await aufbau();
    await bucheWareneingang({ materialId: material.id, menge: 5, note: "   " });

    expect((await db.stockMovement.findFirstOrThrow()).note).toBeNull();
  });

  it("weist Menge null oder negativ ab", async () => {
    const { material } = await aufbau();
    expect((await bucheWareneingang({ materialId: material.id, menge: 0, note: null })).ok).toBe(false);
    expect((await bucheWareneingang({ materialId: material.id, menge: -5, note: null })).ok).toBe(false);
    expect(await lager(material.id)).toBe(100);
  });
});

describe("Berechtigung beim Wareneingang", () => {
  it("lässt eine mitarbeitende Person keinen Wareneingang erfassen", async () => {
    const { liridon, material } = await aufbau();
    sitzung.user = liridon.alsSitzung();

    expect((await bucheWareneingang({ materialId: material.id, menge: 50, note: null })).ok).toBe(false);
    expect(await lager(material.id)).toBe(100);
    expect(await db.stockMovement.count()).toBe(0);
  });

  /* Der Kern der Lagerberechtigung: annehmen kann die Lieferung, wer
   * gerade da ist, ohne dafür Vorgesetzter zu werden. */
  it("lässt eine Person mit Lagerberechtigung einen Wareneingang erfassen", async () => {
    const { c, material } = await aufbau();
    const islom = await person(c.id, "Islom", "EMPLOYEE", true);
    sitzung.user = islom.alsSitzung();

    expect(await bucheWareneingang({ materialId: material.id, menge: 50, note: "LS 12" })).toEqual({ ok: true });
    expect(await lager(material.id)).toBe(150);
    expect((await db.stockMovement.findFirstOrThrow()).userId).toBe(islom.id);
  });

  it("greift nicht auf einen Artikel einer anderen Firma", async () => {
    await aufbau();
    const fremd = await firma("Flüma Klima AG");
    const fremderArtikel = await db.material.create({
      data: { companyId: fremd.id, name: "Fremd", unit: "M2", price: "1.00", stock: "10" },
    });

    expect((await bucheWareneingang({ materialId: fremderArtikel.id, menge: 5, note: null })).ok).toBe(false);
    expect(await lager(fremderArtikel.id)).toBe(10);
  });
});

/* Der Bestand im Artikelformular ist eine Zählung. Eine offene Fehlmenge
 * gilt damit als erledigt, sonst bliebe ein Bestellbedarf stehen, den es
 * nach der Inventur nicht mehr gibt. */
describe("Bestand im Artikelformular zählen", () => {
  const speichern = async (id: string, lagerwert: number, preis = 12.5) =>
    (await import("@/server/materials")).saveMaterial({
      id,
      sku: "AF-19",
      name: "Armaflex AF 19 mm",
      categoryId: null,
      unit: "M2",
      preis,
      lager: lagerwert,
      mindestbestand: 10,
      fireClass: null,
    });

  it("löscht die Fehlmenge, wenn der Bestand geändert wird", async () => {
    const { material } = await aufbau();
    await db.material.update({ where: { id: material.id }, data: { stock: "0", shortfall: "30" } });

    expect(await speichern(material.id, 50)).toEqual({ ok: true });
    expect(await deckung(material.id)).toEqual({ bestand: 50, fehlmenge: 0 });
  });

  /* Sonst würde jedes Ändern des Preises stillschweigend einen
   * Bestellbedarf wegwerfen. */
  it("lässt die Fehlmenge stehen, wenn nur der Preis geändert wird", async () => {
    const { material } = await aufbau();
    await db.material.update({ where: { id: material.id }, data: { stock: "40", shortfall: "30" } });

    expect(await speichern(material.id, 40, 99)).toEqual({ ok: true });
    expect(await deckung(material.id)).toEqual({ bestand: 40, fehlmenge: 30 });
  });
});

describe("Lagerverlauf", () => {
  /* Der Kern des Warenausgangs: wohin ist die Ware gegangen. Die
   * Baustelle steht als Verknüpfung an der Bewegung, nicht als Satzteil
   * in der Notiz. */
  it("nennt bei einem Abgang die Baustelle", async () => {
    const { daut, site, material } = await aufbau();
    await saveMaterialBooking({
      siteId: site.id,
      userId: daut.id,
      materialId: material.id,
      menge: 10,
      bookedOn: "2026-09-14",
    });

    const [b] = await lagerverlauf(daut.alsSitzung());
    expect(b.grund).toBe("BOOKING");
    expect(b.menge).toBe(-10);
    expect(b.baustelle).toBe("Testobjekt");
    expect(b.baustelleId).toBe(site.id);
  });

  it("lässt die Baustelle bei einem Wareneingang leer", async () => {
    const { daut, material } = await aufbau();
    await bucheWareneingang({ materialId: material.id, menge: 50, note: "LS 4711" });

    const [b] = await lagerverlauf(daut.alsSitzung());
    expect(b.grund).toBe("DELIVERY");
    expect(b.baustelle).toBeNull();
    expect(b.notiz).toBe("LS 4711");
  });

  it("zeigt die neueste Bewegung zuerst", async () => {
    const { daut, material } = await aufbau();
    await bucheWareneingang({ materialId: material.id, menge: 10, note: "erste" });
    await bucheWareneingang({ materialId: material.id, menge: 20, note: "zweite" });

    const alle = await lagerverlauf(daut.alsSitzung());
    expect(alle.map((b) => b.notiz)).toEqual(["zweite", "erste"]);
  });

  it("filtert auf eine Baustelle", async () => {
    const { c, daut, site, material } = await aufbau();
    const zweite = await baustelle(c.id);
    await bucheWareneingang({ materialId: material.id, menge: 10, note: null });
    for (const s of [site, zweite])
      await saveMaterialBooking({
        siteId: s.id,
        userId: daut.id,
        materialId: material.id,
        menge: 5,
        bookedOn: "2026-09-14",
      });

    const nurErste = await lagerverlauf(daut.alsSitzung(), { siteId: site.id });
    expect(nurErste).toHaveLength(1);
    expect(nurErste[0].baustelleId).toBe(site.id);
  });

  it("zeigt keine Bewegungen einer anderen Firma", async () => {
    const { material } = await aufbau();
    await bucheWareneingang({ materialId: material.id, menge: 10, note: null });

    const fremd = await firma("Flüma Klima AG");
    const fremdePerson = await person(fremd.id, "Fremd", "ADMIN");

    expect(await lagerverlauf(fremdePerson.alsSitzung())).toEqual([]);
  });
});
