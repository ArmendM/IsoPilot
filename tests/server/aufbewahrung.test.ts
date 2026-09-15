import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { firma, person } from "./hilfen";

/* Die Aufbewahrung, M4f, gegen ein echtes Postgres.
 *
 * Der wichtigste Test hier ist der, der nachweist, dass **nichts**
 * geschieht: ein Zeiteintrag von vor zwanzig Jahren bleibt stehen. Zehn
 * Jahre nach OR 958f sind eine Pflicht zum Aufbewahren, nicht einer zum
 * Löschen, und ein Job, der das verwechselt, tut es unwiederbringlich.
 *
 * Die Zeit wird nicht eingefroren, sondern als Wert hineingereicht:
 * `aufbewahrungAnwenden(jetzt)`. Ein Job, dem man das Jetzt sagen kann,
 * braucht keine gestellte Uhr, und der Testlauf bleibt lesbar. */

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { aufbewahrungAnwenden } = await import("@/server/aufbewahrung");

const HEUTE = new Date("2026-09-15T03:00:00Z");
const tag = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Ein Zeiteintrag an einem bestimmten Arbeitstag. */
async function zeiteintrag(userId: string, workDate: string) {
  return db.timeEntry.create({
    data: {
      userId,
      createdById: userId,
      workDate: tag(workDate),
      startedAt: new Date(`${workDate}T07:00:00Z`),
      endedAt: new Date(`${workDate}T16:00:00Z`),
    },
  });
}

/** Eine Krankmeldung mit Notiz, deren Frist auf `clearAt` fällt. */
async function krankmeldung(userId: string, am: string, clearAt: string | null) {
  return db.absence.create({
    data: {
      userId,
      type: "SICK",
      startDate: tag(am),
      endDate: tag(am),
      workingDays: "1",
      status: "APPROVED",
      note: "Grippe",
      noteClearAt: clearAt ? tag(clearAt) : null,
    },
  });
}

/** Ein Eintrag im Audit-Log mit gesetztem Zeitstempel. */
async function protokoll(companyId: string, actorId: string, action: string, am: string) {
  return db.auditLog.create({
    data: {
      companyId,
      actorId,
      action,
      entity: "User",
      entityId: actorId,
      createdAt: new Date(`${am}T08:00:00Z`),
    },
  });
}

async function aufbau() {
  const c = await firma();
  const liridon = await person(c.id, "Liridon");
  return { c, liridon };
}

describe("Zeiteinträge, zehn Jahre", () => {
  it("löscht nichts, auch wenn die Frist längst abgelaufen ist", async () => {
    /* Der wichtigste Test dieser Datei, und er hält ein Nichtstun fest.
     *
     * OR 958f sagt, wie lange Geschäftsunterlagen dableiben müssen, nicht
     * wann sie weg sollen. Ein Job, der nach zehn Jahren löscht, erfindet
     * eine Pflicht, die es nicht gibt. Wann alte Stunden gehen,
     * entscheidet der Betrieb.
     *
     * Ein früherer Anlauf in M4f hat genau das verwechselt und gelöscht. */
    const { liridon } = await aufbau();

    const uralt = await zeiteintrag(liridon.id, "2006-01-02");
    const knappDrueber = await zeiteintrag(liridon.id, "2016-09-14");
    const heute = await zeiteintrag(liridon.id, "2026-09-14");

    await aufbewahrungAnwenden(HEUTE);

    for (const e of [uralt, knappDrueber, heute])
      expect(await db.timeEntry.findUnique({ where: { id: e.id } })).not.toBeNull();
    expect(await db.timeEntry.count()).toBe(3);
  });

});

describe("Krankheitsnotizen, 18 Monate", () => {
  it("leert die Notiz und lässt den Eintrag stehen", async () => {
    /* Dass jemand krank war, ist eine Tatsache und gehört zu den
     * Geschäftsunterlagen. Warum er krank war, sind besonders
     * schützenswerte Personendaten nach revDSG und gehen nach
     * 18 Monaten. */
    const { liridon } = await aufbau();
    const alt = await krankmeldung(liridon.id, "2025-01-10", "2026-07-10");
    const neu = await krankmeldung(liridon.id, "2026-08-01", "2028-02-01");

    const lauf = await aufbewahrungAnwenden(HEUTE);
    expect(lauf.krankheitsnotizen).toBe(1);

    const a = await db.absence.findUniqueOrThrow({ where: { id: alt.id } });
    expect(a).not.toBeNull();
    expect(a.note).toBeNull();
    expect(a.noteClearAt).toBeNull();

    const b = await db.absence.findUniqueOrThrow({ where: { id: neu.id } });
    expect(b.note).toBe("Grippe");
  });

  it("zählt beim zweiten Lauf nicht noch einmal mit", async () => {
    // Ohne `note: { not: null }` fände jeder Lauf dieselben, längst
    // geleerten Einträge wieder, und die Zahl im Journal wüchse, ohne
    // dass etwas geschähe.
    const { liridon } = await aufbau();
    await krankmeldung(liridon.id, "2025-01-10", "2026-07-10");

    expect((await aufbewahrungAnwenden(HEUTE)).krankheitsnotizen).toBe(1);
    expect((await aufbewahrungAnwenden(HEUTE)).krankheitsnotizen).toBe(0);
  });
});

