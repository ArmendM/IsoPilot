import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { IsoTeamWortmarke } from "@/components/marke/isoteam-logo";

// Kein requireUser(): eine abgelaufene Sitzung hat noch ein Cookie, der Proxy
// lässt sie also durch. Hier gehört eine Weiterleitung hin, kein Fehler.
export default async function StartPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">IsoPilot</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Angemeldet als {user.name},{" "}
            {user.role === "ADMIN" ? "Vorgesetzter" : "Mitarbeitender"}
          </p>
        </div>
        {/* Die Wortmarke rechts, an derselben Stelle wie auf den
            Unterseiten. IsoPilot ist die Software und steht als Titel
            links, IsoTeam ist der Betrieb und steht als Marke rechts.
            Die Fassung "farbig" gilt auf hellem Grund, siehe fassungFuer
            in lib/marke.ts. */}
        <div className="flex flex-col items-end gap-3">
          <IsoTeamWortmarke hoehe={24} />
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Abmelden
            </button>
          </form>
        </div>
      </header>

      <nav className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link
          href="/zeiten"
          className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          <h2 className="text-sm font-medium">Zeiterfassung</h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Stunden erfassen, ändern und nachschauen. Mehrere Einträge pro Tag
            sind möglich.
          </p>
        </Link>
        <Link
          href="/zeiten/monat"
          className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          <h2 className="text-sm font-medium">Monatsansicht</h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Ganzer Monat auf einen Blick, mit den offenen Tagen und den
            Feiertagen.
          </p>
        </Link>

        <Link
          href="/baustellen"
          className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          <h2 className="text-sm font-medium">Baustellen</h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Laufende Baustellen mit Soll und Ist, Auftraggeber und Status.
          </p>
        </Link>

        <Link
          href="/material"
          className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          <h2 className="text-sm font-medium">Material</h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Katalog mit Preisen, Lagerbestand und Mindestbestand.
          </p>
        </Link>

        <Link
          href="/absenzen"
          className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          <h2 className="text-sm font-medium">Absenzen und Ferien</h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Ferien beantragen, krank melden, Ferienstand ansehen.
          </p>
        </Link>

        <Link
          href="/auswertung/mitarbeitende"
          className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          <h2 className="text-sm font-medium">Auswertung Mitarbeitende</h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Eine Person über einen Monat, ein Jahr oder eine freie Zeitspanne,
            mit Stunden, Pausen, Ferien und Krankheit.
          </p>
        </Link>
      </nav>

      {user.role === "ADMIN" && (
        <nav className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/personen"
              className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              <h2 className="text-sm font-medium">Personen</h2>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Konten freigeben, Rolle setzen, Ferientage und Eintrittsdatum
                pflegen.
              </p>
            </Link>
            <Link
              href="/auswertung/baustellen"
              className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              <h2 className="text-sm font-medium">Auswertung Baustellen</h2>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Eine Baustelle oder alle: Soll und Ist, Materialkosten,
                VSI-Ausmass und Auftraggeber.
              </p>
            </Link>
            <Link
              href="/firma"
              className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              <h2 className="text-sm font-medium">Firma</h2>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Anschrift, Kontakt und Logo für den Briefkopf, dazu die
                Vorgaben für neue Konten.
              </p>
            </Link>
            <Link
              href="/abschluss"
              className="rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              <h2 className="text-sm font-medium">Monatsabschluss</h2>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Stand pro Person ansehen und den Monat zusperren.
              </p>
            </Link>
          </div>
        </nav>
      )}

      <p className="mt-6 text-sm text-black/60 dark:text-white/60">
        Ferienanspruch: {user.vacationDays} Tage
      </p>
    </main>
  );
}
