import { db } from "@/lib/db";
import { anmeldungGrenze, ANMELDEPROTOKOLLE } from "@/lib/aufbewahrung";

/* Die Aufbewahrung, M4f. Ein Job, der die Löschpflichten aus CLAUDE.md
 * anwendet, und nicht drei Stellen, die je eine kennen.
 *
 * **Er löscht nur, wo eine Pflicht zu löschen besteht.** Die zehn Jahre
 * nach OR 958f sind das Gegenteil davon: sie sagen, wie lange
 * Geschäftsunterlagen dableiben müssen, nicht wann sie weg sollen.
 * Zeiteinträge, Absenzen als Tatsache und die fachlichen Einträge im
 * Audit-Log rührt dieser Job deshalb nicht an, auch nach zehn Jahren
 * nicht. Wann sie gehen, entscheidet der Betrieb, nicht eine Nacht.
 * `TimeEntry.keepUntil` sagt nur, ab wann das überhaupt zulässig wäre.
 *
 * Gelöscht wird, wo revDSG es verlangt: die Notiz zu einer Krankheit
 * nach 18 Monaten, und Anmeldeprotokolle und Sitzungen nach 90 Tagen.
 *
 * Er läuft jede Nacht und ist **wiederholbar**: geräumt wird, was über
 * einer Grenze liegt, nie "was seit dem letzten Mal dazugekommen ist".
 * Ein zweiter Lauf am selben Tag findet nichts mehr und ändert nichts.
 * Das ist der Grund, warum es keinen Merker für den letzten Lauf gibt:
 * ein Job, der sich merken muss, wo er stand, verliert genau das beim
 * ersten Absturz.
 *
 * Die Zählung geht in die Antwort und in die Ausgabe. Der Cron-Aufruf
 * steht in `deploy/systemd/isopilot-cron.service`, die Ausgabe landet
 * damit im Journal: dort steht nachher, wie viel wann geräumt wurde.
 */

export type Aufbewahrungslauf = {
  /** Krankheitsnotizen, geleert nach 18 Monaten. Der Eintrag bleibt. */
  krankheitsnotizen: number;
  /** Anmeldeprotokolle im Audit-Log, gelöscht nach 90 Tagen. */
  anmeldeprotokolle: number;
  /** Abgelaufene Sitzungen. */
  sitzungen: number;
};

export async function aufbewahrungAnwenden(
  jetzt = new Date(),
): Promise<Aufbewahrungslauf> {
  const grenze = anmeldungGrenze(jetzt);

  /* Alles in einer Transaktion: ein halb gelaufener Aufbewahrungsjob
   * liesse sich später nicht mehr von einem vollständigen
   * unterscheiden, und die Zählung in der Ausgabe stimmte nicht mehr
   * mit dem überein, was in der Datenbank steht. */
  const [notizen, anmeldungen, sitzungen] = await db.$transaction([
    /* Nur die Notiz wird geleert, der Absenzeintrag bleibt: dass jemand
     * krank war, ist die Tatsache und gehört zu den Geschäftsunterlagen,
     * warum er krank war sind besonders schützenswerte Personendaten
     * nach revDSG.
     *
     * `note: { not: null }` ist keine Zierde: ohne das zählte jeder Lauf
     * dieselben, längst geleerten Einträge noch einmal mit, und die
     * Zahl im Journal wüchse, ohne dass etwas geschähe. */
    db.absence.updateMany({
      where: { type: "SICK", noteClearAt: { lt: jetzt }, note: { not: null } },
      data: { note: null, noteClearAt: null },
    }),

    /* Anmeldeprotokolle nach 90 Tagen. Die Liste der Aktionen steht in
     * lib/aufbewahrung.ts und ist ausgeschrieben, nicht geraten: was
     * hier zu viel stünde, wären Geschäftsdaten, die niemand
     * zurückholen kann. */
    db.auditLog.deleteMany({
      where: { action: { in: [...ANMELDEPROTOKOLLE] }, createdAt: { lt: grenze } },
    }),

    /* Abgelaufene Sitzungen. Sie laufen weit vor den 90 Tagen ab, das
     * Aufräumen ist also strenger als die Frist und nicht lockerer. */
    db.session.deleteMany({ where: { expiresAt: { lt: jetzt } } }),
  ]);

  const lauf: Aufbewahrungslauf = {
    krankheitsnotizen: notizen.count,
    anmeldeprotokolle: anmeldungen.count,
    sitzungen: sitzungen.count,
  };

  console.log("[aufbewahrung]", JSON.stringify({ ...lauf, grenze: grenze.toISOString() }));
  return lauf;
}
