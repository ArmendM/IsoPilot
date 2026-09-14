import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { personen } from "@/server/users-read";
import { PersonenListe } from "@/components/personen/personen-liste";
import { Kopfleiste } from "@/components/marke/kopfleiste";

export default async function PersonenPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  // Mitarbeitende haben hier nichts zu suchen, die Seite gibt es für sie
  // gar nicht erst.
  if (user.role !== "ADMIN") redirect("/");

  const zeilen = await personen(user);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <Kopfleiste>
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          Übersicht
        </Link>
        <Link href="/zeiten" className="text-black/60 underline dark:text-white/60">
          Tagesansicht
        </Link>
        <Link href="/absenzen" className="text-black/60 underline dark:text-white/60">
          Absenzen
        </Link>
      </Kopfleiste>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Personen</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Konten entstehen bei der ersten Anmeldung über Infomaniak. Hier wird
        nur entschieden, wer hinein darf und was er sehen kann.
      </p>

      <PersonenListe zeilen={zeilen} />
    </main>
  );
}
