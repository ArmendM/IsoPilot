// Lesezugriffe auf Konten, getrennt von der Datei mit "use server".
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";

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
      lastLoginAt: true,
      createdAt: true,
    },
  });

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
