"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setFirmendaten, setLogo, entferneLogo } from "@/server/firma";
import type { Firmendaten } from "@/server/firma-read";
import { DatumFeld, ZahlFeld } from "@/components/ui/eingabefelder";
import { IsoTeamWortmarke } from "@/components/marke/isoteam-logo";

const feld =
  "h-10 w-full rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20";
const bez = "block text-xs font-medium text-black/60 dark:text-white/60";
const knopf =
  "h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50";
const knopfRand =
  "h-10 rounded-md border border-black/15 px-3 text-sm disabled:opacity-50 dark:border-white/20";

export function FirmaFormular({ daten }: { daten: Firmendaten }) {
  return (
    <div className="mt-6 space-y-8">
      <Logo name={daten.logoName} />
      <Angaben daten={daten} />
    </div>
  );
}

function Logo({ name }: { name: string | null }) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const eingabe = useRef<HTMLInputElement>(null);

  function lauf(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setFehler("");
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (eingabe.current) eingabe.current.value = "";
        router.refresh();
      } else setFehler(r.error ?? "Fehlgeschlagen.");
    });
  }

  function hochladen(datei: File) {
    const fd = new FormData();
    fd.append("datei", datei);
    lauf(() => setLogo(fd));
  }

  return (
    <section>
      <h2 className="text-sm font-medium">Logo</h2>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Steht hier kein eigenes Logo, tragen Bericht und Beleg die Wortmarke
        von IsoTeam. PNG oder JPEG, mindestens 600 Pixel breit, höchstens 2 MB.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
        {/* Auf hellem Grund die farbige Fassung, siehe fassungFuer in
            lib/marke.ts. Das Logo einer anderen Firma kommt als Bild über
            die eigene Adresse, das eigene als Komponente. */}
        <div className="flex h-10 items-center">
          {name ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/firma/logo" alt="" className="max-h-10 w-auto" />
          ) : (
            <IsoTeamWortmarke hoehe={26} />
          )}
        </div>
        <p className="text-sm text-black/60 dark:text-white/60">
          {name ?? "Wortmarke IsoTeam, aus dem Verzeichnis"}
        </p>
      </div>

      {fehler && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {fehler}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={eingabe}
          type="file"
          accept="image/png,image/jpeg"
          disabled={laeuft}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) hochladen(f);
          }}
          className="text-sm file:mr-3 file:h-10 file:rounded-md file:border file:border-black/15 file:bg-transparent file:px-3 file:text-sm dark:file:border-white/20 dark:file:text-white"
        />
        {name && (
          <button
            type="button"
            disabled={laeuft}
            onClick={() => {
              if (confirm("Wieder die Wortmarke von IsoTeam verwenden?"))
                lauf(entferneLogo);
            }}
            className={knopfRand}
          >
            Logo entfernen
          </button>
        )}
        {laeuft && (
          <span className="text-sm text-black/60 dark:text-white/60">Lädt</span>
        )}
      </div>
    </section>
  );
}

function Angaben({ daten }: { daten: Firmendaten }) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const [gespeichert, setGespeichert] = useState(false);
  const [f, setF] = useState(daten);

  const setzen = (teil: Partial<Firmendaten>) => {
    setGespeichert(false);
    setF({ ...f, ...teil });
  };

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        setFehler("");
        start(async () => {
          const r = await setFirmendaten({
            name: f.name,
            street: f.street,
            zip: f.zip,
            city: f.city,
            vatNumber: f.vatNumber,
            phone: f.phone,
            email: f.email,
            iban: f.iban,
            defaultVacationDays: Number(f.defaultVacationDays),
            regieRateA: f.regieRateA,
            regieRateB: f.regieRateB,
            regieValidFrom: f.regieValidFrom,
          });
          if (r.ok) {
            setGespeichert(true);
            router.refresh();
          } else setFehler(r.error);
        });
      }}
    >
      <h2 className="text-sm font-medium">Anschrift und Kontakt</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className={bez}>Firmenname</span>
          <input
            required
            maxLength={120}
            value={f.name}
            onChange={(e) => setzen({ name: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className={bez}>Strasse und Hausnummer</span>
          <input
            required
            maxLength={120}
            value={f.street}
            onChange={(e) => setzen({ street: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>PLZ</span>
          <input
            required
            inputMode="numeric"
            pattern="\d{4}"
            value={f.zip}
            onChange={(e) => setzen({ zip: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>Ort</span>
          <input
            required
            maxLength={120}
            value={f.city}
            onChange={(e) => setzen({ city: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>Telefon</span>
          <input
            maxLength={60}
            value={f.phone}
            onChange={(e) => setzen({ phone: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>Mailadresse</span>
          <input
            type="email"
            maxLength={120}
            value={f.email}
            onChange={(e) => setzen({ email: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>UID und MwSt-Nummer</span>
          <input
            maxLength={40}
            value={f.vatNumber}
            onChange={(e) => setzen({ vatNumber: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>IBAN</span>
          <input
            maxLength={40}
            value={f.iban}
            onChange={(e) => setzen({ iban: e.target.value })}
            className={feld}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-black/50 dark:text-white/50">
        Telefon, Mailadresse, UID und IBAN stehen im Fuss jedes Berichts. Die
        IBAN trägt später den Zahlteil der Rechnung.
      </p>

      <h2 className="mt-6 text-sm font-medium">Vorgaben</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className={bez}>Ferientage für neue Konten</span>
          <ZahlFeld
            min={0}
            max={60}
            wert={f.defaultVacationDays}
            onWert={(n) => setzen({ defaultVacationDays: n })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>Regieansatz A, CHF je Stunde</span>
          <input
            inputMode="decimal"
            value={f.regieRateA}
            onChange={(e) => setzen({ regieRateA: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>Regieansatz B, CHF je Stunde</span>
          <input
            inputMode="decimal"
            value={f.regieRateB}
            onChange={(e) => setzen({ regieRateB: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>Ansätze gültig ab</span>
          <DatumFeld
            value={f.regieValidFrom}
            onChange={(e) => setzen({ regieValidFrom: e.target.value })}
            className={feld}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-black/50 dark:text-white/50">
        Die Ferientage gelten für Konten, die neu entstehen. Bestehende behalten
        ihren Anspruch, der steht unter Personen.
      </p>

      <p className="mt-4 text-xs text-black/50 dark:text-white/50">
        Der Kanton steht hier nicht: er ist nicht Teil der Anschrift, sondern
        die Quelle der Feiertage. Ein Wechsel müsste die bereits geholten
        Feiertage mitziehen, und das ist kein Formularfeld.
      </p>

      {fehler && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {fehler}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={laeuft} className={knopf}>
          {laeuft ? "Speichert" : "Firmenangaben speichern"}
        </button>
        {gespeichert && !laeuft && (
          <span className="text-sm text-black/60 dark:text-white/60">
            Gespeichert
          </span>
        )}
      </div>
    </form>
  );
}
