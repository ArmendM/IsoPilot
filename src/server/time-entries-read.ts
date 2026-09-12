// Lesezugriffe auf Zeiteinträge. Absichtlich getrennt von
// time-entries.ts: eine Datei mit "use server" macht jeden Export zu
// einer Server Action, die der Browser aufrufen kann. Abfragen gehören
// nicht dorthin.
import { db } from "@/lib/db";
import { netHours } from "@/lib/dates";
import type { SessionUser } from "@/lib/session";
import { assertOwnerOrAdmin } from "./guards";

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
