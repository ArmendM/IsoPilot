import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { formatHours, monthKey, todayISO } from "@/lib/dates";
import { zeitraumAus, type ZeitraumArt } from "@/lib/zeitraum";
import {
  auswertungAlleBaustellen,
  auswertungBaustelle,
  type MaterialPosition,
  type ZeitPosition,
} from "@/server/auswertung-read";
import { baustellen } from "@/server/sites-read";
import { ZeitraumWahl } from "@/components/auswertung/zeitraum-wahl";

/* Auswertung Baustellen. Eine Baustelle auf einmal oder alle als
 * Übersicht, getrennt von der Auswertung Mitarbeitende: die eine fragt,
 * was eine Person geleistet hat, die andere, was eine Baustelle gekostet
 * hat.
 *
 * Nur für Vorgesetzte. Hier stehen die Stunden aller Beteiligten und die
 * Kosten der Baustelle, und Mitarbeitende sehen nur ihre eigenen. */

const text = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : "";

const datumDE = (iso: string) => iso.split("-").reverse().join(".");
const franken = (n: number) =>
  n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const menge = (n: number) => n.toLocaleString("de-CH", { maximumFractionDigits: 2 });

const STATUS: Record<string, string> = {
  OPEN: "offen",
  PAUSED: "pausiert",
  DONE: "abgeschlossen",
};

