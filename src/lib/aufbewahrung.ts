/* Die Aufbewahrungsfristen als Zahlen und Regeln, ohne Prisma und ohne
 * React. Verbindlich ist die Tabelle in CLAUDE.md, Abschnitt
 * "Aufbewahrung". Was hier steht, ist die Umsetzung davon.
 *
 * | Daten                                | Frist     |
 * |--------------------------------------|-----------|
 * | Zeiteinträge, Ferien, Audit-Log      | 10 Jahre  |
 * | Absenz "krank" als Tatsache          | 10 Jahre  |
 * | Notiz oder Grund zur Krankheit       | 18 Monate |
 * | Sitzungen und Anmeldeprotokolle      | 90 Tage   |
 */

/** Anmeldeprotokolle und Sitzungen, in Tagen. */
export const ANMELDUNG_TAGE = 90;

/** Krankheitsnotizen, in Monaten. Besonders schützenswerte Personendaten
 *  nach revDSG, deshalb kürzer als der Absenzeintrag selbst. */
export const KRANKHEITSNOTIZ_MONATE = 18;

/** Geschäftsdaten nach OR 958f, in Jahren. */
export const GESCHAEFTSDATEN_JAHRE = 10;

/**
 * Welche Einträge im Audit-Log ein Anmeldeprotokoll sind und damit nach
 * 90 Tagen verschwinden.
 *
 * **Eine ausgeschriebene Liste, bewusst keine Regel über den Namen.**
 * Ein Muster wie "enthält LOCK" nähme `LOCKED` und `UNLOCKED` mit, und
 * das sind die Monatsabschlüsse: zehn Jahre aufzubewahrende
 * Geschäftsdaten, die niemand zurückholen kann. Löschen ist die
 * Richtung, in der ein Irrtum nicht zu heilen ist, deshalb steht hier
 * genau das, was gehen soll, und sonst nichts.
 *
 * Wer eine Anmeldung protokolliert, trägt die Aktion hier nach. Bis
 * dahin bleibt der Eintrag stehen, und das ist die harmlosere Richtung:
 * zu lange aufbewahrt statt zu früh gelöscht.
 *
 * `USER_BOOTSTRAP` und `USER_SELF_CREATED` gehören ausdrücklich nicht
 * dazu. Dass ein Konto entstanden ist, ist keine Anmeldung, sondern der
 * Anfang eines Arbeitsverhältnisses.
 */
export const ANMELDEPROTOKOLLE = ["LOGIN_OIDC"] as const;

export function istAnmeldeprotokoll(action: string): boolean {
  return (ANMELDEPROTOKOLLE as readonly string[]).includes(action);
}

/**
 * Der Zeitpunkt, vor dem ein Anmeldeprotokoll zu löschen ist.
 *
 * Gerechnet wird auf dem Zeitstempel und nicht auf dem Kalendertag: ein
 * Anmeldeprotokoll trägt eine Uhrzeit, keinen `@db.Date`. Damit spielt
 * die Zeitzone hier keine Rolle, anders als bei Arbeitstagen und
 * Ferien. Die Frist ist ohnehin auf den Tag genau gemeint, nicht auf
 * die Minute.
 */
export function anmeldungGrenze(jetzt: Date): Date {
  return new Date(jetzt.getTime() - ANMELDUNG_TAGE * 24 * 60 * 60 * 1000);
}
