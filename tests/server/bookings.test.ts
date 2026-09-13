import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { artikel, baustelle, firma, lager, person, sitzung } from "./hilfen";

/* Der Schreibpfad der Materialbuchung gegen ein echtes Postgres. Deckt
 * die vier Befunde aus der M3c-Durchsicht ab, die vorher ungetestet
 * behoben wurden. */

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => {
    if (!sitzung.user) throw new Error("UNAUTHENTICATED");
    return sitzung.user;
  },
  getSession: async () => sitzung.user,
  requireAdmin: async () => {
    if (!sitzung.user) throw new Error("UNAUTHENTICATED");
    if (sitzung.user.role !== "ADMIN") throw new Error("FORBIDDEN");
    return sitzung.user;
  },
}));

const { saveMaterialBooking, deleteMaterialBooking } = await import("@/server/bookings");

const HEUTE = "2026-09-13";

async function aufbau(status: "OPEN" | "PAUSED" | "DONE" = "OPEN") {
  const c = await firma();
  const liridon = await person(c.id, "Liridon");
  const daut = await person(c.id, "Daut", "ADMIN");
  const site = await baustelle(c.id, status);
  const material = await artikel(c.id);
  sitzung.user = liridon.alsSitzung();
  return { c, liridon, daut, site, material };
}

const buchen = (siteId: string, userId: string, materialId: string, menge: number) =>
  saveMaterialBooking({ siteId, userId, materialId, menge, bookedOn: HEUTE });

beforeEach(() => {
  sitzung.user = null;
});

describe("Material buchen", () => {
  it("schreibt Buchung, Lagerabgang und Protokoll in einem Zug", async () => {
    const { liridon, site, material } = await aufbau();

    expect(await buchen(site.id, liridon.id, material.id, 10)).toEqual({ ok: true });

    const b = await db.materialBooking.findFirstOrThrow();
    expect(Number(b.quantity)).toBe(10);
    expect(b.kind).toBe("CATALOG");
    expect(await lager(material.id)).toBe(90);
    expect(await db.stockMovement.count({ where: { reason: "BOOKING" } })).toBe(1);
    expect(await db.auditLog.count({ where: { entity: "MaterialBooking", action: "CREATE" } })).toBe(1);
  });

  /* Die Regel aus CLAUDE.md: ein späterer Preisimport darf abgeschlossene
   * Baustellen nicht rückwirkend verändern. */
  it("friert den Preis ein und folgt einem späteren Preisimport nicht", async () => {
    const { liridon, site, material } = await aufbau();
    await buchen(site.id, liridon.id, material.id, 4);

    await db.material.update({ where: { id: material.id }, data: { price: "99.00" } });

    const b = await db.materialBooking.findFirstOrThrow();
    expect(Number(b.unitPrice)).toBe(12.5);
  });

  it("übernimmt auch die Einheit aus dem Artikel", async () => {
    const { liridon, site, material } = await aufbau();
    await buchen(site.id, liridon.id, material.id, 1);
    expect((await db.materialBooking.findFirstOrThrow()).unit).toBe("M2");
  });
});

describe("Geschlossene Baustellen", () => {
  it.each(["PAUSED", "DONE"] as const)("nimmt auf einer %s-Baustelle nichts an", async (status) => {
    const { liridon, site, material } = await aufbau(status);

    const r = await buchen(site.id, liridon.id, material.id, 5);
    expect(r.ok).toBe(false);

    // Nichts darf durchgesickert sein, auch nicht der Lagerabgang.
    expect(await db.materialBooking.count()).toBe(0);
    expect(await lager(material.id)).toBe(100);
    expect(await db.stockMovement.count()).toBe(0);
  });

  it("lässt eine bestehende Buchung auch nach dem Abschliessen zurücknehmen", async () => {
    const { liridon, site, material } = await aufbau();
    await buchen(site.id, liridon.id, material.id, 10);
    await db.site.update({ where: { id: site.id }, data: { status: "DONE" } });

    const b = await db.materialBooking.findFirstOrThrow();
    expect(await deleteMaterialBooking(b.id)).toEqual({ ok: true });
    expect(await lager(material.id)).toBe(100);
  });
});

