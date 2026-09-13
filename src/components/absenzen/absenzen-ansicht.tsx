"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAbsence, decideAbsence, deleteAbsence } from "@/server/absences";
import { DatumFeld } from "@/components/ui/datum-feld";

export type Zeile = {
  id: string;
  personId: string;
  personName: string;
  typ: "VACATION" | "SICK" | "OTHER";
  status: "PENDING" | "APPROVED" | "DENIED";
  von: string;
  bis: string;
  tage: number;
  halberTag: boolean;
  note: string | null;
  entschiedenVon: string | null;
};

type Props = {
  zeilen: Zeile[];
  personen: { id: string; name: string }[];
  eigeneId: string;
  istAdmin: boolean;
  mehrerePersonen: boolean;
};

const TYP: Record<Zeile["typ"], string> = {
  VACATION: "Ferien",
  SICK: "Krank",
  OTHER: "Absenz",
};

const STATUS: Record<Zeile["status"], string> = {
  PENDING: "beantragt",
  APPROVED: "bewilligt",
  DENIED: "abgelehnt",
};

const feld =
  "h-10 w-full rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20";
const bez = "block text-xs font-medium text-black/60 dark:text-white/60";

const datum = (iso: string) => iso.split("-").reverse().join(".");

export function AbsenzenAnsicht({
  zeilen,
  personen,
  eigeneId,
  istAdmin,
  mehrerePersonen,
}: Props) {
  const offen = zeilen.filter((z) => z.status === "PENDING");

  return (
    <div className="mt-6 space-y-8">
      <Formular personen={personen} eigeneId={eigeneId} istAdmin={istAdmin} />

      {istAdmin && offen.length > 0 && (
        <section>
          <h2 className="text-sm font-medium">
            Zu entscheiden, {offen.length}
          </h2>
          <ul className="mt-3 divide-y divide-black/10 rounded-md border border-amber-300 dark:divide-white/10 dark:border-amber-800">
            {offen.map((z) => (
              <Zeile
                key={z.id}
                z={z}
                istAdmin={istAdmin}
                eigeneId={eigeneId}
                mitPerson={mehrerePersonen}
              />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium">Alle Absenzen</h2>
        {zeilen.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-black/15 p-4 text-sm text-black/50 dark:border-white/20 dark:text-white/50">
            In diesem Jahr ist nichts erfasst.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-black/10 rounded-md border border-black/10 dark:divide-white/10 dark:border-white/15">
            {zeilen.map((z) => (
              <Zeile
                key={z.id}
                z={z}
                istAdmin={istAdmin}
                eigeneId={eigeneId}
                mitPerson={mehrerePersonen}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Zeile({
  z,
  istAdmin,
  eigeneId,
  mitPerson,
}: {
  z: Zeile;
  istAdmin: boolean;
  eigeneId: string;
  mitPerson: boolean;
}) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");

  function fuehreAus(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setFehler("");
    start(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
      else setFehler(r.error ?? "Fehlgeschlagen.");
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
      {mitPerson && <span className="font-medium">{z.personName}</span>}
      <span className="font-medium">{TYP[z.typ]}</span>
      <span className="tabular-nums">
        {z.von === z.bis ? datum(z.von) : `${datum(z.von)} bis ${datum(z.bis)}`}
      </span>
      <span className="tabular-nums text-black/60 dark:text-white/60">
        {z.tage.toFixed(z.halberTag || z.tage % 1 !== 0 ? 1 : 0)}{" "}
        {z.tage === 1 ? "Tag" : "Tage"}
      </span>
      <span
        className={
          z.status === "APPROVED"
            ? "text-green-800 dark:text-green-300"
            : z.status === "DENIED"
              ? "text-black/45 line-through dark:text-white/45"
              : "text-amber-800 dark:text-amber-300"
        }
      >
        {STATUS[z.status]}
        {z.entschiedenVon && z.status !== "PENDING" && ` von ${z.entschiedenVon}`}
      </span>

      {z.note && (
        <span className="w-full text-black/50 dark:text-white/50">{z.note}</span>
      )}
      {fehler && <span className="w-full text-red-700 dark:text-red-300">{fehler}</span>}

      <span className="ml-auto flex gap-3">
        {istAdmin && z.status === "PENDING" && (
          <>
            <button
              type="button"
              disabled={laeuft}
              onClick={() => fuehreAus(() => decideAbsence(z.id, "APPROVED"))}
              className="text-green-800 underline disabled:opacity-50 dark:text-green-300"
            >
              Bewilligen
            </button>
            <button
              type="button"
              disabled={laeuft}
              onClick={() => fuehreAus(() => decideAbsence(z.id, "DENIED"))}
              className="text-black/60 underline disabled:opacity-50 dark:text-white/60"
            >
              Ablehnen
            </button>
          </>
        )}
        {(istAdmin || (z.personId === eigeneId && z.status !== "APPROVED")) && (
          <button
            type="button"
            disabled={laeuft}
            onClick={() => {
              if (confirm("Diese Absenz löschen?")) fuehreAus(() => deleteAbsence(z.id));
            }}
            className="text-red-700 underline disabled:opacity-50 dark:text-red-300"
          >
            Löschen
          </button>
        )}
      </span>
    </li>
  );
}

function Formular({
  personen,
  eigeneId,
  istAdmin,
}: {
  personen: { id: string; name: string }[];
  eigeneId: string;
  istAdmin: boolean;
}) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const [hinweis, setHinweis] = useState("");
  const heute = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    userId: eigeneId,
    type: "VACATION" as Zeile["typ"],
    von: heute,
    bis: heute,
    halberTag: false,
    note: "",
  });

  const einTag = f.von === f.bis;

  function absenden(ev: React.FormEvent) {
    ev.preventDefault();
    setFehler("");
    setHinweis("");
    start(async () => {
      const r = await saveAbsence({
        userId: f.userId,
        type: f.type,
        startDate: f.von,
        endDate: f.bis,
        isHalfDay: einTag && f.halberTag,
        note: f.note.trim() || null,
      });
      if (!r.ok) {
        setFehler(r.error);
        return;
      }
      setHinweis(
        f.type === "SICK"
          ? "Krankmeldung erfasst, sie gilt sofort."
          : "Antrag eingereicht, ein Vorgesetzter entscheidet darüber.",
      );
      setF({ ...f, note: "", halberTag: false });
      router.refresh();
    });
  }

  return (
    <form onSubmit={absenden} className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-medium">Neue Absenz</h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {istAdmin && personen.length > 1 && (
          <label className="space-y-1">
            <span className={bez}>Person</span>
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

        <label className="space-y-1">
          <span className={bez}>Art</span>
          <select
            value={f.type}
            onChange={(e) => setF({ ...f, type: e.target.value as Zeile["typ"] })}
            className={feld}
          >
            <option value="VACATION">Ferien</option>
            <option value="SICK">Krank</option>
            <option value="OTHER">Andere Absenz</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className={bez}>Von</span>
          <DatumFeld
            required
            value={f.von}
            onChange={(e) =>
              setF({ ...f, von: e.target.value, bis: e.target.value > f.bis ? e.target.value : f.bis })
            }
            className={feld}
          />
        </label>

        <label className="space-y-1">
          <span className={bez}>Bis</span>
          <DatumFeld
            required
            min={f.von}
            value={f.bis}
            onChange={(e) => setF({ ...f, bis: e.target.value })}
            className={feld}
          />
        </label>
      </div>

      <label className="space-y-1 block">
        <span className={bez}>
          Bemerkung
          {f.type === "SICK" && ", wird nach 18 Monaten automatisch geleert"}
        </span>
        <input
          type="text"
          maxLength={500}
          value={f.note}
          onChange={(e) => setF({ ...f, note: e.target.value })}
          className={feld}
          placeholder="optional"
        />
      </label>

      {einTag && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.halberTag}
            onChange={(e) => setF({ ...f, halberTag: e.target.checked })}
            className="size-4"
          />
          Nur ein halber Tag
        </label>
      )}

      {fehler && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {fehler}
        </p>
      )}
      {hinweis && (
        <p className="text-sm text-green-800 dark:text-green-300">{hinweis}</p>
      )}

      <button
        type="submit"
        disabled={laeuft}
        className="h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
      >
        {laeuft ? "Speichert" : f.type === "SICK" ? "Krank melden" : "Antrag einreichen"}
      </button>
    </form>
  );
}
