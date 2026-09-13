"use client";

import { useRef, type ComponentProps } from "react";

type Basis = Omit<ComponentProps<"input">, "type">;

/**
 * Ein Feld, dessen Auswahlhilfe beim Klick hineinfährt und nicht erst
 * über das kleine Symbol am Rand. Tippen bleibt möglich: es ist ein
 * gewöhnliches Eingabefeld, der Picker ist nur ein zusätzlicher Weg.
 */
function MitPicker({ typ, onClick, ...rest }: Basis & { typ: string }) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <input
      ref={ref}
      type={typ}
      onClick={(e) => {
        onClick?.(e);
        // showPicker wirft, wenn der Browser den Aufruf nicht als
        // Nutzeraktion wertet oder die Methode nicht kennt. Dann bleibt
        // das Feld ein gewöhnliches Eingabefeld, mehr braucht es nicht.
        try {
          ref.current?.showPicker();
        } catch {
          // absichtlich still
        }
      }}
      {...rest}
    />
  );
}

/** Datum oder Monat, mit Kalender beim Klick. */
export function DatumFeld({
  typ = "date",
  ...rest
}: Basis & { typ?: "date" | "month" }) {
  return <MitPicker typ={typ} {...rest} />;
}

/** Uhrzeit, mit Zeitauswahl beim Klick. */
export function ZeitFeld(props: Basis) {
  return <MitPicker typ="time" {...props} />;
}
