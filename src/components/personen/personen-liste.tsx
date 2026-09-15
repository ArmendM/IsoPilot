"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setZugang,
  setLagerrecht,
  setStammdaten,
  setPensum,
  loeschePensum,
  setAnfangssaldo,
} from "@/server/users";
import { DatumFeld, ZahlFeld } from "@/components/ui/eingabefelder";

export type Zeile = {
  id: string;
  name: string;
  email: string | null;
  role: "EMPLOYEE" | "ADMIN";
  isActive: boolean;
  canManageStock: boolean;
  vacationDays: number;
  regieTariff: "A" | "B";
  employedFrom: string | null;
  employedUntil: string | null;
  startBalance: number | null;
  balanceFrom: string | null;
  pensen: { id: string; validFrom: string; weeklyHours: number }[];
  wochenstunden: number;
  letzteAnmeldung: string | null;
  kontoSeit: string;
  istIchSelbst: boolean;
};

const feld =
  "h-10 w-full rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20";
const bez = "block text-xs font-medium text-black/60 dark:text-white/60";

const datumDE = (iso: string) => iso.split("-").reverse().join(".");
const zahl = (n: number) => n.toLocaleString("de-CH", { maximumFractionDigits: 2 });

/** Ein Saldo trägt sein Vorzeichen, auch das positive: "+12.5 h" sagt
 *  Überstunden, "12.5 h" allein liesse offen, in welche Richtung. */
const saldoText = (n: number) => `${n > 0 ? "+" : ""}${zahl(n)} h`;

