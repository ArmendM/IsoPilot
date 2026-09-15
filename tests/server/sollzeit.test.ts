import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { firma, person, sitzung } from "./hilfen";

/* Sollstunden und Zeitsaldo, M4g, gegen ein echtes Postgres.
 *
 * Die reine Rechnung steht in tests/einheit. Hier wird geprüft, was nur
 * mit Daten zu prüfen ist: dass die Auswertung das Pensum nimmt, das an
 * jenem Tag galt, dass Absenzen und Feiertage das Soll senken, und dass
 * der Anfangssaldo dieselbe Zeit nicht zweimal zählt. */

/* Welche Seiten nach einem Schreibvorgang nachgeführt werden, ist hier
 * kein Beiwerk: eine Seite, die eine Zahl zeigt und nicht nachgeführt
 * wird, zeigt sie irgendwann falsch. Genau so kam der Fehlerbericht
 * zustande, der Stichtag werde nicht erkannt. */
const nachgefuehrt: string[] = [];
vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => {
    nachgefuehrt.push(pfad);
  },
}));
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

const { auswertungPerson } = await import("@/server/auswertung-read");
const { zeitsaldo } = await import("@/server/saldo-read");
const { setPensum, loeschePensum, setAnfangssaldo } = await import("@/server/users");

const tag = (iso: string) => new Date(`${iso}T00:00:00Z`);

/* September 2026: der 1. ist ein Dienstag, das Monatsende der 30., ein
 * Mittwoch. Der Monat hat 22 Werktage und keinen Feiertag im Kanton
 * Luzern. 22 mal 8.4 sind 184.8 Sollstunden. */
const SEPTEMBER = {
  art: "monat" as const,
  von: "2026-09-01",
  bis: "2026-09-30",
  bezeichnung: "September 2026",
};

async function aufbau() {
  const c = await firma();
  const daut = await person(c.id, "Daut", "ADMIN");
  const liridon = await person(c.id, "Liridon");
  sitzung.user = daut.alsSitzung();
  return { c, daut, liridon };
}

/** Stunden an einem Tag erfassen, von 07:00 an. */
async function stunden(userId: string, datum: string, anzahl: number) {
  return db.timeEntry.create({
    data: {
      userId,
      createdById: userId,
      workDate: tag(datum),
      startedAt: new Date(`${datum}T07:00:00Z`),
      endedAt: new Date(`${datum}T${String(7 + anzahl).padStart(2, "0")}:00:00Z`),
    },
  });
}

