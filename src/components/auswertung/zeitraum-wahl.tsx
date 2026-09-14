"use client";

import { useState } from "react";
import { DatumFeld, ZahlFeld } from "@/components/ui/eingabefelder";
import type { ZeitraumArt } from "@/lib/zeitraum";

/* Die Wahl des Zeitraums. Ein Client-Teil in einem GET-Formular, damit
 * nur die Felder dastehen, die zur gewählten Art gehören: alle drei
 * zugleich anzuzeigen hiesse raten, welche gerade gilt.
 *
 * Abgeschickt wird trotzdem gewöhnlich über GET. Die Auswertung steht
 * damit vollständig in der Adresse und lässt sich weitergeben, und die
 * Seite bleibt serverseitig gerendert. */

const feld =
  "h-10 rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20";
const bez = "block text-xs font-medium text-black/60 dark:text-white/60";

export function ZeitraumWahl({
  art,
  monat,
  jahr,
  von,
  bis,
}: {
  art: ZeitraumArt;
  monat: string;
  jahr: string;
  von: string;
  bis: string;
}) {
  const [gewaehlt, setGewaehlt] = useState<ZeitraumArt>(art);

  return (
    <>
      <label className="space-y-1">
        <span className={bez}>Zeitraum</span>
        <select
          name="art"
          value={gewaehlt}
          onChange={(e) => setGewaehlt(e.target.value as ZeitraumArt)}
          className={feld}
        >
          <option value="monat">Monat</option>
          <option value="jahr">Jahr</option>
          <option value="spanne">Freie Zeitspanne</option>
        </select>
      </label>

      {gewaehlt === "monat" && (
        <label className="space-y-1">
          <span className={bez}>Monat</span>
          <DatumFeld typ="month" name="monat" defaultValue={monat} className={feld} />
        </label>
      )}

      {gewaehlt === "jahr" && (
        <label className="space-y-1">
          <span className={bez}>Jahr</span>
          <ZahlFeld
            name="jahr"
            min={2000}
            max={2100}
            step={1}
            defaultValue={jahr}
            className={`${feld} w-28`}
          />
        </label>
      )}

      {gewaehlt === "spanne" && (
        <>
          <label className="space-y-1">
            <span className={bez}>Von</span>
            <DatumFeld name="von" defaultValue={von} className={feld} />
          </label>
          <label className="space-y-1">
            <span className={bez}>Bis</span>
            <DatumFeld name="bis" defaultValue={bis} className={feld} />
          </label>
        </>
      )}
    </>
  );
}
