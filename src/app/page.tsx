import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// Kein requireUser(): eine abgelaufene Sitzung hat noch ein Cookie, der Proxy
// lässt sie also durch. Hier gehört eine Weiterleitung hin, kein Fehler.
export default async function StartPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">IsoPilot</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Angemeldet als {user.name},{" "}
            {user.role === "ADMIN" ? "Vorgesetzter" : "Mitarbeitender"}
          </p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Abmelden
          </button>
        </form>
      </header>

      <section className="mt-8 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-medium">Nächster Schritt</h2>
        <p className="mt-2 text-sm text-black/70 dark:text-white/70">
          Das Fundament steht: Anmeldung über Infomaniak, Sitzung, Rollen und
          Protokoll. Die Zeiterfassung kommt in M2.
        </p>
        <p className="mt-2 text-sm text-black/70 dark:text-white/70">
          Ferienanspruch: {user.vacationDays} Tage
        </p>
      </section>
    </main>
  );
}