describe("Sollstunden", () => {
  it("rechnet 42 Wochenstunden als 8.4 je Werktag", async () => {
    const { daut, liridon } = await aufbau();

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);
    expect(a.werktage).toBe(22);
    expect(a.soll.sollstunden).toBe(184.8);
    expect(a.soll.wochenstunden).toBe(42);
    expect(a.soll.pensumWechselt).toBe(false);
  });

  it("nimmt das eigene Pensum statt der Vorgabe der Firma", async () => {
    const { daut, liridon } = await aufbau();
    expect(await setPensum({ id: liridon.id, weeklyHours: 33.6, validFrom: "2026-01-01" })).toEqual(
      { ok: true },
    );

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);
    expect(a.soll.wochenstunden).toBe(33.6);
    expect(a.soll.sollstunden).toBe(147.84); // 22 mal 6.72
  });

  it("verändert vergangene Monate nicht, wenn das Pensum wechselt", async () => {
    /* Der Kern des Datenmodells. Ein Pensum ab Oktober darf den
     * September nicht anfassen: wer bis dahin 42 Stunden schuldete,
     * schuldet sie auch nachher noch. Genau deshalb braucht der
     * Monatsabschluss den Saldo nicht einzufrieren. */
    const { daut, liridon } = await aufbau();
    const vorher = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);

    await setPensum({ id: liridon.id, weeklyHours: 21, validFrom: "2026-10-01" });

    const nachher = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);
    expect(nachher.soll.sollstunden).toBe(vorher.soll.sollstunden);

    const oktober = await auswertungPerson(daut.alsSitzung(), liridon.id, {
      art: "monat",
      von: "2026-10-01",
      bis: "2026-10-31",
      bezeichnung: "Oktober 2026",
    });
    expect(oktober.soll.wochenstunden).toBe(21);
    expect(oktober.soll.sollstunden).toBeLessThan(vorher.soll.sollstunden);
  });

  it("meldet einen Pensumswechsel mitten im Zeitraum", async () => {
    const { daut, liridon } = await aufbau();
    await setPensum({ id: liridon.id, weeklyHours: 21, validFrom: "2026-09-16" });

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);
    expect(a.soll.pensumWechselt).toBe(true);
    // Weder das eine noch das andere Pensum für den ganzen Monat.
    expect(a.soll.sollstunden).toBeGreaterThan(92.4);
    expect(a.soll.sollstunden).toBeLessThan(184.8);
  });

  it("senkt das Soll um Ferien, Krankheit und Feiertage", async () => {
    const { c, daut, liridon } = await aufbau();

    // Eine Woche Ferien, Montag bis Freitag.
    await db.absence.create({
      data: {
        userId: liridon.id,
        type: "VACATION",
        startDate: tag("2026-09-07"),
        endDate: tag("2026-09-11"),
        workingDays: "5",
        status: "APPROVED",
      },
    });
    // Ein Feiertag an einem Werktag.
    await db.holiday.create({
      data: {
        companyId: c.id,
        date: tag("2026-09-21"),
        name: "Prüffeiertag",
        source: "manual",
      },
    });

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);
    expect(a.ferientage).toBe(5);
    expect(a.feiertage).toBe(1);
    // 22 Werktage minus 5 Ferientage minus 1 Feiertag sind 16 mal 8.4.
    expect(a.soll.sollstunden).toBe(134.4);
  });

  it("zählt einen halben Absenztag halb", async () => {
    const { daut, liridon } = await aufbau();
    await db.absence.create({
      data: {
        userId: liridon.id,
        type: "OTHER",
        startDate: tag("2026-09-08"),
        endDate: tag("2026-09-08"),
        workingDays: "0.5",
        isHalfDay: true,
        status: "APPROVED",
      },
    });

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);
    expect(a.soll.sollstunden).toBe(180.6); // 184.8 minus 4.2
  });

  it("trägt vor dem Eintritt kein Soll", async () => {
    const { daut, liridon } = await aufbau();
    await db.user.update({
      where: { id: liridon.id },
      data: { employedFrom: tag("2026-09-16") },
    });

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);
    // Vom 16. bis 30. September sind 11 Werktage.
    expect(a.soll.sollstunden).toBe(92.4);
  });
});

