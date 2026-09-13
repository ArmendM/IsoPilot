import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { artikel, baustelle, firma, lager, person, sitzung } from "./hilfen";

/* Eine bestehende Materialbuchung ändern, M3f. Deckt die beiden
 * Entscheide ab: nur die Differenz ins Lager, und der eingefrorene Preis
 * bleibt, solange der Artikel derselbe ist. */

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => {
    if (!sitzung.user) throw new Error("UNAUTHENTICATED");
    return sitzung.user;
  },
  getSession: async () => sitzung.user,
}));

const { saveMaterialBooking, updateMaterialBooking } = await import("@/server/bookings");

const HEUTE = "2026-09-13";

async function aufbau(status: "OPEN" | "PAUSED" | "DONE" = "OPEN") {
  const c = await firma();
  const liridon = await person(c.id, "Liridon");
  const daut = await person(c.id, "Daut", "ADMIN");
  const site = await baustelle(c.id, status);
  const material = await artikel(c.id); // 12.50, Lager 100
  sitzung.user = liridon.alsSitzung();

  await saveMaterialBooking({
    siteId: site.id,
    userId: liridon.id,
    materialId: material.id,
    menge: 10,
    bookedOn: HEUTE,
  });
  const buchung = await db.materialBooking.findFirstOrThrow();
  return { c, liridon, daut, site, material, buchung };
}

const aendern = (id: string, materialId: string, menge: number, bookedOn = HEUTE) =>
  updateMaterialBooking({ id, materialId, menge, bookedOn });

beforeEach(() => {
  sitzung.user = null;
});

describe("Menge ändern", () => {
  it("bucht bei einer Erhöhung nur die Differenz ab", async () => {
    const { material, buchung } = await aufbau();
    expect(await lager(material.id)).toBe(90);

    expect(await aendern(buchung.id, material.id, 12)).toEqual({ ok: true });

    expect(await lager(material.id)).toBe(88);
    expect(Number((await db.materialBooking.findUniqueOrThrow({ where: { id: buchung.id } })).quantity)).toBe(12);
  });

  it("bucht bei einer Verringerung die Differenz zurück", async () => {
    const { material, buchung } = await aufbau();
    await aendern(buchung.id, material.id, 4);
    expect(await lager(material.id)).toBe(96);
  });

  /* Der Sinn der Übung: keine zweite volle Abgangsbuchung, sondern eine
   * Bewegung über die Differenz, und zwar mit eigenem Grund. */
  it("schreibt genau eine Lagerbewegung mit dem Grund BOOKING_CHANGE", async () => {
    const { material, buchung } = await aufbau();
    await aendern(buchung.id, material.id, 12);

    const bewegungen = await db.stockMovement.findMany({ orderBy: { id: "asc" } });
    expect(bewegungen).toHaveLength(2); // die ursprüngliche Buchung plus die Korrektur
    expect(bewegungen[1].reason).toBe("BOOKING_CHANGE");
    expect(Number(bewegungen[1].delta)).toBe(-2);
  });

  it("erzeugt ohne Mengenänderung keine Lagerbewegung", async () => {
    const { material, buchung } = await aufbau();
    await aendern(buchung.id, material.id, 10, "2026-09-14");

    expect(await db.stockMovement.count({ where: { reason: "BOOKING_CHANGE" } })).toBe(0);
    expect(await lager(material.id)).toBe(90);
  });

  it("legt keine zweite Buchung an", async () => {
    const { material, buchung } = await aufbau();
    await aendern(buchung.id, material.id, 12);
    expect(await db.materialBooking.count()).toBe(1);
  });
});

describe("Preis beim Ändern", () => {
  /* Die Einfrier-Regel: eine Mengenkorrektur ist dieselbe Buchung, ein
   * zwischenzeitlicher Preisimport darf sie nicht rückwirkend verändern. */
  it("behält den eingefrorenen Preis, wenn der Artikel derselbe bleibt", async () => {
    const { material, buchung } = await aufbau();
    await db.material.update({ where: { id: material.id }, data: { price: "99.00" } });

    await aendern(buchung.id, material.id, 12);

    expect(Number((await db.materialBooking.findUniqueOrThrow({ where: { id: buchung.id } })).unitPrice)).toBe(12.5);
  });

  it("holt den heutigen Preis beim Wechsel auf einen anderen Artikel", async () => {
    const { c, material, buchung } = await aufbau();
    const anderer = await db.material.create({
      data: { companyId: c.id, name: "Rockwool", unit: "LFM", price: "20.00", stock: "50" },
    });

    await aendern(buchung.id, anderer.id, 3);

    const nachher = await db.materialBooking.findUniqueOrThrow({ where: { id: buchung.id } });
    expect(Number(nachher.unitPrice)).toBe(20);
    expect(nachher.unit).toBe("LFM");
    // Die alte Menge geht ganz zurück, die neue ganz ab.
    expect(await lager(material.id)).toBe(100);
    expect(await lager(anderer.id)).toBe(47);
  });
});

