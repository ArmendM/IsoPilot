import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { baustelle, firma, person, sitzung } from "./hilfen";
import { zeitraumAus } from "@/lib/zeitraum";

/* Auswertung Mitarbeitende. Eine Person auf einmal, und eine
 * mitarbeitende Person kommt an keine fremden Zahlen. */

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => {
    if (!sitzung.user) throw new Error("UNAUTHENTICATED");
    return sitzung.user;
  },
  getSession: async () => sitzung.user,
}));

const { auswertungPerson } = await import("@/server/auswertung-read");

const september = zeitraumAus({ art: "monat", monat: "2026-09" })!;

async function aufbau() {
  const c = await firma();
  const daut = await person(c.id, "Daut", "ADMIN");
  const liridon = await person(c.id, "Liridon");
  const site = await baustelle(c.id);
  sitzung.user = daut.alsSitzung();
  return { c, daut, liridon, site };
}

/** Ein Eintrag an einem Tag, Zeiten in UTC wie in der Datenbank. */
async function zeit(
  userId: string,
  tag: string,
  vonH: number,
  bisH: number,
  pause = 0,
  siteId: string | null = null,
) {
  return db.timeEntry.create({
    data: {
      userId,
      createdById: userId,
      workDate: new Date(`${tag}T00:00:00Z`),
      startedAt: new Date(`${tag}T${String(vonH).padStart(2, "0")}:00:00Z`),
      endedAt: new Date(`${tag}T${String(bisH).padStart(2, "0")}:00:00Z`),
      breakMinutes: pause,
      siteId,
    },
  });
}

async function absenz(
  userId: string,
  typ: "VACATION" | "SICK" | "OTHER",
  von: string,
  bis: string,
  halb = false,
  status: "PENDING" | "APPROVED" | "DENIED" = "APPROVED",
) {
  return db.absence.create({
    data: {
      userId,
      type: typ,
      status,
      startDate: new Date(`${von}T00:00:00Z`),
      endDate: new Date(`${bis}T00:00:00Z`),
      isHalfDay: halb,
      workingDays: 1,
    },
  });
}

beforeEach(() => {
  sitzung.user = null;
});

describe("Summen", () => {
  it("zählt die Nettostunden über den Zeitraum", async () => {
    const { daut, liridon } = await aufbau();
    await zeit(liridon.id, "2026-09-01", 7, 17, 60); // 9
    await zeit(liridon.id, "2026-09-02", 7, 12, 0); // 5

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.nettostunden).toBe(14);
    expect(a.pausenMinuten).toBe(60);
    expect(a.tageMitErfassung).toBe(2);
  });

  /* Zwei Baustellen am selben Tag sind ausdrücklich erlaubt, der Tag
   * zählt trotzdem einmal. */
  it("zählt einen Tag mit zwei Einträgen als einen Tag", async () => {
    const { daut, liridon, site } = await aufbau();
    await zeit(liridon.id, "2026-09-01", 7, 12, 0, site.id);
    await zeit(liridon.id, "2026-09-01", 13, 17, 0);

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.tageMitErfassung).toBe(1);
    expect(a.nettostunden).toBe(9);
  });

  it("lässt Einträge ausserhalb des Zeitraums weg", async () => {
    const { daut, liridon } = await aufbau();
    await zeit(liridon.id, "2026-08-31", 7, 17);
    await zeit(liridon.id, "2026-10-01", 7, 17);
    await zeit(liridon.id, "2026-09-15", 7, 17);

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.tageMitErfassung).toBe(1);
  });

  /* Soft Delete: ein zurückgenommener Eintrag darf in keiner Summe mehr
   * auftauchen. */
  it("übergeht gelöschte Einträge", async () => {
    const { daut, liridon } = await aufbau();
    const e = await zeit(liridon.id, "2026-09-01", 7, 17);
    await db.timeEntry.update({ where: { id: e.id }, data: { deletedAt: new Date() } });

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.nettostunden).toBe(0);
    expect(a.positionen).toHaveLength(0);
  });

  /* An Wochenenden wird gebucht wie an jedem anderen Tag. Die Stunden
   * zählen, der Werktag nicht. */
  it("nimmt Stunden vom Samstag mit, zählt ihn aber nicht als Werktag", async () => {
    const { daut, liridon } = await aufbau();
    await zeit(liridon.id, "2026-09-12", 8, 12); // Samstag

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.nettostunden).toBe(4);
    expect(a.tageMitErfassung).toBe(1);
    expect(a.werktage).toBe(22); // September 2026 hat 22 Werktage
  });
});

describe("Baustellen und Einzelpositionen", () => {
  it("summiert je Baustelle und nennt Tage ohne Baustelle eigens", async () => {
    const { daut, liridon, site } = await aufbau();
    await zeit(liridon.id, "2026-09-01", 7, 12, 0, site.id); // 5
    await zeit(liridon.id, "2026-09-02", 7, 10, 0, site.id); // 3
    await zeit(liridon.id, "2026-09-03", 7, 11, 0, null); // 4

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.proBaustelle).toHaveLength(2);
    // Absteigend nach Stunden, die Baustelle zuerst.
    expect(a.proBaustelle[0]).toMatchObject({ siteId: site.id, stunden: 8 });
    expect(a.proBaustelle[1]).toMatchObject({ siteId: null, stunden: 4 });
  });

  it("gibt die Einzelpositionen nach Datum aus", async () => {
    const { daut, liridon } = await aufbau();
    await zeit(liridon.id, "2026-09-10", 7, 12);
    await zeit(liridon.id, "2026-09-02", 7, 12);

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.positionen.map((p) => p.datum)).toEqual(["2026-09-02", "2026-09-10"]);
  });
});

