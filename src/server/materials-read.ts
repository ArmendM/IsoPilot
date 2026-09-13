// Lesezugriffe auf den Materialkatalog.
import { bestellbedarf } from "@/lib/lagerdeckung";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";

export const EINHEIT: Record<string, string> = {
  M2: "m²",
  LFM: "Laufmeter",
  STK: "Stück",
  KG: "kg",
  ROLLE: "Rolle",
};

export type ArtikelZeile = {
  id: string;
  sku: string | null;
  name: string;
  categoryId: string | null;
  kategorie: string | null;
  unit: "M2" | "LFM" | "STK" | "KG" | "ROLLE";
  preis: number;
  lager: number;
  mindestbestand: number;
  /** Auf Baustellen gebucht, ohne dass das Lager es decken konnte. */
  fehlmenge: number;
  /** Was bestellt werden muss: Fehlmenge plus was bis zum Mindestbestand fehlt. */
  bestellbedarf: number;
  fireClass: string | null;
  istAktiv: boolean;
  /** Lager unter dem Mindestbestand. Nur wenn ein Mindestbestand gesetzt ist. */
  unterMindestbestand: boolean;
};

export type KategorieZeile = {
  id: string;
  name: string;
  sortOrder: number;
  artikel: number;
};

export async function katalog(
  user: SessionUser,
  opts: { kategorieId?: string; suche?: string; mitStillgelegten?: boolean } = {},
): Promise<ArtikelZeile[]> {
  const suche = opts.suche?.trim();

  const rows = await db.material.findMany({
    where: {
      companyId: user.companyId,
      ...(opts.mitStillgelegten ? {} : { isActive: true }),
      ...(opts.kategorieId ? { categoryId: opts.kategorieId } : {}),
      ...(suche
        ? {
            OR: [
              { name: { contains: suche, mode: "insensitive" } },
              { sku: { contains: suche, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    include: { category: { select: { id: true, name: true } } },
  });

  return rows.map((m) => {
    const lager = Number(m.stock);
    const fehlmenge = Number(m.shortfall);
    const mindest = Number(m.minStock);
    return {
      id: m.id,
      sku: m.sku,
      name: m.name,
      categoryId: m.category?.id ?? null,
      kategorie: m.category?.name ?? null,
      unit: m.unit,
      preis: Number(m.price),
      lager,
      mindestbestand: mindest,
      fehlmenge,
      bestellbedarf: bestellbedarf({ bestand: lager, fehlmenge }, mindest),
      fireClass: m.fireClass,
      istAktiv: m.isActive,
      unterMindestbestand: mindest > 0 && lager < mindest,
    };
  });
}

export async function kategorien(user: SessionUser): Promise<KategorieZeile[]> {
  const rows = await db.category.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { materials: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    artikel: c._count.materials,
  }));
}
