// Ferienstand und Jahreslauf. Liest die Datenbank, deshalb bewusst ohne
// "use server": das hier sind Abfragen, keine Server Actions.
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import {
  anteiligerAnspruch,
  rechneStand,
  verfallsdatum,
  type Stand,
} from "@/lib/vacation";
import { assertOwnerOrAdmin } from "./guards";

const isoUtc = (d: Date) => d.toISOString().slice(0, 10);

export type Ferienstand = Stand & {
  jahr: number;
  grundanspruch: number;
  monate: number;
  anteilig: boolean;
  verfallenAm: string | null;
  krankheitstage: number;
  uebrigeTage: number;
  /** Ob eine gespeicherte Zeile dahintersteht oder frisch gerechnet wurde. */
  quelle: "gespeichert" | "berechnet";
  vonHand: boolean;
  hinweis: string | null;
};

/** Ferientage eines Jahres, aufgeteilt nach Status. */
async function ferientage(personId: string, jahr: number, verfallen: Date | null) {
  const rows = await db.absence.findMany({
    where: {
      userId: personId,
      deletedAt: null,
      startDate: { lte: new Date(Date.UTC(jahr, 11, 31)) },
      endDate: { gte: new Date(Date.UTC(jahr, 0, 1)) },
    },
    select: { type: true, status: true, workingDays: true, startDate: true },
  });

  const summe = (typ: string, status: string, nurVorVerfall = false) =>
    rows
      .filter(
        (r) =>
          r.type === typ &&
          r.status === status &&
          (!nurVorVerfall || (verfallen !== null && r.startDate <= verfallen)),
      )
      .reduce((s, r) => s + Number(r.workingDays), 0);

  return {
    bewilligt: summe("VACATION", "APPROVED"),
    beantragt: summe("VACATION", "PENDING"),
    vorVerfall:
      summe("VACATION", "APPROVED", true) + summe("VACATION", "PENDING", true),
    krankheitstage: summe("SICK", "APPROVED"),
    uebrigeTage: summe("OTHER", "APPROVED"),
  };
}

/** Nur der Rest eines Jahres, für den Übertrag ins Folgejahr. */
async function restDesJahres(
  personId: string,
  grundanspruch: number,
  jahr: number,
  eintritt: Date | null,
  austritt: Date | null,
): Promise<number> {
  const zeile = await db.vacationBalance.findUnique({
    where: { userId_year: { userId: personId, year: jahr } },
  });

  const anspruch = zeile
    ? Number(zeile.entitled)
    : anteiligerAnspruch(grundanspruch, jahr, eintritt, austritt).anspruch;
  const uebertrag = zeile ? Number(zeile.carriedOver) : 0;
  const verfallenAm = zeile?.carryOverExpiresAt ?? null;

  const t = await ferientage(personId, jahr, verfallenAm);
  // Für den Übertrag zählt der Stand am Jahresende, nicht der von heute.
  const stand = rechneStand({
    anspruch,
    uebertrag,
    verfallenAm,
    ...t,
    heute: new Date(Date.UTC(jahr, 11, 31)),
  });
  return stand.rest;
}

