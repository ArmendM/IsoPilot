/* Auswertung Mitarbeitende. Lesezugriffe, getrennt von jeder Datei mit
 * "use server": dort wäre jeder Export eine Server Action, die der
 * Browser aufrufen kann.
 *
 * Eine Person auf einmal, nie alle zugleich. Die Auswertung Baustellen
 * ist ein eigener Bereich und kommt getrennt, sonst vermischen sich zwei
 * Fragen, die nichts miteinander zu tun haben. */
import { db } from "@/lib/db";
import { netHours } from "@/lib/dates";
import { holidayMap } from "@/lib/holidays";
import type { SessionUser } from "@/lib/session";
import { istWochenende, tageIn, type Zeitraum } from "@/lib/zeitraum";

const isoUtc = (d: Date) => d.toISOString().slice(0, 10);

export type Einzelposition = {
  datum: string;
  von: string | null;
  bis: string | null;
  pause: number;
  netto: number;
  baustelle: string | null;
  istRegie: boolean;
  notiz: string | null;
};

export type BaustellenAnteil = {
  siteId: string | null;
  label: string;
  stunden: number;
};

export type PersonAuswertung = {
  person: { id: string; name: string };
  zeitraum: Zeitraum;
  /** Werktage im Zeitraum, ohne Wochenenden und ohne Feiertage. */
  werktage: number;
  /** Tage, an denen tatsächlich etwas erfasst wurde, Wochenenden mitgezählt. */
  tageMitErfassung: number;
  nettostunden: number;
  pausenMinuten: number;
  ferientage: number;
  krankheitstage: number;
  uebrigeAbsenztage: number;
  feiertage: number;
  /** Werktag ohne Eintrag und ohne Absenz. */
  offeneTage: number;
  proBaustelle: BaustellenAnteil[];
  positionen: Einzelposition[];
};

const hhmm = (d: Date | null, zeit: string) =>
  d ? new Date(d).toLocaleTimeString("de-CH", { timeZone: zeit, hour: "2-digit", minute: "2-digit" }) : null;

/**
 * Eine Person über einen Zeitraum.
 *
 * Mitarbeitende kommen nur an die eigenen Zahlen, Vorgesetzte an alle
 * der eigenen Firma, einschliesslich der jeweils anderen vorgesetzten
 * Person. Die Firma wird mitgeprüft: die Rolle allein sagt nichts
 * darüber, zu welcher Firma eine fremde Kennung gehört.
 */
