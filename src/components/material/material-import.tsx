"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type ImportErgebnis,
  type Vorschau,
  importAusfuehren,
  importVorschau,
} from "@/server/material-import";

/* Zwei Schritte, absichtlich: zuerst zeigen, was geschähe, dann ein
 * zweiter Klick. Bei einem verrutschten Spaltenaufbau wäre der Katalog
 * sonst mit einem einzigen Klick verändert.
 *
 * Die Datei wird beide Male mitgeschickt und auf dem Server neu gelesen.
 * Der Abgleich aus der Vorschau geht nie zurück an den Server: sonst
 * liesse sich über das Formular jeder beliebige Artikel überschreiben. */

const feld =
  "h-10 w-full rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20";
const knopf = "h-10 rounded-md px-4 text-sm font-medium disabled:opacity-50";

const ART: Record<string, { titel: string; ton: string }> = {
  aktualisieren: { titel: "wird aktualisiert", ton: "text-black/70 dark:text-white/70" },
  anlegen: { titel: "wird neu angelegt", ton: "text-green-700 dark:text-green-300" },
  uneindeutig: { titel: "übersprungen, mehrdeutig", ton: "text-amber-700 dark:text-amber-300" },
  fehlerhaft: { titel: "übersprungen, fehlerhaft", ton: "text-red-700 dark:text-red-300" },
};

export function MaterialImport() {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const eingabe = useRef<HTMLInputElement>(null);
  const [datei, setDatei] = useState<File | null>(null);
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const [fertig, setFertig] = useState<ImportErgebnis | null>(null);
  const [fehler, setFehler] = useState("");

  function zuruecksetzen() {
    setDatei(null);
    setVorschau(null);
    setFertig(null);
    setFehler("");
    if (eingabe.current) eingabe.current.value = "";
  }

  function pruefen(f: File) {
    setFehler("");
    setFertig(null);
    const fd = new FormData();
    fd.append("datei", f);
    start(async () => {
      const r = await importVorschau(fd);
      if (r.ok) setVorschau(r);
      else {
        setVorschau(null);
        setFehler(r.error);
      }
    });
  }

  function ausfuehren() {
    if (!datei) return;
    setFehler("");
    const fd = new FormData();
    fd.append("datei", datei);
    start(async () => {
      const r = await importAusfuehren(fd);
      if (r.ok) {
        setFertig(r);
        setVorschau(null);
        setDatei(null);
        if (eingabe.current) eingabe.current.value = "";
        router.refresh();
      } else setFehler(r.error);
    });
  }

  const z = vorschau?.zusammenfassung;
  const schreibt = z ? z.aktualisieren + z.anlegen : 0;

  return (
    <div className="space-y-3">
      <p className="text-sm text-black/60 dark:text-white/60">
        Eine Excel-Liste einlesen und Preise nachführen. Der Abgleich läuft über
        die Artikelnummer, sonst über Kategorie und Bezeichnung, sonst über die
        Bezeichnung. Lagerbestand und Mindestbestand bleiben unberührt.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-black/60 dark:text-white/60">
            Excel-Datei (.xlsx)
          </span>
          <input
            ref={eingabe}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={laeuft}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setDatei(f);
              setVorschau(null);
              setFertig(null);
              if (f) pruefen(f);
            }}
            className={`${feld} w-80 py-2`}
          />
        </label>
        {(vorschau || fertig || fehler) && (
          <button
            type="button"
            onClick={zuruecksetzen}
            disabled={laeuft}
            className={`${knopf} border border-black/15 dark:border-white/20`}
          >
            Zurücksetzen
          </button>
        )}
      </div>

      {laeuft && !vorschau && (
        <p className="text-sm text-black/60 dark:text-white/60">Die Datei wird gelesen.</p>
      )}

      {vorschau && z && (
        <div className="space-y-3 rounded-md border border-black/10 p-3 dark:border-white/15">
          <p className="text-sm">
            <strong>Noch nichts geändert.</strong> Der Import würde{" "}
            <span className="tabular-nums">{z.aktualisieren}</span>{" "}
            {z.aktualisieren === 1 ? "Artikel aktualisieren" : "Artikel aktualisieren"} und{" "}
            <span className="tabular-nums">{z.anlegen}</span>{" "}
            {z.anlegen === 1 ? "Artikel neu anlegen" : "Artikel neu anlegen"}.
            {z.uneindeutig + z.fehlerhaft > 0 && (
              <>
                {" "}
                <span className="tabular-nums">{z.uneindeutig + z.fehlerhaft}</span>{" "}
                {z.uneindeutig + z.fehlerhaft === 1 ? "Zeile wird" : "Zeilen werden"}{" "}
                übersprungen.
              </>
            )}
          </p>

          {vorschau.fehlendeSpalten.length > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Diese Spalten fehlen in der Datei und bleiben unverändert:{" "}
              {vorschau.fehlendeSpalten.join(", ")}. Stimmt der Spaltenaufbau?
            </p>
          )}

          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-black/60 dark:text-white/60">
                <tr>
                  <th className="py-1 pr-2 font-medium">Zeile</th>
                  <th className="py-1 pr-2 font-medium">Bezeichnung</th>
                  <th className="py-1 pr-2 font-medium">Preis</th>
                  <th className="py-1 font-medium">Was geschieht</th>
                </tr>
              </thead>
              <tbody>
                {vorschau.zeilen.map((a) => (
                  <tr key={a.zeile.zeile} className="border-t border-black/5 dark:border-white/10">
                    <td className="py-1 pr-2 tabular-nums text-black/50 dark:text-white/50">
                      {a.zeile.zeile}
                    </td>
                    <td className="py-1 pr-2">
                      {a.zeile.sku && (
                        <span className="tabular-nums text-black/50 dark:text-white/50">
                          {a.zeile.sku}{" "}
                        </span>
                      )}
                      {a.zeile.name || <em className="text-black/40">ohne Bezeichnung</em>}
                    </td>
                    <td className="py-1 pr-2 tabular-nums">
                      {a.zeile.preis === null ? (
                        <span className="text-black/40 dark:text-white/40">unverändert</span>
                      ) : (
                        a.zeile.preis.toLocaleString("de-CH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      )}
                    </td>
                    <td className={`py-1 ${ART[a.art].ton}`}>
                      {ART[a.art].titel}
                      {a.art === "fehlerhaft" && `: ${a.grund}`}
                      {a.art === "uneindeutig" &&
                        `: ${a.kandidaten.length} Artikel passen auf diese Zeile`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={ausfuehren}
            disabled={laeuft || schreibt === 0}
            className={`${knopf} bg-foreground text-background`}
          >
            {laeuft
              ? "Import läuft"
              : schreibt === 0
                ? "Nichts zu importieren"
                : `${schreibt} ${schreibt === 1 ? "Artikel" : "Artikel"} jetzt importieren`}
          </button>
        </div>
      )}

      {fertig?.ok && (
        <p className="text-sm text-green-700 dark:text-green-300">
          Import abgeschlossen: {fertig.aktualisiert} aktualisiert, {fertig.angelegt} neu
          angelegt
          {fertig.uebersprungen > 0 && `, ${fertig.uebersprungen} übersprungen`}.
        </p>
      )}

      {fehler && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {fehler}
        </p>
      )}
    </div>
  );
}
