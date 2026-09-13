"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMonthLock } from "@/server/month-lock";

type Props = {
  monat: string;
  gesperrt: boolean;
  laeuftNoch: boolean;
  offeneTage: number;
};

export function AbschlussSchalter({ monat, gesperrt, laeuftNoch, offeneTage }: Props) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const [grund, setGrund] = useState("");
  const [oeffnen, setOeffnen] = useState(false);

  function lauf(sperren: boolean, reason: string | null) {
    setFehler("");
    start(async () => {
      const r = await setMonthLock({ month: monat, sperren, reason });
      if (r.ok) {
        setGrund("");
        setOeffnen(false);
        router.refresh();
      } else setFehler(r.error);
    });
  }

  if (gesperrt) {
    return (
      <div className="mt-6 rounded-lg border border-black/15 p-4 dark:border-white/20">
        <p className="text-sm">
          Dieser Monat ist abgeschlossen. Zeiten und Absenzen lassen sich
          ansehen, aber nicht mehr ändern, auch nicht von Vorgesetzten.
        </p>

        {!oeffnen ? (
          <button
            type="button"
            onClick={() => setOeffnen(true)}
            className="mt-3 h-10 rounded-md border border-black/15 px-4 text-sm dark:border-white/20"
          >
            Wieder öffnen
          </button>
        ) : (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              lauf(false, grund);
            }}
          >
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-black/60 dark:text-white/60">
                Grund fürs Protokoll, Pflicht
              </span>
              <input
                type="text"
                required
                maxLength={300}
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
                placeholder="etwa: Liridon hat zwei Tage vergessen"
                className="h-10 w-full rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20"
              />
            </label>
            {fehler && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {fehler}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={laeuft}
                className="h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
              >
                {laeuft ? "Öffnet" : "Öffnen"}
              </button>
              <button
                type="button"
                onClick={() => setOeffnen(false)}
                className="h-10 rounded-md border border-black/15 px-4 text-sm dark:border-white/20"
              >
                Abbrechen
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-black/15 p-4 dark:border-white/20">
      {laeuftNoch ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          Dieser Monat läuft noch. Abschliessen geht erst, wenn er vorbei ist.
        </p>
      ) : (
        <>
          <p className="text-sm">
            {offeneTage === 0
              ? "Alle Arbeitstage sind gedeckt. Der Monat kann abgeschlossen werden."
              : `Es gibt noch ${offeneTage} offene ${offeneTage === 1 ? "Tag" : "Tage"}. Abschliessen geht trotzdem, die Lücken bleiben dann aber stehen.`}
          </p>
          {fehler && (
            <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
              {fehler}
            </p>
          )}
          <button
            type="button"
            disabled={laeuft}
            onClick={() => {
              const frage =
                offeneTage === 0
                  ? `Monat ${monat} abschliessen?`
                  : `Monat ${monat} mit ${offeneTage} offenen Tagen abschliessen?`;
              if (confirm(frage)) lauf(true, null);
            }}
            className={[
              "mt-3 h-10 rounded-md px-4 text-sm font-medium disabled:opacity-50",
              offeneTage === 0
                ? "bg-foreground text-background"
                : "border border-amber-500 text-amber-900 dark:text-amber-200",
            ].join(" ")}
          >
            {laeuft ? "Schliesst ab" : "Monat abschliessen"}
          </button>
        </>
      )}
    </div>
  );
}
