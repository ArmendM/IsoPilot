import { db } from "@/lib/db";

type ApiHoliday = { startDate: string; name: { language: string; text: string }[] };
export type Feiertag = { date: string; name: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Ostersonntag nach dem anonymen gregorianischen Algorithmus. */
function ostersonntag(jahr: number): Date {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(jahr, monat - 1, tag));
}

const plusTage = (d: Date, n: number) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

/** Dritter Sonntag im September. Fällt immer auf einen Sonntag und
 *  verändert die Arbeitstage daher nicht, gehört aber in die Liste. */
function bettag(jahr: number): Date {
  const d = new Date(Date.UTC(jahr, 8, 1));
  const ersterSonntag = 1 + ((7 - d.getUTCDay()) % 7);
  return new Date(Date.UTC(jahr, 8, ersterSonntag + 14));
}

/**
 * Feiertage Kanton Luzern, lokal berechnet. Nur der Rückfall, wenn die
 * OpenHolidays-API nicht antwortet. Die Liste gilt für CH-LU und ist
 * einmal jährlich kantonal zu bestätigen.
 */
export function berechneFeiertage(jahr: number): Feiertag[] {
  const o = ostersonntag(jahr);
  const p = (m: number, t: number) => iso(new Date(Date.UTC(jahr, m - 1, t)));

  return [
    { date: p(1, 1), name: "Neujahrstag" },
    { date: p(1, 2), name: "Berchtoldstag" },
    { date: iso(plusTage(o, -2)), name: "Karfreitag" },
    { date: iso(plusTage(o, 1)), name: "Ostermontag" },
    { date: iso(plusTage(o, 39)), name: "Auffahrt" },
    { date: iso(plusTage(o, 50)), name: "Pfingstmontag" },
    { date: iso(plusTage(o, 60)), name: "Fronleichnam" },
    { date: p(8, 1), name: "Bundesfeiertag" },
    { date: p(8, 15), name: "Mariä Himmelfahrt" },
    { date: iso(bettag(jahr)), name: "Eidgenössischer Dank-, Buss- und Bettag" },
    { date: p(11, 1), name: "Allerheiligen" },
    { date: p(12, 8), name: "Mariä Empfängnis" },
    { date: p(12, 25), name: "Weihnachten" },
    { date: p(12, 26), name: "Stephanstag" },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

async function vonApi(vonJahr: number, bisJahr: number, sub: string): Promise<Feiertag[]> {
  const url =
    `https://openholidaysapi.org/PublicHolidays?countryIsoCode=CH` +
    `&subdivisionCode=${sub}&languageIsoCode=DE` +
    `&validFrom=${vonJahr}-01-01&validTo=${bisJahr}-12-31`;

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OpenHolidays ${res.status}`);

  const items = (await res.json()) as ApiHoliday[];
  if (items.length === 0) throw new Error("OpenHolidays lieferte keine Einträge");

  return items.map((h) => ({
    date: h.startDate,
    name: h.name.find((n) => n.language === "DE")?.text ?? h.name[0].text,
  }));
}

/**
 * Nächtlich per Cron. Bestätigte Einträge werden nie überschrieben: hat
 * eine vorgesetzte Person einen Tag bestätigt, hat der Mensch gegen die
 * API recht.
 */
export async function syncHolidays() {
  const jahr = new Date().getFullYear();
  const bis = jahr + 2;
  const sub = process.env.HOLIDAY_SUBDIVISION ?? "CH-LU";

  // Der Rückfall kennt nur Luzern. Bei einer anderen Region wäre eine
  // lokale Berechnung schlicht falsch, dann soll der Job scheitern.
  const rueckfallMoeglich = sub === "CH-LU";

  const tage: { eintrag: Feiertag; quelle: string }[] = [];
  let ausApi: Feiertag[] = [];

  try {
    ausApi = await vonApi(jahr, bis, sub);
  } catch (e) {
    if (!rueckfallMoeglich) throw e;
    console.error("OpenHolidays nicht erreichbar, lokale Berechnung:", e);
  }

  for (const t of ausApi) tage.push({ eintrag: t, quelle: "openholidays" });

  // OpenHolidays reicht nur wenige Jahre in die Zukunft, derzeit bis 2030.
  // Jahre, die die API nicht abdeckt, würden sonst still fehlen.
  const jahreAusApi = new Set(ausApi.map((t) => t.date.slice(0, 4)));
  for (let j = jahr; j <= bis; j++) {
    if (jahreAusApi.has(String(j))) continue;
    if (!rueckfallMoeglich) {
      console.error(`Keine Feiertage für ${j} und kein Rückfall für ${sub}.`);
      continue;
    }
    for (const t of berechneFeiertage(j)) tage.push({ eintrag: t, quelle: "berechnet" });
  }

  const companies = await db.company.findMany({ select: { id: true } });
  let geschrieben = 0;
  let bestaetigtUebersprungen = 0;

  for (const c of companies) {
    for (const { eintrag, quelle } of tage) {
      const schluessel = {
        companyId: c.id,
        date: new Date(`${eintrag.date}T00:00:00Z`),
        subdivision: sub,
      };

      const vorhanden = await db.holiday.findUnique({
        where: { companyId_date_subdivision: schluessel },
        select: { confirmedAt: true },
      });

      if (vorhanden?.confirmedAt) {
        bestaetigtUebersprungen++;
        continue;
      }

      await db.holiday.upsert({
        where: { companyId_date_subdivision: schluessel },
        update: { name: eintrag.name, source: quelle, fetchedAt: new Date() },
        create: { ...schluessel, name: eintrag.name, source: quelle },
      });
      geschrieben++;
    }
  }

  const berechnet = tage.filter((t) => t.quelle === "berechnet").length;
  return {
    geschrieben,
    ausApi: tage.length - berechnet,
    berechnet,
    bestaetigtUebersprungen,
  };
}

export async function holidaySet(companyId: string, from: Date, to: Date) {
  const rows = await db.holiday.findMany({
    where: { companyId, date: { gte: from, lte: to } },
    select: { date: true },
  });
  return new Set(rows.map((r) => iso(r.date)));
}

/** Wie holidaySet, aber mit Namen für die Anzeige im Kalender. */
export async function holidayMap(companyId: string, from: Date, to: Date) {
  const rows = await db.holiday.findMany({
    where: { companyId, date: { gte: from, lte: to } },
    select: { date: true, name: true },
  });
  return new Map(rows.map((r) => [iso(r.date), r.name]));
}