export default async function AuswertungBaustellenPage({
  searchParams,
}: PageProps<"/auswertung/baustellen">) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/baustellen");

  const q = await searchParams;
  // Abgeschlossene sind dabei: sie verschwinden aus der Auswahl beim
  // Buchen, bleiben aber in Auswertungen.
  const wahl = await baustellen(user, true);

  const siteId = text(q.baustelle) || "alle";
  const art = (text(q.art) || "monat") as ZeitraumArt;
  const monat = text(q.monat) || monthKey(todayISO());
  const jahr = text(q.jahr) || String(new Date().getUTCFullYear());
  const von = text(q.von);
  const bis = text(q.bis);

  const zeitraum = zeitraumAus({ art, monat, jahr, von, bis });
  const alle = siteId === "alle";

  const adresse = new URLSearchParams({ baustelle: siteId, art });
  if (art === "monat") adresse.set("monat", monat);
  if (art === "jahr") adresse.set("jahr", jahr);
  if (art === "spanne") {
    adresse.set("von", von);
    adresse.set("bis", bis);
  }

  const einzeln =
    zeitraum && !alle && wahl.some((b) => b.id === siteId)
      ? await auswertungBaustelle(user, siteId, zeitraum)
      : null;
  const uebersicht = zeitraum && alle ? await auswertungAlleBaustellen(user, zeitraum) : null;

  const feld =
    "h-10 rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20";
  const bez = "block text-xs font-medium text-black/60 dark:text-white/60";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <nav className="flex gap-4 text-sm">
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          Übersicht
        </Link>
        <Link href="/baustellen" className="text-black/60 underline dark:text-white/60">
          Baustellen
        </Link>
        <Link
          href="/auswertung/mitarbeitende"
          className="text-black/60 underline dark:text-white/60"
        >
          Auswertung Mitarbeitende
        </Link>
      </nav>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Auswertung Baustellen
      </h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Eine Baustelle auf einmal oder alle als Übersicht. Stunden und
        Material über den Zeitraum, Soll und Ist über die ganze Laufzeit.
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className={bez}>Baustelle</span>
          <select name="baustelle" defaultValue={siteId} className={feld}>
            <option value="alle">Alle als Übersicht</option>
            {wahl.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bezeichnung}
                {b.status !== "OPEN" ? `, ${STATUS[b.status]}` : ""}
              </option>
            ))}
          </select>
        </label>

        <ZeitraumWahl art={art} monat={monat} jahr={jahr} von={von} bis={bis} />

        <button
          type="submit"
          className="h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background"
        >
          Anzeigen
        </button>
      </form>

      {!zeitraum && (
        <p className="mt-6 text-sm text-amber-800 dark:text-amber-300">
          {art === "spanne"
            ? "Wähle ein Von und ein Bis, das Bis darf nicht vor dem Von liegen."
            : "Wähle einen Zeitraum aus."}
        </p>
      )}

      {zeitraum && wahl.length === 0 && (
        <p className="mt-6 text-sm text-black/50 dark:text-white/50">
          Es gibt noch keine Baustelle.
        </p>
      )}

      {(einzeln || uebersicht) && (
        <div className="mt-6 flex justify-end gap-2">
          <a
            href={`/auswertung/baustellen/excel?${adresse}`}
            className="h-9 rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
          >
            Excel
          </a>
          <a
            href={`/auswertung/baustellen/pdf?${adresse}`}
            className="h-9 rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
          >
            PDF
          </a>
        </div>
      )}

      {uebersicht && (
        <section className="mt-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Alle Baustellen, {zeitraum!.bezeichnung}
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-black/60 dark:text-white/60">
                <tr>
                  <th className="py-2 pr-3 font-medium">Baustelle</th>
                  <th className="py-2 pr-3 font-medium">Auftraggeber</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 text-right font-medium">Ist im Zeitraum</th>
                  <th className="py-2 pr-3 text-right font-medium">Soll</th>
                  <th className="py-2 pr-3 text-right font-medium">Ist gesamt</th>
                  <th className="py-2 pr-3 text-right font-medium">Differenz</th>
                  <th className="py-2 pr-3 text-right font-medium">Material</th>
                  <th className="py-2 text-right font-medium">VSI</th>
                </tr>
              </thead>
              <tbody>
                {uebersicht.map((b) => (
                  <tr key={b.id} className="border-t border-black/10 dark:border-white/15">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/auswertung/baustellen?${new URLSearchParams({
                          ...Object.fromEntries(adresse),
                          baustelle: b.id,
                        })}`}
                        className="underline"
                      >
                        {b.bezeichnung}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-black/60 dark:text-white/60">
                      {b.partner ?? "–"}
                    </td>
                    <td className="py-2 pr-3 text-black/60 dark:text-white/60">
                      {STATUS[b.status]}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatHours(b.istImZeitraum)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {b.soll > 0 ? formatHours(b.soll) : "–"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatHours(b.istGesamt)}
                    </td>
                    <td
                      className={[
                        "py-2 pr-3 text-right tabular-nums",
                        b.soll > 0 && b.differenz < 0
                          ? "font-medium text-amber-800 dark:text-amber-300"
                          : "",
                      ].join(" ")}
                    >
                      {b.soll > 0 ? formatHours(b.differenz) : "–"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {franken(b.materialkosten)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {franken(b.vsiBetrag)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-black/20 font-medium dark:border-white/30">
                  <td className="py-2 pr-3" colSpan={3}>
                    Zusammen
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatHours(uebersicht.reduce((s, b) => s + b.istImZeitraum, 0))}
                  </td>
                  <td className="py-2 pr-3" colSpan={3} />
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {franken(uebersicht.reduce((s, b) => s + b.materialkosten, 0))}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {franken(uebersicht.reduce((s, b) => s + b.vsiBetrag, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-black/50 dark:text-white/50">
            Soll, Ist gesamt und Differenz gelten für die ganze Laufzeit der
            Baustelle, nicht für den Zeitraum. Gegen einen Monat gerechnet
            wäre die Differenz nichtssagend.
          </p>
        </section>
      )}

      {einzeln && (
        <section className="mt-4">
          <h2 className="text-lg font-semibold tracking-tight">
            {einzeln.baustelle.bezeichnung}, {einzeln.zeitraum.bezeichnung}
          </h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {einzeln.baustelle.adresse}
            {einzeln.baustelle.partner && `, ${einzeln.baustelle.partner}`}, Status{" "}
            {STATUS[einzeln.baustelle.status]}
          </p>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kachel
              titel="Ist im Zeitraum"
              wert={formatHours(einzeln.istImZeitraum)}
            />
            <Kachel
              titel="Soll und Ist gesamt"
              wert={
                einzeln.soll > 0
                  ? `${formatHours(einzeln.soll)} / ${formatHours(einzeln.istGesamt)}`
                  : formatHours(einzeln.istGesamt)
              }
              hinweis={
                einzeln.soll > 0
                  ? `Differenz ${formatHours(einzeln.differenz)}, ganze Laufzeit`
                  : "Kein Soll erfasst"
              }
            />
            <Kachel
              titel="Materialkosten"
              wert={`CHF ${franken(einzeln.materialkosten)}`}
              hinweis={`${einzeln.materialPositionen.length} Buchungen im Zeitraum`}
            />
            <Kachel
              titel="VSI-Ausmass"
              wert={`CHF ${franken(einzeln.vsiBetrag)}`}
              hinweis={`${einzeln.vsiPositionen.length} Positionen im Zeitraum`}
            />
          </dl>

          <h3 className="mt-8 text-sm font-medium">Stunden je Person</h3>
          {einzeln.proPerson.length === 0 ? (
            <p className="mt-2 text-sm text-black/50 dark:text-white/50">
              In diesem Zeitraum wurde hier nicht gearbeitet.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <tbody>
                  {einzeln.proPerson.map((p) => (
                    <tr
                      key={p.personId}
                      className="border-t border-black/10 dark:border-white/15"
                    >
                      <td className="py-2 pr-3">{p.name}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatHours(p.stunden)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-black/20 font-medium dark:border-white/30">
                    <td className="py-2 pr-3">Zusammen</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatHours(einzeln.istImZeitraum)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <Zeitpositionen positionen={einzeln.zeitPositionen} summe={einzeln.istImZeitraum} />

          <Positionen
            titel="Material"
            positionen={einzeln.materialPositionen}
            summe={einzeln.materialkosten}
          />
          <Positionen
            titel="VSI-Ausmass"
            positionen={einzeln.vsiPositionen}
            summe={einzeln.vsiBetrag}
            leerText="Keine VSI-Positionen. Die Tarife sind noch nicht erfasst."
          />
        </section>
      )}
    </main>
  );
}

/* Die einzelnen Zeiteinträge, nicht nur die Summe je Person. Wer eine
 * Baustelle gegenüber dem Auftraggeber belegen muss, braucht den
 * einzelnen Tag und nicht eine Monatszahl. */
function Zeitpositionen({
  positionen,
  summe,
}: {
  positionen: ZeitPosition[];
  summe: number;
}) {
  return (
    <>
      <h3 className="mt-8 text-sm font-medium">
        Stunden im Einzelnen, {positionen.length}
      </h3>
      {positionen.length === 0 ? (
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">
          Keine Zeiteinträge in diesem Zeitraum.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-black/60 dark:text-white/60">
              <tr>
                <th className="py-2 pr-3 font-medium">Datum</th>
                <th className="py-2 pr-3 font-medium">Person</th>
                <th className="py-2 pr-3 font-medium">Von</th>
                <th className="py-2 pr-3 font-medium">Bis</th>
                <th className="py-2 pr-3 text-right font-medium">Pause</th>
                <th className="py-2 pr-3 text-right font-medium">Netto</th>
                <th className="py-2 pr-3 font-medium">Verrechnung</th>
                <th className="py-2 font-medium">Notiz</th>
              </tr>
            </thead>
            <tbody>
              {positionen.map((p, i) => (
                <tr
                  key={`${p.datum}-${i}`}
                  className="border-t border-black/10 dark:border-white/15"
                >
                  <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                    {datumDE(p.datum)}
                  </td>
                  <td className="py-2 pr-3">{p.person}</td>
                  <td className="py-2 pr-3 tabular-nums">{p.von ?? "–"}</td>
                  <td className="py-2 pr-3 tabular-nums">{p.bis ?? "läuft"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{p.pause} min</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatHours(p.netto)}
                  </td>
                  <td className="py-2 pr-3 text-black/60 dark:text-white/60">
                    {p.istRegie ? "Regie" : "Pauschal"}
                  </td>
                  <td className="py-2 text-black/60 dark:text-white/60">{p.notiz}</td>
                </tr>
              ))}
              <tr className="border-t border-black/20 font-medium dark:border-white/30">
                <td className="py-2 pr-3" colSpan={5}>
                  Zusammen
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatHours(summe)}
                </td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Positionen({
  titel,
  positionen,
  summe,
  leerText = "Keine Buchungen in diesem Zeitraum.",
}: {
  titel: string;
  positionen: MaterialPosition[];
  summe: number;
  leerText?: string;
}) {
  return (
    <>
      <h3 className="mt-8 text-sm font-medium">
        {titel}, {positionen.length}
      </h3>
      {positionen.length === 0 ? (
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">{leerText}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-black/60 dark:text-white/60">
              <tr>
                <th className="py-2 pr-3 font-medium">Datum</th>
                <th className="py-2 pr-3 font-medium">Bezeichnung</th>
                <th className="py-2 pr-3 text-right font-medium">Menge</th>
                <th className="py-2 pr-3 text-right font-medium">Einzelpreis</th>
                <th className="py-2 pr-3 text-right font-medium">Rabatt</th>
                <th className="py-2 pr-3 text-right font-medium">Betrag</th>
                <th className="py-2 font-medium">Erfasst von</th>
              </tr>
            </thead>
            <tbody>
              {positionen.map((p, i) => (
                <tr
                  key={`${p.datum}-${i}`}
                  className="border-t border-black/10 dark:border-white/15"
                >
                  <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                    {datumDE(p.datum)}
                  </td>
                  <td className="py-2 pr-3">{p.bezeichnung}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {menge(p.menge)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {franken(p.einzelpreis)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {p.rabattPct > 0 ? `${p.rabattPct} %` : "–"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {franken(p.betrag)}
                  </td>
                  <td className="py-2 text-black/60 dark:text-white/60">{p.person}</td>
                </tr>
              ))}
              <tr className="border-t border-black/20 font-medium dark:border-white/30">
                <td className="py-2 pr-3" colSpan={5}>
                  Zusammen
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{franken(summe)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Kachel({
  titel,
  wert,
  hinweis,
}: {
  titel: string;
  wert: string;
  hinweis?: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <dt className="text-xs font-medium text-black/60 dark:text-white/60">{titel}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{wert}</dd>
      {hinweis && (
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">{hinweis}</p>
      )}
    </div>
  );
}
