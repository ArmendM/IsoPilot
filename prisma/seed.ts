/**
 * Stammdaten für IsoPilot.
 * Ausführen: npm run db:seed
 *
 * Enthält bewusst keine Zeiteinträge. Echte Stunden entstehen im Betrieb.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Eigener Client statt src/lib/db.ts: der Seed läuft ausserhalb von Next
// und soll die Verbindung am Ende sauber schliessen.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const company = await db.company.upsert({
    where: { id: "isoteam" },
    update: {},
    create: {
      id: "isoteam",
      name: "IsoTeam Suljejmani GmbH",
      street: "Gerliswilstrasse 68",
      zip: "6020",
      city: "Emmenbrücke",
      vatNumber: "CHE-190.604.537",
      phone: "079 616 89 75",
      email: "isoteam.daut@gmail.com",
      canton: "LU",
      defaultVacationDays: 25,
      // Regietarife gemäss Preisliste 01.01.2024
      regieRateA: 84,
      regieRateB: 76,
      // QR-IBAN vor dem ersten Rechnungsversand eintragen
      iban: null,
    },
  });

  // Bewusst keine Personen: die Identität liegt beim IdP. Konten entstehen
  // bei der ersten Anmeldung, die erste wird automatisch Vorgesetzter.
  // Alle weiteren gibt ein Vorgesetzter frei.

  const partners = [
    { name: "Flüma Klima AG", street: "Industriestrasse 8", zip: "6031", city: "Ebikon",
      phone: "041 445 68 28", website: "fluema.ch" },
    { name: "Air Five AG", street: "Parkstrasse 1a", zip: "6214", city: "Schenkon",
      phone: "041 700 49 60", website: "air-five.ch" },
  ];
  for (const p of partners) {
    await db.partner.upsert({
      where: { companyId_name: { companyId: company.id, name: p.name } },
      update: {},
      create: { ...p, companyId: company.id },
    });
  }

  // Preisliste Stand 01.01.2024. Kleinmengenzuschlag unter 30 m2.
  const cats = ["Thermische Dämmung", "Synthetischer Kautschuk", "Brandschutzdämmung",
                "Alublech-Verkleidung", "Brandabschottung Weichschott"];
  const catIds: Record<string, string> = {};
  for (const [i, name] of cats.entries()) {
    const c = await db.category.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: {},
      create: { companyId: company.id, name, sortOrder: i },
    });
    catIds[name] = c.id;
  }

  const mats = [
    ["TH-20","Thermische Dämmung","Thermisch 20mm (Paroc/Flumroc)","M2",25,null],
    ["TH-30","Thermische Dämmung","Thermisch 30mm (Paroc/Flumroc)","M2",27,null],
    ["TH-40","Thermische Dämmung","Thermisch 40mm (Paroc/Flumroc)","M2",30,null],
    ["TH-50","Thermische Dämmung","Thermisch 50mm (Paroc/Flumroc)","M2",34,null],
    ["TH-60","Thermische Dämmung","Thermisch 60mm (Paroc/Flumroc)","M2",36,null],
    ["TH-100","Thermische Dämmung","Thermisch 100mm (Paroc/Flumroc)","M2",48,null],
    ["AF-13","Synthetischer Kautschuk","Armaflex XG 13mm","M2",49,null],
    ["AF-19","Synthetischer Kautschuk","Armaflex XG 19mm","M2",58,null],
    ["AF-25","Synthetischer Kautschuk","Armaflex XG 25mm","M2",66,null],
    ["AF-32","Synthetischer Kautschuk","Armaflex XG 32mm","M2",78,null],
    ["AF-40","Synthetischer Kautschuk","Armaflex XG 40mm","M2",86,null],
    ["AF-50","Synthetischer Kautschuk","Armaflex XG 50mm","M2",91,null],
    ["FMI30-50","Brandschutzdämmung","Flumroc FMI 500 FP 50mm","M2",56,"EI 30"],
    ["FMI60-80","Brandschutzdämmung","Flumroc FMI 500 FP 80mm","M2",70,"EI 60"],
    ["FMI60-100","Brandschutzdämmung","Flumroc FMI 500 FP 100mm","M2",88,"EI 60"],
    ["CD30-60","Brandschutzdämmung","Conlit Ductbord 30 LW 60mm","M2",54,"EI 30"],
    ["CD30-100","Brandschutzdämmung","Conlit Ductbord 30 LW 100mm","M2",73,"EI 30"],
    ["CD60-60","Brandschutzdämmung","Conlit Ductbord 60 LW 60mm","M2",64,"EI 60"],
    ["CD60-100","Brandschutzdämmung","Conlit Ductbord 60 LW 100mm","M2",88,"EI 60"],
    ["CD90-80","Brandschutzdämmung","Conlit Ductbord 90 80mm","M2",80,"EI 90"],
    ["ALU-GS","Alublech-Verkleidung","Aluminium halbhart, glatt oder stucco","M2",85,null],
    ["WS-100","Brandabschottung Weichschott","Weichschott bis 100 cm2","STK",75,"VKF"],
    ["WS-500","Brandabschottung Weichschott","Weichschott 101-500 cm2","STK",144,"VKF"],
    ["WS-1000","Brandabschottung Weichschott","Weichschott 501-1000 cm2","STK",185,"VKF"],
    ["WS-2000","Brandabschottung Weichschott","Weichschott 1001-2000 cm2","STK",228,"VKF"],
    ["WS-4000","Brandabschottung Weichschott","Weichschott 2001-4000 cm2","STK",304,"VKF"],
    ["WS-6000","Brandabschottung Weichschott","Weichschott 4001-6000 cm2","STK",405,"VKF"],
    ["WS-8000","Brandabschottung Weichschott","Weichschott 6001-8000 cm2","STK",495,"VKF"],
    ["WS-10000","Brandabschottung Weichschott","Weichschott 8001-10000 cm2","STK",558,"VKF"],
  ] as const;

  for (const [sku, cat, name, unit, price, fire] of mats) {
    const alu = sku === "ALU-GS";
    await db.material.upsert({
      where: { companyId_sku: { companyId: company.id, sku } },
      update: { price },
      create: {
        companyId: company.id, categoryId: catIds[cat], sku, name,
        unit: unit as never, price,
        fireClass: fire ?? undefined,
        smallQtyThreshold: unit === "M2" ? 30 : null,
        smallQtySurcharge: unit === "M2" ? (alu ? 5 : 2) : null,
      },
    });
  }

  console.log("Seed fertig: Firma, 2 Partner, 5 Kategorien, 29 Artikel");
  console.log("Personen entstehen bei der ersten Anmeldung über Infomaniak.");
  console.log("Offen: QR-IBAN eintragen, VSI-Tarife importieren");
}

main().finally(() => db.$disconnect());
