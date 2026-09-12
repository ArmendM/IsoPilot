import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { format, eachDayOfInterval, isWeekend } from "date-fns";

export const TZ = "Europe/Zurich";

/** Lokale Schweizer Eingabe in UTC umwandeln. Immer diese Funktion verwenden. */
export const zurichToUtc = (day: string, hhmm: string): Date =>
  fromZonedTime(`${day} ${hhmm}`, TZ);

/** UTC aus der Datenbank für die Anzeige in Schweizer Zeit. */
export const utcToZurich = (d: Date): Date => toZonedTime(d, TZ);

export const isoDate = (d: Date): string => format(utcToZurich(d), "yyyy-MM-dd");
export const todayISO = (): string => isoDate(new Date());
export const monthKey = (d: Date | string): string =>
  typeof d === "string" ? d.slice(0, 7) : isoDate(d).slice(0, 7);

export function monthRange(d: Date) {
  const z = utcToZurich(d);
  const from = new Date(Date.UTC(z.getFullYear(), z.getMonth(), 1));
  const to = new Date(Date.UTC(z.getFullYear(), z.getMonth() + 1, 0));
  return { from, to };
}

/** Nettostunden: Bruttozeit abzüglich Pause. */
export function netHours(
  start: Date | string,
  end: Date | string | null,
  breakMinutes = 0,
): number {
  if (!end) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  return Math.max(0, (b - a) / 3_600_000 - breakMinutes / 60);
}

export const formatHours = (h: number): string => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${m % 60}min`;
};

/** Arbeitstage ohne Wochenenden und ohne die übergebenen Feiertage. */
export function workingDays(
  from: Date,
  to: Date,
  holidays: Set<string> = new Set(),
): number {
  if (to < from) return 0;
  return eachDayOfInterval({ start: from, end: to }).filter(
    (d) => !isWeekend(d) && !holidays.has(isoDate(d)),
  ).length;
}