export async function auswertungPerson(
  user: SessionUser,
  personId: string,
  zeitraum: Zeitraum,
): Promise<PersonAuswertung> {
  if (user.role !== "ADMIN" && user.id !== personId) throw new Error("FORBIDDEN");

  const person = await db.user.findUnique({
    where: { id: personId },
    select: { id: true, name: true, companyId: true },
  });
  if (!person || person.companyId !== user.companyId) throw new Error("FORBIDDEN");

  const von = new Date(`${zeitraum.von}T00:00:00Z`);
  const bis = new Date(`${zeitraum.bis}T00:00:00Z`);

  const [eintraege, feiertage, absenzen] = await Promise.all([
    db.timeEntry.findMany({
      where: {
        userId: personId,
        workDate: { gte: von, lte: bis },
        deletedAt: null,
      },
      orderBy: [{ workDate: "asc" }, { startedAt: "asc" }],
      include: { site: { select: { id: true, name: true, street: true, city: true } } },
    }),
    holidayMap(user.companyId, von, bis),
    db.absence.findMany({
      where: {
        userId: personId,
        deletedAt: null,
        // Ein abgelehnter Antrag deckt keinen Tag ab, der Tag bleibt offen.
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: bis },
        endDate: { gte: von },
      },
      select: { type: true, startDate: true, endDate: true, isHalfDay: true },
    }),
  ]);

  const positionen: Einzelposition[] = eintraege.map((e) => ({
    datum: isoUtc(e.workDate),
    von: hhmm(e.startedAt, "Europe/Zurich"),
    bis: hhmm(e.endedAt, "Europe/Zurich"),
    pause: e.breakMinutes,
    netto: netHours(e.startedAt, e.endedAt, e.breakMinutes),
    baustelle: e.site ? (e.site.name ?? `${e.site.street}, ${e.site.city}`) : null,
    istRegie: e.billingMode === "REGIE",
    notiz: e.note,
  }));

  /* Je Baustelle aufsummieren. Tage ohne Baustelle sind Werkstatt- und
   * Bürotage, die es ausdrücklich geben soll, und stehen deshalb als
   * eigene Zeile statt unter den Tisch zu fallen. */
  const proBaustelle = new Map<string, BaustellenAnteil>();
  for (const e of eintraege) {
    const id = e.site?.id ?? null;
    const label = e.site
      ? (e.site.name ?? `${e.site.street}, ${e.site.city}`)
      : "Ohne Baustelle, Werkstatt oder Büro";
    const v = proBaustelle.get(id ?? "") ?? { siteId: id, label, stunden: 0 };
    v.stunden += netHours(e.startedAt, e.endedAt, e.breakMinutes);
    proBaustelle.set(id ?? "", v);
  }

  const tageMitErfassung = new Set(eintraege.map((e) => isoUtc(e.workDate))).size;

  /* Absenzen Tag für Tag, mit derselben Regel wie die Monatsübersicht:
   * am Wochenende und am Feiertag wird kein Ferientag verbraucht, ein
   * halber Tag zählt halb. */
  let ferientage = 0;
  let krankheitstage = 0;
  let uebrigeAbsenztage = 0;
  let werktage = 0;
  let feiertageImZeitraum = 0;
  let offeneTage = 0;

  const erfassteTage = new Set(eintraege.map((e) => isoUtc(e.workDate)));

  for (const tag of tageIn(zeitraum)) {
    const wochenende = istWochenende(tag);
    const feiertag = feiertage.has(tag);
    if (feiertag && !wochenende) feiertageImZeitraum += 1;
    if (wochenende || feiertag) continue;

    werktage += 1;

    const absenz = absenzen.find(
      (a) => isoUtc(a.startDate) <= tag && isoUtc(a.endDate) >= tag,
    );
    if (absenz) {
      const anteil = absenz.isHalfDay ? 0.5 : 1;
      if (absenz.type === "VACATION") ferientage += anteil;
      else if (absenz.type === "SICK") krankheitstage += anteil;
      else uebrigeAbsenztage += anteil;
    }

    // Ein halber Absenztag deckt den Tag nicht ganz: die andere Hälfte
    // wurde gearbeitet und gehört erfasst.
    if (!erfassteTage.has(tag) && !(absenz && !absenz.isHalfDay)) offeneTage += 1;
  }

  return {
    person: { id: person.id, name: person.name },
    zeitraum,
    werktage,
    tageMitErfassung,
    nettostunden: runde(positionen.reduce((s, p) => s + p.netto, 0)),
    pausenMinuten: eintraege.reduce((s, e) => s + e.breakMinutes, 0),
    ferientage,
    krankheitstage,
    uebrigeAbsenztage,
    feiertage: feiertageImZeitraum,
    offeneTage,
    proBaustelle: [...proBaustelle.values()]
      .map((b) => ({ ...b, stunden: runde(b.stunden) }))
      .sort((a, b) => b.stunden - a.stunden),
    positionen,
  };
}

/** Stunden auf zwei Stellen, sonst summieren sich Rundungsreste sichtbar auf. */
const runde = (n: number) => Math.round(n * 100) / 100;


/* ────────────────────────────────────────────────────────────
 * Auswertung Baustellen
 *
 * Ein eigener Bereich, nicht mit der Auswertung Mitarbeitende
 * vermischt: die eine fragt, was eine Person geleistet hat, die andere,
 * was eine Baustelle gekostet hat.
 *
 * Nur für Vorgesetzte. Eine Baustellenauswertung führt die Stunden aller
 * Beteiligten und die Kosten zusammen, und Mitarbeitende sehen nur ihre
 * eigenen Zeiten und Buchungen.
 * ──────────────────────────────────────────────────────────── */

export type MaterialPosition = {
  datum: string;
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  rabattPct: number;
  betrag: number;
  person: string;
};

export type PersonAnteil = { personId: string; name: string; stunden: number };

/** Ein einzelner Zeiteintrag auf der Baustelle, mit der Person dazu. */
export type ZeitPosition = {
  datum: string;
  person: string;
  von: string | null;
  bis: string | null;
  pause: number;
  netto: number;
  istRegie: boolean;
  notiz: string | null;
};

