import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { auswaehlbarePersonen } from "@/server/time-entries-read";
import { absenzen } from "@/server/absences-read";
import { ferienstand } from "@/server/vacation";
import { AbsenzenAnsicht } from "@/components/absenzen/absenzen-ansicht";
import { ZahlFeld } from "@/components/ui/eingabefelder";

const datumDE = (iso: string) => iso.split("-").reverse().join(".");

export default async function AbsenzenPage({ searchParams }: PageProps<"/absenzen">) {
  const user = await getSession();
  if (!user) redirect("/login");

  const q = await searchParams;
  const istAdmin = user.role === "ADMIN";

  const rohJahr = Number(typeof q.jahr === "string" ? q.jahr : "");
  const jahr =
    Number.isInteger(rohJahr) && rohJahr >= 2020 && rohJahr <= 2100
      ? rohJahr
      : new Date().getFullYear();

  const personen = await auswaehlbarePersonen(user);
  const gewuenscht = typeof q.person === "string" ? q.person : "";
  // "alle" ist nur für Vorgesetzte, sonst fällt es auf die eigene Person.
  const auswahl =
    gewuenscht === "alle" && istAdmin
      ? "alle"
      : personen.some((p) => p.id === gewuenscht)
        ? gewuenscht
        : istAdmin
          ? "alle"
          : user.id;

  const zeilen = await absenzen(user, auswahl, jahr);
  // Der Ferienstand gilt immer für eine Person, nicht für die Firma.
  const standFuer = auswahl === "alle" ? user.id : auswahl;
  const stand = await ferienstand(user, standFuer, jahr);
  const standName = personen.find((p) => p.id === standFuer)?.name;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <nav className="flex gap-4 text-sm">
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          Übersicht
        </Link>
        <Link href="/zeiten" className="text-black/60 underline dark:text-white/60">
          Tagesansicht
        </Link>
        <Link href="/zeiten/monat" className="text-black/60 underline dark:text-white/60">
          Monatsansicht
        </Link>
      </nav>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Absenzen {jahr}</h1>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-black/60 dark:text-white/60">
            Jahr
          </span>
          <ZahlFeld
            name="jahr"
            min={2020}
            max={2100}
            defaultValue={jahr}
            className="h-10 w-28 rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20"
          />
        </label>

        {istAdmin && (
          <label className="space-y-1">
            <span className="block text-xs font-medium text-black/60 dark:text-white/60">
              Person
            </span>
            <select
              name="person"
              defaultValue={auswahl}
              className="h-10 rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20"
            >
              <option value="alle">Alle</option>
              {personen.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="submit"
          className="h-10 rounded-md border border-black/15 px-4 text-sm dark:border-white/20"
        >
          Anzeigen
        </button>
      </form>

      <section className="mt-6">
        <h2 className="text-sm font-medium">
          Ferienstand {standName ? `von ${standName}` : ""}
        </h2>

        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kennzahl titel="Verfügbar" wert={stand.verfuegbar.toFixed(1)} />
          <Kennzahl titel="Bewilligt" wert={stand.bewilligt.toFixed(1)} />
          <Kennzahl titel="Beantragt" wert={stand.beantragt.toFixed(1)} />
          <Kennzahl titel="Rest" wert={stand.rest.toFixed(1)} betont={stand.rest < 0} />
        </dl>

        <ul className="mt-3 space-y-1 text-xs text-black/60 dark:text-white/60">
          <li>
            Anspruch {stand.anspruch.toFixed(1)} Tage
            {stand.anteilig
              ? ` (anteilig, ${stand.monate} von 12 Monaten bei ${stand.grundanspruch.toFixed(1)} Tagen im ganzen Jahr)`
              : ""}
          </li>
          {stand.uebertrag > 0 && (
            <li>
              Übertrag aus {stand.jahr - 1}: {stand.uebertrag.toFixed(1)} Tage
              {stand.verfallenAm && `, verfällt am ${datumDE(stand.verfallenAm)}`}
              {stand.uebertragGenutzt > 0 &&
                `, davon ${stand.uebertragGenutzt.toFixed(1)} bezogen`}
              {stand.uebertragVerfallen > 0 && (
                <span className="text-amber-800 dark:text-amber-300">
                  {" "}
                  — {stand.uebertragVerfallen.toFixed(1)} Tage sind verfallen
                </span>
              )}
            </li>
          )}
          <li>
            Krankheitstage {stand.krankheitstage.toFixed(1)}, übrige Absenzen{" "}
            {stand.uebrigeTage.toFixed(1)}
          </li>
          <li>
            Gezählt werden Arbeitstage ohne Wochenenden und ohne Feiertage
            Luzern. Ferien werden zuerst vom Übertrag genommen, weil der
            verfällt.
          </li>
          {stand.vonHand && (
            <li className="text-black/80 dark:text-white/80">
              Diese Zeile wurde von Hand angepasst, der Jahreslauf lässt sie
              unberührt.
            </li>
          )}
        </ul>

        {stand.hinweis && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {stand.hinweis}
          </p>
        )}
      </section>

      <AbsenzenAnsicht
        zeilen={zeilen}
        personen={personen}
        eigeneId={user.id}
        istAdmin={istAdmin}
        mehrerePersonen={auswahl === "alle"}
      />
    </main>
  );
}

function Kennzahl({
  titel,
  wert,
  betont,
}: {
  titel: string;
  wert: string;
  betont?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-lg border p-3",
        betont
          ? "border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950/40"
          : "border-black/10 dark:border-white/15",
      ].join(" ")}
    >
      <dt className="text-xs text-black/60 dark:text-white/60">{titel}</dt>
      <dd className="mt-0.5 text-lg font-medium tabular-nums">{wert}</dd>
    </div>
  );
}
