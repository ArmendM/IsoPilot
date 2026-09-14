"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMaterial, setMaterialAktiv, saveKategorie } from "@/server/materials";
import { inventur } from "@/server/lager";
import { zaehldifferenz } from "@/lib/lagerdeckung";
import { ZahlFeld } from "@/components/ui/eingabefelder";

export type Artikel = {
  id: string;
  sku: string | null;
  name: string;
  categoryId: string | null;
  kategorie: string | null;
  unit: "M2" | "LFM" | "STK" | "KG" | "ROLLE";
  preis: number;
  lager: number;
  mindestbestand: number;
  fehlmenge: number;
  bestellbedarf: number;
  fireClass: string | null;
  istAktiv: boolean;
  unterMindestbestand: boolean;
};

export type Kategorie = { id: string; name: string; sortOrder: number; artikel: number };

const EINHEIT: Record<Artikel["unit"], string> = {
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
const menge = (n: number) =>
  n.toLocaleString("de-CH", { maximumFractionDigits: 2 });

export function MaterialAnsicht({
  artikel,
  kategorien,
  istAdmin,
  istLager,
}: {
  artikel: Artikel[];
  kategorien: Kategorie[];
  istAdmin: boolean;
  /* Zählen darf, wer die Lagerberechtigung hat. Den Katalog pflegen
   * bleibt beim Vorgesetzten: das eine ist der Lagerplatz, das andere
   * sind Preise und Stammdaten. */
  istLager: boolean;
}) {
  const [neu, setNeu] = useState(false);
  const [kategorienOffen, setKategorienOffen] = useState(false);
  /* Was bestellt werden muss, damit die Baustellen gedeckt sind und der
   * Mindestbestand wieder steht. */
  const zuBestellen = artikel.filter((a) => a.bestellbedarf > 0);

  return (
    <div className="mt-6 space-y-6">
      {zuBestellen.length > 0 && (
        <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">
            {zuBestellen.length === 1
              ? "Ein Artikel muss bestellt werden"
              : `${zuBestellen.length} Artikel müssen bestellt werden`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {zuBestellen.map((a) => (
              <li key={a.id} className="tabular-nums">
                {a.name}: <strong>{menge(a.bestellbedarf)} {EINHEIT[a.unit]}</strong>
                {a.fehlmenge > 0 && (
                  <span className="text-amber-800/80 dark:text-amber-200/70">
                    {" "}
                    ({menge(a.fehlmenge)} auf Baustellen gebucht und nicht gedeckt
                    {a.mindestbestand > a.lager &&
                      `, ${menge(a.mindestbestand - a.lager)} bis zum Mindestbestand`}
                    )
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {istAdmin && (
        <div className="flex flex-wrap gap-3">
          {!neu && (
            <button
              type="button"
              onClick={() => setNeu(true)}
              className="h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background"
            >
              Neuer Artikel
            </button>
          )}
          <button
            type="button"
            onClick={() => setKategorienOffen(!kategorienOffen)}
            className="h-10 rounded-md border border-black/15 px-4 text-sm dark:border-white/20"
          >
            {kategorienOffen ? "Kategorien schliessen" : "Kategorien verwalten"}
          </button>
        </div>
      )}

      {neu && (
        <ArtikelFormular
          kategorien={kategorien}
          onFertig={() => setNeu(false)}
          onAbbrechen={() => setNeu(false)}
        />
      )}

      {kategorienOffen && <Kategorien kategorien={kategorien} />}

      {artikel.length === 0 ? (
        <p className="rounded-md border border-dashed border-black/15 p-4 text-sm text-black/50 dark:border-white/20 dark:text-white/50">
          Kein Artikel gefunden.
        </p>
      ) : (
        <ul className="space-y-3">
          {artikel.map((a) => (
            <ArtikelKarte
              key={a.id}
              a={a}
              kategorien={kategorien}
              istAdmin={istAdmin}
              istLager={istLager}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ArtikelKarte({
  a,
  kategorien,
  istAdmin,
  istLager,
}: {
  a: Artikel;
  kategorien: Kategorie[];
  istAdmin: boolean;
  istLager: boolean;
}) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const [offen, setOffen] = useState(false);
  const [zaehlen, setZaehlen] = useState(false);

  return (
    <li
      className={[
        "rounded-lg border p-4",
        !a.istAktiv
          ? "border-black/10 opacity-60 dark:border-white/15"
          : a.unterMindestbestand
            ? "border-amber-400 dark:border-amber-700"
            : "border-black/10 dark:border-white/15",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {a.sku && (
          <span className="rounded bg-black/10 px-1.5 py-0.5 text-xs tabular-nums dark:bg-white/15">
            {a.sku}
          </span>
        )}
        <span className="font-medium">{a.name}</span>
        {a.kategorie && (
          <span className="text-sm text-black/60 dark:text-white/60">{a.kategorie}</span>
        )}
        {a.fireClass && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-900 dark:bg-red-950 dark:text-red-200">
            {a.fireClass}
          </span>
        )}
        {!a.istAktiv && (
          <span className="text-xs text-black/50 dark:text-white/50">stillgelegt</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="tabular-nums">
          {franken(a.preis)} pro {EINHEIT[a.unit]}
        </span>
        <span className="tabular-nums">
          Lager {menge(a.lager)} {EINHEIT[a.unit]}
        </span>
        {a.fehlmenge > 0 && (
          <span className="tabular-nums font-medium text-amber-800 dark:text-amber-300">
            Fehlmenge {menge(a.fehlmenge)} {EINHEIT[a.unit]}
          </span>
        )}
        {a.mindestbestand > 0 && (
          <span
            className={[
              "tabular-nums",
              a.unterMindestbestand
                ? "font-medium text-amber-800 dark:text-amber-300"
                : "text-black/60 dark:text-white/60",
            ].join(" ")}
          >
            Mindestbestand {menge(a.mindestbestand)}
            {a.unterMindestbestand && ", unterschritten"}
          </span>
        )}
      </div>

      {fehler && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {fehler}
        </p>
      )}

      {(istAdmin || istLager) && (
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {istAdmin && (
            <>
              <button
                type="button"
                onClick={() => setOffen(!offen)}
                className="h-9 px-1 underline text-black/60 dark:text-white/60"
              >
                {offen ? "Schliessen" : "Bearbeiten"}
              </button>
              <button
                type="button"
                disabled={laeuft}
                onClick={() => {
                  setFehler("");
                  start(async () => {
                    const r = await setMaterialAktiv(a.id, !a.istAktiv);
                    if (r.ok) router.refresh();
                    else setFehler(r.error);
                  });
                }}
                className="h-9 px-1 underline text-black/60 disabled:opacity-50 dark:text-white/60"
              >
                {a.istAktiv ? "Stilllegen" : "Wieder aufnehmen"}
              </button>
            </>
          )}
          {istLager && a.istAktiv && (
            <button
              type="button"
              onClick={() => setZaehlen(!zaehlen)}
              className="h-9 px-1 underline text-black/60 dark:text-white/60"
            >
              {zaehlen ? "Inventur schliessen" : "Inventur"}
            </button>
          )}
        </div>
      )}

      {zaehlen && (
        <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/15">
          <InventurFormular a={a} onFertig={() => setZaehlen(false)} />
        </div>
      )}

      {offen && (
        <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/15">
          <ArtikelFormular
            kategorien={kategorien}
            artikel={a}
            onFertig={() => setOffen(false)}
            onAbbrechen={() => setOffen(false)}
          />
        </div>
      )}
    </li>
  );
}

/* Inventur. Gezählt wird der Bestand und nicht die Differenz: auf dem
 * Lagerplatz zählt man Stücke, das Rechnen macht die Maschine.
 *
 * Die angezeigte Berichtigung kommt aus derselben Funktion, die der
 * Server schreibt. Zwei Rechnungen für dieselbe Zahl gingen sonst
 * irgendwann auseinander, und die Vorschau zeigte etwas anderes an, als
 * nachher im Verlauf steht. */
function InventurFormular({ a, onFertig }: { a: Artikel; onFertig: () => void }) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const [gezaehlt, setGezaehlt] = useState(a.lager);
  const [notiz, setNotiz] = useState("");

  const differenz = zaehldifferenz(
    { bestand: a.lager, fehlmenge: a.fehlmenge },
    Number(gezaehlt) || 0,
  );

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setFehler("");
        start(async () => {
          const r = await inventur({
            materialId: a.id,
            gezaehlt: Number(gezaehlt) || 0,
            note: notiz.trim() || null,
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
      <h3 className="text-sm font-medium">Inventur</h3>

      <p className="text-sm text-black/60 dark:text-white/60">
        Laut System {menge(a.lager)} {EINHEIT[a.unit]}
        {a.fehlmenge > 0 && (
          <>
            , dazu eine Fehlmenge von {menge(a.fehlmenge)}. Die Zählung
            erledigt sie: was gezählt ist, ist da.
          </>
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={bez}>Gezählter Bestand</span>
          <ZahlFeld
            min={0}
            step={1}
            wert={gezaehlt}
            onWert={setGezaehlt}
            className={feld}
          />
        </label>
        <label className="space-y-1">
          <span className={bez}>Notiz, freiwillig</span>
          <input
            type="text"
            maxLength={160}
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            placeholder="Jahresinventur, Bruch, Schwund"
            className={feld}
          />
        </label>
      </div>

      <p className="text-sm">
        {differenz === 0 ? (
          <span className="text-black/60 dark:text-white/60">
            Die Zählung bestätigt den Bestand, es entsteht keine Bewegung.
          </span>
        ) : (
          <span className="text-amber-800 dark:text-amber-300">
            Berichtigung um {differenz > 0 ? "+" : ""}
            {menge(differenz)} {EINHEIT[a.unit]}, als Inventurdifferenz im
            Lagerverlauf.
          </span>
        )}
      </p>

      {fehler && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {fehler}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={laeuft}
          className="h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
        >
          {laeuft ? "Speichert" : "Bestand übernehmen"}
        </button>
        <button
          type="button"
          onClick={onFertig}
          className="h-10 px-2 text-sm underline text-black/60 dark:text-white/60"
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function ArtikelFormular({
  kategorien,
  artikel,
  onFertig,
  onAbbrechen,
}: {
  kategorien: Kategorie[];
  artikel?: Artikel;
  onFertig: () => void;
  onAbbrechen: () => void;
}) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const [f, setF] = useState({
    sku: artikel?.sku ?? "",
    name: artikel?.name ?? "",
    categoryId: artikel?.categoryId ?? "",
    unit: artikel?.unit ?? ("M2" as Artikel["unit"]),
    preis: artikel?.preis ?? 0,
    lager: artikel?.lager ?? 0,
    mindestbestand: artikel?.mindestbestand ?? 0,
    fireClass: artikel?.fireClass ?? "",
  });

  const kategorieGewechselt =
    artikel && f.categoryId !== (artikel.categoryId ?? "");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setFehler("");
        start(async () => {
          const r = await saveMaterial({
            id: artikel?.id,
            sku: f.sku.trim() || null,
            name: f.name,
            categoryId: f.categoryId || null,
            unit: f.unit,
            preis: Number(f.preis) || 0,
            lager: Number(f.lager) || 0,
            mindestbestand: Number(f.mindestbestand) || 0,
            fireClass: f.fireClass.trim() || null,
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
      {!artikel && <h2 className="text-sm font-medium">Neuer Artikel</h2>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className={bez}>Artikelnummer, freiwillig</span>
          <input
            type="text"
            maxLength={40}
            value={f.sku}
            onChange={(e) => setF({ ...f, sku: e.target.value })}
            className={feld}
          />
        </label>
        <label className="space-y-1 sm:col-span-1 lg:col-span-3">
          <span className={bez}>Bezeichnung</span>
          <input
            type="text"
            required
            maxLength={160}
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            className={feld}
          />
        </label>

        <label className="space-y-1">
          <span className={bez}>Kategorie</span>
          <select
            value={f.categoryId}
            onChange={(e) => setF({ ...f, categoryId: e.target.value })}
            className={feld}
          >
            <option value="">Keine</option>
            {kategorien.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={bez}>Einheit</span>
          <select
            value={f.unit}
            onChange={(e) => setF({ ...f, unit: e.target.value as Artikel["unit"] })}
            className={feld}
          >
            {Object.entries(EINHEIT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={bez}>Preis in Franken</span>
          <ZahlFeld
            min={0}
            step={0.05}
            wert={f.preis}
            onWert={(n) => setF({ ...f, preis: n })}
            className={feld}
          />
        </label>

        <label className="space-y-1">
          <span className={bez}>EI-Klasse, freiwillig</span>
          <input
            type="text"
            maxLength={20}
            value={f.fireClass}
            onChange={(e) => setF({ ...f, fireClass: e.target.value })}
            placeholder="EI 30, EI 60, VKF"
            className={feld}
          />
        </label>

        {/* Nur beim Anlegen. An einem bestehenden Artikel bewegen den
            Bestand ausschliesslich Wareneingang, Buchung, Rückgabe und
            Inventur, jede mit einer Zeile im Lagerverlauf. */}
        {!artikel && (
          <label className="space-y-1">
            <span className={bez}>Anfangsbestand</span>
            <ZahlFeld
              min={0}
              step={1}
              wert={f.lager}
              onWert={(n) => setF({ ...f, lager: n })}
              className={feld}
            />
          </label>
        )}

        <label className="space-y-1">
          <span className={bez}>Mindestbestand</span>
          <ZahlFeld
            min={0}
            step={1}
            wert={f.mindestbestand}
            onWert={(n) => setF({ ...f, mindestbestand: n })}
            className={feld}
          />
        </label>
      </div>

      {/* Wie beim Auftraggeber: ein fokussiertes Auswahlfeld wechselt bei
          einem Pfeiltastendruck lautlos den Wert. */}
      {kategorieGewechselt && (
        <p className="rounded-md border border-amber-400 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          Kategorie wird von <strong>{artikel.kategorie ?? "Keine"}</strong> auf{" "}
          <strong>
            {kategorien.find((k) => k.id === f.categoryId)?.name ?? "Keine"}
          </strong>{" "}
          geändert.
        </p>
      )}

      {artikel && (
        <p className="text-sm text-black/50 dark:text-white/50">
          Der Lagerbestand steht hier nicht mehr: er ändert sich über
          Wareneingang, Buchung und Inventur, damit jeder Sprung im
          Lagerverlauf erklärt ist.
        </p>
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
          {laeuft ? "Speichert" : artikel ? "Änderung speichern" : "Artikel anlegen"}
        </button>
        <button
          type="button"
          onClick={onAbbrechen}
          className="h-10 rounded-md border border-black/15 px-4 text-sm dark:border-white/20"
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function Kategorien({ kategorien }: { kategorien: Kategorie[] }) {
  const router = useRouter();
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState("");
  const [namen, setNamen] = useState<Record<string, string>>(
    Object.fromEntries(kategorien.map((k) => [k.id, k.name])),
  );
  const [neuerName, setNeuerName] = useState("");

  function speichern(daten: { id?: string; name: string; sortOrder: number }) {
    setFehler("");
    start(async () => {
      const r = await saveKategorie(daten);
      if (r.ok) {
        setNeuerName("");
        router.refresh();
      } else setFehler(r.error);
    });
  }

  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-medium">Kategorien</h2>
      <p className="mt-1 text-xs text-black/60 dark:text-white/60">
        Ein neuer Name wirkt sofort auf alle Artikel der Kategorie. Gelöscht
        werden können Kategorien nicht, solange Artikel daran hängen.
      </p>

      <ul className="mt-3 space-y-2">
        {kategorien.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={namen[k.id] ?? ""}
              onChange={(e) => setNamen({ ...namen, [k.id]: e.target.value })}
              className={`${feld} w-auto flex-1`}
            />
            <span className="text-xs tabular-nums text-black/50 dark:text-white/50">
              {k.artikel} {k.artikel === 1 ? "Artikel" : "Artikel"}
            </span>
            <button
              type="button"
              disabled={laeuft || !namen[k.id]?.trim() || namen[k.id] === k.name}
              onClick={() =>
                speichern({ id: k.id, name: namen[k.id], sortOrder: k.sortOrder })
              }
              className="h-9 rounded-md border border-black/15 px-3 text-sm disabled:opacity-40 dark:border-white/20"
            >
              Umbenennen
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={neuerName}
          onChange={(e) => setNeuerName(e.target.value)}
          placeholder="Neue Kategorie"
          className={`${feld} w-auto flex-1`}
        />
        <button
          type="button"
          disabled={laeuft || !neuerName.trim()}
          onClick={() =>
            speichern({ name: neuerName, sortOrder: kategorien.length })
          }
          className="h-9 rounded-md bg-foreground px-3 text-sm font-medium text-background disabled:opacity-40"
        >
          Anlegen
        </button>
      </div>

      {fehler && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {fehler}
        </p>
      )}
    </section>
  );
}
