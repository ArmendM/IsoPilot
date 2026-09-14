/* Auswertung Mitarbeitende. Lesezugriffe, getrennt von jeder Datei mit
 * "use server": dort wäre jeder Export eine Server Action, die der
 * Browser aufrufen kann.
 *
 * Eine Person auf einmal, nie alle zugleich. Die Auswertung Baustellen
 * ist ein eigener Bereich und kommt getrennt, sonst vermischen sich zwei
 * Fragen, die nichts miteinander zu tun haben. */
import { db } from "@/lib/db";
import { netHours } from "@/lib/dates";
import { holidayMap } from "@/lib/holidays";
import type { SessionUser } from "@/lib/session";
import { istWochenende, tageIn, type Zeitraum } from "@/lib/zeitraum";

const isoUtc = (d: Date) => d.toISOString().slice(0, 10);

export type Einzelposition = {
  datum: string;
  von: string | null;
  bis: string | null;
  pause: number;
  netto: number;
  baustelle: string | null;
  istRegie: boolean;
  notiz: string | null;
};

export type BaustellenAnteil = {
  siteId: string | null;
  label: string;
  stunden: number;
};

export type PersonAuswertung = {
  person: { id: string; name: string };
  zeitraum: Zeitraum;
  /** Werktage im Zeitraum, ohne Wochenenden und ohne Feiertage. */
  werktage: number;
  /** Tage, an denen tatsächlich etwas erfasst wurde, Wochenenden mitgezählt. */
  tageMitErfassung: number;
  nettostunden: number;
  pausenMinuten: number;
  ferientage: number;
  krankheitstage: number;
  uebrigeAbsenztage: number;
  feiertage: number;
  /** Werktag ohne Eintrag und ohne Absenz. */
  offeneTage: number;
  proBaustelle: BaustellenAnteil[];
  positionen: Einzelposition[];
};

const hhmm = (d: Date | null, zeit: string) =>
  d ? new Date(d).toLocaleTimeString("de-CH", { timeZone: zeit, hour: "2-digit", minute: "2-digit" }) : null;

/**
 * Eine Person über einen Zeitraum.
 *
 * Mitarbeitende kommen nur an die eigenen Zahlen, Vorgesetzte an alle
 * der eigenen Firma, einschliesslich der jeweils anderen vorgesetzten
 * Person. Die Firma wird mitgeprüft: die Rolle allein sagt nichts
 * darüber, zu welcher Firma eine fremde Kennung gehört.
 */
export async function auswertungPerson(
  user: SessionUser,
  personId: string,
  zeitraum: Zeitraum,
): Promise<PersonAuswertung> {
  if (user.role !== "ADMIN" && user.id !== personId) throw new Error("FORBIDDEN");

  const person = await db.user.findUnique({
    where: { id: personId },
    select: { id: true, name: true, companyId: true },
  });
  if (!person || person.companyId !== user.companyId) throw new Error("FORBIDDEN");

  const von = new Date(`${zeitraum.von}T00:00:00Z`);
  const bis = new Date(`${zeitraum.bis}T00:00:00Z`);

  const [eintraege, feiertage, absenzen] = await Promise.all([
    db.timeEntry.findMany({
      where: {
        userId: personId,
        workDate: { gte: von, lte: bis },
        deletedAt: null,
      },
      orderBy: [{ workDate: "asc" }, { startedAt: "asc" }],
      include: { site: { select: { id: true, name: true, street: true, city: true } } },
    }),
    holidayMap(user.companyId, von, bis),
    db.absence.findMany({
      where: {
        userId: personId,
        deletedAt: null,
        // Ein abgelehnter Antrag deckt keinen Tag ab, der Tag bleibt offen.
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: bis },
        endDate: { gte: von },
      },
      select: { type: true, startDate: true, endDate: true, isHalfDay: true },
    }),
  ]);

  const positionen: Einzelposition[] = eintraege.map((e) => ({
    datum: isoUtc(e.workDate),
    von: hhmm(e.startedAt, "Europe/Zurich"),
    bis: hhmm(e.endedAt, "Europe/Zurich"),
    pause: e.breakMinutes,
    netto: netHours(e.startedAt, e.endedAt, e.breakMinutes),
    baustelle: e.site ? (e.site.name ?? `${e.site.street}, ${e.site.city}`) : null,
    istRegie: e.billingMode === "REGIE",
    notiz: e.note,
  }));

  /* Je Baustelle aufsummieren. Tage ohne Baustelle sind Werkstatt- und
   * Bürotage, die es ausdrücklich geben soll, und stehen deshalb als
   * eigene Zeile statt unter den Tisch zu fallen. */
  const proBaustelle = new Map<string, BaustellenAnteil>();
  for (const e of eintraege) {
    const id = e.site?.id ?? null;
    const label = e.site
      ? (e.site.name ?? `${e.site.street}, ${e.site.city}`)
      : "Ohne Baustelle, Werkstatt oder Büro";
    const v = proBaustelle.get(id ?? "") ?? { siteId: id, label, stunden: 0 };
    v.stunden += netHours(e.startedAt, e.endedAt, e.breakMinutes);
    proBaustelle.set(id ?? "", v);
  }

  const tageMitErfassung = new Set(eintraege.map((e) => isoUtc(e.workDate))).size;

  /* Absenzen Tag für Tag, mit derselben Regel wie die Monatsübersicht:
   * am Wochenende und am Feiertag wird kein Ferientag verbraucht, ein
   * halber Tag zählt halb. */
  let ferientage = 0;
  let krankheitstage = 0;
  let uebrigeAbsenztage = 0;
  let werktage = 0;
  let feiertageImZeitraum = 0;
  let offeneTage = 0;

  const erfassteTage = new Set(eintraege.map((e) => isoUtc(e.workDate)));

  for (const tag of tageIn(zeitraum)) {
    const wochenende = istWochenende(tag);
    const feiertag = feiertage.has(tag);
    if (feiertag && !wochenende) feiertageImZeitraum += 1;
    if (wochenende || feiertag) continue;

    werktage += 1;

    const absenz = absenzen.find(
      (a) => isoUtc(a.startDate) <= tag && isoUtc(a.endDate) >= tag,
    );
    if (absenz) {
      const anteil = absenz.isHalfDay ? 0.5 : 1;
      if (absenz.type === "VACATION") ferientage += anteil;
      else if (absenz.type === "SICK") krankheitstage += anteil;
      else uebrigeAbsenztage += anteil;
    }

    // Ein halber Absenztag deckt den Tag nicht ganz: die andere Hälfte
    // wurde gearbeitet und gehört erfasst.
    if (!erfassteTage.has(tag) && !(absenz && !absenz.isHalfDay)) offeneTage += 1;
  }

  return {
    person: { id: person.id, name: person.name },
    zeitraum,
    werktage,
    tageMitErfassung,
    nettostunden: runde(positionen.reduce((s, p) => s + p.netto, 0)),
    pausenMinuten: eintraege.reduce((s, e) => s + e.breakMinutes, 0),
    ferientage,
    krankheitstage,
    uebrigeAbsenztage,
    feiertage: feiertageImZeitraum,
    offeneTage,
    proBaustelle: [...proBaustelle.values()]
      .map((b) => ({ ...b, stunden: runde(b.stunden) }))
      .sort((a, b) => b.stunden - a.stunden),
    positionen,
  };
}

/** Stunden auf zwei Stellen, sonst summieren sich Rundungsreste sichtbar auf. */
const runde = (n: number) => Math.round(n * 100) / 100;
