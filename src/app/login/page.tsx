import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// Fehlermeldungen sagen, was zu tun ist, nicht was schiefging.
const MELDUNGEN: Record<string, string> = {
  pending:
    "Dein Zugang ist angelegt und muss noch von Daut oder Qail freigegeben werden. Sag ihnen Bescheid, danach kommst du hinein.",
  setup:
    "IsoPilot ist noch nicht fertig eingerichtet, die Firma fehlt in der Datenbank. Das muss Armend erledigen.",
  state:
    "Die Anmeldung ist abgelaufen, weil zwischen den Schritten zu viel Zeit lag. Bitte noch einmal versuchen.",
  token:
    "Der Anmeldedienst hat die Anfrage abgelehnt. Bitte noch einmal versuchen. Bleibt es dabei, stimmen Client-ID, Secret oder Weiterleitungs-URL der Auth-Anwendung nicht.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSession()) redirect("/");

  const { e } = await searchParams;
  const code = typeof e === "string" ? e : undefined;
  const meldung = code
    ? (MELDUNGEN[code] ??
      "Die Anmeldung ist fehlgeschlagen. Bitte noch einmal versuchen.")
    : undefined;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">IsoPilot</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Stunden, Material, Ausmass. Alles auf einer Baustelle.
        </p>

        {meldung && (
          <p
            role="alert"
            className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200"
          >
            {meldung}
          </p>
        )}

        <a
          href="/api/auth/login"
          className="mt-6 flex h-11 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Mit Infomaniak anmelden
        </a>

        <p className="mt-4 text-xs text-black/50 dark:text-white/50">
          Anmeldung mit dem Infomaniak-Konto der Firma. Beim ersten Mal gibt
          dich danach ein Vorgesetzter frei.
        </p>
      </div>
    </main>
  );
}
