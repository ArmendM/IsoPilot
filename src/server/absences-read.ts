// Lesezugriffe auf Absenzen, getrennt von der Datei mit "use server".
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { assertOwnerOrAdmin } from "./guards";

const isoUtc = (d: Date) => d.toISOString().slice(0, 10);

export type AbsenzZeile = {
  id: string;
  personId: string;
  personName: string;
  typ: "VACATION" | "SICK" | "OTHER";
  status: "PENDING" | "APPROVED" | "DENIED";
  von: string;
  bis: string;
  tage: number;
  halberTag: boolean;
  note: string | null;
  entschiedenVon: string | null;
};

/**
 * Absenzen eines Jahres. personId "alle" ist nur für Vorgesetzte,
 * Mitarbeitende bekommen ausschliesslich ihre eigenen.
 */
export async function absenzen(
  user: SessionUser,
  personId: string,
  jahr: number,
): Promise<AbsenzZeile[]> {
  const alle = personId === "alle";
  if (alle && user.role !== "ADMIN") throw new Error("FORBIDDEN");
  if (!alle) assertOwnerOrAdmin(user, personId);

  const von = new Date(Date.UTC(jahr, 0, 1));
  const bis = new Date(Date.UTC(jahr, 11, 31));

  const rows = await db.absence.findMany({
    where: {
      deletedAt: null,
      ...(alle ? { user: { companyId: user.companyId } } : { userId: personId }),
      startDate: { lte: bis },
      endDate: { gte: von },
    },
    orderBy: [{ startDate: "desc" }],
    include: {
      user: { select: { id: true, name: true } },
      decidedBy: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    personId: r.user.id,
    personName: r.user.name,
    typ: r.type,
    status: r.status,
    von: isoUtc(r.startDate),
    bis: isoUtc(r.endDate),
    tage: Number(r.workingDays),
    halberTag: r.isHalfDay,
    note: r.note,
    entschiedenVon: r.decidedBy?.name ?? null,
  }));
}
