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

const { bucheWareneingang, inventur } = await import("@/server/lager");
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

/* Der Bestand ist im Artikelformular nicht mehr schreibbar. Er bewegt
 * sich nur noch über Wareneingang, Buchung, Rückgabe und Inventur, jede
 * mit einer Zeile im Verlauf. */
describe("Artikelformular rührt den Bestand nicht mehr an", () => {
  const speichern = async (id: string | undefined, lagerwert: number, preis = 12.5) =>
    (await import("@/server/materials")).saveMaterial({
      id,
      sku: id ? "AF-19" : "AF-NEU",
      name: id ? "Armaflex AF 19 mm" : "Armaflex AF 25 mm",
      categoryId: null,
      unit: "M2",
      preis,
      lager: lagerwert,
      mindestbestand: 10,
      fireClass: null,
    });

  it("lässt Bestand und Fehlmenge stehen, auch wenn eine andere Zahl kommt", async () => {
    const { material } = await aufbau();
    await db.material.update({ where: { id: material.id }, data: { stock: "0", shortfall: "30" } });

    expect(await speichern(material.id, 50)).toEqual({ ok: true });

    expect(await deckung(material.id)).toEqual({ bestand: 0, fehlmenge: 30 });
    expect(await db.stockMovement.count()).toBe(0);
  });

  it("speichert die übrigen Felder weiterhin", async () => {
    const { material } = await aufbau();
    expect(await speichern(material.id, 0, 99)).toEqual({ ok: true });

    const m = await db.material.findUniqueOrThrow({ where: { id: material.id } });
    expect(Number(m.price)).toBe(99);
    expect(await lager(material.id)).toBe(100);
  });

  /* Ein neuer Artikel darf einen Anfangsbestand haben, sonst liefe die
   * erste Buchung sofort in eine Fehlmenge. Er bekommt aber eine
   * Bewegung: sonst stünde gleich zu Beginn eine Menge im Lager, die im
   * Verlauf nirgends herkommt. */
  it("legt einen Anfangsbestand mit einer Bewegung an", async () => {
    await aufbau();

    expect(await speichern(undefined, 40)).toEqual({ ok: true });

    const neu = await db.material.findFirstOrThrow({ where: { sku: "AF-NEU" } });
    expect(Number(neu.stock)).toBe(40);
    const b = await db.stockMovement.findFirstOrThrow({ where: { materialId: neu.id } });
    expect(Number(b.delta)).toBe(40);
    expect(b.reason).toBe("CORRECTION");
  });

  it("schreibt beim Anlegen ohne Anfangsbestand keine Bewegung", async () => {
    await aufbau();
    await speichern(undefined, 0);

    expect(await db.stockMovement.count()).toBe(0);
  });
});

describe("Inventur", () => {
  it("übernimmt den gezählten Bestand und hält die Differenz fest", async () => {
    const { material } = await aufbau(); // Lager 100

    expect(await inventur({ materialId: material.id, gezaehlt: 94, note: "Jahresinventur" })).toEqual({ ok: true });

    expect(await deckung(material.id)).toEqual({ bestand: 94, fehlmenge: 0 });
    const b = await db.stockMovement.findFirstOrThrow();
    expect(Number(b.delta)).toBe(-6);
    expect(b.reason).toBe("CORRECTION");
    expect(b.note).toBe("Inventur, gezählt 94, Jahresinventur");
  });

  /* Was gezählt ist, ist da: eine offene Fehlmenge ist damit erledigt,
   * sonst stünden Bestand und Fehlmenge zugleich über null. */
  it("erledigt eine offene Fehlmenge", async () => {
    const { material } = await aufbau();
    await db.material.update({ where: { id: material.id }, data: { stock: "0", shortfall: "30" } });

    await inventur({ materialId: material.id, gezaehlt: 10, note: null });

    expect(await deckung(material.id)).toEqual({ bestand: 10, fehlmenge: 0 });
  });

  /* Der Kern: die Bewegung trägt die Berichtigung der Bücher, nicht nur
   * die des Bestands. Über den Bestand allein wären es +10, und die
   * getilgten 30 verschwänden lautlos aus dem Verlauf. */
  it("rechnet die getilgte Fehlmenge in die Bewegung ein", async () => {
    const { material } = await aufbau();
    await db.material.update({ where: { id: material.id }, data: { stock: "0", shortfall: "30" } });

    await inventur({ materialId: material.id, gezaehlt: 10, note: null });

    expect(Number((await db.stockMovement.findFirstOrThrow()).delta)).toBe(40);
  });

  /* Auch hier ändert sich der Bestand nicht, die Bücher aber schon. Ohne
   * Bewegung bliebe genau der Sprung unerklärt, um den es hier geht. */
  it("hält auch das Wegfallen einer Fehlmenge allein fest", async () => {
    const { material } = await aufbau();
    await db.material.update({ where: { id: material.id }, data: { stock: "0", shortfall: "30" } });

    await inventur({ materialId: material.id, gezaehlt: 0, note: null });

    expect(await deckung(material.id)).toEqual({ bestand: 0, fehlmenge: 0 });
    expect(Number((await db.stockMovement.findFirstOrThrow()).delta)).toBe(30);
  });

  it("schreibt keine Bewegung, wenn die Zählung den Bestand bestätigt", async () => {
    const { material } = await aufbau();

    expect(await inventur({ materialId: material.id, gezaehlt: 100, note: null })).toEqual({ ok: true });

    expect(await db.stockMovement.count()).toBe(0);
    expect(await lager(material.id)).toBe(100);
  });

  it("nimmt eine Zählung auf null an", async () => {
    const { material } = await aufbau();

    await inventur({ materialId: material.id, gezaehlt: 0, note: null });

    expect(await lager(material.id)).toBe(0);
  });

  it("weist einen negativen Wert ab", async () => {
    const { material } = await aufbau();

    expect((await inventur({ materialId: material.id, gezaehlt: -5, note: null })).ok).toBe(false);
    expect(await lager(material.id)).toBe(100);
  });

  it("schreibt einen Protokolleintrag", async () => {
    const { material } = await aufbau();
    await inventur({ materialId: material.id, gezaehlt: 94, note: null });

    expect(await db.auditLog.count({ where: { entity: "StockMovement" } })).toBe(1);
  });
});

describe("Berechtigung bei der Inventur", () => {
  it("lässt eine mitarbeitende Person ohne Lagerberechtigung nicht zählen", async () => {
    const { liridon, material } = await aufbau();
    sitzung.user = liridon.alsSitzung();

    expect((await inventur({ materialId: material.id, gezaehlt: 94, note: null })).ok).toBe(false);
    expect(await lager(material.id)).toBe(100);
  });

  it("lässt eine Person mit Lagerberechtigung zählen", async () => {
    const { c, material } = await aufbau();
    const islom = await person(c.id, "Islom", "EMPLOYEE", true);
    sitzung.user = islom.alsSitzung();

    expect(await inventur({ materialId: material.id, gezaehlt: 94, note: null })).toEqual({ ok: true });
    expect(await lager(material.id)).toBe(94);
  });

  it("greift nicht auf einen Artikel einer anderen Firma", async () => {
    await aufbau();
    const fremd = await firma("Flüma Klima AG");
    const fremderArtikel = await db.material.create({
      data: { companyId: fremd.id, name: "Fremd", unit: "M2", price: "1.00", stock: "10" },
    });

    expect((await inventur({ materialId: fremderArtikel.id, gezaehlt: 5, note: null })).ok).toBe(false);
    expect(await lager(fremderArtikel.id)).toBe(10);
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
