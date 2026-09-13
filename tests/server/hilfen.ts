import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";

/** Wer gerade angemeldet ist. Die Tests setzen das, der Mock von
 *  @/lib/session liest es. */
export const sitzung: { user: SessionUser | null } = { user: null };

export async function firma(name = "Isoteam Suljejmani GmbH") {
  return db.company.create({
    data: { name, street: "Gerliswilstrasse 68", zip: "6020", city: "Emmenbrücke" },
  });
}

export async function person(
  companyId: string,
  name: string,
  role: "EMPLOYEE" | "ADMIN" = "EMPLOYEE",
) {
  const u = await db.user.create({ data: { companyId, name, role, isActive: true } });
  return { ...u, alsSitzung: (): SessionUser => ({
    id: u.id,
    companyId: u.companyId,
    name: u.name,
    role: u.role as "EMPLOYEE" | "ADMIN",
    vacationDays: u.vacationDays,
  }) };
}

export async function baustelle(
  companyId: string,
  status: "OPEN" | "PAUSED" | "DONE" = "OPEN",
) {
  return db.site.create({
    data: { companyId, name: "Testobjekt", street: "Industriestrasse 8", zip: "6030", city: "Ebikon", status },
  });
}

export async function artikel(companyId: string, preis = "12.50", lager = "100") {
  const kategorie = await db.category.create({ data: { companyId, name: "Armaflex" } });
  return db.material.create({
    data: {
      companyId,
      categoryId: kategorie.id,
      name: "Armaflex AF 19 mm",
      sku: "AF-19",
      unit: "M2",
      price: preis,
      stock: lager,
      minStock: "10",
    },
  });
}

/** Lagerbestand frisch aus der Datenbank, als Zahl. */
export async function lager(materialId: string) {
  const m = await db.material.findUniqueOrThrow({ where: { id: materialId } });
  return Number(m.stock);
}