export type BaustellenAuswertung = {
  baustelle: {
    id: string;
    bezeichnung: string;
    adresse: string;
    partner: string | null;
    status: "OPEN" | "PAUSED" | "DONE";
  };
  zeitraum: Zeitraum;
  soll: number;
  /** Ist über den gewählten Zeitraum. */
  istImZeitraum: number;
  /** Ist über die ganze Laufzeit der Baustelle. */
  istGesamt: number;
  /** Soll minus Ist gesamt. Gegen den Zeitraum gerechnet wäre sie
   *  nichtssagend: das Soll gilt für die ganze Baustelle. */
  differenz: number;
  materialkosten: number;
  vsiBetrag: number;
  materialPositionen: MaterialPosition[];
  vsiPositionen: MaterialPosition[];
  proPerson: PersonAnteil[];
  /** Die einzelnen Zeiteinträge im Zeitraum, nicht nur die Summe je Person. */
  zeitPositionen: ZeitPosition[];
};

export type BaustellenZeile = {
  id: string;
  bezeichnung: string;
  partner: string | null;
  status: "OPEN" | "PAUSED" | "DONE";
  soll: number;
  istImZeitraum: number;
  istGesamt: number;
  differenz: number;
  materialkosten: number;
  vsiBetrag: number;
};

const adresseVon = (s: { street: string; zip: string; city: string }) =>
  `${s.street}, ${s.zip} ${s.city}`;

/** Betrag einer Buchung, mit dem eingefrorenen Preis und dem Rabatt. */
const betragVon = (b: { quantity: unknown; unitPrice: unknown; discountPct: number }) =>
  runde(Number(b.quantity) * Number(b.unitPrice) * (1 - b.discountPct / 100));

/**
 * Eine Baustelle über einen Zeitraum.
 *
 * Stunden und Materialkosten werden über den Zeitraum gerechnet, das
 * Soll-Ist dagegen über die ganze Laufzeit: das Soll gilt für die
 * Baustelle und nicht für einen Monat. Beide Zahlen stehen deshalb
 * nebeneinander, statt eine davon stillschweigend zu wählen.
 */
