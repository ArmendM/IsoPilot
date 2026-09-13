"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSite, setSiteStatus } from "@/server/sites";
import { ZahlFeld } from "@/components/ui/eingabefelder";

export type Zeile = {
  id: string;
  objektname: string | null;
  street: string;
  zip: string;
  city: string;
  bezeichnung: string;
  partnerId: string | null;
  partnerName: string | null;
  status: "OPEN" | "PAUSED" | "DONE";
  soll: number;
  ist: number;
  discountPct: number;
  personen: number;
  letzteArbeit: string | null;
};

type Partner = { id: string; name: string };

const STATUS: Record<Zeile["status"], string> = {
  OPEN: "offen",
  PAUSED: "pausiert",
  DONE: "abgeschlossen",
};

const feld =
  "h-10 w-full rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20";
const bez = "block text-xs font-medium text-black/60 dark:text-white/60";
const stunden = (h: number) => `${Math.floor(h)}h ${Math.round((h % 1) * 60)}min`;
const datumDE = (iso: string) => iso.split("-").reverse().join(".");

export function BaustellenAnsicht({
  zeilen,
  partner,
  istAdmin,
}: {
  zeilen: Zeile[];
  partner: Partner[];
  istAdmin: boolean;
}) {
  const [neu, setNeu] = useState(false);

  return (
    <div className="mt-6 space-y-6">
      {istAdmin &&
        (neu ? (
          <Formular partner={partner} onFertig={() => setNeu(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setNeu(true)}
            className="h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background"
          >
            Neue Baustelle
          </button>
        ))}

      {zeilen.length === 0 ? (
        <p className="rounded-md border border-dashed border-black/15 p-4 text-sm text-black/50 dark:border-white/20 dark:text-white/50">
          Es gibt noch keine Baustelle. Ohne Baustelle lassen sich Stunden
          trotzdem erfassen, das Feld ist bei der Zeiterfassung freiwillig.
        </p>
      ) : (
        <ul className="space-y-3">
          {zeilen.map((z) => (
            <Karte key={z.id} z={z} partner={partner} istAdmin={istAdmin} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Karte({
  z,
  partner,
  istAdmin,
}: {
  z: Zeile;
  partner: Partner[];
  istAdmin: boolean;
}) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const [offen, setOffen] = useState(false);

  const differenz = z.ist - z.soll;
  const anteil = z.soll > 0 ? Math.min(100, (z.ist / z.soll) * 100) : 0;

  function status(neuerStatus: Zeile["status"]) {
    setFehler("");
    start(async () => {
      const r = await setSiteStatus({ id: z.id, status: neuerStatus });
      if (r.ok) router.refresh();
      else setFehler(r.error);
    });
  }

  return (
    <li
      className={[
        "rounded-lg border p-4",
        z.status === "DONE"
          ? "border-black/10 opacity-70 dark:border-white/15"
          : "border-black/10 dark:border-white/15",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{z.bezeichnung}</span>
        {z.objektname && (
          <span className="text-sm text-black/60 dark:text-white/60">
            {z.street}, {z.zip} {z.city}
          </span>
        )}
        <span
          className={[
            "rounded px-1.5 py-0.5 text-xs",
            z.status === "OPEN"
              ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200"
              : z.status === "PAUSED"
                ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                : "bg-black/10 dark:bg-white/15",
          ].join(" ")}
        >
          {STATUS[z.status]}
        </span>
        {z.partnerName && (
          <span className="text-sm text-black/60 dark:text-white/60">
            {z.partnerName}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="tabular-nums">
          Soll {z.soll > 0 ? stunden(z.soll) : "nicht gesetzt"}
        </span>
        <span className="tabular-nums">Ist {stunden(z.ist)}</span>
        {z.soll > 0 && (
          <span
            className={[
              "tabular-nums",
              differenz > 0
                ? "text-red-700 dark:text-red-300"
                : "text-green-800 dark:text-green-300",
            ].join(" ")}
          >
            {differenz > 0 ? "über" : "unter"} Soll um {stunden(Math.abs(differenz))}
          </span>
        )}
        {z.personen > 0 && (
          <span className="text-black/60 dark:text-white/60">
            {z.personen} {z.personen === 1 ? "Person" : "Personen"}
          </span>
        )}
        {z.letzteArbeit && (
          <span className="text-black/60 dark:text-white/60">
            zuletzt {datumDE(z.letzteArbeit)}
          </span>
        )}
      </div>

      {z.soll > 0 && (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
          role="img"
          aria-label={`${Math.round(anteil)} Prozent der Sollstunden`}
        >
          <div
            className={differenz > 0 ? "h-full bg-red-600" : "h-full bg-foreground"}
            style={{ width: `${anteil}%` }}
          />
        </div>
      )}

      {fehler && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {fehler}
        </p>
      )}

      {istAdmin && (
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {z.status !== "OPEN" && (
            <button
              type="button"
              disabled={laeuft}
              onClick={() => status("OPEN")}
              className="h-9 rounded-md border border-black/15 px-3 disabled:opacity-50 dark:border-white/20"
            >
              {z.status === "DONE" ? "Wieder öffnen" : "Fortsetzen"}
            </button>
          )}
          {z.status === "OPEN" && (
            <button
              type="button"
              disabled={laeuft}
              onClick={() => status("PAUSED")}
              className="h-9 rounded-md border border-black/15 px-3 disabled:opacity-50 dark:border-white/20"
            >
              Pausieren
            </button>
          )}
          {z.status !== "DONE" && (
            <button
              type="button"
              disabled={laeuft}
              onClick={() => {
                if (
                  confirm(
                    `${z.bezeichnung} abschliessen? Sie verschwindet dann aus der Auswahl bei der Zeiterfassung, bleibt aber in den Auswertungen.`,
                  )
                )
                  status("DONE");
              }}
              className="h-9 rounded-md border border-black/15 px-3 disabled:opacity-50 dark:border-white/20"
            >
              Abschliessen
            </button>
          )}
          <button
            type="button"
            onClick={() => setOffen(!offen)}
            className="h-9 px-1 underline text-black/60 dark:text-white/60"
          >
            {offen ? "Schliessen" : "Bearbeiten"}
          </button>
        </div>
      )}

      {offen && (
        <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/15">
          <Formular
            partner={partner}
            zeile={z}
            onFertig={() => setOffen(false)}
            onAbbrechen={() => setOffen(false)}
          />
        </div>
      )}
    </li>
  );
}

function Formular({
  partner,
  zeile,
  onFertig,
  onAbbrechen,
}: {
  partner: Partner[];
  zeile?: Zeile;
  onFertig: () => void;
  onAbbrechen?: () => void;
}) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const [f, setF] = useState({
    name: zeile?.objektname ?? "",
    street: zeile?.street ?? "",
    zip: zeile?.zip ?? "",
    city: zeile?.city ?? "",
    partnerId: zeile?.partnerId ?? "",
    targetHours: zeile?.soll ?? 0,
    discountPct: zeile?.discountPct ?? 0,
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setFehler("");
        start(async () => {
          const r = await saveSite({
            id: zeile?.id,
            name: f.name.trim() || null,
            street: f.street,
            zip: f.zip,
            city: f.city,
            partnerId: f.partnerId || null,
            targetHours: Number(f.targetHours) || 0,
            discountPct: Number(f.discountPct) || 0,
          });
          if (!r.ok) {
            setFehler(r.error);
            return;
          }
          onFertig();
          router.refresh();
        });
      }}
    >
      {!zeile && <h2 className="text-sm font-medium">Neue Baustelle</h2>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 lg:col-span-3">
          <span className={bez}>Objektname, freiwillig</span>
          <input
            type="text"
            maxLength={120}
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="etwa: MFH Sonnenhof, Lüftungsisolation"
            className={feld}
          />
        </label>

        <label className="space-y-1 sm:col-span-2">
          <span className={bez}>Strasse mit Hausnummer</span>
          <input
            type="text"
            required
            maxLength={120}
            value={f.street}
            onChange={(e) => setF({ ...f, street: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>Postleitzahl</span>
          <input
            type="text"
            required
            inputMode="numeric"
            maxLength={10}
            value={f.zip}
            onChange={(e) => setF({ ...f, zip: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>Ort</span>
          <input
            type="text"
            required
            maxLength={80}
            value={f.city}
            onChange={(e) => setF({ ...f, city: e.target.value })}
            className={feld}
          />
        </label>

        <label className="space-y-1">
          <span className={bez}>Auftraggeber</span>
          <select
            value={f.partnerId}
            onChange={(e) => setF({ ...f, partnerId: e.target.value })}
            className={feld}
          >
            <option value="">Keiner</option>
            {partner.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={bez}>Sollstunden</span>
          <ZahlFeld
            min={0}
            step={1}
            wert={f.targetHours}
            onWert={(n) => setF({ ...f, targetHours: n })}
            className={feld}
          />
        </label>

        <label className="space-y-1">
          <span className={bez}>Objektrabatt in Prozent</span>
          <ZahlFeld
            min={0}
            max={100}
            step={1}
            wert={f.discountPct}
            onWert={(n) => setF({ ...f, discountPct: n })}
            className={feld}
          />
        </label>
      </div>

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
          {laeuft ? "Speichert" : zeile ? "Änderung speichern" : "Baustelle anlegen"}
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
