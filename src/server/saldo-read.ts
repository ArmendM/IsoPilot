/* Der laufende Zeitsaldo einer Person, für die Tagesansicht.
 *
 * Eine eigene Leseschicht neben `auswertung-read.ts`: die Auswertung
 * fragt nach einem gewählten Zeitraum und liefert dazu Einzelpositionen,
 * Baustellenanteile und Absenztage. Die Tagesansicht will genau eine
 * Zahl, und zwar über Jahre statt über einen Monat. Dieselbe Funktion
 * für beides hiesse, auf jeder Tagesansicht alle Einträge seit dem
 * Eintritt auszuformatieren, nur um sie wegzuwerfen.
 *
 * **Die Regel teilen sie trotzdem**: gerechnet wird über `sollSumme` in
 * `lib/sollzeit.ts`, dieselbe Summe wie in der Auswertung.
 */
import { db } from "@/lib/db";
import { netHours } from "@/lib/dates";
import { holidayMap } from "@/lib/holidays";
import type { SessionUser } from "@/lib/session";
import { istWochenende } from "@/lib/zeitraum";
import { type Pensum, type Tagesangabe, saldo, sollSumme } from "@/lib/sollzeit";

const isoUtc = (d: Date) => d.toISOString().slice(0, 10);

export type Zeitsaldo =
  | {
      /** Der laufende Saldo: Anfangssaldo plus Ist minus Soll. */
      stunden: number;
      /** Ab wann gerechnet wird, "yyyy-mm-dd". */
      ab: string;
      /** Bis wann gerechnet wird, in der Regel heute. */
      bis: string;
      /** Ist der Anfangssaldo gesetzt, sein Wert, sonst null. */
      anfangssaldo: number | null;
    }
  | {
      /** Kein Saldo zu rechnen, mit dem Grund. */
      stunden: null;
      grund: string;
    };

/**
 * Der Saldo einer Person bis zu einem Tag.
 *
 * Mitarbeitende kommen nur an die eigenen Zahlen, Vorgesetzte an alle
 * der eigenen Firma. Die Firma wird mitgeprüft: die Rolle allein sagt
 * nichts darüber, zu welcher Firma eine fremde Kennung gehört.
 */
export async function zeitsaldo(
  user: SessionUser,
  personId: string,
  bis: string,
): Promise<Zeitsaldo> {
  if (user.role !== "ADMIN" && user.id !== personId) throw new Error("FORBIDDEN");

  const person = await db.user.findUnique({
    where: { id: personId },
    select: {
      companyId: true,
      employedFrom: true,
      employedUntil: true,
      startBalance: true,
      balanceFrom: true,
      workloads: {
        select: { validFrom: true, weeklyHours: true },
        orderBy: { validFrom: "asc" },
      },
      company: { select: { weeklyHours: true } },
    },
  });
  if (!person || person.companyId !== user.companyId) throw new Error("FORBIDDEN");

  const pensen: Pensum[] = person.workloads.map((w) => ({
    validFrom: isoUtc(w.validFrom),
    weeklyHours: Number(w.weeklyHours),
  }));

  /* **Nur der Stichtag des Anfangssaldos.** Er ist die einzige Aussage
   * darüber, ab wann die Stunden in IsoPilot vollständig sind. Ersatzweise
   * den Eintritt zu nehmen war der Fehler, der bei einem Konto mit
   * Eintritt am 01.01.2026 einen Saldo von minus 1486.8 Stunden ergab:
   * 177 Werktage Soll gegen null erfasste, weil IsoPilot im ersten
   * Halbjahr noch gar nicht lief. Die Begründung steht ausführlich in
   * `lib/sollzeit.ts`. */
  const ab = person.balanceFrom ? isoUtc(person.balanceFrom) : null;

  if (!ab)
    return {
      stunden: null,
      grund:
        'Für den Saldo fehlt das Datum, ab dem IsoPilot rechnet: erst ab dann sind die Stunden hier vollständig. Einzutragen unter Personen, "Arbeitszeit und Saldo", Feld "IsoPilot rechnet ab".',
    };

  if (ab > bis)
    return { stunden: null, grund: "Der Saldo beginnt erst später." };

  const von = new Date(`${ab}T00:00:00Z`);
  const bisDatum = new Date(`${bis}T00:00:00Z`);

  const [eintraege, feiertage, absenzen] = await Promise.all([
    db.timeEntry.findMany({
      where: {
        userId: personId,
        workDate: { gte: von, lte: bisDatum },
        deletedAt: null,
      },
      select: { startedAt: true, endedAt: true, breakMinutes: true },
    }),
    holidayMap(person.companyId, von, bisDatum),
    db.absence.findMany({
      where: {
        userId: personId,
        deletedAt: null,
        // Ein abgelehnter Antrag deckt keinen Tag ab.
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: bisDatum },
        endDate: { gte: von },
      },
      select: { startDate: true, endDate: true, isHalfDay: true },
    }),
  ]);

  const ist = eintraege.reduce(
    (s, e) => s + netHours(e.startedAt, e.endedAt, e.breakMinutes),
    0,
  );

  const austritt = person.employedUntil ? isoUtc(person.employedUntil) : null;

  /* Die Tage einzeln, wie in der Auswertung: nur so lassen sich Feiertag
   * und Absenz je Tag abziehen. Über Jahre sind das einige tausend
   * Schleifendurchläufe und kein Datenbankzugriff, das trägt. */
  const tage: Tagesangabe[] = [];
  for (const d = new Date(von); d <= bisDatum; d.setUTCDate(d.getUTCDate() + 1)) {
    const tag = isoUtc(d);
    const absenz = absenzen.find(
      (a) => isoUtc(a.startDate) <= tag && isoUtc(a.endDate) >= tag,
    );
    tage.push({
      tag,
      wochenende: istWochenende(tag),
      feiertag: feiertage.has(tag),
      absenzAnteil: absenz ? (absenz.isHalfDay ? 0.5 : 1) : 0,
      beschaeftigt: !austritt || tag <= austritt,
    });
  }

  const anfang = person.startBalance === null ? 0 : Number(person.startBalance);

  return {
    stunden: saldo(anfang, ist, sollSumme(tage, pensen, Number(person.company.weeklyHours))),
    ab,
    bis,
    anfangssaldo: person.startBalance === null ? null : Number(person.startBalance),
  };
}
