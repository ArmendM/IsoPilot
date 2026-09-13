/* Was beim Ändern einer Materialbuchung mit Preis und Lager geschieht.
 * Reine Rechenlogik, ohne Prisma, damit sie in tests/einheit prüfbar ist. */

export type Buchungsstand = {
  materialId: string;
  menge: number;
  /** Der bei der ursprünglichen Buchung eingefrorene Einzelpreis. */
  einzelpreis: number;
};

export type Aenderung = {
  materialId: string;
  menge: number;
  /** Heutiger Katalogpreis des gewählten Artikels. */
  heutigerPreis: number;
};

export type Lagerbewegung = {
  materialId: string;
  /** Positiv heisst zurück ins Lager, negativ heisst Abgang. */
  delta: number;
};

export type Plan = {
  einzelpreis: number;
  bewegungen: Lagerbewegung[];
  artikelGewechselt: boolean;
};

/**
 * Der Plan für eine Änderung.
 *
 * **Preis:** Menge oder Datum zu ändern behält den eingefrorenen Preis,
 * es ist dieselbe Buchung und ein späterer Preisimport darf sie nicht
 * rückwirkend verändern. Ein Wechsel auf einen anderen Artikel holt den
 * heutigen Katalogpreis: einen ursprünglichen Preis gibt es für diesen
 * Artikel gar nicht.
 *
 * **Lager:** nur die Differenz. Wer 10 auf 12 korrigiert, erzeugt eine
 * Bewegung von -2 und nicht eine zweite von -12. Beim Artikelwechsel geht
 * die alte Menge vollständig zurück und die neue vollständig ab, das sind
 * zwei Bewegungen auf zwei verschiedenen Artikeln.
 */
export function planeAenderung(alt: Buchungsstand, neu: Aenderung): Plan {
  const artikelGewechselt = alt.materialId !== neu.materialId;

  if (artikelGewechselt) {
    return {
      einzelpreis: neu.heutigerPreis,
      artikelGewechselt,
      bewegungen: [
        { materialId: alt.materialId, delta: alt.menge },
        { materialId: neu.materialId, delta: -neu.menge },
      ],
    };
  }

  const delta = runde(alt.menge - neu.menge);
  return {
    einzelpreis: alt.einzelpreis,
    artikelGewechselt,
    // Ohne Mengenänderung entsteht keine Bewegung. Eine Zeile mit delta 0
    // im Lagerverlauf wäre nur Rauschen.
    bewegungen: delta === 0 ? [] : [{ materialId: alt.materialId, delta }],
  };
}

/** Mengen liegen im Schema auf zwei Nachkommastellen. Ohne Rundung bleibt
 *  aus 0.3 minus 0.1 ein Rest, und der Lagerverlauf bekommt eine Bewegung,
 *  die niemand ausgelöst hat. */
const runde = (n: number): number => Math.round(n * 100) / 100;