describe("Saldo", () => {
  it("ist Ist minus Soll", async () => {
    const { daut, liridon } = await aufbau();
    // Zwei Tage zu je zehn Stunden, sonst nichts.
    await stunden(liridon.id, "2026-09-01", 10);
    await stunden(liridon.id, "2026-09-02", 10);

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);
    expect(a.nettostunden).toBe(20);
    expect(a.soll.saldoZeitraum).toBe(-164.8); // 20 minus 184.8
  });

  it("schreibt Samstagsarbeit voll gut, ohne dafür ein Soll zu erheben", async () => {
    /* Am Wochenende wird gebucht wie an jedem anderen Tag, eine Sperre
     * gibt es nicht und soll es nicht geben. Der Samstag trägt kein
     * Soll, die Stunden zählen aber voll. */
    const { daut, liridon } = await aufbau();
    const ohne = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);

    await stunden(liridon.id, "2026-09-05", 6); // ein Samstag

    const mit = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);
    expect(mit.soll.sollstunden).toBe(ohne.soll.sollstunden);
    expect(mit.soll.saldoZeitraum).toBe(ohne.soll.saldoZeitraum + 6);
  });

  it("meldet den Anfangssaldo, ohne ihn in den Zeitraum zu mischen", async () => {
    const { daut, liridon } = await aufbau();
    expect(
      await setAnfangssaldo({
        id: liridon.id,
        startBalance: 23.5,
        balanceFrom: "2026-01-01",
      }),
    ).toEqual({ ok: true });

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);
    expect(a.soll.anfangssaldo).toBe(23.5);
    expect(a.soll.anfangssaldoAb).toBe("2026-01-01");
    // Der Saldo des Zeitraums bleibt Ist minus Soll, ohne den Anfang.
    expect(a.soll.saldoZeitraum).toBe(-184.8);
    expect(a.soll.abStichtagGekuerzt).toBe(false);
  });

  it("zählt die Zeit vor dem Stichtag nicht noch einmal", async () => {
    /* Der Anfangssaldo deckt alles vor seinem Stichtag ab. Trüge diese
     * Zeit zusätzlich Soll und Ist, stünde sie zweimal in der Rechnung. */
    const { daut, liridon } = await aufbau();
    await stunden(liridon.id, "2026-09-01", 8); // vor dem Stichtag
    await stunden(liridon.id, "2026-09-17", 8); // danach

    await setAnfangssaldo({
      id: liridon.id,
      startBalance: 0,
      balanceFrom: "2026-09-16",
    });

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);
    expect(a.soll.abStichtagGekuerzt).toBe(true);
    // Nettostunden zeigen weiterhin den ganzen Zeitraum.
    expect(a.nettostunden).toBe(16);
    // In die Rechnung geht nur, was ab dem Stichtag liegt.
    expect(a.soll.iststunden).toBe(8);
    expect(a.soll.sollstunden).toBe(92.4); // 11 Werktage
  });
});

describe("Pensum pflegen", () => {
  it("setzt nur ein Vorgesetzter", async () => {
    const { liridon } = await aufbau();
    sitzung.user = liridon.alsSitzung();

    expect((await setPensum({ id: liridon.id, weeklyHours: 20, validFrom: "2026-01-01" })).ok).toBe(
      false,
    );
    expect((await setAnfangssaldo({ id: liridon.id, startBalance: 5, balanceFrom: "2026-01-01" })).ok).toBe(
      false,
    );
    expect(await db.workload.count()).toBe(0);
  });

  it("rührt eine Person einer anderen Firma nicht an", async () => {
    const { daut } = await aufbau();
    const fremd = await firma("Fremde AG");
    const fremder = await person(fremd.id, "Fremd");
    sitzung.user = daut.alsSitzung();

    expect((await setPensum({ id: fremder.id, weeklyHours: 20, validFrom: "2026-01-01" })).ok).toBe(
      false,
    );
    expect(await db.workload.count()).toBe(0);
  });

  it("überschreibt ein Pensum am selben Stichtag, statt zu scheitern", async () => {
    // Wer eine Zahl berichtigt, tippt denselben Stichtag noch einmal.
    // Ein Fehler an der Eindeutigkeit wäre dort keine Hilfe.
    const { liridon } = await aufbau();
    await setPensum({ id: liridon.id, weeklyHours: 20, validFrom: "2026-01-01" });
    expect(await setPensum({ id: liridon.id, weeklyHours: 24, validFrom: "2026-01-01" })).toEqual({
      ok: true,
    });

    const alle = await db.workload.findMany({ where: { userId: liridon.id } });
    expect(alle).toHaveLength(1);
    expect(Number(alle[0].weeklyHours)).toBe(24);
  });

  it("schreibt jede Änderung ins Protokoll", async () => {
    const { liridon } = await aufbau();
    await setPensum({ id: liridon.id, weeklyHours: 20, validFrom: "2026-01-01" });
    const gesetzt = await db.auditLog.findFirstOrThrow({
      where: { action: "USER_WORKLOAD_SET" },
    });
    expect(gesetzt.entity).toBe("Workload");

    const p = await db.workload.findFirstOrThrow({ where: { userId: liridon.id } });
    expect(await loeschePensum({ id: liridon.id, pensumId: p.id })).toEqual({ ok: true });
    expect(await db.workload.count()).toBe(0);
    expect(
      await db.auditLog.count({ where: { action: "USER_WORKLOAD_REMOVED" } }),
    ).toBe(1);
  });

  it("entfernt kein fremdes Pensum über eine falsche Kennung", async () => {
    /* Die Person steht im WHERE, nicht nur in der Prüfung davor: sonst
     * liesse sich über eine fremde Kennung ein beliebiges Pensum
     * entfernen. */
    const { c, liridon } = await aufbau();
    const islom = await person(c.id, "Islom");
    await setPensum({ id: islom.id, weeklyHours: 20, validFrom: "2026-01-01" });
    const fremdesPensum = await db.workload.findFirstOrThrow({ where: { userId: islom.id } });

    expect(
      (await loeschePensum({ id: liridon.id, pensumId: fremdesPensum.id })).ok,
    ).toBe(false);
    expect(await db.workload.count()).toBe(1);
  });

  it("verlangt Saldo und Stichtag zusammen", async () => {
    // Ein Saldo ohne Stichtag wüsste nicht, ab wann IsoPilot selbst rechnet.
    const { liridon } = await aufbau();
    expect((await setAnfangssaldo({ id: liridon.id, startBalance: 12, balanceFrom: null })).ok).toBe(
      false,
    );
    expect(
      (await setAnfangssaldo({ id: liridon.id, startBalance: null, balanceFrom: "2026-01-01" })).ok,
    ).toBe(false);

    // Beide leer hebt ihn auf, das ist erlaubt.
    expect(
      await setAnfangssaldo({ id: liridon.id, startBalance: null, balanceFrom: null }),
    ).toEqual({ ok: true });
  });
});

