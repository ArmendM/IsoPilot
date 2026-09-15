import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { firmendaten } from "@/server/firma-read";
import { FirmaFormular } from "@/components/firma/firma-formular";
import { Kopfleiste } from "@/components/marke/kopfleiste";

export default async function FirmaPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  // Die Angaben stehen auf jedem Bericht, das ist keine Sache für
  // Mitarbeitende. Die Seite gibt es für sie gar nicht erst.
  if (user.role !== "ADMIN") redirect("/");

  const daten = await firmendaten(user);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <Kopfleiste>
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          Übersicht
        </Link>
        <Link href="/personen" className="text-black/60 underline dark:text-white/60">
          Personen
        </Link>
      </Kopfleiste>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Firma</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Anschrift, Kontakt und Logo stehen im Briefkopf jeder Auswertung und
        später auf Offerte und Rechnung. Was hier steht, gilt: im Code ist
        nichts davon fest verdrahtet.
      </p>

      <FirmaFormular daten={daten} />
    </main>
  );
}
