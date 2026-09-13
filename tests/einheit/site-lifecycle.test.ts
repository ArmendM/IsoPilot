import { describe, expect, it } from "vitest";
import {
  NEXT_STATUS,
  assertTransition,
  canBookMaterial,
  canBookTime,
  needsReason,
  type SiteLifecycleStatus,
} from "@/server/site-lifecycle";

/* Das Statusmodell aus docs/lifecycle.md. Reine Rechenlogik, keine
 * Datenbank. Noch nicht aufgerufen, siehe M6b, aber genau deshalb
 * festgenagelt: ohne Test merkt niemand, wenn die Tabelle wegdriftet. */

const ALLE: SiteLifecycleStatus[] = [
  "OFFERTE",
  "AUFTRAG",
  "GEPLANT",
  "IN_ARBEIT",
  "AUSGEFUEHRT",
  "VERRECHNET",
  "ABGESCHLOSSEN",
  "PAUSIERT",
  "VERLOREN",
  "STORNIERT",
];

describe("Übergangstabelle", () => {
  it("führt den geraden Weg von der Offerte bis abgeschlossen", () => {
    const weg: SiteLifecycleStatus[] = [
      "OFFERTE",
      "AUFTRAG",
      "GEPLANT",
      "IN_ARBEIT",
      "AUSGEFUEHRT",
      "VERRECHNET",
      "ABGESCHLOSSEN",
    ];
    for (let i = 0; i < weg.length - 1; i++) {
      expect(NEXT_STATUS[weg[i]]).toContain(weg[i + 1]);
    }
  });

  it("lässt kein freies Springen zu", () => {
    expect(() => assertTransition("OFFERTE", "VERRECHNET")).toThrow("BAD_TRANSITION");
    expect(() => assertTransition("GEPLANT", "ABGESCHLOSSEN")).toThrow("BAD_TRANSITION");
  });

  it("nimmt aus einem Endstatus nichts mehr an", () => {
    expect(NEXT_STATUS.ABGESCHLOSSEN).toEqual([]);
    expect(NEXT_STATUS.STORNIERT).toEqual([]);
  });

  it("lässt eine verlorene Anfrage nur als Offerte wieder aufleben", () => {
    expect(NEXT_STATUS.VERLOREN).toEqual(["OFFERTE"]);
  });

  it("erlaubt pausieren und stornieren aus jedem laufenden Status", () => {
    const laufend: SiteLifecycleStatus[] = [
      "OFFERTE",
      "AUFTRAG",
      "GEPLANT",
      "IN_ARBEIT",
      "AUSGEFUEHRT",
      "VERRECHNET",
    ];
    for (const s of laufend) {
      expect(NEXT_STATUS[s], `${s} muss pausierbar sein`).toContain("PAUSIERT");
      expect(NEXT_STATUS[s], `${s} muss stornierbar sein`).toContain("STORNIERT");
    }
  });

  it("pausiert weder einen Endstatus noch eine verlorene Anfrage", () => {
    for (const s of ["ABGESCHLOSSEN", "VERLOREN", "STORNIERT"] as SiteLifecycleStatus[]) {
      expect(NEXT_STATUS[s]).not.toContain("PAUSIERT");
    }
  });

  /* Der eigentliche Grund für die Ableitung im Code: wer die beiden
   * Richtungen von Hand pflegt, vergisst eine, und die pausierte
   * Baustelle bleibt stecken. */
  it("kommt aus PAUSIERT in jeden Status zurück, aus dem pausiert wurde", () => {
    for (const s of ALLE) {
      if (s === "PAUSIERT") continue;
      const konntePausieren = NEXT_STATUS[s].includes("PAUSIERT");
      if (konntePausieren) {
        expect(NEXT_STATUS.PAUSIERT, `${s} muss aus der Pause erreichbar sein`).toContain(s);
      }
    }
  });

  it("lässt aus der Pause heraus stornieren", () => {
    expect(NEXT_STATUS.PAUSIERT).toContain("STORNIERT");
  });

  it("nennt keinen Status, den es nicht gibt", () => {
    for (const s of ALLE) {
      for (const ziel of NEXT_STATUS[s]) expect(ALLE).toContain(ziel);
    }
  });
});

describe("Begründungspflicht", () => {
  it("verlangt einen Grund für Abbruch, Verlust und Pause", () => {
    expect(needsReason("IN_ARBEIT", "PAUSIERT")).toBe(true);
    expect(needsReason("IN_ARBEIT", "STORNIERT")).toBe(true);
    expect(needsReason("OFFERTE", "VERLOREN")).toBe(true);
  });

  it("verlangt einen Grund für jeden Rückschritt auf dem geraden Weg", () => {
    expect(needsReason("AUSGEFUEHRT", "IN_ARBEIT")).toBe(true);
    expect(needsReason("VERRECHNET", "AUSGEFUEHRT")).toBe(true);
    expect(needsReason("GEPLANT", "AUFTRAG")).toBe(true);
  });

  it("verlangt keinen Grund vorwärts", () => {
    expect(needsReason("OFFERTE", "AUFTRAG")).toBe(false);
    expect(needsReason("IN_ARBEIT", "AUSGEFUEHRT")).toBe(false);
  });

  it("verlangt keinen Grund fürs Fortsetzen nach der Pause", () => {
    expect(needsReason("PAUSIERT", "IN_ARBEIT")).toBe(false);
  });

  it("weist einen begründungspflichtigen Wechsel ohne Grund ab", () => {
    expect(() => assertTransition("IN_ARBEIT", "PAUSIERT")).toThrow("REASON_REQUIRED");
    expect(() => assertTransition("IN_ARBEIT", "PAUSIERT", "   ")).toThrow("REASON_REQUIRED");
    expect(() => assertTransition("IN_ARBEIT", "PAUSIERT", "Winterpause")).not.toThrow();
  });
});

describe("Was sich buchen lässt", () => {
  it("bucht Zeit ab Auftrag, aber nicht in der Offertphase", () => {
    expect(canBookTime("OFFERTE")).toBe(false);
    expect(canBookTime("AUFTRAG")).toBe(true);
    expect(canBookTime("GEPLANT")).toBe(true);
    expect(canBookTime("IN_ARBEIT")).toBe(true);
  });

  it("bucht Material bereits in der Offertphase", () => {
    expect(canBookMaterial("OFFERTE")).toBe(true);
    expect(canBookMaterial("AUSGEFUEHRT")).toBe(true);
  });

  /* Genau die Lücke, die heute in saveMaterialBooking fehlt. */
  it("bucht weder auf eine pausierte noch auf eine abgeschlossene Baustelle", () => {
    for (const s of ["PAUSIERT", "ABGESCHLOSSEN", "STORNIERT"] as SiteLifecycleStatus[]) {
      expect(canBookTime(s), `Zeit auf ${s}`).toBe(false);
      expect(canBookMaterial(s), `Material auf ${s}`).toBe(false);
    }
  });
});