describe("Absenzen", () => {
  it("trennt Ferien, Krankheit und übrige Absenzen", async () => {
    const { daut, liridon } = await aufbau();
    await absenz(liridon.id, "VACATION", "2026-09-07", "2026-09-08");
    await absenz(liridon.id, "SICK", "2026-09-09", "2026-09-09");
    await absenz(liridon.id, "OTHER", "2026-09-10", "2026-09-10");

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.ferientage).toBe(2);
    expect(a.krankheitstage).toBe(1);
    expect(a.uebrigeAbsenztage).toBe(1);
  });

  it("zählt einen halben Tag halb", async () => {
    const { daut, liridon } = await aufbau();
    await absenz(liridon.id, "VACATION", "2026-09-07", "2026-09-07", true);

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.ferientage).toBe(0.5);
  });

  /* Niemand verbraucht am Sonntag einen Ferientag. */
  it("zählt Wochenenden innerhalb einer Ferienwoche nicht mit", async () => {
    const { daut, liridon } = await aufbau();
    await absenz(liridon.id, "VACATION", "2026-09-07", "2026-09-13"); // Mo bis So

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.ferientage).toBe(5);
  });

  it("übergeht einen abgelehnten Antrag", async () => {
    const { daut, liridon } = await aufbau();
    await absenz(liridon.id, "VACATION", "2026-09-07", "2026-09-08", false, "DENIED");

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.ferientage).toBe(0);
  });

  /* Eine Absenz über den Monatswechsel zählt nur mit dem Teil, der in
   * den Zeitraum fällt. */
  it("schneidet eine Absenz am Rand des Zeitraums ab", async () => {
    const { daut, liridon } = await aufbau();
    await absenz(liridon.id, "VACATION", "2026-08-31", "2026-09-02");

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.ferientage).toBe(2);
  });
});

describe("Offene Tage und Feiertage", () => {
  it("zählt Werktage ohne Eintrag und ohne Absenz", async () => {
    const { daut, liridon } = await aufbau();
    for (const t of ["2026-09-01", "2026-09-02"]) await zeit(liridon.id, t, 7, 17);

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.offeneTage).toBe(20); // 22 Werktage, 2 erfasst
  });

  it("lässt einen Feiertag weder als Werktag noch als offen gelten", async () => {
    const { c, daut, liridon } = await aufbau();
    await db.holiday.create({
      data: {
        companyId: c.id,
        date: new Date("2026-09-21T00:00:00Z"),
        name: "Bettag",
        source: "manual",
      },
    });

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.feiertage).toBe(1);
    expect(a.werktage).toBe(21);
    expect(a.offeneTage).toBe(21);
  });

  /* Ein halber Ferientag deckt den Tag nicht ganz: die andere Hälfte
   * wurde gearbeitet und gehört erfasst. */
  it("lässt einen halben Absenztag ohne Eintrag offen", async () => {
    const { daut, liridon } = await aufbau();
    await absenz(liridon.id, "VACATION", "2026-09-07", "2026-09-07", true);

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, september);

    expect(a.offeneTage).toBe(22);
  });
});

describe("Sichtbarkeit", () => {
  it("lässt eine mitarbeitende Person die eigenen Zahlen sehen", async () => {
    const { liridon } = await aufbau();
    sitzung.user = liridon.alsSitzung();
    await zeit(liridon.id, "2026-09-01", 7, 17);

    const a = await auswertungPerson(liridon.alsSitzung(), liridon.id, september);

    expect(a.nettostunden).toBe(10);
  });

  it("lässt eine mitarbeitende Person nicht an fremde Zahlen", async () => {
    const { c, liridon } = await aufbau();
    const islom = await person(c.id, "Islom");
    sitzung.user = liridon.alsSitzung();

    await expect(
      auswertungPerson(liridon.alsSitzung(), islom.id, september),
    ).rejects.toThrow("FORBIDDEN");
  });

  /* Daut sieht Qails Zeiten und umgekehrt, das ist ausdrücklich so
   * gewollt. */
  it("lässt einen Vorgesetzten die andere vorgesetzte Person sehen", async () => {
    const { c, daut } = await aufbau();
    const qail = await person(c.id, "Qail", "ADMIN");
    await zeit(qail.id, "2026-09-01", 7, 17);

    const a = await auswertungPerson(daut.alsSitzung(), qail.id, september);

    expect(a.nettostunden).toBe(10);
  });

  /* Die Rolle allein sagt nichts darüber, zu welcher Firma eine fremde
   * Kennung gehört. */
  it("lässt einen Vorgesetzten nicht an eine andere Firma", async () => {
    const { daut } = await aufbau();
    const fremd = await firma("Flüma Klima AG");
    const fremdePerson = await person(fremd.id, "Fremd");

    await expect(
      auswertungPerson(daut.alsSitzung(), fremdePerson.id, september),
    ).rejects.toThrow("FORBIDDEN");
  });
});
