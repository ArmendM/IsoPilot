import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { katalog, kategorien } from "@/server/materials-read";
import { MaterialAnsicht } from "@/components/material/material-ansicht";
import { MaterialImport } from "@/components/material/material-import";
import { Wareneingang } from "@/components/material/wareneingang";
import { artikelFuerEingang } from "@/server/lager-read";

export default async function MaterialPage({ searchParams }: PageProps<"/material">) {
  const user = await getSession();
  if (!user) redirect("/login");

  const q = await searchParams;
  const suche = typeof q.suche === "string" ? q.suche : "";
  const kategorieId = typeof q.kategorie === "string" ? q.kategorie : "";
  const mitStillgelegten = q.alle === "1";

  const [liste, kats, eingangsArtikel] = await Promise.all([
    katalog(user, { suche, kategorieId: kategorieId || undefined, mitStillgelegten }),
    kategorien(user),
    artikelFuerEingang(user),
  ]);

  const istAdmin = user.role === "ADMIN";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <nav className="flex gap-4 text-sm">
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          Übersicht
        </Link>
        <Link href="/baustellen" className="text-black/60 underline dark:text-white/60">
          Baustellen
        </Link>
        <Link href="/zeiten" className="text-black/60 underline dark:text-white/60">
          Tagesansicht
        </Link>
        {user.role === "ADMIN" && (
          <Link href="/lager" className="text-black/60 underline dark:text-white/60">
            Lagerverlauf
          </Link>
        )}
      </nav>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Material</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        {liste.length} {liste.length === 1 ? "Artikel" : "Artikel"} in{" "}
        {kats.length} Kategorien
        {istAdmin ? "" : ". Pflegen kann den Katalog ein Vorgesetzter."}
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-black/60 dark:text-white/60">
            Suche nach Bezeichnung oder Artikelnummer
          </span>
          <input
            type="search"
            name="suche"
            defaultValue={suche}
            className="h-10 w-56 rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20"
          />
        </label>

        <label className="space-y-1">
          <span className="block text-xs font-medium text-black/60 dark:text-white/60">
            Kategorie
          </span>
          <select
            name="kategorie"
            defaultValue={kategorieId}
            className="h-10 rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20"
          >
            <option value="">Alle</option>
            {kats.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>

        {mitStillgelegten && <input type="hidden" name="alle" value="1" />}

        <button
          type="submit"
          className="h-10 rounded-md border border-black/15 px-4 text-sm dark:border-white/20"
        >
          Anzeigen
        </button>
      </form>

      <p className="mt-3 text-sm">
        <Link
          href={mitStillgelegten ? "/material" : "/material?alle=1"}
          className="underline text-black/60 dark:text-white/60"
        >
          {mitStillgelegten
            ? "Stillgelegte ausblenden"
            : "Stillgelegte mit anzeigen"}
        </Link>
      </p>

      <MaterialAnsicht artikel={liste} kategorien={kats} istAdmin={istAdmin} />

      {istAdmin && (
        <section className="mt-8 border-t border-black/10 pt-6 dark:border-white/15">
          <h2 className="text-lg font-semibold tracking-tight">Wareneingang</h2>
          <div className="mt-3">
            <Wareneingang artikel={eingangsArtikel} />
          </div>
        </section>
      )}

      {istAdmin && (
        <section className="mt-8 border-t border-black/10 pt-6 dark:border-white/15">
          <h2 className="text-lg font-semibold tracking-tight">Excel-Import</h2>
          <div className="mt-3">
            <MaterialImport />
          </div>
        </section>
      )}
    </main>
  );
}
