import { db } from "@/lib/db";

type ApiHoliday = { startDate: string; name: { language: string; text: string }[] };

/** Nächtlich per Cron. Bestätigte Einträge werden nie überschrieben:
 *  der Mensch hat gegen die API recht. */
export async function syncHolidays() {
  const year = new Date().getFullYear();
  const sub = process.env.HOLIDAY_SUBDIVISION ?? "CH-LU";
  const url =
    `https://openholidaysapi.org/PublicHolidays?countryIsoCode=CH` +
    `&subdivisionCode=${sub}&languageIsoCode=DE` +
    `&validFrom=${year}-01-01&validTo=${year + 2}-12-31`;

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenHolidays ${res.status}`);
  const items = (await res.json()) as ApiHoliday[];

  const companies = await db.company.findMany({ select: { id: true } });
  let written = 0;

  for (const c of companies) {
    for (const h of items) {
      const name = h.name.find((n) => n.language === "DE")?.text ?? h.name[0].text;
      await db.holiday.upsert({
        where: {
          companyId_date_subdivision: {
            companyId: c.id,
            date: new Date(h.startDate),
            subdivision: sub,
          },
        },
        update: { name, source: "openholidays", fetchedAt: new Date() },
        create: {
          companyId: c.id,
          date: new Date(h.startDate),
          name,
          subdivision: sub,
          source: "openholidays",
        },
      });
      written++;
    }
  }
  return { written };
}

export async function holidaySet(companyId: string, from: Date, to: Date) {
  const rows = await db.holiday.findMany({
    where: { companyId, date: { gte: from, lte: to } },
    select: { date: true },
  });
  return new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
}
