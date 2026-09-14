import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { formatHours, monthKey, todayISO } from "@/lib/dates";
import { zeitraumAus, type ZeitraumArt } from "@/lib/zeitraum";
import { auswertungPerson } from "@/server/auswertung-read";
import { auswaehlbarePersonen } from "@/server/time-entries-read";
import { ZeitraumWahl } from "@/components/auswertung/zeitraum-wahl";

/* Auswertung Mitarbeitende: eine Person auf einmal, nie alle zugleich.
 * Die Auswertung Baustellen ist ein eigener Bereich, die beiden
 * beantworten verschiedene Fragen und werden nicht vermischt.
 *
 * Alles steht in der Adresse, die Seite ist damit weitergebbar und
 * bleibt serverseitig gerendert. Die Berechtigung hängt trotzdem nicht
 * an der Adresse: auswertungPerson prüft Rolle und Firma selbst. */

const text = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : "";

const datumDE = (iso: string) => iso.split("-").reverse().join(".");
const zahl = (n: number) =>
  n.toLocaleString("de-CH", { maximumFractionDigits: 2 });

export default async function AuswertungPersonPage({
  searchParams,
}: PageProps<"/auswertung/mitarbeitende">) {
  const user = await getSession();
  if (!user) redirect("/login");

  const q = await searchParams;
  const personen = await auswaehlbarePersonen(user);

  /* Ohne Auswahl die eigene Person und der laufende Monat. Das ist die
   * Frage, die am häufigsten gestellt wird, und ein Mitarbeitender hat
   * ohnehin nur sich selbst zur Auswahl. */
  const personId = text(q.person) || user.id;
  const art = (text(q.art) || "monat") as ZeitraumArt;
  const monat = text(q.monat) || monthKey(todayISO());
  const jahr = text(q.jahr) || String(new Date().getUTCFullYear());
  const von = text(q.von);
  const bis = text(q.bis);
  /* Einzelpositionen sind ab Werk sichtbar. Ein leeres Kästchen schickt
   * über GET nichts mit, deshalb trägt das Formular ein verstecktes
   * Feld: ohne das liesse sich "noch nichts gewählt" nicht von
   * "abgewählt" unterscheiden, und das Kästchen wäre nicht abwählbar. */
  const mitPositionen = q.gesendet ? q.positionen === "1" : true;

  const zeitraum = zeitraumAus({ art, monat, jahr, von, bis });

  /* Der Knopf für die Mappe trägt dieselben Angaben wie die Ansicht.
   * Der Export rechnet damit über denselben Weg, statt eine zweite
   * Rechnung aufzumachen, die irgendwann etwas anderes ergibt. */
  const excelAdresse = new URLSearchParams({ person: personId, art });
  if (art === "monat") excelAdresse.set("monat", monat);
  if (art === "jahr") excelAdresse.set("jahr", jahr);
  if (art === "spanne") {
    excelAdresse.set("von", von);
    excelAdresse.set("bis", bis);
  }

  /* Eine fremde Kennung in der Adresse ist kein Absturz, sondern eine
   * Auskunft. Geprüft wird trotzdem im Lesezugriff, nicht hier. */
  const erlaubt = personen.some((p) => p.id === personId);
  const a = zeitraum && erlaubt ? await auswertungPerson(user, personId, zeitraum) : null;

  const feld =
    "h-10 rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20";
  const bez = "block text-xs font-medium text-black/60 dark:text-white/60";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <nav className="flex gap-4 text-sm">
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          Übersicht
        </Link>
        <Link href="/zeiten" className="text-black/60 underline dark:text-white/60">
          Tagesansicht
        </Link>
        <Link href="/absenzen" className="text-black/60 underline dark:text-white/60">
          Absenzen
        </Link>
      </nav>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Auswertung Mitarbeitende
      </h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        {user.role === "ADMIN"
          ? "Eine Person und ein Zeitraum. Vorgesetzte sind ebenfalls auswählbar."
          : "Deine eigenen Stunden und Absenzen über einen Zeitraum."}
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className={bez}>Person</span>
          <select
            name="person"
            defaultValue={personId}
            disabled={personen.length === 1}
            className={`${feld} disabled:opacity-60`}
          >
            {personen.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <ZeitraumWahl art={art} monat={monat} jahr={jahr} von={von} bis={bis} />

        <input type="hidden" name="gesendet" value="1" />

        <label className="flex h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="positionen"
            value="1"
            defaultChecked={mitPositionen}
            className="size-4"
          />
          Einzelpositionen
        </label>

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

      {zeitraum && !erlaubt && (
        <p className="mt-6 text-sm text-amber-800 dark:text-amber-300">
          Diese Person steht dir nicht zur Auswahl.
        </p>
      )}

      {a && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              {a.person.name}, {a.zeitraum.bezeichnung}
            </h2>
            {/* Gewöhnliche Links, keine Formulare: beide Dateien sind
                Auskunft und ändern nichts. */}
            <div className="flex gap-2">
              <a
                href={`/auswertung/mitarbeitende/excel?${excelAdresse}`}
                className="h-9 rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
              >
                Excel
              </a>
              <a
                href={`/auswertung/mitarbeitende/pdf?${excelAdresse}`}
                className="h-9 rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
              >
                PDF
              </a>
            </div>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kachel titel="Nettostunden" wert={formatHours(a.nettostunden)} />
            <Kachel
              titel="Tage mit Erfassung"
              wert={`${a.tageMitErfassung} von ${a.werktage} Werktagen`}
            />
            <Kachel
              titel="Pausen"
              wert={formatHours(a.pausenMinuten / 60)}
              hinweis="Nicht in den Nettostunden enthalten"
            />
            <Kachel titel="Ferientage" wert={zahl(a.ferientage)} />
            <Kachel titel="Krankheitstage" wert={zahl(a.krankheitstage)} />
            <Kachel
              titel="Übrige Absenzen"
              wert={zahl(a.uebrigeAbsenztage)}
              hinweis={`${a.feiertage} Feiertage im Zeitraum`}
            />
          </dl>

          {a.offeneTage > 0 && (
            <p className="mt-4 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              {a.offeneTage} {a.offeneTage === 1 ? "Werktag" : "Werktage"} ohne
              Eintrag und ohne Absenz. Nachtragen lässt sich das in der{" "}
              <Link href="/zeiten/monat" className="underline">
                Monatsansicht
              </Link>
              .
            </p>
          )}

          <h3 className="mt-8 text-sm font-medium">Stunden je Baustelle</h3>
          {a.proBaustelle.length === 0 ? (
            <p className="mt-2 text-sm text-black/50 dark:text-white/50">
              In diesem Zeitraum wurde nichts erfasst.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-black/60 dark:text-white/60">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Baustelle</th>
                    <th className="py-2 text-right font-medium">Nettostunden</th>
                  </tr>
                </thead>
                <tbody>
                  {a.proBaustelle.map((b) => (
                    <tr
                      key={b.siteId ?? "ohne"}
                      className="border-t border-black/10 dark:border-white/15"
                    >
                      <td className="py-2 pr-3">{b.label}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatHours(b.stunden)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-black/20 font-medium dark:border-white/30">
                    <td className="py-2 pr-3">Zusammen</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatHours(a.nettostunden)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {mitPositionen && (
            <>
              <h3 className="mt-8 text-sm font-medium">
                Einzelpositionen, {a.positionen.length}
              </h3>
              {a.positionen.length === 0 ? (
                <p className="mt-2 text-sm text-black/50 dark:text-white/50">
                  Keine Einträge in diesem Zeitraum.
                </p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-black/60 dark:text-white/60">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Datum</th>
                        <th className="py-2 pr-3 font-medium">Von</th>
                        <th className="py-2 pr-3 font-medium">Bis</th>
                        <th className="py-2 pr-3 text-right font-medium">Pause</th>
                        <th className="py-2 pr-3 text-right font-medium">Netto</th>
                        <th className="py-2 pr-3 font-medium">Baustelle</th>
                        <th className="py-2 font-medium">Notiz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.positionen.map((p, i) => (
                        <tr
                          key={`${p.datum}-${i}`}
                          className="border-t border-black/10 dark:border-white/15"
                        >
                          <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                            {datumDE(p.datum)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">{p.von ?? "–"}</td>
                          <td className="py-2 pr-3 tabular-nums">{p.bis ?? "läuft"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {p.pause} min
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatHours(p.netto)}
                          </td>
                          <td className="py-2 pr-3">
                            {p.baustelle ?? (
                              <span className="text-black/40 dark:text-white/40">
                                Werkstatt oder Büro
                              </span>
                            )}
                            {p.istRegie && (
                              <span className="text-black/50 dark:text-white/50">
                                {" "}
                                · Regie
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-black/60 dark:text-white/60">
                            {p.notiz}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          <p className="mt-8 text-xs text-black/50 dark:text-white/50">
            Excel und PDF enthalten die Einzelpositionen immer, auch wenn
            sie hier ausgeblendet sind, und beide rechnen über denselben
            Weg wie diese Ansicht. Das PDF trägt die Firmenzeile, das Logo
            kommt mit den Firmeneinstellungen dazu.
          </p>
        </section>
      )}
    </main>
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
      <dt className="text-xs font-medium text-black/60 dark:text-white/60">
        {titel}
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{wert}</dd>
      {hinweis && (
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">{hinweis}</p>
      )}
    </div>
  );
}