describe("Geschlossene Baustellen und Monatsabschluss", () => {
  it.each(["PAUSED", "DONE"] as const)("ändert auf einer %s-Baustelle nichts", async (status) => {
    const { site, material, buchung } = await aufbau();
    await db.site.update({ where: { id: site.id }, data: { status } });

    const r = await aendern(buchung.id, material.id, 12);
    expect(r.ok).toBe(false);
    expect(await lager(material.id)).toBe(90);
    expect(Number((await db.materialBooking.findUniqueOrThrow({ where: { id: buchung.id } })).quantity)).toBe(10);
  });

  it("ändert in einem abgeschlossenen Monat nichts", async () => {
    const { c, material, buchung } = await aufbau();
    await db.monthLock.create({ data: { companyId: c.id, month: "2026-09", isLocked: true } });

    expect((await aendern(buchung.id, material.id, 12)).ok).toBe(false);
    expect(await lager(material.id)).toBe(90);
  });

  /* Sonst liesse sich ein Eintrag aus einem gesperrten Monat
   * herausschieben und die Sperre wäre wertlos. */
  it("schiebt eine Buchung nicht in einen gesperrten Monat", async () => {
    const { c, material, buchung } = await aufbau();
    await db.monthLock.create({ data: { companyId: c.id, month: "2026-10", isLocked: true } });

    const r = await aendern(buchung.id, material.id, 10, "2026-10-05");
    expect(r.ok).toBe(false);
    expect((await db.materialBooking.findUniqueOrThrow({ where: { id: buchung.id } })).bookedOn.toISOString().slice(0, 10)).toBe(HEUTE);
  });
});

describe("Berechtigung", () => {
  it("lässt eine mitarbeitende Person keine fremde Buchung ändern", async () => {
    const { liridon, daut, site, material } = await aufbau();
    sitzung.user = daut.alsSitzung();
    await saveMaterialBooking({
      siteId: site.id,
      userId: daut.id,
      materialId: material.id,
      menge: 5,
      bookedOn: HEUTE,
    });
    const fremde = await db.materialBooking.findFirstOrThrow({ where: { userId: daut.id } });

    sitzung.user = liridon.alsSitzung();
    expect((await aendern(fremde.id, material.id, 8)).ok).toBe(false);
    expect(Number((await db.materialBooking.findUniqueOrThrow({ where: { id: fremde.id } })).quantity)).toBe(5);
  });

  it("lässt einen Vorgesetzten eine fremde Buchung ändern", async () => {
    const { daut, material, buchung } = await aufbau();
    sitzung.user = daut.alsSitzung();

    expect(await aendern(buchung.id, material.id, 7)).toEqual({ ok: true });
  });

  it("ändert keine Buchung einer anderen Firma", async () => {
    const { material, buchung } = await aufbau();
    const fremd = await firma("Flüma Klima AG");
    const fremdePerson = await person(fremd.id, "Fremd", "ADMIN");
    sitzung.user = fremdePerson.alsSitzung();

    expect((await aendern(buchung.id, material.id, 99)).ok).toBe(false);
    expect(await lager(material.id)).toBe(90);
  });

  it("ändert keine bereits zurückgenommene Buchung", async () => {
    const { material, buchung } = await aufbau();
    await db.materialBooking.update({ where: { id: buchung.id }, data: { deletedAt: new Date() } });

    expect((await aendern(buchung.id, material.id, 12)).ok).toBe(false);
  });
});

describe("Protokoll", () => {
  it("hält die Änderung mit Vorher und Nachher fest", async () => {
    const { material, buchung } = await aufbau();
    await aendern(buchung.id, material.id, 12);

    const eintrag = await db.auditLog.findFirstOrThrow({
      where: { entity: "MaterialBooking", action: "UPDATE" },
    });
    expect(eintrag.entityId).toBe(buchung.id);
    expect(Number((eintrag.before as { quantity: string }).quantity)).toBe(10);
    expect(Number((eintrag.after as { quantity: string }).quantity)).toBe(12);
  });
});
