"use client";

import { useRef, useState, type ComponentProps } from "react";

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

/**
 * Zahlenfeld, dessen Inhalt beim Hineinklicken markiert wird: getippte
 * Ziffern ersetzen den alten Wert, statt sich anzuhängen. Ohne das wurde
 * aus einer stehenden 0 und getippten 500 die Anzeige 0500.
 *
 * Mit `wert` und `onWert` gesteuert, ohne beides ein gewöhnliches Feld
 * für Formulare, die über GET abgeschickt werden.
 */
export function ZahlFeld({
  wert,
  onWert,
  onFocus,
  onMouseUp,
  onBlur,
  onWheel,
  ...rest
}: Basis & { wert?: number; onWert?: (n: number) => void }) {
  // select() im onFocus allein genügt nicht: das darauffolgende mouseup
  // setzt den Cursor an die Klickstelle und hebt die Markierung wieder
  // auf. Bei einer einzelnen 0 fällt das nicht auf, bei 500 landet der
  // Cursor mitten in der Zahl. Deshalb wird nur das erste mouseup nach
  // dem Fokussieren unterdrückt, spätere Klicks setzen den Cursor wie
  // gewohnt.
  const geradeFokussiert = useRef(false);
  // Eigener Textzustand, damit das Feld zwischendurch leer sein darf.
  // Bei einer reinen Zahl würde eine geleerte Eingabe sofort wieder zu 0.
  const [roh, setRoh] = useState(() => (wert === undefined ? "" : String(wert)));

  // Von aussen gesetzte Werte durchlassen, etwa die Schnellwahl der Pause,
  // aber beim Tippen nicht dazwischenfunken. React nennt das Anpassen des
  // Zustands beim Rendern, es gehört nicht in einen Effekt.
  const [letzterWert, setLetzterWert] = useState(wert);
  if (wert !== letzterWert) {
    setLetzterWert(wert);
    if (wert !== undefined && Number(roh) !== wert) setRoh(String(wert));
  }

  const gesteuert =
    wert === undefined
      ? {}
      : {
          value: roh,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            setRoh(e.target.value);
            onWert?.(e.target.value === "" ? 0 : Number(e.target.value));
          },
        };

  return (
    <input
      type="number"
      {...gesteuert}
      onFocus={(e) => {
        onFocus?.(e);
        geradeFokussiert.current = true;
        e.currentTarget.select();
      }}
      onMouseUp={(e) => {
        onMouseUp?.(e);
        if (geradeFokussiert.current) {
          geradeFokussiert.current = false;
          e.preventDefault();
        }
      }}
      onBlur={(e) => {
        onBlur?.(e);
        geradeFokussiert.current = false;
      }}
      onWheel={(e) => {
        onWheel?.(e);
        // Über einem fokussierten Zahlenfeld verstellt das Mausrad den
        // Wert. Beim Scrollen der Seite würde so lautlos aus 400 eine
        // 380. Den Fokus abgeben, dann scrollt die Seite wie erwartet.
        if (document.activeElement === e.currentTarget) e.currentTarget.blur();
      }}
      {...rest}
    />
  );
}
