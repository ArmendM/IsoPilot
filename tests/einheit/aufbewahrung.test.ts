import { describe, expect, it } from "vitest";
import {
  ANMELDUNG_TAGE,
  GESCHAEFTSDATEN_JAHRE,
  KRANKHEITSNOTIZ_MONATE,
  anmeldungGrenze,
  istAnmeldeprotokoll,
} from "@/lib/aufbewahrung";

describe("Fristen", () => {
  it("stehen so, wie CLAUDE.md sie nennt", () => {
    // Ändert jemand eine Zahl, soll er hier vorbeikommen und die Tabelle
    // in CLAUDE.md mitziehen. Die Fristen sind Recht, nicht Geschmack.
    expect(ANMELDUNG_TAGE).toBe(90);
    expect(KRANKHEITSNOTIZ_MONATE).toBe(18);
    expect(GESCHAEFTSDATEN_JAHRE).toBe(10);
  });
});

describe("istAnmeldeprotokoll", () => {
  it("nimmt die Anmeldung", () => {
    expect(istAnmeldeprotokoll("LOGIN_OIDC")).toBe(true);
  });

  /* Die eigentliche Prüfung. Gelöscht wird nach 90 Tagen, und Löschen
   * ist die Richtung, in der ein Irrtum nicht zu heilen ist. Deshalb
   * steht hier ausgeschrieben, was bleiben muss.
   *
   * `LOCKED` und `UNLOCKED` sind der Fall, der eine Regel über den Namen
   * teuer macht: ein Muster wie "enthält LOCK" nähme die
   * Monatsabschlüsse mit, und die sind zehn Jahre aufzubewahren. */
  it.each([
    "LOCKED",
    "UNLOCKED",
    "MONTH_LOCKED",
    "MONTH_UNLOCKED",
    "CREATE",
    "UPDATE",
    "DELETE",
    "USER_BOOTSTRAP",
    "USER_SELF_CREATED",
    "USER_UPDATED",
    "USER_APPROVED",
    "USER_BLOCKED",
    "USER_ROLE_CHANGED",
    "USER_STOCK_GRANTED",
    "USER_STOCK_REVOKED",
    "COMPANY_UPDATED",
    "COMPANY_LOGO_SET",
    "COMPANY_LOGO_REMOVED",
    "MATERIAL_ACTIVATED",
    "MATERIAL_DEACTIVATED",
    "SITE_OPEN",
    "SITE_PAUSED",
    "SITE_DONE",
  ])("lässt %s stehen, das sind Geschäftsdaten", (action) => {
    expect(istAnmeldeprotokoll(action)).toBe(false);
  });

  it("rät nicht über den Namen", () => {
    // Eine erfundene Aktion, die mit LOGIN anfängt, gilt nicht
    // automatisch: eingetragen wird von Hand, und bis dahin bleibt der
    // Eintrag stehen. Zu lange aufbewahrt ist die harmlosere Richtung.
    expect(istAnmeldeprotokoll("LOGIN_ETWAS_NEUES")).toBe(false);
  });
});

describe("anmeldungGrenze", () => {
  it("liegt 90 Tage zurück", () => {
    const jetzt = new Date("2026-09-15T03:00:00Z");
    expect(anmeldungGrenze(jetzt).toISOString()).toBe("2026-06-17T03:00:00.000Z");
  });

  it("rechnet über einen Jahreswechsel und einen Schalttag", () => {
    // 2028 ist ein Schaltjahr: vom 1. März zurück führt der 90. Tag auf
    // den 2. Dezember, nicht den 1.
    expect(anmeldungGrenze(new Date("2028-03-01T00:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2027-12-02",
    );
  });
});
