"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMaterialBooking, deleteMaterialBooking } from "@/server/bookings";
import { ZahlFeld, DatumFeld } from "@/components/ui/eingabefelder";
import { todayISO } from "@/lib/dates";

export type Buchung = {
  id: string;
  materialId: string | null;
  bezeichnung: string;
  sku: string | null;
  unit: "M2" | "LFM" | "STK" | "KG" | "ROLLE";
  menge: number;
  einzelpreis: number;
  summe: number;
  bookedOn: string;
  userId: string;
  userName: string;
};

export type ArtikelWahl = {
  id: string;
  sku: string | null;
  name: string;
  unit: "M2" | "LFM" | "STK" | "KG" | "ROLLE";
  preis: number;
  lager: number;
};

type Person = { id: string; name: string };

const EINHEIT: Record<ArtikelWahl["unit"], string> = {
  M2: "m²",
  LFM: "Laufmeter",
  STK: "Stück",
  KG: "kg",
  ROLLE: "Rolle",
};

const feld =
  "h-10 w-full rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20";
const bez = "block text-xs font-medium text-black/60 dark:text-white/60";
const franken = (n: number) =>
  n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const menge = (n: number) => n.toLocaleString("de-CH", { maximumFractionDigits: 2 });
const datumDE = (iso: string) => iso.split("-").reverse().join(".");

export function MaterialBuchung({
  siteId,
  buchungen,
  artikel,
  personen,
  userId,
  istAdmin,
  offen,
}: {
  siteId: string;
  buchungen: Buchung[];
  artikel: ArtikelWahl[];
  personen: Person[];
  userId: string;
  istAdmin: boolean;
  /** Nur eine offene Baustelle nimmt neue Buchungen an. Bereits Gebuchtes
   *  bleibt sichtbar und lässt sich weiterhin rückgängig machen. */
  offen: boolean;
}) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const [f, setF] = useState({
    materialId: artikel[0]?.id ?? "",
    userId,
    menge: 0,
    bookedOn: todayISO(),
  });

  const gewaehlt = artikel.find((a) => a.id === f.materialId);
  const summe = gewaehlt ? gewaehlt.preis * f.menge : 0;

  function loeschen(id: string) {
    if (!confirm("Diese Buchung rückgängig machen? Der Lagerbestand wird zurückgebucht."))
      return;
    setFehler("");
    start(async () => {
      const r = await deleteMaterialBooking(id);
      if (r.ok) router.refresh();
      else setFehler(r.error);
    });
  }

  return (
    <div className="space-y-3">
      {buchungen.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          Noch keine Materialbuchung auf dieser Baustelle.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {buchungen.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-black/10 p-2 dark:border-white/15"
            >
              <span>
                {b.sku && (
                  <span className="tabular-nums text-black/50 dark:text-white/50">
                    {b.sku}{" "}
                  </span>
                )}
                <span className="font-medium">{b.bezeichnung}</span>{" "}
                <span className="tabular-nums">
                  {menge(b.menge)} {EINHEIT[b.unit]}
                </span>
                {" · "}
                <span className="tabular-nums">{franken(b.summe)}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
                {datumDE(b.bookedOn)} · {b.userName}
                {(istAdmin || b.userId === userId) && (
                  <button
                    type="button"
                    disabled={laeuft}
                    onClick={() => loeschen(b.id)}
                    className="underline disabled:opacity-50"
                  >
                    Rückgängig
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!offen ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          Diese Baustelle ist pausiert oder abgeschlossen. Zum Buchen zuerst
          wieder öffnen.
        </p>
      ) : artikel.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          Der Materialkatalog ist leer. Zuerst unter „Material&rdquo; Artikel anlegen.
        </p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!f.materialId) return;
            setFehler("");
            start(async () => {
              const r = await saveMaterialBooking({
                siteId,
                userId: f.userId,
                materialId: f.materialId,
                menge: Number(f.menge) || 0,
                bookedOn: f.bookedOn,
              });
              if (!r.ok) {
                setFehler(r.error);
                return;
              }
              setF((v) => ({ ...v, menge: 0 }));
              router.refresh();
            });
          }}
        >
          <label className="space-y-1">
            <span className={bez}>Artikel</span>
            <select
              value={f.materialId}
              onChange={(e) => setF({ ...f, materialId: e.target.value })}
              className={feld}
            >
              {artikel.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.sku ? `${a.sku} · ` : ""}
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className={bez}>
              Menge{gewaehlt ? ` in ${EINHEIT[gewaehlt.unit]}` : ""}
            </span>
            <ZahlFeld
              min={0}
              step={0.01}
              wert={f.menge}
              onWert={(n) => setF({ ...f, menge: n })}
              className={`${feld} w-28`}
            />
          </label>

          <label className="space-y-1">
            <span className={bez}>Datum</span>
            <DatumFeld
              required
              value={f.bookedOn}
              onChange={(e) => setF({ ...f, bookedOn: e.target.value })}
              className={`${feld} w-40`}
            />
          </label>

          {istAdmin && personen.length > 1 && (
            <label className="space-y-1">
              <span className={bez}>Gebucht von</span>
              <select
                value={f.userId}
                onChange={(e) => setF({ ...f, userId: e.target.value })}
                className={feld}
              >
                {personen.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <span className="pb-2 text-sm tabular-nums text-black/60 dark:text-white/60">
            {franken(summe)}
          </span>

          <button
            type="submit"
            disabled={laeuft || f.menge <= 0}
            className="h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
          >
            {laeuft ? "Bucht" : "Buchen"}
          </button>
        </form>
      )}

      {fehler && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {fehler}
        </p>
      )}
    </div>
  );
}
