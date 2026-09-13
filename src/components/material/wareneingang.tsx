"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bucheWareneingang } from "@/server/lager";
import { ZahlFeld } from "@/components/ui/eingabefelder";
import { ALLE_KATEGORIEN, kategorienAus, nachKategorie } from "@/lib/materialwahl";

export type EingangsArtikel = {
  id: string;
  sku: string | null;
  name: string;
  unit: "M2" | "LFM" | "STK" | "KG" | "ROLLE";
  bestand: number;
  fehlmenge: number;
  mindestbestand: number;
  kategorieId: string | null;
  kategorie: string | null;
};

const EINHEIT: Record<EingangsArtikel["unit"], string> = {
  M2: "m²",
  LFM: "Laufmeter",
  STK: "Stück",
  KG: "kg",
  ROLLE: "Rollen",
};

const feld =
  "h-10 w-full rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20";
const bez = "block text-xs font-medium text-black/60 dark:text-white/60";
const menge = (n: number) => n.toLocaleString("de-CH", { maximumFractionDigits: 2 });

export function Wareneingang({ artikel }: { artikel: EingangsArtikel[] }) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const [erfolg, setErfolg] = useState("");

  const kategorien = kategorienAus(artikel);
  const [kategorieId, setKategorieId] = useState(kategorien[0]?.id ?? ALLE_KATEGORIEN);
  const sichtbar = nachKategorie(artikel, kategorieId);

  const [f, setF] = useState({ materialId: "", anzahl: 0, note: "" });

  // Nach einem Kategoriewechsel zeigt die Wahl noch auf einen Artikel der
  // alten Kategorie. Gebucht wird der erste sichtbare.
  const materialId = sichtbar.some((a) => a.id === f.materialId)
    ? f.materialId
    : (sichtbar[0]?.id ?? "");
  const gewaehlt = sichtbar.find((a) => a.id === materialId);

  /* Der Vorschlag ist genau das, was der Katalog als Bestellbedarf
   * ausweist: die Fehlmenge plus was bis zum Mindestbestand fehlt. Wer
   * anders liefert, tippt die tatsächliche Menge ein. */
  const vorschlag = gewaehlt
    ? Math.max(0, gewaehlt.fehlmenge + Math.max(0, gewaehlt.mindestbestand - gewaehlt.bestand))
    : 0;

  function speichern() {
    if (!materialId || f.anzahl <= 0) return;
    setFehler("");
    setErfolg("");
    start(async () => {
      const r = await bucheWareneingang({
        materialId,
        menge: Number(f.anzahl) || 0,
        note: f.note.trim() || null,
      });
      if (r.ok) {
        setErfolg(
          `${menge(Number(f.anzahl))} ${gewaehlt ? EINHEIT[gewaehlt.unit] : ""} ${gewaehlt?.name ?? ""} eingebucht.`,
        );
        setF((v) => ({ ...v, anzahl: 0, note: "" }));
        router.refresh();
      } else setFehler(r.error);
    });
  }

  if (artikel.length === 0)
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        Der Materialkatalog ist leer. Zuerst Artikel anlegen.
      </p>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-black/60 dark:text-white/60">
        Gelieferte Ware einbuchen. Eine offene Fehlmenge wird zuerst getilgt,
        erst dann wächst der Bestand. Jede Lieferung erscheint im Lagerverlauf.
      </p>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        {kategorien.length > 1 && (
          <label className="space-y-1">
            <span className={bez}>Kategorie</span>
            <select
              value={kategorieId}
              onChange={(e) => setKategorieId(e.target.value)}
              className={feld}
            >
              {kategorien.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
              <option value={ALLE_KATEGORIEN}>Alle Kategorien</option>
            </select>
          </label>
        )}

        <label className="space-y-1">
          <span className={bez}>Artikel</span>
          <select
            value={materialId}
            onChange={(e) => setF({ ...f, materialId: e.target.value })}
            className={feld}
          >
            {sichtbar.map((a) => (
              <option key={a.id} value={a.id}>
                {a.sku ? `${a.sku} · ` : ""}
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={bez}>
            Gelieferte Menge{gewaehlt ? ` in ${EINHEIT[gewaehlt.unit]}` : ""}
          </span>
          <ZahlFeld
            min={0}
            step={0.01}
            wert={f.anzahl}
            onWert={(n) => setF({ ...f, anzahl: n })}
            className={`${feld} w-32`}
          />
        </label>

        <label className="space-y-1">
          <span className={bez}>Lieferschein oder Bemerkung</span>
          <input
            type="text"
            maxLength={200}
            value={f.note}
            onChange={(e) => setF({ ...f, note: e.target.value })}
            className={`${feld} w-56`}
          />
        </label>

        <button
          type="submit"
          disabled={laeuft || f.anzahl <= 0 || !materialId}
          className="h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
        >
          {laeuft ? "Bucht" : "Einbuchen"}
        </button>
      </form>

      {gewaehlt && (
        <p className="text-sm text-black/60 dark:text-white/60">
          <span className="tabular-nums">
            Bestand {menge(gewaehlt.bestand)} {EINHEIT[gewaehlt.unit]}
          </span>
          {gewaehlt.fehlmenge > 0 && (
            <span className="tabular-nums text-amber-800 dark:text-amber-300">
              {" · "}Fehlmenge {menge(gewaehlt.fehlmenge)}
            </span>
          )}
          {vorschlag > 0 && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => setF({ ...f, anzahl: vorschlag })}
                className="underline"
              >
                Bestellbedarf {menge(vorschlag)} übernehmen
              </button>
            </>
          )}
        </p>
      )}

      {erfolg && (
        <p className="text-sm text-green-700 dark:text-green-300">{erfolg}</p>
      )}
      {fehler && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {fehler}
        </p>
      )}
    </div>
  );
}
