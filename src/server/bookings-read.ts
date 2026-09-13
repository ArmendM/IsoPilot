// Lesezugriffe auf Materialbuchungen.
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { isoDate } from "@/lib/dates";

export type BuchungZeile = {
  id: string;
  siteId: string;
  materialId: string | null;
  bezeichnung: string;
  sku: string | null;
  unit: "M2" | "LFM" | "STK" | "KG" | "ROLLE";
  menge: number;
  einzelpreis: number;
  summe: number;
  bookedOn: string;
  userId: string;
  userName: string;
};

/**
 * Materialbuchungen der Firma, neueste zuerst. Mitarbeitende sehen nur
 * eigene Buchungen, Vorgesetzte alle. Nur Katalogbuchungen: VSI-Positionen
 * kommen erst mit M3e.
 */
export async function buchungen(user: SessionUser): Promise<BuchungZeile[]> {
  const rows = await db.materialBooking.findMany({
    where: {
      deletedAt: null,
      kind: "CATALOG",
      site: { companyId: user.companyId },
      ...(user.role === "ADMIN" ? {} : { userId: user.id }),
    },
    orderBy: { bookedOn: "desc" },
    include: {
      material: { select: { name: true, sku: true } },
      user: { select: { name: true } },
    },
  });

  return rows.map((b) => {
    const menge = Number(b.quantity);
    const einzelpreis = Number(b.unitPrice);
    return {
      id: b.id,
      siteId: b.siteId,
      materialId: b.materialId,
      bezeichnung: b.material?.name ?? b.label ?? "Unbekannt",
      sku: b.material?.sku ?? null,
      unit: b.unit,
      menge,
      einzelpreis,
      summe: menge * einzelpreis,
      bookedOn: isoDate(b.bookedOn),
      userId: b.userId,
      userName: b.user.name,
    };
  });
}

export type MaterialWahl = {
  id: string;
  sku: string | null;
  name: string;
  unit: "M2" | "LFM" | "STK" | "KG" | "ROLLE";
  preis: number;
  lager: number;
};

/** Aktive Artikel zur Auswahl bei der Buchung. */
export async function materialAuswahl(user: SessionUser): Promise<MaterialWahl[]> {
  const rows = await db.material.findMany({
    where: { companyId: user.companyId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, sku: true, name: true, unit: true, price: true, stock: true },
  });
  return rows.map((m) => ({
    id: m.id,
    sku: m.sku,
    name: m.name,
    unit: m.unit,
    preis: Number(m.price),
    lager: Number(m.stock),
  }));
}