describe("Laufender Saldo in der Tagesansicht", () => {
  it("bleibt ohne Stichtag aus, auch wenn der Eintritt gesetzt ist", async () => {
    /* Der Eintritt sagt nur, seit wann jemand angestellt ist, nicht seit
     * wann er in IsoPilot erfasst. Ersatzweise ab Eintritt zu rechnen
     * war der gemeldete Fehler. Lieber keine Zahl als eine falsche. */
    const { daut, liridon } = await aufbau();
    await db.user.update({
      where: { id: liridon.id },
      data: { employedFrom: tag("2026-01-01") },
    });

    const r = await zeitsaldo(daut.alsSitzung(), liridon.id, "2026-09-30");
    expect(r.stunden).toBeNull();
    if (r.stunden === null) expect(r.grund).toMatch(/Anfangssaldo mit Stichtag/);
  });

  it("rechnet ab dem Stichtag, auch ohne mitgebrachte Stunden", async () => {
    const { daut, liridon } = await aufbau();
    await setAnfangssaldo({
      id: liridon.id,
      startBalance: 0,
      balanceFrom: "2026-09-01",
    });
    await stunden(liridon.id, "2026-09-01", 8);

    const r = await zeitsaldo(daut.alsSitzung(), liridon.id, "2026-09-02");
    // Zwei Werktage Soll, 16.8, dagegen 8 Stunden Ist.
    expect(r.stunden).toBe(-8.8);
    if (r.stunden !== null) {
      expect(r.ab).toBe("2026-09-01");
      expect(r.anfangssaldo).toBe(0);
    }
  });

  it("zählt den Anfangssaldo mit und rechnet ab dessen Stichtag", async () => {
    const { daut, liridon } = await aufbau();
    await db.user.update({
      where: { id: liridon.id },
      data: { employedFrom: tag("2020-01-01") },
    });
    await stunden(liridon.id, "2026-09-01", 8);

    await setAnfangssaldo({
      id: liridon.id,
      startBalance: 20,
      balanceFrom: "2026-09-01",
    });

    const r = await zeitsaldo(daut.alsSitzung(), liridon.id, "2026-09-02");
    // 20 mitgebracht, plus 8 geleistet, minus 16.8 geschuldet.
    expect(r.stunden).toBe(11.2);
    if (r.stunden !== null) expect(r.ab).toBe("2026-09-01");
  });

  it("stimmt mit der Auswertung überein, wenn beide denselben Ausschnitt sehen", async () => {
    /* Die eigentliche Gefahr an zwei Leseschichten: sie rechnen
     * auseinander. Beide summieren deshalb über `sollSumme`. */
    const { daut, liridon } = await aufbau();
    await setAnfangssaldo({
      id: liridon.id,
      startBalance: 0,
      balanceFrom: "2026-09-01",
    });
    await stunden(liridon.id, "2026-09-01", 8);
    await stunden(liridon.id, "2026-09-05", 6); // ein Samstag

    const r = await zeitsaldo(daut.alsSitzung(), liridon.id, "2026-09-30");
    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);
    expect(r.stunden).toBe(a.soll.saldoZeitraum);
  });

  it("lässt eine mitarbeitende Person nur an den eigenen Saldo", async () => {
    const { c, liridon } = await aufbau();
    const islom = await person(c.id, "Islom");
    sitzung.user = liridon.alsSitzung();

    await expect(zeitsaldo(liridon.alsSitzung(), islom.id, "2026-09-30")).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("lässt einen Vorgesetzten nicht an eine fremde Firma", async () => {
    // Die Rolle allein sagt nichts darüber, zu welcher Firma eine fremde
    // Kennung gehört.
    const { daut } = await aufbau();
    const fremd = await firma("Fremde AG");
    const fremder = await person(fremd.id, "Fremd");

    await expect(zeitsaldo(daut.alsSitzung(), fremder.id, "2026-09-30")).rejects.toThrow(
      "FORBIDDEN",
    );
  });
});

describe("Der Fall aus dem Betrieb: Eintritt im Januar, Pensum ab September", () => {
  /* Gemeldet am 15.09.2026. Beide echten Konten hatten Eintritt
   * 01.01.2026 und ein Pensum ab 01.09.2026, IsoPilot lief im ersten
   * Halbjahr noch gar nicht. Die Tagesansicht zeigte einen Saldo von
   * minus 1486.8 Stunden: 177 Werktage Soll gegen null erfasste. */

  async function wieImBetrieb() {
    const { c, daut, liridon } = await aufbau();
    await db.user.update({
      where: { id: liridon.id },
      data: { employedFrom: tag("2026-01-01") },
    });
    await setPensum({ id: liridon.id, weeklyHours: 42, validFrom: "2026-09-01" });
    return { c, daut, liridon };
  }

  it("zeigt gar keinen Saldo, solange kein Stichtag gesetzt ist", async () => {
    /* Der gemeldete Fehler. Ohne Stichtag weiss IsoPilot nicht, ab wann
     * seine Stunden vollständig sind, und darf deshalb keine Zahl
     * nennen. Vorher wurde ab Eintritt gerechnet, und heraus kam minus
     * 1486.8. */
    const { daut, liridon } = await wieImBetrieb();

    const r = await zeitsaldo(daut.alsSitzung(), liridon.id, "2026-09-15");
    expect(r.stunden).toBeNull();
    if (r.stunden === null) expect(r.grund).toMatch(/Anfangssaldo mit Stichtag/);
  });

  it("rechnet, sobald der Stichtag steht, und zwar ab ihm", async () => {
    const { daut, liridon } = await wieImBetrieb();
    await setAnfangssaldo({
      id: liridon.id,
      startBalance: 0,
      balanceFrom: "2026-09-01",
    });

    const r = await zeitsaldo(daut.alsSitzung(), liridon.id, "2026-09-15");
    if (r.stunden === null) throw new Error("Saldo fehlt: " + r.grund);

    expect(r.ab).toBe("2026-09-01");
    // 11 Werktage vom 01. bis 15. September, mal 8.4, ohne erfasste Stunden.
    expect(r.stunden).toBe(-92.4);
    // Und ausdrücklich nicht die Zahl aus dem Fehlerbild.
    expect(r.stunden).not.toBe(-1486.8);
  });

  it("nimmt einen mitgebrachten Saldo mit", async () => {
    const { daut, liridon } = await wieImBetrieb();
    await setAnfangssaldo({
      id: liridon.id,
      startBalance: 10,
      balanceFrom: "2026-09-08",
    });

    const r = await zeitsaldo(daut.alsSitzung(), liridon.id, "2026-09-15");
    if (r.stunden === null) throw new Error("Saldo fehlt: " + r.grund);
    expect(r.ab).toBe("2026-09-08");
    // 6 Werktage vom 08. bis 15. September, mal 8.4, plus 10 mitgebracht.
    expect(r.stunden).toBe(-40.4);
  });

  it("lässt die Auswertung über einen gewählten Zeitraum unberührt", async () => {
    /* Dort ist der Zeitraum ausdrücklich gefragt, und das Soll darin ist
     * eine wohldefinierte Antwort: ohne eigenes Pensum gilt die Vorgabe
     * der Firma. Der September trägt also sein volles Soll. */
    const { daut, liridon } = await wieImBetrieb();

    const a = await auswertungPerson(daut.alsSitzung(), liridon.id, SEPTEMBER);
    expect(a.soll.sollstunden).toBe(184.8);
    expect(a.soll.abStichtagGekuerzt).toBe(false);
  });
});

describe("Nachführen der Seiten", () => {
  /* Der gemeldete Fehler: die Saldozeile in `/zeiten` kam später dazu
   * als die Liste der nachzuführenden Seiten. Wer den Stichtag setzte,
   * sah ihn in der Auswertung sofort, in der Tagesansicht aber weiter
   * den Hinweis, es fehle einer. Von aussen sah das aus, als würde der
   * Stichtag nicht erkannt. */

  it.each([
    [
      "Anfangssaldo",
      (id: string) => setAnfangssaldo({ id, startBalance: 5, balanceFrom: "2026-09-01" }),
    ],
    ["Pensum", (id: string) => setPensum({ id, weeklyHours: 42, validFrom: "2026-09-01" })],
  ])("führt nach dem Setzen des %s auch /zeiten nach", async (_name, aktion) => {
    const { liridon } = await aufbau();
    nachgefuehrt.length = 0;

    expect(await aktion(liridon.id)).toEqual({ ok: true });

    expect(nachgefuehrt).toContain("/zeiten");
    expect(nachgefuehrt).toContain("/personen");
    expect(nachgefuehrt).toContain("/auswertung/mitarbeitende");
  });

  it("führt auch nach dem Entfernen eines Pensums /zeiten nach", async () => {
    const { liridon } = await aufbau();
    await setPensum({ id: liridon.id, weeklyHours: 42, validFrom: "2026-09-01" });
    const p = await db.workload.findFirstOrThrow({ where: { userId: liridon.id } });
    nachgefuehrt.length = 0;

    expect(await loeschePensum({ id: liridon.id, pensumId: p.id })).toEqual({ ok: true });
    expect(nachgefuehrt).toContain("/zeiten");
  });

  it("führt nichts nach, wenn die Eingabe abgewiesen wird", async () => {
    // Ein Nachführen ohne Schreibvorgang wäre nur Arbeit ohne Wirkung.
    const { liridon } = await aufbau();
    nachgefuehrt.length = 0;

    expect((await setAnfangssaldo({ id: liridon.id, startBalance: 5, balanceFrom: null })).ok).toBe(
      false,
    );
    expect(nachgefuehrt).toEqual([]);
  });
});