describe("Rückgängig machen", () => {
  it("bucht die Menge zurück und protokolliert den Zugang", async () => {
    const { liridon, site, material } = await aufbau();
    await buchen(site.id, liridon.id, material.id, 30);
    expect(await lager(material.id)).toBe(70);

    const b = await db.materialBooking.findFirstOrThrow();
    expect(await deleteMaterialBooking(b.id)).toEqual({ ok: true });

    expect(await lager(material.id)).toBe(100);
    expect(await db.stockMovement.count({ where: { reason: "RETURN" } })).toBe(1);
    // Soft Delete: die Zeile bleibt, damit das Protokoll aufgeht.
    expect((await db.materialBooking.findUniqueOrThrow({ where: { id: b.id } })).deletedAt).not.toBeNull();
  });

  /* Der Befund: zwei gleichzeitige Klicks hätten die Menge zweimal
   * gutgeschrieben, weil die Bedingung im Code stand statt im WHERE. */
  it("schreibt bei zwei gleichzeitigen Klicks nur einmal gut", async () => {
    const { liridon, site, material } = await aufbau();
    await buchen(site.id, liridon.id, material.id, 30);
    const b = await db.materialBooking.findFirstOrThrow();

    const [a, z] = await Promise.all([
      deleteMaterialBooking(b.id),
      deleteMaterialBooking(b.id),
    ]);

    expect([a.ok, z.ok].filter(Boolean)).toHaveLength(1);
    expect(await lager(material.id)).toBe(100);
    expect(await db.stockMovement.count({ where: { reason: "RETURN" } })).toBe(1);
  });

  it("macht dasselbe auch nacheinander nur einmal", async () => {
    const { liridon, site, material } = await aufbau();
    await buchen(site.id, liridon.id, material.id, 30);
    const b = await db.materialBooking.findFirstOrThrow();

    expect(await deleteMaterialBooking(b.id)).toEqual({ ok: true });
    expect((await deleteMaterialBooking(b.id)).ok).toBe(false);
    expect(await lager(material.id)).toBe(100);
  });
});

describe("Sichtbarkeit und Berechtigung", () => {
  it("lässt eine mitarbeitende Person nicht für jemand anderen buchen", async () => {
    const { liridon, daut, site, material } = await aufbau();
    sitzung.user = liridon.alsSitzung();

    const r = await buchen(site.id, daut.id, material.id, 5);
    expect(r).toEqual({ ok: false, error: "Dafür fehlt dir die Berechtigung." });
    expect(await db.materialBooking.count()).toBe(0);
  });

  it("lässt einen Vorgesetzten für eine andere Person buchen", async () => {
    const { liridon, daut, site, material } = await aufbau();
    sitzung.user = daut.alsSitzung();

    expect(await buchen(site.id, liridon.id, material.id, 5)).toEqual({ ok: true });
    expect((await db.materialBooking.findFirstOrThrow()).userId).toBe(liridon.id);
  });

  it("lässt eine mitarbeitende Person keine fremde Buchung zurücknehmen", async () => {
    const { liridon, daut, site, material } = await aufbau();
    sitzung.user = daut.alsSitzung();
    await buchen(site.id, daut.id, material.id, 5);
    const b = await db.materialBooking.findFirstOrThrow();

    sitzung.user = liridon.alsSitzung();
    expect((await deleteMaterialBooking(b.id)).ok).toBe(false);
    expect(await lager(material.id)).toBe(95);
  });

  it("greift nicht über die Firmengrenze", async () => {
    const { liridon, material } = await aufbau();
    const fremd = await firma("Flüma Klima AG");
    const fremdeBaustelle = await baustelle(fremd.id);

    const r = await buchen(fremdeBaustelle.id, liridon.id, material.id, 5);
    expect(r).toEqual({ ok: false, error: "Baustelle nicht gefunden." });
  });
});

describe("Monatsabschluss", () => {
  it("nimmt in einem abgeschlossenen Monat nichts mehr an", async () => {
    const { c, liridon, site, material } = await aufbau();
    await db.monthLock.create({ data: { companyId: c.id, month: "2026-09", isLocked: true } });

    const r = await buchen(site.id, liridon.id, material.id, 5);
    expect(r.ok).toBe(false);
    expect(await db.materialBooking.count()).toBe(0);
    expect(await lager(material.id)).toBe(100);
  });

  /* Die Sperre gilt auch für Vorgesetzte, sonst ist sie wertlos. */
  it("gilt auch für einen Vorgesetzten", async () => {
    const { c, daut, site, material } = await aufbau();
    await db.monthLock.create({ data: { companyId: c.id, month: "2026-09", isLocked: true } });
    sitzung.user = daut.alsSitzung();

    expect((await buchen(site.id, daut.id, material.id, 5)).ok).toBe(false);
  });
});
