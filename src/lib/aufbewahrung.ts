/* Die Aufbewahrungsfristen als Zahlen und Regeln, ohne Prisma und ohne
 * React. Verbindlich ist die Tabelle in CLAUDE.md, Abschnitt
 * "Aufbewahrung". Was hier steht, ist die Umsetzung davon.
 *
 * **Zwei verschiedene Arten von Frist, und sie zeigen in entgegengesetzte
 * Richtungen.** Das auseinanderzuhalten ist der ganze Punkt dieser Datei:
 *
 * | Daten                           | Frist     | Art                    |
 * |---------------------------------|-----------|------------------------|
 * | Zeiteinträge, Ferien, Audit-Log | 10 Jahre  | mindestens aufbewahren |
 * | Absenz "krank" als Tatsache     | 10 Jahre  | mindestens aufbewahren |
 * | Notiz oder Grund zur Krankheit  | 18 Monate | spätestens löschen     |
 * | Sitzungen, Anmeldeprotokolle    | 90 Tage   | spätestens löschen     |
 *
 * OR 958f sagt, wie lange Geschäftsunterlagen dableiben **müssen**, nicht
 * wann sie weg **sollen**. Ein Job, der nach zehn Jahren löscht, erfindet
 * eine Pflicht, die es nicht gibt, und tut es unwiederbringlich. Wann
 * alte Unterlagen gehen, entscheidet der Betrieb.
 *
 * revDSG zeigt andersherum: Gesundheitsdaten und Anmeldespuren sind
 * spätestens dann zu löschen. Nur diese Fristen wendet
 * `server/aufbewahrung.ts` von selbst an.
 */

/** Anmeldeprotokolle und Sitzungen, in Tagen. Spätestens dann löschen. */
export const ANMELDUNG_TAGE = 90;

/** Krankheitsnotizen, in Monaten. Besonders schützenswerte Personendaten
 *  nach revDSG, deshalb kürzer als der Absenzeintrag selbst.
 *  Spätestens dann löschen. */
export const KRANKHEITSNOTIZ_MONATE = 18;

/** Geschäftsdaten nach OR 958f, in Jahren. **Mindestens** so lange
 *  aufbewahren. Danach ist Wegräumen zulässig, aber nichts tut es von
 *  selbst: `TimeEntry.keepUntil` trägt diese Frist und ist Auskunft,
 *  kein Auftrag. */
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
