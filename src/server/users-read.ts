// Lesezugriffe auf Konten, getrennt von der Datei mit "use server".
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { wochenstundenAm } from "@/lib/sollzeit";

const isoUtc = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export type PersonZeile = {
  id: string;
  name: string;
  email: string | null;
  role: "EMPLOYEE" | "ADMIN";
  isActive: boolean;
  canManageStock: boolean;
  vacationDays: number;
  regieTariff: "A" | "B";
  employedFrom: string | null;
  employedUntil: string | null;
  /** Anfangssaldo aus dem alten Vorgehen, für den Parallelbetrieb. */
  startBalance: number | null;
  balanceFrom: string | null;
  /** Pensen, jüngstes zuerst. Leer heisst: es gilt die Vorgabe der Firma. */
  pensen: { id: string; validFrom: string; weeklyHours: number }[];
  /** Wochenstunden, die heute gelten. Vorgabe oder eigenes Pensum. */
  wochenstunden: number;
  letzteAnmeldung: string | null;
  kontoSeit: string;
  istIchSelbst: boolean;
};

/** Alle Konten der Firma. Nur für Vorgesetzte. */
export async function personen(user: SessionUser): Promise<PersonZeile[]> {
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");

  const rows = await db.user.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ isActive: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      oidcEmail: true,
      role: true,
      isActive: true,
      canManageStock: true,
      vacationDays: true,
      regieTariff: true,
      employedFrom: true,
      employedUntil: true,
      startBalance: true,
      balanceFrom: true,
      workloads: {
        select: { id: true, validFrom: true, weeklyHours: true },
        orderBy: { validFrom: "desc" },
      },
      lastLoginAt: true,
      createdAt: true,
    },
  });

  // Die Vorgabe der Firma einmal, nicht je Zeile: sie ist für alle
  // dieselbe.
  const { weeklyHours: vorgabe } = await db.company.findUniqueOrThrow({
    where: { id: user.companyId },
    select: { weeklyHours: true },
  });
  const heute = new Date().toISOString().slice(0, 10);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.oidcEmail,
    role: r.role,
    isActive: r.isActive,
    canManageStock: r.canManageStock,
    vacationDays: r.vacationDays,
    regieTariff: r.regieTariff,
    employedFrom: isoUtc(r.employedFrom),
    employedUntil: isoUtc(r.employedUntil),
    startBalance: r.startBalance === null ? null : Number(r.startBalance),
    balanceFrom: isoUtc(r.balanceFrom),
    pensen: r.workloads.map((w) => ({
      id: w.id,
      validFrom: w.validFrom.toISOString().slice(0, 10),
      weeklyHours: Number(w.weeklyHours),
    })),
    wochenstunden: wochenstundenAm(
      heute,
      r.workloads.map((w) => ({
        validFrom: w.validFrom.toISOString().slice(0, 10),
        weeklyHours: Number(w.weeklyHours),
      })),
      Number(vorgabe),
    ),
    letzteAnmeldung: r.lastLoginAt ? r.lastLoginAt.toISOString().slice(0, 10) : null,
    kontoSeit: r.createdAt.toISOString().slice(0, 10),
    istIchSelbst: r.id === user.id,
  }));
}

/**
 * Wäre diese Person die letzte freigegebene vorgesetzte Person? Wenn ja,
 * darf ihr weder die Rolle noch die Freigabe genommen werden, sonst kann
 * niemand mehr jemanden freigeben.
 */
export async function istLetzterVorgesetzter(
  companyId: string,
  id: string,
): Promise<boolean> {
  const weitere = await db.user.count({
    where: { companyId, role: "ADMIN", isActive: true, id: { not: id } },
  });
  return weitere === 0;
}
