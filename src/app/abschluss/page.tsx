import Link from "next/link";
import { DatumFeld } from "@/components/ui/eingabefelder";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { formatHours, monthKey, todayISO } from "@/lib/dates";
import { monatsabschluss } from "@/server/month-lock-read";
import { AbschlussSchalter } from "@/components/abschluss/abschluss-schalter";

const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONATSNAME = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function monatPlus(monat: string, n: number) {
  const [j, m] = monat.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function AbschlussPage({ searchParams }: PageProps<"/abschluss">) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");

  const q = await searchParams;
  const roh = typeof q.monat === "string" ? q.monat : "";
  // Vorgabe ist der Vormonat: den schliesst man ab, nicht den laufenden.
  const monat = MONAT.test(roh) ? roh : monatPlus(monthKey(todayISO()), -1);

  const a = await monatsabschluss(user, monat);
  const [jahr, m] = monat.split("-").map(Number);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <nav className="flex gap-4 text-sm">
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          Übersicht
        </Link>
        <Link href="/zeiten/monat" className="text-black/60 underline dark:text-white/60">
          Monatsansicht
        </Link>
        <Link href="/personen" className="text-black/60 underline dark:text-white/60">
          Personen
        </Link>
      </nav>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Monatsabschluss {MONATSNAME[m - 1]} {jahr}
      </h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        {a.gesperrt ? "Abgeschlossen" : a.laeuftNoch ? "Läuft noch" : "Offen"}
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-black/60 dark:text-white/60">
            Monat
          </span>
          <DatumFeld
            typ="month"
            name="monat"
            defaultValue={monat}
            className="h-10 rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-md border border-black/15 px-4 text-sm dark:border-white/20"
        >
          Anzeigen
        </button>
        <span className="ml-auto flex gap-3 text-sm">
          <Link
            href={`/abschluss?monat=${monatPlus(monat, -1)}`}
            className="underline text-black/60 dark:text-white/60"
          >
            Vormonat
          </Link>
          <Link
            href={`/abschluss?monat=${monatPlus(monat, 1)}`}
            className="underline text-black/60 dark:text-white/60"
          >
            Folgemonat
          </Link>
        </span>
      </form>

      <section className="mt-6">
        <h2 className="text-sm font-medium">Stand pro Person</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-black/60 dark:text-white/60">
              <tr className="border-b border-black/10 dark:border-white/15">
                <th className="py-2 pr-4 font-medium">Person</th>
                <th className="py-2 pr-4 text-right font-medium">Erfasst</th>
                <th className="py-2 pr-4 text-right font-medium">Einträge</th>
                <th className="py-2 pr-4 text-right font-medium">Absenztage</th>
                <th className="py-2 text-right font-medium">Offene Tage</th>
              </tr>
            </thead>
            <tbody>
              {a.personen.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-black/5 last:border-0 dark:border-white/10"
                >
                  <td className="py-2 pr-4">
                    <Link
                      href={`/zeiten/monat?monat=${monat}&person=${p.id}`}
                      className="underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatHours(p.stunden)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{p.eintraege}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {p.absenztage.toFixed(1)}
                  </td>
                  <td
                    className={[
                      "py-2 text-right tabular-nums",
                      p.offeneTage > 0
                        ? "font-medium text-amber-800 dark:text-amber-300"
                        : "",
                    ].join(" ")}
                  >
                    {p.offeneTage}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/15 font-medium dark:border-white/20">
                <td className="py-2 pr-4">Zusammen</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {formatHours(a.stundenGesamt)}
                </td>
                <td />
                <td />
                <td className="py-2 text-right tabular-nums">{a.offeneTageGesamt}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <AbschlussSchalter
        monat={monat}
        gesperrt={a.gesperrt}
        laeuftNoch={a.laeuftNoch}
        offeneTage={a.offeneTageGesamt}
      />

      {a.ereignisse.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-medium">Protokoll</h2>
          <ul className="mt-2 space-y-1 text-sm text-black/60 dark:text-white/60">
            {a.ereignisse.map((e, i) => (
              <li key={i}>
                {e.am}, {e.action === "LOCKED" ? "abgeschlossen" : "geöffnet"} von{" "}
                {e.akteur}
                {e.grund && `: ${e.grund}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
