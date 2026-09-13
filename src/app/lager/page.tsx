import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { lagerverlauf, verlaufFilter } from "@/server/lager-read";

/* Der Lagerverlauf als eigene Seite: wo ist die Ware hingegangen, und was
 * ist wann hereingekommen. Vorerst nur für Vorgesetzte, eine eigene
 * Lagerberechtigung kommt als nächstes Stück. */

const GRUND: Record<string, string> = {
  DELIVERY: "Wareneingang",
  BOOKING: "Auf Baustelle gebucht",
  BOOKING_CHANGE: "Buchung berichtigt",
  RETURN: "Buchung rückgängig",
  CORRECTION: "Inventurdifferenz",
};

const EINHEIT: Record<string, string> = {
  M2: "m²",
  LFM: "Laufmeter",
  STK: "Stück",
  KG: "kg",
  ROLLE: "Rollen",
};

const datumDE = (iso: string) => iso.split("-").reverse().join(".");
const menge = (n: number) =>
  n.toLocaleString("de-CH", { maximumFractionDigits: 2, signDisplay: "exceptZero" });

export default async function LagerPage({ searchParams }: PageProps<"/lager">) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/material");

  const q = await searchParams;
  const materialId = typeof q.artikel === "string" ? q.artikel : "";
  const siteId = typeof q.baustelle === "string" ? q.baustelle : "";

  const [zeilen, filter] = await Promise.all([
    lagerverlauf(user, {
      materialId: materialId || undefined,
      siteId: siteId || undefined,
    }),
    verlaufFilter(user),
  ]);

  const auswahl =
    "h-10 rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <nav className="flex gap-4 text-sm">
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          Übersicht
        </Link>
        <Link href="/material" className="text-black/60 underline dark:text-white/60">
          Material
        </Link>
        <Link href="/baustellen" className="text-black/60 underline dark:text-white/60">
          Baustellen
        </Link>
      </nav>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Lagerverlauf</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Jede Bewegung mit Datum, Menge und Ziel. Die neueste zuoberst.
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-black/60 dark:text-white/60">
            Artikel
          </span>
          <select name="artikel" defaultValue={materialId} className={auswahl}>
            <option value="">Alle</option>
            {filter.artikel.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="block text-xs font-medium text-black/60 dark:text-white/60">
            Baustelle
          </span>
          <select name="baustelle" defaultValue={siteId} className={auswahl}>
            <option value="">Alle</option>
            {filter.baustellen.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="h-10 rounded-md border border-black/15 px-4 text-sm dark:border-white/20"
        >
          Anzeigen
        </button>

        {(materialId || siteId) && (
          <Link
            href="/lager"
            className="pb-2 text-sm underline text-black/60 dark:text-white/60"
          >
            Filter zurücksetzen
          </Link>
        )}
      </form>

      {zeilen.length === 0 ? (
        <p className="mt-6 text-sm text-black/50 dark:text-white/50">
          Noch keine Lagerbewegung erfasst. Ein Wareneingang wird unter
          „Material&rdquo; gebucht.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-black/60 dark:text-white/60">
              <tr>
                <th className="py-2 pr-3 font-medium">Datum</th>
                <th className="py-2 pr-3 font-medium">Artikel</th>
                <th className="py-2 pr-3 text-right font-medium">Menge</th>
                <th className="py-2 pr-3 font-medium">Vorgang</th>
                <th className="py-2 pr-3 font-medium">Wohin</th>
                <th className="py-2 font-medium">Erfasst von</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((b) => (
                <tr key={b.id} className="border-t border-black/10 dark:border-white/15">
                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                    {datumDE(b.datum)}
                  </td>
                  <td className="py-2 pr-3">
                    {b.sku && (
                      <span className="tabular-nums text-black/50 dark:text-white/50">
                        {b.sku}{" "}
                      </span>
                    )}
                    {b.bezeichnung}
                  </td>
                  <td
                    className={[
                      "py-2 pr-3 text-right tabular-nums whitespace-nowrap",
                      b.menge < 0
                        ? "text-black/70 dark:text-white/70"
                        : "font-medium text-green-700 dark:text-green-300",
                    ].join(" ")}
                  >
                    {menge(b.menge)} {EINHEIT[b.unit] ?? b.unit}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{GRUND[b.grund] ?? b.grund}</td>
                  <td className="py-2 pr-3">
                    {b.baustelle ?? (
                      <span className="text-black/40 dark:text-white/40">Lager</span>
                    )}
                    {b.notiz && (
                      <span className="text-black/50 dark:text-white/50"> · {b.notiz}</span>
                    )}
                  </td>
                  <td className="py-2 text-black/60 dark:text-white/60">{b.person}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
