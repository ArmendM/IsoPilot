// Die Firmenangaben für den Kopf eines Berichts und für die Einstellungen.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import { bildmasse } from "@/lib/bildmass";
import type { SessionUser } from "@/lib/session";
import type { Firmenkopf } from "@/server/pdf";

/* Die Wortmarke aus `public/marke`, solange an der Firma kein eigenes
 * Logo hochgeladen ist. Das Dockerfile kopiert `public` in den
 * Containerstamm und der Server läuft von dort, der Pfad trägt also in
 * Entwicklung und Betrieb.
 *
 * Bewusst die PNG und nicht die SVG: pdfkit kennt nur PNG und JPEG und
 * wirft bei einer SVG "Unknown image format". Siehe
 * `public/marke/EINBAU.md`. */
const WORTMARKE = join(
  process.cwd(),
  "public", "marke", "wortmarke", "isoteam-wortmarke-farbig-2000.png",
);

/* Ohne `logo`. Die Bytes gehören in den Bericht, nicht in jede Abfrage
 * und erst recht nicht in einen Protokolleintrag: `before` und `after`
 * sind JSON, und ein Bild darin stünde als Zahlenreihe mit
 * hunderttausend Einträgen im Audit-Log. */
export const FIRMENFELDER = {
  id: true,
  name: true,
  street: true,
  zip: true,
  city: true,
  vatNumber: true,
  phone: true,
  email: true,
  iban: true,
  canton: true,
  defaultVacationDays: true,
  regieRateA: true,
  regieRateB: true,
  regieValidFrom: true,
  logoTyp: true,
  logoName: true,
} as const;

export type Firmendaten = {
  name: string;
  street: string;
  zip: string;
  city: string;
  vatNumber: string;
  phone: string;
  email: string;
  iban: string;
  canton: string;
  defaultVacationDays: number;
  regieRateA: string;
  regieRateB: string;
  regieValidFrom: string;
  /** Dateiname des hochgeladenen Logos, null heisst: es gilt die Wortmarke. */
  logoName: string | null;
};

/** Die Firmenangaben zum Bearbeiten unter /firma. */
export async function firmendaten(user: SessionUser): Promise<Firmendaten> {
  const c = await db.company.findUniqueOrThrow({
    where: { id: user.companyId },
    select: FIRMENFELDER,
  });

  return {
    name: c.name,
    street: c.street,
    zip: c.zip,
    city: c.city,
    // Im Formular ist ein leeres Feld ein leerer Text, kein null. Erst
    // beim Speichern wird daraus wieder null, siehe server/firma.ts.
    vatNumber: c.vatNumber ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    iban: c.iban ?? "",
    canton: c.canton,
    defaultVacationDays: c.defaultVacationDays,
    regieRateA: c.regieRateA?.toString() ?? "",
    regieRateB: c.regieRateB?.toString() ?? "",
    regieValidFrom: c.regieValidFrom?.toISOString().slice(0, 10) ?? "",
    logoName: c.logoName,
  };
}

/**
 * Firmenzeile und Logo für einen Bericht.
 *
 * Solange kein eigenes Logo hochgeladen ist, nimmt der Bericht die
 * Wortmarke aus dem Verzeichnis. Liegt eines an der Firma, gilt dieses:
 * eine zweite Firma soll ihr eigenes Logo tragen können, ohne dass
 * jemand hier etwas ändert.
 *
 * Fehlt auch die Wortmarke oder ist sie unbrauchbar, steht der Kopf
 * trotzdem. Ein fehlendes Bild ist kein Grund, einen Bericht zu
 * verweigern: sonst stünde jemand vor einer leeren Seite, weil eine
 * Datei verschoben wurde.
 */
export async function firmenkopf(user: SessionUser): Promise<Firmenkopf> {
  const c = await db.company.findUniqueOrThrow({
    where: { id: user.companyId },
    select: { ...FIRMENFELDER, logo: true },
  });

  const logo = await logobytes(c.logo);

  return {
    name: c.name,
    strasse: c.street,
    ort: `${c.zip} ${c.city}`,
    mwst: c.vatNumber,
    telefon: c.phone,
    mail: c.email,
    logo,
    // Aus den Bytes gelesen, nie aus dem gemeldeten Typ: Excel setzt das
    // Bild in eine feste Box und verzerrte es sonst.
    logoMass: logo ? bildmasse(logo) : null,
  };
}

/** Die Bytes des Logos, sonst die Wortmarke, sonst nichts. */
export async function logobytes(eigenes: Uint8Array | null): Promise<Buffer | null> {
  if (eigenes) return Buffer.from(eigenes);
  try {
    return await readFile(WORTMARKE);
  } catch {
    return null;
  }
}
