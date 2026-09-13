// Lesezugriffe auf den Lagerverlauf.
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { isoDate } from "@/lib/dates";

export type BewegungZeile = {
  id: string;
  datum: string;
  materialId: string;
  bezeichnung: string;
  sku: string | null;
  unit: "M2" | "LFM" | "STK" | "KG" | "ROLLE";
  menge: number;
  grund: "DELIVERY" | "BOOKING" | "CORRECTION" | "RETURN" | "BOOKING_CHANGE";
  /** Wohin die Ware ging, sofern es eine Baustelle war. */
  baustelle: string | null;
  baustelleId: string | null;
  person: string;
  notiz: string | null;
};

/**
 * Der Lagerverlauf, neueste zuerst.
 *
 * Bewusst ohne Sichtbarkeitsfilter auf die Person: das Lager gehört dem
 * Betrieb, nicht der einzelnen Buchung. Wer die Seite überhaupt sehen
 * darf, entscheidet die Seite selbst.
 */
export async function lagerverlauf(
  user: SessionUser,
  filter: { materialId?: string; siteId?: string; limit?: number } = {},
): Promise<BewegungZeile[]> {
  const rows = await db.stockMovement.findMany({
    where: {
      material: { companyId: user.companyId },
      ...(filter.materialId ? { materialId: filter.materialId } : {}),
      ...(filter.siteId ? { siteId: filter.siteId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filter.limit ?? 200,
    include: {
      material: { select: { name: true, sku: true, unit: true } },
      user: { select: { name: true } },
      site: { select: { id: true, name: true, street: true } },
    },
  });

  return rows.map((b) => ({
    id: b.id,
    datum: isoDate(b.createdAt),
    materialId: b.materialId,
    bezeichnung: b.material.name,
    sku: b.material.sku,
    unit: b.material.unit,
    menge: Number(b.delta),
    grund: b.reason,
    baustelle: b.site ? (b.site.name ?? b.site.street) : null,
    baustelleId: b.site?.id ?? null,
    person: b.user.name,
    notiz: b.note,
  }));
}

/** Artikel und Baustellen zum Filtern, nur solche mit Bewegungen. */
export async function verlaufFilter(user: SessionUser) {
  const [artikel, baustellen] = await Promise.all([
    db.material.findMany({
      where: { companyId: user.companyId, movements: { some: {} } },
      select: { id: true, name: true, sku: true },
      orderBy: { name: "asc" },
    }),
    db.site.findMany({
      where: { companyId: user.companyId, stockMovements: { some: {} } },
      select: { id: true, name: true, street: true },
      orderBy: { street: "asc" },
    }),
  ]);

  return {
    artikel: artikel.map((a) => ({ id: a.id, name: a.sku ? `${a.sku} · ${a.name}` : a.name })),
    baustellen: baustellen.map((s) => ({ id: s.id, name: s.name ?? s.street })),
  };
}

/** Alle aktiven Artikel zur Auswahl beim Wareneingang. */
export async function artikelFuerEingang(user: SessionUser) {
  const rows = await db.material.findMany({
    where: { companyId: user.companyId, isActive: true },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    select: {
      id: true, sku: true, name: true, unit: true,
      stock: true, shortfall: true, minStock: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });
  return rows.map((m) => ({
    id: m.id,
    sku: m.sku,
    name: m.name,
    unit: m.unit,
    bestand: Number(m.stock),
    fehlmenge: Number(m.shortfall),
    mindestbestand: Number(m.minStock),
    kategorieId: m.categoryId,
    kategorie: m.category?.name ?? null,
  }));
}