describe("Anmeldeprotokolle, 90 Tage", () => {
  it("löscht alte Anmeldungen", async () => {
    const { c, liridon } = await aufbau();
    const alt = await protokoll(c.id, liridon.id, "LOGIN_OIDC", "2026-06-01");
    const neu = await protokoll(c.id, liridon.id, "LOGIN_OIDC", "2026-09-01");

    const lauf = await aufbewahrungAnwenden(HEUTE);
    expect(lauf.anmeldeprotokolle).toBe(1);

    expect(await db.auditLog.findUnique({ where: { id: alt.id } })).toBeNull();
    expect(await db.auditLog.findUnique({ where: { id: neu.id } })).not.toBeNull();
  });

  it("rührt alte Geschäftsdaten im selben Protokoll nicht an", async () => {
    /* Die eigentliche Gefahr an dieser Stelle. Im Audit-Log liegen zehn
     * Jahre aufzubewahrende Vorgänge neben den Anmeldungen, und ein zu
     * weit gefasster Filter nähme sie mit. Zurückholen kann sie
     * niemand. */
    const { c, liridon } = await aufbau();
    const alt = "2020-01-01";
    const behalten = [];
    for (const action of ["LOCKED", "UNLOCKED", "MONTH_LOCKED", "CREATE", "UPDATE",
                          "DELETE", "USER_BOOTSTRAP", "USER_SELF_CREATED", "COMPANY_UPDATED"])
      behalten.push(await protokoll(c.id, liridon.id, action, alt));

    const lauf = await aufbewahrungAnwenden(HEUTE);
    expect(lauf.anmeldeprotokolle).toBe(0);

    for (const e of behalten)
      expect(await db.auditLog.findUnique({ where: { id: e.id } })).not.toBeNull();
  });
});

describe("Sitzungen", () => {
  it("räumt abgelaufene ab und lässt gültige stehen", async () => {
    const { liridon } = await aufbau();
    const abgelaufen = await db.session.create({
      data: {
        userId: liridon.id,
        tokenHash: "abgelaufen",
        expiresAt: new Date("2026-09-14T00:00:00Z"),
        mfaVerified: true,
      },
    });
    const gueltig = await db.session.create({
      data: {
        userId: liridon.id,
        tokenHash: "gueltig",
        expiresAt: new Date("2026-09-16T00:00:00Z"),
        mfaVerified: true,
      },
    });

    const lauf = await aufbewahrungAnwenden(HEUTE);
    expect(lauf.sitzungen).toBe(1);

    expect(await db.session.findUnique({ where: { id: abgelaufen.id } })).toBeNull();
    expect(await db.session.findUnique({ where: { id: gueltig.id } })).not.toBeNull();
  });
});

describe("Der Lauf als Ganzes", () => {
  it("ist wiederholbar: der zweite Lauf ändert nichts mehr", async () => {
    const { c, liridon } = await aufbau();
    const alterEintrag = await zeiteintrag(liridon.id, "2016-01-01");
    await krankmeldung(liridon.id, "2025-01-10", "2026-07-10");
    await protokoll(c.id, liridon.id, "LOGIN_OIDC", "2026-01-01");
    await db.session.create({
      data: {
        userId: liridon.id,
        tokenHash: "alt",
        expiresAt: new Date("2026-01-01T00:00:00Z"),
        mfaVerified: true,
      },
    });

    expect(await aufbewahrungAnwenden(HEUTE)).toEqual({
      krankheitsnotizen: 1,
      anmeldeprotokolle: 1,
      sitzungen: 1,
    });

    expect(await aufbewahrungAnwenden(HEUTE)).toEqual({
      krankheitsnotizen: 0,
      anmeldeprotokolle: 0,
      sitzungen: 0,
    });

    // Der alte Zeiteintrag steht auch nach zwei Läufen noch.
    expect(await db.timeEntry.findUnique({ where: { id: alterEintrag.id } })).not.toBeNull();
  });

  it("lässt eine frische Datenbank unberührt", async () => {
    const { c, liridon } = await aufbau();
    await zeiteintrag(liridon.id, "2026-09-14");
    await krankmeldung(liridon.id, "2026-09-01", "2028-03-01");
    await protokoll(c.id, liridon.id, "LOGIN_OIDC", "2026-09-14");

    expect(await aufbewahrungAnwenden(HEUTE)).toEqual({
      krankheitsnotizen: 0,
      anmeldeprotokolle: 0,
      sitzungen: 0,
    });
    expect(await db.timeEntry.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(1);
  });
});
