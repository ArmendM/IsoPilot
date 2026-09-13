"use client";

import { useRef, type ComponentProps } from "react";

type Props = Omit<ComponentProps<"input">, "type"> & {
  /** "date" für einen Tag, "month" für einen ganzen Monat. */
  typ?: "date" | "month";
};

/**
 * Datumsfeld, das den Kalender beim Klick ins Feld öffnet und nicht erst
 * über das kleine Symbol am Rand. Tippen bleibt möglich: es ist ein
 * gewöhnliches Datumsfeld, der Picker ist nur ein zusätzlicher Weg.
 */
export function DatumFeld({ typ = "date", onClick, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <input
      ref={ref}
      type={typ}
      onClick={(e) => {
        onClick?.(e);
        // showPicker wirft, wenn der Browser den Aufruf nicht als
        // Nutzeraktion wertet oder die Methode nicht kennt. Dann bleibt
        // das Feld ein normales Datumsfeld, mehr braucht es nicht.
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
