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

/* Der Bestand geht nie ins Minus, gebucht wird trotzdem. Was nicht
 * gedeckt ist, steht als Fehlmenge und ist das, was bestellt werden muss. */
describe("Fehlmenge statt negativem Lager", () => {
  const deckung = async (id: string) => {
    const m = await db.material.findUniqueOrThrow({ where: { id } });
    return { bestand: Number(m.stock), fehlmenge: Number(m.shortfall) };
  };

  it("bucht bis genau auf null ohne Fehlmenge", async () => {
    const { liridon, site, material } = await aufbau();
    expect(await buchen(site.id, liridon.id, material.id, 100)).toEqual({ ok: true });
    expect(await deckung(material.id)).toEqual({ bestand: 0, fehlmenge: 0 });
  });

  it("lässt eine Buchung über den Bestand hinaus zu und merkt sich die Fehlmenge", async () => {
    const { liridon, site, material } = await aufbau();
    expect(await buchen(site.id, liridon.id, material.id, 130)).toEqual({ ok: true });

    expect(await deckung(material.id)).toEqual({ bestand: 0, fehlmenge: 30 });
    // Die Buchung selbst trägt die volle Menge, sie ist die Grundlage der Kosten.
    expect(Number((await db.materialBooking.findFirstOrThrow()).quantity)).toBe(130);
  });

  it("bucht bei leerem Lager alles als Fehlmenge", async () => {
    const { liridon, site, material } = await aufbau();
    await db.material.update({ where: { id: material.id }, data: { stock: "0" } });

    expect(await buchen(site.id, liridon.id, material.id, 12)).toEqual({ ok: true });
    expect(await deckung(material.id)).toEqual({ bestand: 0, fehlmenge: 12 });
  });

  /* Die Bewegung hält die tatsächliche Bestandsänderung fest, nicht die
   * gebuchte Menge. Sonst ginge die Summe der Bewegungen nicht mehr mit
   * dem Bestand auf. */
  it("schreibt die Lagerbewegung über den echten Abgang, nicht über die Menge", async () => {
    const { liridon, site, material } = await aufbau();
    await buchen(site.id, liridon.id, material.id, 130);

    const bewegungen = await db.stockMovement.findMany();
    expect(bewegungen).toHaveLength(1);
    expect(Number(bewegungen[0].delta)).toBe(-100);
  });

  it("schreibt gar keine Bewegung, wenn das Lager nichts hergibt", async () => {
    const { liridon, site, material } = await aufbau();
    await db.material.update({ where: { id: material.id }, data: { stock: "0" } });
    await buchen(site.id, liridon.id, material.id, 12);

    expect(await db.stockMovement.count()).toBe(0);
  });

  it("häuft Fehlmengen über mehrere Buchungen auf", async () => {
    const { liridon, site, material } = await aufbau();
    await buchen(site.id, liridon.id, material.id, 80);
    await buchen(site.id, liridon.id, material.id, 50);

    expect(await deckung(material.id)).toEqual({ bestand: 0, fehlmenge: 30 });
  });

  /* Zuerst die Fehlmenge tilgen: sonst stünde Ware im Lager und
   * gleichzeitig eine Bestellung offen, die es nicht mehr braucht. */
  it("tilgt beim Rückgängigmachen zuerst die Fehlmenge", async () => {
    const { liridon, site, material } = await aufbau();
    await buchen(site.id, liridon.id, material.id, 130);
    const b = await db.materialBooking.findFirstOrThrow();

    expect(await deleteMaterialBooking(b.id)).toEqual({ ok: true });
    expect(await deckung(material.id)).toEqual({ bestand: 100, fehlmenge: 0 });
  });

  it("stellt nach Buchen und Rückgängigmachen genau den Ausgangszustand her", async () => {
    const { liridon, site, material } = await aufbau();
    await db.material.update({ where: { id: material.id }, data: { stock: "0", shortfall: "7" } });

    await buchen(site.id, liridon.id, material.id, 9);
    const b = await db.materialBooking.findFirstOrThrow();
    await deleteMaterialBooking(b.id);

    expect(await deckung(material.id)).toEqual({ bestand: 0, fehlmenge: 7 });
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
