import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { baustellen, partnerwahl } from "@/server/sites-read";
import { BaustellenAnsicht } from "@/components/baustellen/baustellen-ansicht";

export default async function BaustellenPage({
  searchParams,
}: PageProps<"/baustellen">) {
  const user = await getSession();
  if (!user) redirect("/login");

  const q = await searchParams;
  const mitAbgeschlossenen = q.alle === "1";

  const [zeilen, partner] = await Promise.all([
    baustellen(user, mitAbgeschlossenen),
    partnerwahl(user),
  ]);

  const istAdmin = user.role === "ADMIN";
  const offene = zeilen.filter((z) => z.status !== "DONE").length;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <nav className="flex gap-4 text-sm">
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          Übersicht
        </Link>
        <Link href="/zeiten" className="text-black/60 underline dark:text-white/60">
          Tagesansicht
        </Link>
        <Link href="/material" className="text-black/60 underline dark:text-white/60">
          Material
        </Link>
      </nav>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Baustellen</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        {offene} {offene === 1 ? "laufende" : "laufende"}
        {mitAbgeschlossenen && `, ${zeilen.length - offene} abgeschlossene`}
        {istAdmin ? "" : ". Anlegen und ändern kann ein Vorgesetzter."}
      </p>

      <p className="mt-3 text-sm">
        <Link
          href={mitAbgeschlossenen ? "/baustellen" : "/baustellen?alle=1"}
          className="underline text-black/60 dark:text-white/60"
        >
          {mitAbgeschlossenen
            ? "Abgeschlossene ausblenden"
            : "Abgeschlossene mit anzeigen"}
        </Link>
      </p>

      <BaustellenAnsicht zeilen={zeilen} partner={partner} istAdmin={istAdmin} />
    </main>
  );
}
