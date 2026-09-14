import Link from "next/link";
import { DatumFeld } from "@/components/ui/eingabefelder";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { formatHours, monthKey, todayISO } from "@/lib/dates";
import { auswaehlbarePersonen, monatsuebersicht } from "@/server/time-entries-read";
import { Kopfleiste } from "@/components/marke/kopfleiste";

const MONAT = /^\d{4}-\d{2}$/;
const MONATSNAME = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const WTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function monatPlus(monat: string, n: number) {
  const [j, m] = monat.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function MonatPage({ searchParams }: PageProps<"/zeiten/monat">) {
  const user = await getSession();
  if (!user) redirect("/login");

  const q = await searchParams;
  const roh = typeof q.monat === "string" ? q.monat : "";
  const monat = MONAT.test(roh) ? roh : monthKey(todayISO());

  const personen = await auswaehlbarePersonen(user);
  const gewuenscht = typeof q.person === "string" ? q.person : "";
  const personId = personen.some((p) => p.id === gewuenscht) ? gewuenscht : user.id;
  const person = personen.find((p) => p.id === personId);

  const [u, lock] = await Promise.all([
    monatsuebersicht(user, personId, monat),
    db.monthLock.findUnique({
      where: { companyId_month: { companyId: user.companyId, month: monat } },
      select: { isLocked: true },
    }),
  ]);

  const istAdmin = user.role === "ADMIN";
  const [jahr, m] = monat.split("-").map(Number);
  // Montag als erster Spaltentag, deshalb Sonntag auf 7 schieben.
  const ersterWochentag = new Date(Date.UTC(jahr, m - 1, 1)).getUTCDay() || 7;
  const heute = todayISO();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <Kopfleiste>
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          Übersicht
        </Link>
        <Link href="/zeiten" className="text-black/60 underline dark:text-white/60">
          Tagesansicht
        </Link>
      </Kopfleiste>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {MONATSNAME[m - 1]} {jahr}
      </h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        {person?.name}
        {lock?.isLocked && ", Monat abgeschlossen"}
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

        {istAdmin && (
          <label className="space-y-1">
            <span className="block text-xs font-medium text-black/60 dark:text-white/60">
              Person
            </span>
            <select
              name="person"
              defaultValue={personId}
              className="h-10 rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20"
            >
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

        <span className="ml-auto flex gap-3 text-sm">
          <Link
            href={`/zeiten/monat?monat=${monatPlus(monat, -1)}&person=${personId}`}
            className="underline text-black/60 dark:text-white/60"
          >
            Vormonat
          </Link>
          <Link
            href={`/zeiten/monat?monat=${monatPlus(monat, 1)}&person=${personId}`}
            className="underline text-black/60 dark:text-white/60"
          >
            Folgemonat
          </Link>
        </span>
      </form>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kennzahl titel="Erfasst" wert={formatHours(u.stunden)} />
        <Kennzahl titel="Arbeitstage" wert={String(u.arbeitstage)} />
        <Kennzahl
          titel="Offene Tage"
          wert={String(u.offeneTage)}
          betont={u.offeneTage > 0}
        />
        <Kennzahl titel="Feiertage" wert={String(u.feiertage)} />
      </dl>

      <div className="mt-6 grid grid-cols-7 gap-1 text-center text-xs font-medium text-black/50 dark:text-white/50">
        {WTAGE.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: ersterWochentag - 1 }, (_, i) => (
          <div key={`leer-${i}`} />
        ))}

        {u.tage.map((t) => {
          const grund = t.feiertag
            ? t.feiertag
            : t.absenz
              // Nicht "offen" nennen: daneben bedeutet das Wort bereits
              // "Arbeitstag ohne Eintrag".
              ? [
                  t.absenz.typ === "VACATION"
                    ? "Ferien"
                    : t.absenz.typ === "SICK"
                      ? "Krank"
                      : "Absenz",
                  t.absenz.halberTag ? "halb" : null,
                  t.absenz.status === "PENDING" ? "beantragt" : null,
                ]
                  .filter(Boolean)
                  .join(", ")
              : null;

          return (
            <Link
              key={t.datum}
              href={`/zeiten?tag=${t.datum}&person=${personId}`}
              className={[
                "min-h-20 rounded-md border p-2 text-left text-xs transition-colors",
                t.datum === heute
                  ? "border-black ring-1 ring-black dark:border-white dark:ring-white"
                  : "border-black/10 dark:border-white/15",
                t.istWochenende ? "bg-black/[0.03] dark:bg-white/[0.04]" : "",
                t.istOffen
                  ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
                  : "",
                "hover:bg-black/5 dark:hover:bg-white/10",
              ].join(" ")}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium tabular-nums">{t.tagImMonat}</span>
                {t.eintraege > 1 && (
                  <span className="text-black/40 dark:text-white/40">
                    {t.eintraege}×
                  </span>
                )}
              </div>

              {t.stunden > 0 && (
                <div className="mt-1 tabular-nums">{formatHours(t.stunden)}</div>
              )}
              {grund && (
                <div className="mt-1 leading-tight text-black/55 dark:text-white/55">
                  {grund}
                </div>
              )}
              {t.istOffen && (
                <div className="mt-1 text-amber-800 dark:text-amber-300">offen</div>
              )}
            </Link>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-black/50 dark:text-white/50">
        Offen heisst: Arbeitstag ohne Eintrag und ohne Absenz. Wochenenden und
        Feiertage zählen nicht dazu. Ein Klick auf einen Tag führt in die
        Tagesansicht.
      </p>
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
          ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
          : "border-black/10 dark:border-white/15",
      ].join(" ")}
    >
      <dt className="text-xs text-black/60 dark:text-white/60">{titel}</dt>
      <dd className="mt-0.5 text-lg font-medium tabular-nums">{wert}</dd>
    </div>
  );
}
