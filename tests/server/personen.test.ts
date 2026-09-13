import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { firma, person, sitzung } from "./hilfen";

/* Die Lagerberechtigung unter /personen. */

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => {
    if (!sitzung.user) throw new Error("UNAUTHENTICATED");
    return sitzung.user;
  },
  getSession: async () => sitzung.user,
}));

const { setLagerrecht, setZugang } = await import("@/server/users");

async function aufbau() {
  const c = await firma();
  const daut = await person(c.id, "Daut", "ADMIN");
  const liridon = await person(c.id, "Liridon");
  sitzung.user = daut.alsSitzung();
  return { c, daut, liridon };
}

const recht = async (id: string) =>
  (await db.user.findUniqueOrThrow({ where: { id } })).canManageStock;

beforeEach(() => {
  sitzung.user = null;
});

describe("Lagerberechtigung setzen", () => {
  it("gibt sie einer mitarbeitenden Person und hält es im Protokoll fest", async () => {
    const { liridon } = await aufbau();

    expect(await setLagerrecht({ id: liridon.id, canManageStock: true })).toEqual({ ok: true });

    expect(await recht(liridon.id)).toBe(true);
    const p = await db.auditLog.findFirstOrThrow({ where: { entity: "User" } });
    expect(p.action).toBe("USER_STOCK_GRANTED");
    expect(p.entityId).toBe(liridon.id);
  });

  it("nimmt sie wieder weg", async () => {
    const { c } = await aufbau();
    const islom = await person(c.id, "Islom", "EMPLOYEE", true);

    expect(await setLagerrecht({ id: islom.id, canManageStock: false })).toEqual({ ok: true });

    expect(await recht(islom.id)).toBe(false);
    expect(
      await db.auditLog.count({ where: { action: "USER_STOCK_REVOKED" } }),
    ).toBe(1);
  });

  /* Die Rolle bleibt, was sie war. Wäre die Berechtigung Teil einer
   * dritten Rolle, ginge genau das verloren. */
  it("lässt die Rolle unberührt", async () => {
    const { liridon } = await aufbau();
    await setLagerrecht({ id: liridon.id, canManageStock: true });

    expect((await db.user.findUniqueOrThrow({ where: { id: liridon.id } })).role).toBe("EMPLOYEE");
  });

  /* Der Grund, warum das eine eigene Aktion ist und nicht in setZugang
   * mitläuft: ein Rollenwechsel darf die Berechtigung nicht lautlos
   * zurücksetzen. */
  it("überlebt einen Rollenwechsel über setZugang", async () => {
    const { liridon } = await aufbau();
    await setLagerrecht({ id: liridon.id, canManageStock: true });

    await setZugang({ id: liridon.id, role: "ADMIN", isActive: true });

    expect(await recht(liridon.id)).toBe(true);
  });
});

describe("Wer die Lagerberechtigung vergeben darf", () => {
  it("lässt eine mitarbeitende Person nichts vergeben, auch sich selbst nicht", async () => {
    const { liridon } = await aufbau();
    sitzung.user = liridon.alsSitzung();

    expect((await setLagerrecht({ id: liridon.id, canManageStock: true })).ok).toBe(false);
    expect(await recht(liridon.id)).toBe(false);
  });

  /* Auch eine mitarbeitende Person mit Lagerberechtigung bleibt
   * mitarbeitend: das Merkmal gilt fürs Lager und nicht für Konten. */
  it("lässt auch eine Person mit Lagerberechtigung nichts vergeben", async () => {
    const { c, liridon } = await aufbau();
    const islom = await person(c.id, "Islom", "EMPLOYEE", true);
    sitzung.user = islom.alsSitzung();

    expect((await setLagerrecht({ id: liridon.id, canManageStock: true })).ok).toBe(false);
    expect(await recht(liridon.id)).toBe(false);
  });

  it("greift nicht auf eine Person einer anderen Firma", async () => {
    await aufbau();
    const fremd = await firma("Flüma Klima AG");
    const fremdePerson = await person(fremd.id, "Fremd");

    expect((await setLagerrecht({ id: fremdePerson.id, canManageStock: true })).ok).toBe(false);
    expect(await recht(fremdePerson.id)).toBe(false);
  });
});
