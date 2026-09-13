import { describe, expect, it } from "vitest";
import {
  formatHours,
  isoDate,
  monatLaeuftNoch,
  monthKey,
  monthRange,
  netHours,
  workingDays,
  zurichToUtc,
} from "@/lib/dates";

/* Die Zeitzone ist hier absichtlich nicht festgenagelt: Produktion läuft
 * auf Europe/Zurich, die CI auf UTC. Diese Tests müssen in beiden gleich
 * ausgehen, sonst rechnet die Anwendung auf dem Server anders als im Test. */

describe("Schweizer Zeit in UTC", () => {
  it("rechnet die Winterzeit mit einer Stunde Abstand", () => {
    expect(zurichToUtc("2026-01-15", "08:00").toISOString()).toBe("2026-01-15T07:00:00.000Z");
  });

  it("rechnet die Sommerzeit mit zwei Stunden Abstand", () => {
    expect(zurichToUtc("2026-07-15", "08:00").toISOString()).toBe("2026-07-15T06:00:00.000Z");
  });

  /* Am 29.03.2026 springt die Uhr um 02:00 auf 03:00. Ein Wert davor und
   * einer danach müssen verschieden gerechnet werden, sonst verschiebt
   * sich an zwei Tagen im Jahr jede Arbeitszeit um eine Stunde. */
  it("trifft den Wechsel auf die Sommerzeit", () => {
    expect(zurichToUtc("2026-03-29", "01:00").toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(zurichToUtc("2026-03-29", "03:00").toISOString()).toBe("2026-03-29T01:00:00.000Z");
  });
});

describe("Datum aus der Datenbank anzeigen", () => {
  it("zeigt den Schweizer Tag, nicht den UTC-Tag", () => {
    // In UTC ist das noch der 31.12., in Emmenbrücke bereits der 01.01.
    expect(isoDate(new Date("2025-12-31T23:30:00Z"))).toBe("2026-01-01");
  });

  it("ordnet einen solchen Zeitpunkt dem Schweizer Monat zu", () => {
    expect(monthKey(new Date("2025-12-31T23:30:00Z"))).toBe("2026-01");
  });

  it("kürzt einen Datumsstring ohne zu rechnen", () => {
    expect(monthKey("2026-03-15")).toBe("2026-03");
  });

  it("liefert den ersten und letzten Tag des Monats", () => {
    const { from, to } = monthRange(new Date("2026-09-13T10:00:00Z"));
    expect(isoDate(from)).toBe("2026-09-01");
    expect(isoDate(to)).toBe("2026-09-30");
  });
});

describe("Nettostunden", () => {
  it("zieht die Pause ab", () => {
    expect(netHours("2026-09-13T07:00:00Z", "2026-09-13T12:00:00Z", 30)).toBe(4.5);
  });

  it("rechnet ohne Pause mit der vollen Zeit", () => {
    expect(netHours("2026-09-13T07:00:00Z", "2026-09-13T12:00:00Z")).toBe(5);
  });

  it("gibt null zurück, solange kein Ende erfasst ist", () => {
    expect(netHours("2026-09-13T07:00:00Z", null)).toBe(0);
  });

  it("wird nie negativ, auch wenn die Pause länger ist als die Zeit", () => {
    expect(netHours("2026-09-13T07:00:00Z", "2026-09-13T08:00:00Z", 90)).toBe(0);
  });

  /* Gearbeitet wird tatsächliche Zeit, nicht Zifferblattzeit. Am Tag der
   * Umstellung zeigt die Uhr 01:00 bis 10:00, das sind acht Stunden. */
  it("zählt am Tag der Zeitumstellung die wirklich gearbeitete Zeit", () => {
    expect(netHours("2026-03-29T00:00:00Z", "2026-03-29T08:00:00Z")).toBe(8);
  });

  it("schreibt Stunden und Minuten für die Anzeige", () => {
    expect(formatHours(4.5)).toBe("4h 30min");
    expect(formatHours(0)).toBe("0h 0min");
  });
});

describe("Arbeitstage", () => {
  it("zählt den September 2026 ohne Wochenenden", () => {
    const { from, to } = monthRange(new Date("2026-09-13T10:00:00Z"));
    expect(workingDays(from, to)).toBe(22);
  });

  it("lässt einen Feiertag weg", () => {
    const { from, to } = monthRange(new Date("2026-09-13T10:00:00Z"));
    // Der 01.09.2026 ist ein Dienstag, also ein Arbeitstag.
    expect(workingDays(from, to, new Set(["2026-09-01"]))).toBe(21);
  });

  /* 05.09.2026 ist ein Samstag, 06.09. ein Sonntag.
   *
   * Dieser Test hält zugleich eine Grenze fest: workingDays rechnet über
   * eachDayOfInterval und isWeekend, und beide lesen die Systemzeitzone.
   * Bei UTC-Mitternacht stimmt das nur, solange die Verschiebung nicht
   * negativ ist. In Europe/Zurich und UTC geht es auf, in America/New_York
   * wäre der 05.09. noch Freitag und würde als Arbeitstag gezählt. Für
   * IsoPilot reicht das, siehe CLAUDE.md, Abschnitt Tests. */
  it("zählt ein Wochenende gar nicht erst", () => {
    expect(workingDays(new Date("2026-09-05T00:00:00Z"), new Date("2026-09-06T00:00:00Z"))).toBe(0);
  });

  it("gibt null zurück, wenn das Ende vor dem Anfang liegt", () => {
    expect(workingDays(new Date("2026-09-30T00:00:00Z"), new Date("2026-09-01T00:00:00Z"))).toBe(0);
  });
});

describe("Monatsabschluss", () => {
  it("lässt den laufenden Monat nicht abschliessen", () => {
    expect(monatLaeuftNoch("2026-09", new Date("2026-09-13T10:00:00Z"))).toBe(true);
  });

  it("gibt einen vergangenen Monat frei", () => {
    expect(monatLaeuftNoch("2026-08", new Date("2026-09-13T10:00:00Z"))).toBe(false);
  });

  it("behandelt einen künftigen Monat wie einen laufenden", () => {
    expect(monatLaeuftNoch("2026-10", new Date("2026-09-13T10:00:00Z"))).toBe(true);
  });
});