export async function ferienstand(
  user: SessionUser,
  personId: string,
  jahr: number,
): Promise<Ferienstand> {
  assertOwnerOrAdmin(user, personId);

  const person = await db.user.findUnique({
    where: { id: personId },
    select: {
      companyId: true,
      vacationDays: true,
      employedFrom: true,
      employedUntil: true,
    },
  });
  if (!person || person.companyId !== user.companyId) throw new Error("FORBIDDEN");

  const zeile = await db.vacationBalance.findUnique({
    where: { userId_year: { userId: personId, year: jahr } },
  });

  const anteil = anteiligerAnspruch(
    person.vacationDays,
    jahr,
    person.employedFrom,
    person.employedUntil,
  );

  const anspruch = zeile ? Number(zeile.entitled) : anteil.anspruch;
  const uebertrag = zeile ? Number(zeile.carriedOver) : 0;
  const verfallenAm = zeile?.carryOverExpiresAt ?? null;

  const t = await ferientage(personId, jahr, verfallenAm);
  const stand = rechneStand({
    anspruch,
    uebertrag,
    verfallenAm,
    ...t,
    heute: new Date(),
  });

  return {
    ...stand,
    jahr,
    grundanspruch: person.vacationDays,
    monate: anteil.monate,
    anteilig: zeile ? Number(zeile.entitled) < person.vacationDays : anteil.anteilig,
    verfallenAm: verfallenAm ? isoUtc(verfallenAm) : null,
    krankheitstage: t.krankheitstage,
    uebrigeTage: t.uebrigeTage,
    quelle: zeile ? "gespeichert" : "berechnet",
    vonHand: zeile?.isManual ?? false,
    hinweis: zeile
      ? null
      : "Für dieses Jahr gibt es noch keine gespeicherte Zeile. Der Anspruch ist gerechnet, ein Übertrag aus dem Vorjahr ist nicht berücksichtigt.",
  };
}

/**
 * Jahreslauf. Legt für jede aktive Person die Zeile des Jahres an:
 * Anspruch anteilig, Übertrag aus dem Vorjahresrest, Verfall Ende März.
 * Von Hand angepasste Zeilen bleiben unberührt.
 */
export async function rolloverVacation(zieljahr?: number) {
  const jahr = zieljahr ?? new Date().getFullYear();
  const personen = await db.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      vacationDays: true,
      employedFrom: true,
      employedUntil: true,
    },
  });

  let angelegt = 0;
  let aktualisiert = 0;
  let vonHandUebersprungen = 0;

  for (const p of personen) {
    const vorhanden = await db.vacationBalance.findUnique({
      where: { userId_year: { userId: p.id, year: jahr } },
      select: { isManual: true },
    });
    if (vorhanden?.isManual) {
      vonHandUebersprungen++;
      continue;
    }

    const anspruch = anteiligerAnspruch(
      p.vacationDays,
      jahr,
      p.employedFrom,
      p.employedUntil,
    ).anspruch;

    // Nur übertragen, wenn IsoPilot für das Vorjahr überhaupt Daten hat.
    // Sonst würde für jedes Jahr vor der Einführung ein voller Anspruch
    // erfunden und als Übertrag mitgeschleppt.
    const vorjahr = jahr - 1;
    const [zeilenVorjahr, absenzenVorjahr] = await Promise.all([
      db.vacationBalance.count({ where: { userId: p.id, year: vorjahr } }),
      db.absence.count({
        where: {
          userId: p.id,
          deletedAt: null,
          startDate: { lte: new Date(Date.UTC(vorjahr, 11, 31)) },
          endDate: { gte: new Date(Date.UTC(vorjahr, 0, 1)) },
        },
      }),
    ]);

    // Ein negativer Rest wird nicht mitgeschleppt: zu viel bezogene Ferien
    // sind eine Frage für die Lohnabrechnung, nicht für den Übertrag.
    const uebertrag =
      zeilenVorjahr + absenzenVorjahr === 0
        ? 0
        : Math.max(
            0,
            await restDesJahres(
              p.id,
              p.vacationDays,
              vorjahr,
              p.employedFrom,
              p.employedUntil,
            ),
          );

    const daten = {
      entitled: anspruch,
      carriedOver: uebertrag,
      carryOverExpiresAt: uebertrag > 0 ? verfallsdatum(jahr) : null,
    };

    if (vorhanden) {
      await db.vacationBalance.update({
        where: { userId_year: { userId: p.id, year: jahr } },
        data: daten,
      });
      aktualisiert++;
    } else {
      await db.vacationBalance.create({
        data: { userId: p.id, year: jahr, ...daten },
      });
      angelegt++;
    }
  }

  return { jahr, angelegt, aktualisiert, vonHandUebersprungen };
}
