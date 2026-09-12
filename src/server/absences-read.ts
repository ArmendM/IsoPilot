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

export type Jahresstand = {
  anspruch: number;
  genehmigt: number;
  beantragt: number;
  rest: number;
  krankheitstage: number;
  uebrigeTage: number;
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

/**
 * Ferienstand einer Person in einem Jahr. Der Anspruch ist vorerst das
 * Feld an der Person. Anteilige Kürzung bei Ein- und Austritt sowie der
 * Übertrag aus dem Vorjahr kommen in M2c-2 dazu.
 */
export async function jahresstand(
  user: SessionUser,
  personId: string,
  jahr: number,
): Promise<Jahresstand> {
  assertOwnerOrAdmin(user, personId);

  const person = await db.user.findUnique({
    where: { id: personId },
    select: { vacationDays: true, companyId: true },
  });
  if (!person || person.companyId !== user.companyId) throw new Error("FORBIDDEN");

  const rows = await db.absence.findMany({
    where: {
      userId: personId,
      deletedAt: null,
      startDate: { lte: new Date(Date.UTC(jahr, 11, 31)) },
      endDate: { gte: new Date(Date.UTC(jahr, 0, 1)) },
    },
    select: { type: true, status: true, workingDays: true },
  });

  const summe = (typ: string, status: string) =>
    rows
      .filter((r) => r.type === typ && r.status === status)
      .reduce((s, r) => s + Number(r.workingDays), 0);

  const genehmigt = summe("VACATION", "APPROVED");
  const beantragt = summe("VACATION", "PENDING");

  return {
    anspruch: person.vacationDays,
    genehmigt,
    beantragt,
    rest: person.vacationDays - genehmigt - beantragt,
    krankheitstage: summe("SICK", "APPROVED"),
    uebrigeTage: summe("OTHER", "APPROVED"),
  };
}