export function PersonenListe({ zeilen }: { zeilen: Zeile[] }) {
  const wartend = zeilen.filter((z) => !z.isActive);
  const aktiv = zeilen.filter((z) => z.isActive);

  return (
    <div className="mt-6 space-y-8">
      {wartend.length > 0 && (
        <section>
          <h2 className="text-sm font-medium">
            Im Warteraum, {wartend.length}
          </h2>
          <p className="mt-1 text-xs text-black/60 dark:text-white/60">
            Diese Konten sind bei der ersten Anmeldung entstanden und kommen
            erst mit einer Freigabe hinein.
          </p>
          <ul className="mt-3 space-y-3">
            {wartend.map((z) => (
              <Karte key={z.id} z={z} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium">Freigegeben, {aktiv.length}</h2>
        <ul className="mt-3 space-y-3">
          {aktiv.map((z) => (
            <Karte key={z.id} z={z} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function Karte({ z }: { z: Zeile }) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const [offen, setOffen] = useState(false);
  const [zeitOffen, setZeitOffen] = useState(false);
  const [f, setF] = useState({
    vacationDays: z.vacationDays,
    regieTariff: z.regieTariff,
    employedFrom: z.employedFrom ?? "",
    employedUntil: z.employedUntil ?? "",
  });

  function lauf(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setFehler("");
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setOffen(false);
        router.refresh();
      } else setFehler(r.error ?? "Fehlgeschlagen.");
    });
  }

  const zugang = (role: Zeile["role"], isActive: boolean) =>
    lauf(() => setZugang({ id: z.id, role, isActive }));

  /* Nur bei einer mitarbeitenden Person: ein Vorgesetzter darf das Lager
   * über die Rolle, dort wäre der Knopf ohne Wirkung. */
  const zeigeLagerrecht = z.isActive && z.role !== "ADMIN";

  return (
    <li
      className={[
        "rounded-lg border p-4",
        z.isActive
          ? "border-black/10 dark:border-white/15"
          : "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{z.name}</span>
        {z.istIchSelbst && (
          <span className="text-xs text-black/50 dark:text-white/50">du selbst</span>
        )}
        <span className="text-sm text-black/60 dark:text-white/60">
          {z.role === "ADMIN" ? "Vorgesetzter" : "Mitarbeitender"}
        </span>
        {z.email && (
          <span className="text-sm text-black/50 dark:text-white/50">{z.email}</span>
        )}
        <span className="ml-auto text-xs text-black/50 dark:text-white/50">
          {/* Bei einem gesperrten Konto gibt es keine Anmeldung, weil nie
              eine Sitzung entsteht. "Noch nie angemeldet" wäre dort falsch:
              die Person hat sich sehr wohl bei Infomaniak ausgewiesen. */}
          {z.letzteAnmeldung
            ? `zuletzt angemeldet ${datumDE(z.letzteAnmeldung)}`
            : `Konto seit ${datumDE(z.kontoSeit)}`}
        </span>
      </div>

      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        {z.vacationDays} Ferientage, {zahl(z.wochenstunden)} Stunden je Woche,
        Regieansatz {z.regieTariff}
        {z.role === "ADMIN"
          ? ", Lager über die Rolle"
          : z.canManageStock && ", mit Lagerberechtigung"}
        {z.employedFrom && `, Eintritt ${datumDE(z.employedFrom)}`}
        {z.employedUntil && `, Austritt ${datumDE(z.employedUntil)}`}
        {!z.employedFrom && (
          <span className="text-amber-800 dark:text-amber-300">
            , Eintrittsdatum fehlt
          </span>
        )}
      </p>

      {fehler && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {fehler}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {!z.istIchSelbst && !z.isActive && (
          <button
            type="button"
            disabled={laeuft}
            onClick={() => zugang(z.role, true)}
            className="h-9 rounded-md bg-foreground px-3 font-medium text-background disabled:opacity-50"
          >
            Freigeben als {z.role === "ADMIN" ? "Vorgesetzter" : "Mitarbeitender"}
          </button>
        )}
        {!z.istIchSelbst && !z.isActive && z.role !== "ADMIN" && (
          <button
            type="button"
            disabled={laeuft}
            onClick={() => zugang("ADMIN", true)}
            className="h-9 rounded-md border border-black/15 px-3 disabled:opacity-50 dark:border-white/20"
          >
            Freigeben als Vorgesetzter
          </button>
        )}
        {!z.istIchSelbst && z.isActive && (
          <>
            <button
              type="button"
              disabled={laeuft}
              onClick={() => zugang(z.role === "ADMIN" ? "EMPLOYEE" : "ADMIN", true)}
              className="h-9 rounded-md border border-black/15 px-3 disabled:opacity-50 dark:border-white/20"
            >
              {z.role === "ADMIN" ? "Zu Mitarbeitender machen" : "Zu Vorgesetzter machen"}
            </button>
            <button
              type="button"
              disabled={laeuft}
              onClick={() => {
                if (confirm(`${z.name} den Zugang entziehen?`)) zugang(z.role, false);
              }}
              className="h-9 rounded-md border border-black/15 px-3 text-red-700 disabled:opacity-50 dark:border-white/20 dark:text-red-300"
            >
              Zugang entziehen
            </button>
          </>
        )}
        {zeigeLagerrecht && (
          <button
            type="button"
            disabled={laeuft}
            onClick={() =>
              lauf(() => setLagerrecht({ id: z.id, canManageStock: !z.canManageStock }))
            }
            className="h-9 rounded-md border border-black/15 px-3 disabled:opacity-50 dark:border-white/20"
          >
            {z.canManageStock
              ? "Lagerberechtigung entziehen"
              : "Lagerberechtigung geben"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setOffen(!offen)}
          className="h-9 px-1 underline text-black/60 dark:text-white/60"
        >
          {offen ? "Stammdaten schliessen" : "Stammdaten bearbeiten"}
        </button>
        <button
          type="button"
          onClick={() => setZeitOffen(!zeitOffen)}
          className="h-9 px-1 underline text-black/60 dark:text-white/60"
        >
          {zeitOffen ? "Arbeitszeit schliessen" : "Arbeitszeit und Saldo"}
        </button>
      </div>

      {offen && (
        <form
          className="mt-4 border-t border-black/10 pt-4 dark:border-white/15"
          onSubmit={(ev) => {
            ev.preventDefault();
            lauf(() =>
              setStammdaten({
                id: z.id,
                vacationDays: Number(f.vacationDays),
                regieTariff: f.regieTariff,
                employedFrom: f.employedFrom || null,
                employedUntil: f.employedUntil || null,
              }),
            );
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1">
              <span className={bez}>Ferientage im Jahr</span>
              <ZahlFeld
                min={0}
                max={60}
                wert={f.vacationDays}
                onWert={(n) => setF({ ...f, vacationDays: n })}
                className={feld}
              />
            </label>
            <label className="space-y-1">
              <span className={bez}>Regieansatz</span>
              <select
                value={f.regieTariff}
                onChange={(e) =>
                  setF({ ...f, regieTariff: e.target.value as "A" | "B" })
                }
                className={feld}
              >
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className={bez}>Eintritt</span>
              <DatumFeld
                value={f.employedFrom}
                onChange={(e) => setF({ ...f, employedFrom: e.target.value })}
                className={feld}
              />
            </label>
            <label className="space-y-1">
              <span className={bez}>Austritt</span>
              <DatumFeld
                value={f.employedUntil}
                onChange={(e) => setF({ ...f, employedUntil: e.target.value })}
                className={feld}
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-black/50 dark:text-white/50">
            Ohne Eintrittsdatum gilt jedes Jahr als voll beschäftigt, der
            Ferienanspruch wird dann nicht anteilig gekürzt.
          </p>
          <button
            type="submit"
            disabled={laeuft}
            className="mt-3 h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
          >
            {laeuft ? "Speichert" : "Stammdaten speichern"}
          </button>
        </form>
      )}

      {zeitOffen && <Arbeitszeit z={z} lauf={lauf} laeuft={laeuft} />}
    </li>
  );
}

/**
 * Pensum und Anfangssaldo.
 *
 * Ein eigener Abschnitt neben den Stammdaten, weil hier nicht ein Feld
 * geändert, sondern eine Liste geführt wird: je Pensumsänderung eine
 * Zeile mit Stichtag. Die alten Zeilen bleiben, sonst verschöbe sich der
 * Saldo vergangener Monate rückwirkend.
 */
function Arbeitszeit({
  z,
  lauf,
  laeuft,
}: {
  z: Zeile;
  lauf: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  laeuft: boolean;
}) {
  const [p, setP] = useState({ weeklyHours: z.wochenstunden, validFrom: "" });
  const [s, setS] = useState({
    startBalance: z.startBalance === null ? "" : String(z.startBalance),
    balanceFrom: z.balanceFrom ?? "",
  });

  return (
    <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/15">
      <h3 className="text-sm font-medium">Sollarbeitszeit</h3>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">
        Ohne eigenes Pensum gilt die Vorgabe der Firma, zu ändern unter{" "}
        <a href="/firma" className="underline">
          Firma
        </a>
        . Ein neues Pensum gilt ab seinem Stichtag, die Zeit davor bleibt
        gerechnet wie bisher.
      </p>

      {z.pensen.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {z.pensen.map((x) => (
            <li key={x.id} className="flex items-center gap-3">
              <span className="tabular-nums">
                ab {datumDE(x.validFrom)}: {zahl(x.weeklyHours)} Stunden je Woche
              </span>
              <button
                type="button"
                disabled={laeuft}
                onClick={() => {
                  if (
                    confirm(
                      `Pensum ab ${datumDE(x.validFrom)} entfernen? Das ändert den Saldo ab diesem Tag rückwirkend.`,
                    )
                  )
                    lauf(() => loeschePensum({ id: z.id, pensumId: x.id }));
                }}
                className="text-xs underline text-black/50 dark:text-white/50"
              >
                entfernen
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          lauf(() =>
            setPensum({
              id: z.id,
              weeklyHours: Number(p.weeklyHours),
              validFrom: p.validFrom,
            }),
          );
        }}
      >
        <label className="space-y-1">
          <span className={bez}>Stunden je Woche</span>
          <ZahlFeld
            min={0}
            max={80}
            step={0.1}
            wert={p.weeklyHours}
            onWert={(n) => setP({ ...p, weeklyHours: n })}
            className={`${feld} w-32`}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>gültig ab</span>
          <DatumFeld
            required
            value={p.validFrom}
            onChange={(e) => setP({ ...p, validFrom: e.target.value })}
            className={`${feld} w-44`}
          />
        </label>
        <button
          type="submit"
          disabled={laeuft || !p.validFrom}
          className="h-10 rounded-md border border-black/15 px-3 text-sm disabled:opacity-50 dark:border-white/20"
        >
          Pensum eintragen
        </button>
      </form>

      <h3 className="mt-6 text-sm font-medium">Anfangssaldo</h3>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">
        Der Zeitsaldo aus dem alten Vorgehen, einmal eingetragen. Ab dem
        Stichtag rechnet IsoPilot selbst: die Zeit davor steckt im Saldo und
        wird nicht noch einmal gezählt. Beide Felder leeren hebt ihn auf.
      </p>

      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          const leer = s.startBalance.trim() === "" && s.balanceFrom === "";
          lauf(() =>
            setAnfangssaldo({
              id: z.id,
              startBalance: leer ? null : Number(s.startBalance),
              balanceFrom: leer ? null : s.balanceFrom,
            }),
          );
        }}
      >
        <label className="space-y-1">
          <span className={bez}>Saldo in Stunden</span>
          {/* Ein gewöhnliches Feld, kein ZahlFeld: hier gehört ein Minus
              hinein, und ein Minus ist beim Tippen zwischendurch eine
              unvollständige Zahl. */}
          <input
            inputMode="decimal"
            placeholder="z. B. -4.5"
            value={s.startBalance}
            onChange={(e) => setS({ ...s, startBalance: e.target.value })}
            className={`${feld} w-32`}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>gerechnet ab</span>
          <DatumFeld
            value={s.balanceFrom}
            onChange={(e) => setS({ ...s, balanceFrom: e.target.value })}
            className={`${feld} w-44`}
          />
        </label>
        <button
          type="submit"
          disabled={laeuft}
          className="h-10 rounded-md border border-black/15 px-3 text-sm disabled:opacity-50 dark:border-white/20"
        >
          Anfangssaldo speichern
        </button>
        {z.startBalance !== null && z.balanceFrom && (
          <span className="h-10 leading-10 text-sm text-black/60 dark:text-white/60">
            Steht auf {saldoText(z.startBalance)} per {datumDE(z.balanceFrom)}
          </span>
        )}
      </form>
    </div>
  );
}
