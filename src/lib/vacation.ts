// Reine Rechenregeln zum Ferienanspruch. Keine Datenbank, damit sie
// einzeln prüfbar bleiben.

/** Auf halbe Tage aufrunden, also zugunsten der Person. */
export const aufHalbeTage = (n: number) => Math.ceil(n * 2) / 2;

/**
 * Monate, in denen die Person im Jahr beschäftigt war. Ein angefangener
 * Monat zählt voll, das ist die übliche Handhabung und zugunsten der
 * Person.
 */
export function beschaeftigteMonate(
  jahr: number,
  eintritt: Date | null,
  austritt: Date | null,
): number {
  if (eintritt && eintritt.getUTCFullYear() > jahr) return 0;
  if (austritt && austritt.getUTCFullYear() < jahr) return 0;

  const von =
    eintritt && eintritt.getUTCFullYear() === jahr ? eintritt.getUTCMonth() + 1 : 1;
  const bis =
    austritt && austritt.getUTCFullYear() === jahr ? austritt.getUTCMonth() + 1 : 12;

  return Math.max(0, bis - von + 1);
}

/**
 * Anspruch des Jahres. Bei einem ganzen Jahr bleibt der Grundanspruch
 * unverändert, sonst anteilig nach Monaten und auf halbe Tage aufgerundet.
 */
export function anteiligerAnspruch(
  grundanspruch: number,
  jahr: number,
  eintritt: Date | null,
  austritt: Date | null,
): { anspruch: number; monate: number; anteilig: boolean } {
  const monate = beschaeftigteMonate(jahr, eintritt, austritt);
  if (monate >= 12) return { anspruch: grundanspruch, monate: 12, anteilig: false };
  return {
    anspruch: aufHalbeTage((grundanspruch * monate) / 12),
    monate,
    anteilig: true,
  };
}

/** Der Übertrag aus dem Vorjahr verfällt Ende März. */
export const verfallsdatum = (jahr: number) => new Date(Date.UTC(jahr, 2, 31));

export type StandEingabe = {
  anspruch: number;
  uebertrag: number;
  verfallenAm: Date | null;
  /** Bewilligte und beantragte Ferientage des Jahres. */
  bewilligt: number;
  beantragt: number;
  /** Davon die Tage, die vor dem Verfallsdatum beginnen. */
  vorVerfall: number;
  heute: Date;
};

export type Stand = {
  anspruch: number;
  uebertrag: number;
  uebertragGenutzt: number;
  uebertragVerfallen: number;
  verfuegbar: number;
  bewilligt: number;
  beantragt: number;
  rest: number;
};

/**
 * Ferien werden zuerst vom Übertrag genommen, weil der verfällt. Was vom
 * Übertrag nach dem Verfallsdatum noch übrig ist, ist verloren und zählt
 * nicht mehr zum Verfügbaren.
 */
export function rechneStand(e: StandEingabe): Stand {
  const verbraucht = e.bewilligt + e.beantragt;
  const uebertragGenutzt = Math.min(e.uebertrag, e.vorVerfall);
  const abgelaufen = e.verfallenAm !== null && e.heute > e.verfallenAm;
  const uebertragVerfallen = abgelaufen ? e.uebertrag - uebertragGenutzt : 0;
  const verfuegbar = e.anspruch + e.uebertrag - uebertragVerfallen;

  return {
    anspruch: e.anspruch,
    uebertrag: e.uebertrag,
    uebertragGenutzt,
    uebertragVerfallen,
    verfuegbar,
    bewilligt: e.bewilligt,
    beantragt: e.beantragt,
    rest: verfuegbar - verbraucht,
  };
}
