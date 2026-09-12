import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { formatHours, monthKey, todayISO, utcToZurich } from "@/lib/dates";
import {
  auswaehlbareBaustellen,
  auswaehlbarePersonen,
  eintraegeAmTag,
} from "@/server/time-entries-read";
import { ZeitenTag, type ZeileDaten } from "@/components/zeiten/zeiten-tag";

const TAG = /^\d{4}-\d{2}-\d{2}$/;

const tagPlus = (tag: string, n: number) => {
  const d = new Date(`${tag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const WOCHENTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

const lesbar = (tag: string) => {
  const d = new Date(`${tag}T12:00:00Z`);
  return `${WOCHENTAG[d.getUTCDay()]}, ${format(d, "dd.MM.yyyy")}`;
};

export default async function ZeitenPage({ searchParams }: PageProps<"/zeiten">) {
  const user = await getSession();
  if (!user) redirect("/login");

  const q = await searchParams;
  const roh = typeof q.tag === "string" ? q.tag : "";
  const tag = TAG.test(roh) ? roh : todayISO();

  const personen = await auswaehlbarePersonen(user);
  const gewuenscht = typeof q.person === "string" ? q.person : "";
  // Mitarbeitende sehen nur sich selbst, auch wenn sie eine fremde ID
  // in die Adresszeile schreiben.
  const personId = personen.some((p) => p.id === gewuenscht) ? gewuenscht : user.id;
  const person = personen.find((p) => p.id === personId);

  const [rows, baustellen, lock] = await Promise.all([
    eintraegeAmTag(user, personId, tag),
    auswaehlbareBaustellen(user.companyId),
    db.monthLock.findUnique({
      where: { companyId_month: { companyId: user.companyId, month: monthKey(tag) } },
      select: { isLocked: true },
    }),
  ]);

  // Zeiten in Schweizer Zeit formatieren, damit der Browser nicht rechnet.
  const eintraege: ZeileDaten[] = rows.map((r) => ({
    id: r.id,
    start: format(utcToZurich(r.startedAt), "HH:mm"),
    ende: r.endedAt ? format(utcToZurich(r.endedAt), "HH:mm") : "offen",
    breakMinutes: r.breakMinutes,
    netto: formatHours(r.netto),
    siteId: r.siteId,
    siteLabel: r.siteLabel,
    istRegie: r.istRegie,
    note: r.note,
  }));

  const istAdmin = user.role === "ADMIN";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <nav className="text-sm">
        <Link href="/" className="text-black/60 underline dark:text-white/60">
          Zurück zur Übersicht
        </Link>
      </nav>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Zeiterfassung</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        {lesbar(tag)}
        {istAdmin && person && person.id !== user.id && `, ${person.name}`}
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-black/60 dark:text-white/60">
            Tag
          </span>
          <input
            type="date"
            name="tag"
            defaultValue={tag}
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
            href={`/zeiten?tag=${tagPlus(tag, -1)}&person=${personId}`}
            className="underline text-black/60 dark:text-white/60"
          >
            Vortag
          </Link>
          <Link
            href={`/zeiten?tag=${todayISO()}&person=${personId}`}
            className="underline text-black/60 dark:text-white/60"
          >
            Heute
          </Link>
          <Link
            href={`/zeiten?tag=${tagPlus(tag, 1)}&person=${personId}`}
            className="underline text-black/60 dark:text-white/60"
          >
            Folgetag
          </Link>
        </span>
      </form>

      <ZeitenTag
        tag={tag}
        personId={personId}
        eintraege={eintraege}
        baustellen={baustellen}
        istAdmin={istAdmin}
        gesperrt={lock?.isLocked ?? false}
      />
    </main>
  );
}
