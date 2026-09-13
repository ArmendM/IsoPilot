// Lesezugriffe auf Baustellen.
import { db } from "@/lib/db";
import { netHours } from "@/lib/dates";
import type { SessionUser } from "@/lib/session";

export type BaustelleZeile = {
  id: string;
  objektname: string | null;
  street: string;
  zip: string;
  city: string;
  /** Was in Listen und Auswahlen steht: Objektname, sonst die Adresse. */
  bezeichnung: string;
  partnerId: string | null;
  partnerName: string | null;
  status: "OPEN" | "PAUSED" | "DONE";
  soll: number;
  ist: number;
  discountPct: number;
  personen: number;
  letzteArbeit: string | null;
};

export type Partnerwahl = { id: string; name: string };

const isoUtc = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Alle Baustellen der Firma mit Soll und Ist. Abgeschlossene sind
 * standardmässig nicht dabei, sie verschwinden aus der Auswahl, bleiben
 * aber in Auswertungen sichtbar.
 */
export async function baustellen(
  user: SessionUser,
  mitAbgeschlossenen = false,
): Promise<BaustelleZeile[]> {
  const rows = await db.site.findMany({
    where: {
      companyId: user.companyId,
      ...(mitAbgeschlossenen ? {} : { status: { not: "DONE" } }),
    },
    orderBy: [{ status: "asc" }, { name: "asc" }, { street: "asc" }],
    include: {
      partner: { select: { id: true, name: true } },
      entries: {
        where: { deletedAt: null },
        select: {
          userId: true,
          workDate: true,
          startedAt: true,
          endedAt: true,
          breakMinutes: true,
        },
      },
    },
  });

  return rows.map((s) => {
    const ist = s.entries.reduce(
      (sum, e) => sum + netHours(e.startedAt, e.endedAt, e.breakMinutes),
      0,
    );
    const tage = s.entries.map((e) => isoUtc(e.workDate)).sort();
    return {
      id: s.id,
      objektname: s.name,
      street: s.street,
      zip: s.zip,
      city: s.city,
      bezeichnung: s.name ?? `${s.street}, ${s.zip} ${s.city}`,
      partnerId: s.partner?.id ?? null,
      partnerName: s.partner?.name ?? null,
      status: s.status,
      soll: Number(s.targetHours),
      ist,
      discountPct: s.discountPct,
      personen: new Set(s.entries.map((e) => e.userId)).size,
      letzteArbeit: tage.length ? tage[tage.length - 1] : null,
    };
  });
}

export async function partnerwahl(user: SessionUser): Promise<Partnerwahl[]> {
  return db.partner.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
