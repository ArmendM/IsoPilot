"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTimeEntry, deleteTimeEntry } from "@/server/time-entries";

export type ZeileDaten = {
  id: string;
  start: string;
  ende: string;
  breakMinutes: number;
  netto: string;
  siteId: string | null;
  siteLabel: string | null;
  istRegie: boolean;
  note: string | null;
};

type Baustelle = { id: string; label: string };

type Props = {
  tag: string;
  personId: string;
  eintraege: ZeileDaten[];
  baustellen: Baustelle[];
  istAdmin: boolean;
  gesperrt: boolean;
};

const feld =
  "h-10 w-full rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20";
const beschriftung = "block text-xs font-medium text-black/60 dark:text-white/60";

/** Nettostunden im Browser nur zur Anzeige. Verbindlich rechnet der Server. */
function nettoVorschau(start: string, ende: string, pause: number): string {
  const [a, b] = [start, ende].map((t) => {
    const [h, m] = t.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  });
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  const min = b - a - pause;
  if (min <= 0) return "";
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

export function ZeitenTag({
  tag,
  personId,
  eintraege,
  baustellen,
  istAdmin,
  gesperrt,
}: Props) {
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const summe = eintraege.reduce((s, e) => {
    const [h, m] = e.netto.replace("min", "").split("h ").map(Number);
    return s + (h || 0) * 60 + (m || 0);
  }, 0);

  return (
    <div className="mt-6 space-y-6">
      {gesperrt ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          Dieser Monat ist abgeschlossen. Einträge lassen sich ansehen, aber
          nicht mehr ändern.
        </p>
      ) : (
        <Formular
          tag={tag}
          personId={personId}
          baustellen={baustellen}
          istAdmin={istAdmin}
          onFertig={() => setBearbeite(null)}
        />
      )}

      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Einträge</h2>
          {eintraege.length > 0 && (
            <p className="text-sm text-black/60 dark:text-white/60">
              Summe {Math.floor(summe / 60)}h {summe % 60}min
            </p>
          )}
        </div>

        {eintraege.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-black/15 p-4 text-sm text-black/50 dark:border-white/20 dark:text-white/50">
            Für diesen Tag ist nichts erfasst.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-black/10 rounded-md border border-black/10 dark:divide-white/10 dark:border-white/15">
            {eintraege.map((e) =>
              bearbeite === e.id ? (
                <li key={e.id} className="p-3">
                  <Formular
                    tag={tag}
                    personId={personId}
                    baustellen={baustellen}
                    istAdmin={istAdmin}
                    eintrag={e}
                    onFertig={() => setBearbeite(null)}
                    onAbbrechen={() => setBearbeite(null)}
                  />
                </li>
              ) : (
                <Zeile
                  key={e.id}
                  eintrag={e}
                  gesperrt={gesperrt}
                  onBearbeiten={() => setBearbeite(e.id)}
                />
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function Zeile({
  eintrag: e,
  gesperrt,
  onBearbeiten,
}: {
  eintrag: ZeileDaten;
  gesperrt: boolean;
  onBearbeiten: () => void;
}) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");

  function loeschen() {
    if (!confirm("Diesen Eintrag löschen?")) return;
    start(async () => {
      const r = await deleteTimeEntry(e.id);
      if (r.ok) router.refresh();
      else setFehler(r.error);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
      <span className="font-medium tabular-nums">
        {e.start} bis {e.ende}
      </span>
      <span className="tabular-nums text-black/60 dark:text-white/60">
        {e.netto}
        {e.breakMinutes > 0 && `, ${e.breakMinutes} min Pause`}
      </span>
      <span className="text-black/60 dark:text-white/60">
        {e.siteLabel ?? "Ohne Baustelle"}
      </span>
      {e.istRegie && (
        <span className="rounded bg-black/10 px-1.5 py-0.5 text-xs dark:bg-white/15">
          Regie
        </span>
      )}
      {e.note && (
        <span className="w-full text-black/50 dark:text-white/50">{e.note}</span>
      )}
      {fehler && <span className="w-full text-red-700 dark:text-red-300">{fehler}</span>}
      {!gesperrt && (
        <span className="ml-auto flex gap-3">
          <button
            type="button"
            onClick={onBearbeiten}
            className="text-black/60 underline hover:text-black dark:text-white/60 dark:hover:text-white"
          >
            Bearbeiten
          </button>
          <button
            type="button"
            onClick={loeschen}
            disabled={laeuft}
            className="text-red-700 underline hover:text-red-900 disabled:opacity-50 dark:text-red-300"
          >
            {laeuft ? "Löscht" : "Löschen"}
          </button>
        </span>
      )}
    </li>
  );
}

function Formular({
  tag,
  personId,
  baustellen,
  istAdmin,
  eintrag,
  onFertig,
  onAbbrechen,
}: {
  tag: string;
  personId: string;
  baustellen: Baustelle[];
  istAdmin: boolean;
  eintrag?: ZeileDaten;
  onFertig: () => void;
  onAbbrechen?: () => void;
}) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const [f, setF] = useState({
    start: eintrag?.start ?? "07:00",
    ende: eintrag?.ende ?? "17:00",
    pause: eintrag?.breakMinutes ?? 0,
    siteId: eintrag?.siteId ?? "",
    istRegie: eintrag?.istRegie ?? false,
    note: eintrag?.note ?? "",
  });

  const vorschau = nettoVorschau(f.start, f.ende, f.pause);

  function absenden(ev: React.FormEvent) {
    ev.preventDefault();
    setFehler("");
    start(async () => {
      const r = await saveTimeEntry({
        id: eintrag?.id,
        userId: personId,
        workDate: tag,
        start: f.start,
        end: f.ende,
        breakMinutes: Number(f.pause) || 0,
        siteId: f.siteId || null,
        isRegie: f.istRegie,
        note: f.note.trim() || null,
      });
      if (!r.ok) {
        setFehler(r.error);
        return;
      }
      if (!eintrag) setF({ ...f, note: "" });
      onFertig();
      router.refresh();
    });
  }

  return (
    <form onSubmit={absenden} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="space-y-1">
          <span className={beschriftung}>Beginn</span>
          <input
            type="time"
            required
            value={f.start}
            onChange={(e) => setF({ ...f, start: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={beschriftung}>Ende</span>
          <input
            type="time"
            required
            value={f.ende}
            onChange={(e) => setF({ ...f, ende: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={beschriftung}>Pause in Minuten</span>
          <input
            type="number"
            min={0}
            max={480}
            step={5}
            value={f.pause}
            onChange={(e) => setF({ ...f, pause: Number(e.target.value) })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={beschriftung}>Nettostunden</span>
          <output className={`${feld} flex items-center tabular-nums`}>
            {vorschau || "—"}
          </output>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={beschriftung}>Baustelle, freiwillig</span>
          <select
            value={f.siteId}
            onChange={(e) => setF({ ...f, siteId: e.target.value })}
            className={feld}
          >
            <option value="">Ohne Baustelle, Werkstatt oder Büro</option>
            {baustellen.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={beschriftung}>Bemerkung</span>
          <input
            type="text"
            maxLength={500}
            value={f.note}
            onChange={(e) => setF({ ...f, note: e.target.value })}
            className={feld}
            placeholder="optional"
          />
        </label>
      </div>

      {istAdmin && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.istRegie}
            onChange={(e) => setF({ ...f, istRegie: e.target.checked })}
            className="size-4"
          />
          Regie, also im Stundenlohn statt nach Ausmass
        </label>
      )}

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
          {laeuft ? "Speichert" : eintrag ? "Änderung speichern" : "Erfassen"}
        </button>
        {onAbbrechen && (
          <button
            type="button"
            onClick={onAbbrechen}
            className="h-10 rounded-md border border-black/15 px-4 text-sm dark:border-white/20"
          >
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}
