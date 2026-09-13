import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { firma, person } from "./hilfen";
import { kategorienAus } from "@/lib/materialwahl";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { materialAuswahl } = await import("@/server/bookings-read");

/** Die Buchung wählt zuerst die Kategorie, dann den Artikel. Dafür muss
 *  die Auswahl nach Kategorie gruppiert kommen, nicht nur nach Name. */
describe("Artikelauswahl für die Buchung", () => {
  it("sortiert nach sortOrder der Kategorie, dann nach Artikelname", async () => {
    const c = await firma();
    const u = await person(c.id, "Liridon");

    const brand = await db.category.create({
      data: { companyId: c.id, name: "Brandschutz", sortOrder: 2 },
    });
    const arma = await db.category.create({
      data: { companyId: c.id, name: "Armaflex", sortOrder: 1 },
    });

    const anlegen = (categoryId: string | null, name: string) =>
      db.material.create({
        data: { companyId: c.id, categoryId, name, unit: "M2", price: "1.00" },
      });

    // Absichtlich durcheinander angelegt.
    await anlegen(brand.id, "Rockwool EI 30");
    await anlegen(arma.id, "AF 25 mm");
    await anlegen(arma.id, "AF 19 mm");
    await anlegen(null, "Restposten");

    const rows = await materialAuswahl(u.alsSitzung());

    expect(rows.map((r) => r.name)).toEqual([
      "AF 19 mm",
      "AF 25 mm",
      "Rockwool EI 30",
      "Restposten",
    ]);
    expect(kategorienAus(rows).map((k) => k.name)).toEqual([
      "Armaflex",
      "Brandschutz",
      "Ohne Kategorie",
    ]);
  });

  it("führt einen stillgelegten Artikel nicht mehr auf", async () => {
    const c = await firma();
    const u = await person(c.id, "Liridon");
    await db.material.create({
      data: { companyId: c.id, name: "Alt", unit: "M2", price: "1.00", isActive: false },
    });

    expect(await materialAuswahl(u.alsSitzung())).toEqual([]);
  });

  it("zeigt keine Artikel einer anderen Firma", async () => {
    const c = await firma();
    const u = await person(c.id, "Liridon");
    const fremd = await firma("Flüma Klima AG");
    await db.material.create({
      data: { companyId: fremd.id, name: "Fremd", unit: "M2", price: "1.00" },
    });

    expect(await materialAuswahl(u.alsSitzung())).toEqual([]);
  });
});
