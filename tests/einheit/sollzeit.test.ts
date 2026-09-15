import { describe, expect, it } from "vitest";
import {
  WERKTAGE_JE_WOCHE,
  type Pensum,
  saldo,
  tagessoll,
  wochenstundenAm,
} from "@/lib/sollzeit";

const werktag = {
  wochenende: false,
  feiertag: false,
  absenzAnteil: 0,
  beschaeftigt: true,
  wochenstunden: 42,
};

describe("wochenstundenAm", () => {
  const pensen: Pensum[] = [
    { validFrom: "2026-05-01", weeklyHours: 33.6 },
    { validFrom: "2027-01-01", weeklyHours: 42 },
  ];

  it("nimmt die Vorgabe der Firma, solange kein Pensum steht", () => {
    // Eine Person ohne eigenes Pensum arbeitet Vollzeit, und niemand
    // muss ihr dafür eine Zeile anlegen.
    expect(wochenstundenAm("2026-03-01", [], 42)).toBe(42);
    expect(wochenstundenAm("2026-03-01", pensen, 42)).toBe(42);
  });

  it("nimmt das Pensum ab seinem Stichtag, den Stichtag eingeschlossen", () => {
    expect(wochenstundenAm("2026-04-30", pensen, 42)).toBe(42);
    expect(wochenstundenAm("2026-05-01", pensen, 42)).toBe(33.6);
    expect(wochenstundenAm("2026-12-31", pensen, 42)).toBe(33.6);
  });

  it("nimmt bei mehreren das jüngste, das nicht in der Zukunft liegt", () => {
    expect(wochenstundenAm("2027-06-01", pensen, 42)).toBe(42);
  });

  it("verändert die Vergangenheit nicht, wenn ein Pensum dazukommt", () => {
    /* Der eigentliche Grund für die eigene Zeile je Änderung. Mit einem
     * Feld an `User` wäre der alte Wert weg, und der Saldo vergangener
     * Monate verschöbe sich still. Genau deshalb muss der
     * Monatsabschluss den Saldo nicht einfrieren. */
    const vorher = wochenstundenAm("2026-03-01", pensen, 42);
    const spaeter = [...pensen, { validFrom: "2028-01-01", weeklyHours: 21 }];
    expect(wochenstundenAm("2026-03-01", spaeter, 42)).toBe(vorher);
    expect(wochenstundenAm("2028-02-01", spaeter, 42)).toBe(21);
  });

  it("kommt mit einer unsortierten Liste zurecht", () => {
    const durcheinander: Pensum[] = [
      { validFrom: "2027-01-01", weeklyHours: 42 },
      { validFrom: "2025-01-01", weeklyHours: 20 },
      { validFrom: "2026-05-01", weeklyHours: 33.6 },
    ];
    expect(wochenstundenAm("2026-06-01", durcheinander, 42)).toBe(33.6);
  });
});

describe("tagessoll", () => {
  it("verteilt die Woche gleichmässig auf fünf Werktage", () => {
    expect(WERKTAGE_JE_WOCHE).toBe(5);
    expect(tagessoll(werktag)).toBeCloseTo(8.4, 10);
  });

  it("rechnet Teilzeit als dieselbe Rechnung mit kleinerer Zahl", () => {
    expect(tagessoll({ ...werktag, wochenstunden: 33.6 })).toBeCloseTo(6.72, 10);
  });

  it("trägt am Wochenende und am Feiertag kein Soll", () => {
    /* Wer am Samstag arbeitet, und das kommt vor, schreibt seine Stunden
     * voll dem Saldo gut. Eine Sperre gibt es nicht und soll es nicht
     * geben, siehe CLAUDE.md. */
    expect(tagessoll({ ...werktag, wochenende: true })).toBe(0);
    expect(tagessoll({ ...werktag, feiertag: true })).toBe(0);
  });

  it("senkt das Soll um die Absenz", () => {
    // Ohne das baute jeder in den Ferien Minus auf.
    expect(tagessoll({ ...werktag, absenzAnteil: 1 })).toBe(0);
    expect(tagessoll({ ...werktag, absenzAnteil: 0.5 })).toBeCloseTo(4.2, 10);
  });

  it("trägt vor dem Eintritt und nach dem Austritt kein Soll", () => {
    expect(tagessoll({ ...werktag, beschaeftigt: false })).toBe(0);
  });

  it("wird durch eine unsinnige Absenz nicht negativ", () => {
    // Ein Anteil über 1 wäre ein Fehler weiter oben. Ein negatives Soll
    // wäre darauf keine sinnvolle Antwort: es schriebe stillschweigend
    // Überstunden gut.
    expect(tagessoll({ ...werktag, absenzAnteil: 1.5 })).toBe(0);
    expect(tagessoll({ ...werktag, absenzAnteil: -1 })).toBeCloseTo(8.4, 10);
  });
});

describe("saldo", () => {
  it("ist Anfangssaldo plus Ist minus Soll", () => {
    expect(saldo(23.5, 176, 168)).toBe(31.5);
  });

  it("wird negativ, wer weniger geleistet hat als geschuldet", () => {
    expect(saldo(0, 160, 168)).toBe(-8);
  });

  it("summiert sich über ein Jahr ohne sichtbaren Rundungsrest", () => {
    /* 8.4 lässt sich binär nicht genau darstellen. Über 250 Werktage
     * aufsummiert steht sonst am Ende 2099.9999999999995 statt 2100,
     * und in der Auswertung stünde eine krumme Zahl ohne Grund. */
    let soll = 0;
    for (let i = 0; i < 250; i++) soll += tagessoll(werktag);
    expect(saldo(0, 2100, soll)).toBe(0);
  });
});
