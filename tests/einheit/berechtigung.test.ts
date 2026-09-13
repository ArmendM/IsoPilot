import { describe, expect, it } from "vitest";
import { darfLager } from "@/lib/berechtigung";

/* Die Lagerberechtigung steht neben der Rolle, nicht als dritte Rolle.
 * Wer eine Lieferung annimmt, soll deswegen nicht die Zeiten der anderen
 * sehen: darfLager sagt nur etwas über das Lager und über sonst nichts. */

describe("darfLager", () => {
  it("lässt einen Vorgesetzten immer ans Lager", () => {
    expect(darfLager({ role: "ADMIN", canManageStock: false })).toBe(true);
  });

  it("lässt eine mitarbeitende Person mit Lagerberechtigung ans Lager", () => {
    expect(darfLager({ role: "EMPLOYEE", canManageStock: true })).toBe(true);
  });

  it("lässt eine mitarbeitende Person ohne Lagerberechtigung nicht", () => {
    expect(darfLager({ role: "EMPLOYEE", canManageStock: false })).toBe(false);
  });

  /* Das Merkmal darf einem Vorgesetzten nichts wegnehmen. Sonst müsste es
   * ihm einzeln gesetzt werden, und ein Vergessen sperrte ihn aus dem
   * eigenen Lager aus. */
  it("nimmt einem Vorgesetzten nichts weg", () => {
    expect(darfLager({ role: "ADMIN", canManageStock: true })).toBe(true);
  });
});