export async function auswertungBaustelle(
  user: SessionUser,
  siteId: string,
  zeitraum: Zeitraum,
): Promise<BaustellenAuswertung> {
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");

  const site = await db.site.findUnique({
    where: { id: siteId },
    include: { partner: { select: { name: true } } },
  });
  if (!site || site.companyId !== user.companyId) throw new Error("FORBIDDEN");

  const von = new Date(`${zeitraum.von}T00:00:00Z`);
  const bis = new Date(`${zeitraum.bis}T00:00:00Z`);

  const [imZeitraum, gesamt, buchungen] = await Promise.all([
    db.timeEntry.findMany({
      where: { siteId, deletedAt: null, workDate: { gte: von, lte: bis } },
      orderBy: [{ workDate: "asc" }, { startedAt: "asc" }],
      select: {
        workDate: true, startedAt: true, endedAt: true, breakMinutes: true,
        billingMode: true, note: true,
        user: { select: { id: true, name: true } },
      },
    }),
    db.timeEntry.findMany({
      where: { siteId, deletedAt: null },
      select: { startedAt: true, endedAt: true, breakMinutes: true },
    }),
    db.materialBooking.findMany({
      where: { siteId, deletedAt: null, bookedOn: { gte: von, lte: bis } },
      orderBy: [{ bookedOn: "asc" }],
      include: {
        material: { select: { name: true, sku: true } },
        user: { select: { name: true } },
      },
    }),
  ]);

  const proPerson = new Map<string, PersonAnteil>();
  for (const e of imZeitraum) {
    const v = proPerson.get(e.user.id) ?? {
      personId: e.user.id,
      name: e.user.name,
      stunden: 0,
    };
    v.stunden += netHours(e.startedAt, e.endedAt, e.breakMinutes);
    proPerson.set(e.user.id, v);
  }

  const alsPosition = (b: (typeof buchungen)[number]): MaterialPosition => ({
    datum: isoUtc(b.bookedOn),
    bezeichnung:
      b.kind === "VSI"
        ? (b.label ?? "VSI-Position")
        : b.material
          ? (b.material.sku ? `${b.material.sku} · ${b.material.name}` : b.material.name)
          : "Artikel entfernt",
    menge: Number(b.quantity),
    einheit: b.unit,
    einzelpreis: Number(b.unitPrice),
    rabattPct: b.discountPct,
    betrag: betragVon(b),
    person: b.user.name,
  });

  const materialPositionen = buchungen.filter((b) => b.kind === "CATALOG").map(alsPosition);
  const vsiPositionen = buchungen.filter((b) => b.kind === "VSI").map(alsPosition);

  const zeitPositionen: ZeitPosition[] = imZeitraum.map((e) => ({
    datum: isoUtc(e.workDate),
    person: e.user.name,
    von: hhmm(e.startedAt, "Europe/Zurich"),
    bis: hhmm(e.endedAt, "Europe/Zurich"),
    pause: e.breakMinutes,
    netto: netHours(e.startedAt, e.endedAt, e.breakMinutes),
    istRegie: e.billingMode === "REGIE",
    notiz: e.note,
  }));

  const istImZeitraum = runde(
    imZeitraum.reduce((s, e) => s + netHours(e.startedAt, e.endedAt, e.breakMinutes), 0),
  );
  const istGesamt = runde(
    gesamt.reduce((s, e) => s + netHours(e.startedAt, e.endedAt, e.breakMinutes), 0),
  );

  return {
    baustelle: {
      id: site.id,
      bezeichnung: site.name ?? adresseVon(site),
      adresse: adresseVon(site),
      partner: site.partner?.name ?? null,
      status: site.status,
    },
    zeitraum,
    soll: Number(site.targetHours),
    istImZeitraum,
    istGesamt,
    differenz: runde(Number(site.targetHours) - istGesamt),
    materialkosten: runde(materialPositionen.reduce((s, p) => s + p.betrag, 0)),
    vsiBetrag: runde(vsiPositionen.reduce((s, p) => s + p.betrag, 0)),
    materialPositionen,
    vsiPositionen,
    proPerson: [...proPerson.values()]
      .map((p) => ({ ...p, stunden: runde(p.stunden) }))
      .sort((a, b) => b.stunden - a.stunden),
    zeitPositionen,
  };
}

/**
 * Alle Baustellen als Übersicht, abgeschlossene eingeschlossen: sie
 * verschwinden aus der Auswahl, bleiben aber in Auswertungen.
 */
export async function auswertungAlleBaustellen(
  user: SessionUser,
  zeitraum: Zeitraum,
): Promise<BaustellenZeile[]> {
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");

  const von = new Date(`${zeitraum.von}T00:00:00Z`);
  const bis = new Date(`${zeitraum.bis}T00:00:00Z`);

  const sites = await db.site.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ status: "asc" }, { name: "asc" }, { street: "asc" }],
    include: {
      partner: { select: { name: true } },
      entries: {
        where: { deletedAt: null },
        select: { workDate: true, startedAt: true, endedAt: true, breakMinutes: true },
      },
      bookings: {
        where: { deletedAt: null, bookedOn: { gte: von, lte: bis } },
        select: { kind: true, quantity: true, unitPrice: true, discountPct: true },
      },
    },
  });

  return sites.map((s) => {
    const stunden = (nurZeitraum: boolean) =>
      runde(
        s.entries
          .filter((e) => !nurZeitraum || (e.workDate >= von && e.workDate <= bis))
          .reduce((sum, e) => sum + netHours(e.startedAt, e.endedAt, e.breakMinutes), 0),
      );

    const summe = (kind: "CATALOG" | "VSI") =>
      runde(
        s.bookings.filter((b) => b.kind === kind).reduce((sum, b) => sum + betragVon(b), 0),
      );

    const istGesamt = stunden(false);
    return {
      id: s.id,
      bezeichnung: s.name ?? adresseVon(s),
      partner: s.partner?.name ?? null,
      status: s.status,
      soll: Number(s.targetHours),
      istImZeitraum: stunden(true),
      istGesamt,
      differenz: runde(Number(s.targetHours) - istGesamt),
      materialkosten: summe("CATALOG"),
      vsiBetrag: summe("VSI"),
    };
  });
}
