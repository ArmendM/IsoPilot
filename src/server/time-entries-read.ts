// Lesezugriffe auf Zeiteinträge. Absichtlich getrennt von
// time-entries.ts: eine Datei mit "use server" macht jeden Export zu
// einer Server Action, die der Browser aufrufen kann. Abfragen gehören
// nicht dorthin.
import { db } from "@/lib/db";
import { netHours } from "@/lib/dates";
import { holidayMap } from "@/lib/holidays";
import type { SessionUser } from "@/lib/session";
import { assertOwnerOrAdmin } from "./guards";

/** Datumsspalten stehen als @db.Date in der Datenbank und kommen als
 *  UTC-Mitternacht zurück. Hier wird nicht in eine Zeitzone gerechnet,
 *  sonst rutscht der Tag. */
const isoUtc = (d: Date) => d.toISOString().slice(0, 10);

export type TagesEintrag = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  breakMinutes: number;
  netto: number;
  siteId: string | null;
  siteLabel: string | null;
  istRegie: boolean;
  note: string | null;
};

/** Alle Einträge einer Person an einem Tag, aufsteigend nach Beginn. */
export async function eintraegeAmTag(
  user: SessionUser,
  personId: string,
  tag: string,
): Promise<TagesEintrag[]> {
  assertOwnerOrAdmin(user, personId);

  const rows = await db.timeEntry.findMany({
    where: {
      userId: personId,
      workDate: new Date(`${tag}T00:00:00Z`),
      deletedAt: null,
    },
    orderBy: { startedAt: "asc" },
    include: { site: { select: { name: true, street: true, city: true } } },
  });

  return rows.map((r) => ({
    id: r.id,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    breakMinutes: r.breakMinutes,
    netto: netHours(r.startedAt, r.endedAt, r.breakMinutes),
    siteId: r.siteId,
    siteLabel: r.site ? (r.site.name ?? `${r.site.street}, ${r.site.city}`) : null,
    istRegie: r.billingMode === "REGIE",
    note: r.note,
  }));
}

/** Personen zur Auswahl. Mitarbeitende sehen nur sich selbst. */
export async function auswaehlbarePersonen(user: SessionUser) {
  if (user.role !== "ADMIN") return [{ id: user.id, name: user.name }];
  return db.user.findMany({
    where: { companyId: user.companyId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Baustellen zur Auswahl. Abgeschlossene verschwinden, bleiben aber in
 *  bestehenden Einträgen sichtbar. */
export async function auswaehlbareBaustellen(companyId: string) {
  const rows = await db.site.findMany({
    where: { companyId, status: { not: "DONE" } },
    select: { id: true, name: true, street: true, city: true },
    orderBy: [{ name: "asc" }, { street: "asc" }],
  });
  return rows.map((s) => ({
    id: s.id,
    label: s.name ?? `${s.street}, ${s.city}`,
  }));
}

export type MonatsTag = {
  datum: string;
  tagImMonat: number;
  istWochenende: boolean;
  feiertag: string | null;
  absenz: {
    typ: "VACATION" | "SICK" | "OTHER";
    status: "PENDING" | "APPROVED";
    halberTag: boolean;
  } | null;
  stunden: number;
  eintraege: number;
  /** Arbeitstag ohne Eintrag und ohne Absenz. Das ist die Lücke, die
   *  am Monatsende jemandem auffallen soll. */
  istOffen: boolean;
};

export type Monatsuebersicht = {
  tage: MonatsTag[];
  stunden: number;
  arbeitstage: number;
  offeneTage: number;
  feiertage: number;
  absenztage: number;
};

/** Ein Monat einer Person, Tag für Tag. monat als "2026-09". */
export async function monatsuebersicht(
  user: SessionUser,
  personId: string,
  monat: string,
): Promise<Monatsuebersicht> {
  assertOwnerOrAdmin(user, personId);

  const [jahr, m] = monat.split("-").map(Number);
  const von = new Date(Date.UTC(jahr, m - 1, 1));
  const bis = new Date(Date.UTC(jahr, m, 0));
  const tageImMonat = bis.getUTCDate();

  const [eintraege, feiertage, absenzen] = await Promise.all([
    db.timeEntry.findMany({
      where: {
        userId: personId,
        workDate: { gte: von, lte: bis },
        deletedAt: null,
      },
      select: { workDate: true, startedAt: true, endedAt: true, breakMinutes: true },
    }),
    holidayMap(user.companyId, von, bis),
    db.absence.findMany({
      where: {
        userId: personId,
        deletedAt: null,
        // Abgelehnte Anträge deckten den Tag nicht ab, er bleibt offen.
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: bis },
        endDate: { gte: von },
      },
      select: {
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        isHalfDay: true,
      },
    }),
  ]);

  const proTag = new Map<string, { stunden: number; anzahl: number }>();
  for (const e of eintraege) {
    const k = isoUtc(e.workDate);
    const v = proTag.get(k) ?? { stunden: 0, anzahl: 0 };
    v.stunden += netHours(e.startedAt, e.endedAt, e.breakMinutes);
    v.anzahl += 1;
    proTag.set(k, v);
  }

  const tage: MonatsTag[] = [];
  for (let t = 1; t <= tageImMonat; t++) {
    const d = new Date(Date.UTC(jahr, m - 1, t));
    const datum = isoUtc(d);
    const wt = d.getUTCDay();
    const istWochenende = wt === 0 || wt === 6;
    const feiertag = feiertage.get(datum) ?? null;
    const treffer = absenzen.find(
      (a) => isoUtc(a.startDate) <= datum && isoUtc(a.endDate) >= datum,
    );
    const v = proTag.get(datum);

    tage.push({
      datum,
      tagImMonat: t,
      istWochenende,
      feiertag,
      absenz: treffer
        ? {
            typ: treffer.type,
            status: treffer.status as "PENDING" | "APPROVED",
            halberTag: treffer.isHalfDay,
          }
        : null,
      stunden: v?.stunden ?? 0,
      eintraege: v?.anzahl ?? 0,
      // Ein halber Absenztag deckt den Tag nicht ganz: die andere Hälfte
      // wurde gearbeitet und gehört erfasst.
      istOffen:
        !istWochenende && !feiertag && !v && !(treffer && !treffer.isHalfDay),
    });
  }

  return {
    tage,
    stunden: tage.reduce((s, t) => s + t.stunden, 0),
    arbeitstage: tage.filter((t) => !t.istWochenende && !t.feiertag).length,
    offeneTage: tage.filter((t) => t.istOffen).length,
    feiertage: tage.filter((t) => t.feiertag && !t.istWochenende).length,
    absenztage: tage
      .filter((t) => t.absenz && !t.istWochenende && !t.feiertag)
      .reduce((s, t) => s + (t.absenz!.halberTag ? 0.5 : 1), 0),
  };
}
