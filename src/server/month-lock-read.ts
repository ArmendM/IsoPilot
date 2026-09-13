// Lesezugriffe zum Monatsabschluss.
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { monatsuebersicht } from "./time-entries-read";
import { monatLaeuftNoch } from "@/lib/dates";

export type PersonImMonat = {
  id: string;
  name: string;
  stunden: number;
  offeneTage: number;
  absenztage: number;
  eintraege: number;
};

export type Ereignis = {
  action: "LOCKED" | "UNLOCKED";
  akteur: string;
  grund: string | null;
  am: string;
};

export type Monatsabschluss = {
  monat: string;
  gesperrt: boolean;
  laeuftNoch: boolean;
  personen: PersonImMonat[];
  offeneTageGesamt: number;
  stundenGesamt: number;
  ereignisse: Ereignis[];
};

export async function monatsabschluss(
  user: SessionUser,
  monat: string,
): Promise<Monatsabschluss> {
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");

  const aktive = await db.user.findMany({
    where: { companyId: user.companyId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Jede Person einzeln, damit dieselbe Rechnung gilt wie im Kalender.
  const personen: PersonImMonat[] = [];
  for (const p of aktive) {
    const u = await monatsuebersicht(user, p.id, monat);
    personen.push({
      id: p.id,
      name: p.name,
      stunden: u.stunden,
      offeneTage: u.offeneTage,
      absenztage: u.absenztage,
      eintraege: u.tage.reduce((s, t) => s + t.eintraege, 0),
    });
  }

  const lock = await db.monthLock.findUnique({
    where: { companyId_month: { companyId: user.companyId, month: monat } },
    include: {
      events: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { actor: { select: { name: true } } },
      },
    },
  });

  return {
    monat,
    gesperrt: lock?.isLocked ?? false,
    laeuftNoch: monatLaeuftNoch(monat),
    personen,
    offeneTageGesamt: personen.reduce((s, p) => s + p.offeneTage, 0),
    stundenGesamt: personen.reduce((s, p) => s + p.stunden, 0),
    ereignisse: (lock?.events ?? []).map((e) => ({
      action: e.action as "LOCKED" | "UNLOCKED",
      akteur: e.actor.name,
      grund: e.reason,
      am: e.createdAt.toISOString().slice(0, 16).replace("T", " "),
    })),
  };
}
