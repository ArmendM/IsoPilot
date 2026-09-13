import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";

export type SessionUser = {
  id: string;
  companyId: string;
  name: string;
  role: "EMPLOYEE" | "ADMIN";
  vacationDays: number;
  /** Lagerberechtigung neben der Rolle, siehe lib/berechtigung.ts. */
  canManageStock: boolean;
};

export const SESSION_HOURS = 12;

/** cache(): pro Request nur eine Abfrage, auch wenn zehn Komponenten fragen. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get("sid")?.value;
  if (!token) return null;

  const s = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  // mfaVerified ist entscheidend: nach dem ersten Schritt existiert bereits
  // eine Sitzung, die aber noch nichts darf.
  if (!s || s.expiresAt < new Date() || !s.mfaVerified || !s.user.isActive) return null;

  return {
    id: s.user.id,
    companyId: s.user.companyId,
    name: s.user.name,
    role: s.user.role,
    vacationDays: s.user.vacationDays,
    canManageStock: s.user.canManageStock,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const u = await getSession();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "ADMIN") throw new Error("FORBIDDEN");
  return u;
}
