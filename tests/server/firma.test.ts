import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import { firma, person, sitzung } from "./hilfen";

/* Der Schreibpfad der Firmeneinstellungen, M4e, gegen ein echtes
 * Postgres. Die beiden Dinge, die hier schiefgehen können und im
 * Datenpfad nicht sichtbar wären: eine mitarbeitende Person, die den
 * Briefkopf ändert, und ein Bild, das als Zahlenreihe im Protokoll
 * landet. */

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/session", () => ({
  requireUser: async () => {
    if (!sitzung.user) throw new Error("UNAUTHENTICATED");
    return sitzung.user;
  },
  getSession: async () => sitzung.user,
  requireAdmin: async () => {
    if (!sitzung.user) throw new Error("UNAUTHENTICATED");
    if (sitzung.user.role !== "ADMIN") throw new Error("FORBIDDEN");
    return sitzung.user;
  },
}));

const { setFirmendaten, setLogo, entferneLogo } = await import("@/server/firma");
const { firmenkopf, firmendaten } = await import("@/server/firma-read");

const WORTMARKE = readFileSync(
  join(process.cwd(), "public", "marke", "wortmarke", "isoteam-wortmarke-farbig-2000.png"),
);

const GUELTIG = {
  name: "IsoTeam Suljejmani GmbH",
  street: "Gerliswilstrasse 68",
  zip: "6020",
  city: "Emmenbrücke",
  vatNumber: "CHE-305.978.601",
  phone: "079 616 89 75",
  email: "info@isoteam-suljejmani.ch",
  iban: "CH57 8080 8009 7723 8862 6",
  defaultVacationDays: 25,
  regieRateA: "84.00",
  regieRateB: "76.00",
  regieValidFrom: "2026-01-01",
};

/** Eine PNG mit echten Bytes, gross genug für die Mindestbreite. */
function pngDatei(name = "logo.png", breite = 1200, hoehe = 300) {
  const d = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(d, 0);
  d.writeUInt32BE(13, 8);
  d.write("IHDR", 12, "ascii");
  d.writeUInt32BE(breite, 16);
  d.writeUInt32BE(hoehe, 20);
  return new File([d], name, { type: "image/png" });
}

function formular(datei: File | null) {
  const fd = new FormData();
  if (datei) fd.append("datei", datei);
  return fd;
}

async function aufbau() {
  const c = await firma();
  const daut = await person(c.id, "Daut", "ADMIN");
  const liridon = await person(c.id, "Liridon");
  return { c, daut, liridon };
}

describe("Firmenangaben", () => {
  it("ändert nur ein Vorgesetzter", async () => {
    const { liridon } = await aufbau();
    sitzung.user = liridon.alsSitzung();

    const r = await setFirmendaten(GUELTIG);
    expect(r.ok).toBe(false);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("speichert und schreibt den Protokolleintrag in derselben Transaktion", async () => {
    const { c, daut } = await aufbau();
    sitzung.user = daut.alsSitzung();

    expect(await setFirmendaten(GUELTIG)).toEqual({ ok: true });

    const nachher = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(nachher.vatNumber).toBe("CHE-305.978.601");
    expect(nachher.iban).toBe("CH57 8080 8009 7723 8862 6");
    expect(Number(nachher.regieRateA)).toBe(84);
    expect(nachher.regieValidFrom?.toISOString().slice(0, 10)).toBe("2026-01-01");

    const log = await db.auditLog.findFirstOrThrow();
    expect(log.action).toBe("COMPANY_UPDATED");
    expect(log.entity).toBe("Company");
    expect(log.entityId).toBe(c.id);
  });

  it("macht aus einem leeren Feld null, nicht einen leeren Text", async () => {
    // Sonst steht im Briefkopf eine Zeile ohne Inhalt statt gar keiner,
    // und `mwst ?? ""` im Bericht greift nie.
    const { c, daut } = await aufbau();
    sitzung.user = daut.alsSitzung();

    expect(await setFirmendaten({ ...GUELTIG, vatNumber: "", email: "", regieRateA: "" })).toEqual({
      ok: true,
    });

    const nachher = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(nachher.vatNumber).toBeNull();
    expect(nachher.email).toBeNull();
    expect(nachher.regieRateA).toBeNull();
  });

  it("weist eine unvollständige Anschrift und eine unsinnige Mailadresse ab", async () => {
    const { c, daut } = await aufbau();
    sitzung.user = daut.alsSitzung();

    for (const schlecht of [
      { ...GUELTIG, name: "  " },
      { ...GUELTIG, zip: "602" },
      { ...GUELTIG, zip: "Emmenbrücke" },
      { ...GUELTIG, email: "info@" },
      { ...GUELTIG, regieRateA: "vierundachtzig" },
    ]) {
      expect((await setFirmendaten(schlecht)).ok).toBe(false);
    }

    // Nichts davon darf geschrieben haben.
    const nachher = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(nachher.zip).toBe("6020");
    expect(nachher.vatNumber).toBeNull();
    expect(await db.auditLog.count()).toBe(0);
  });

  it("rührt eine andere Firma nicht an", async () => {
    // Die Firma kommt aus der Sitzung und nicht aus dem Formular. Ein
    // Test hält fest, dass sich daran nichts ändert.
    const { daut } = await aufbau();
    const fremd = await firma("Fremde AG");
    sitzung.user = daut.alsSitzung();

    expect(await setFirmendaten({ ...GUELTIG, name: "Neuer Name" })).toEqual({ ok: true });

    const nachher = await db.company.findUniqueOrThrow({ where: { id: fremd.id } });
    expect(nachher.name).toBe("Fremde AG");
  });
});

describe("Logo", () => {
  it("nimmt nur ein Vorgesetzter entgegen", async () => {
    const { liridon } = await aufbau();
    sitzung.user = liridon.alsSitzung();

    expect((await setLogo(formular(pngDatei()))).ok).toBe(false);
    expect((await entferneLogo()).ok).toBe(false);
  });

  it("weist ab, was keine PNG und keine JPEG ist, auch wenn der Typ es behauptet", async () => {
    const { c, daut } = await aufbau();
    sitzung.user = daut.alsSitzung();

    const svg = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
      "logo.svg",
      { type: "image/png" }, // gelogen, und genau deshalb zählt der Typ nicht
    );
    const r = await setLogo(formular(svg));
    expect(r.ok).toBe(false);

    const nachher = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(nachher.logo).toBeNull();
  });

  it("weist ein Bild ab, das für den Druck zu schmal ist", async () => {
    const { c, daut } = await aufbau();
    sitzung.user = daut.alsSitzung();

    expect((await setLogo(formular(pngDatei("klein.png", 120, 40)))).ok).toBe(false);
    const nachher = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(nachher.logo).toBeNull();
  });

  it("verlangt überhaupt eine Datei", async () => {
    const { daut } = await aufbau();
    sitzung.user = daut.alsSitzung();
    expect((await setLogo(formular(null))).ok).toBe(false);
  });

  it("speichert Bytes, Typ und Namen und schreibt die Bytes nicht ins Protokoll", async () => {
    const { c, daut } = await aufbau();
    sitzung.user = daut.alsSitzung();

    expect(await setLogo(formular(pngDatei("hauslogo.png")))).toEqual({ ok: true });

    const nachher = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(nachher.logo).not.toBeNull();
    expect(nachher.logoTyp).toBe("image/png");
    expect(nachher.logoName).toBe("hauslogo.png");

    /* Die Falle: `before` und `after` sind JSON. Stünden die Bytes
     * darin, läge das Bild als Zahlenreihe im Protokoll und jeder
     * Austausch bliese die Tabelle auf. Im Eintrag stehen nur die
     * Angaben zum Bild. */
    const log = await db.auditLog.findFirstOrThrow();
    expect(log.action).toBe("COMPANY_LOGO_SET");
    expect(log.after).toEqual({
      name: "hauslogo.png",
      typ: "image/png",
      breite: 1200,
      hoehe: 300,
    });
    expect(JSON.stringify(log.after).length).toBeLessThan(200);
  });

  it("nimmt der Bericht, sobald es da ist", async () => {
    const { daut } = await aufbau();
    sitzung.user = daut.alsSitzung();

    // Ohne eigenes Logo gilt die Wortmarke aus public/marke.
    const ohne = await firmenkopf(daut.alsSitzung());
    expect(ohne.logo?.equals(WORTMARKE)).toBe(true);
    expect(ohne.logoMass).toEqual({ typ: "image/png", breite: 2000, hoehe: 303 });

    await setLogo(formular(pngDatei("hauslogo.png", 1200, 300)));

    const mit = await firmenkopf(daut.alsSitzung());
    expect(mit.logo?.equals(WORTMARKE)).toBe(false);
    expect(mit.logoMass).toEqual({ typ: "image/png", breite: 1200, hoehe: 300 });
  });

  it("fällt nach dem Entfernen auf die Wortmarke zurück", async () => {
    const { c, daut } = await aufbau();
    sitzung.user = daut.alsSitzung();

    await setLogo(formular(pngDatei("hauslogo.png")));
    expect(await entferneLogo()).toEqual({ ok: true });

    const nachher = await db.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(nachher.logo).toBeNull();
    expect(nachher.logoTyp).toBeNull();
    expect(nachher.logoName).toBeNull();

    const kopf = await firmenkopf(daut.alsSitzung());
    expect(kopf.logo?.equals(WORTMARKE)).toBe(true);

    const log = await db.auditLog.findFirstOrThrow({
      where: { action: "COMPANY_LOGO_REMOVED" },
    });
    expect(log.before).toEqual({ logoName: "hauslogo.png", logoTyp: "image/png" });
  });

  it("meldet den Dateinamen an die Einstellungen, ohne die Bytes zu laden", async () => {
    const { daut } = await aufbau();
    sitzung.user = daut.alsSitzung();

    expect((await firmendaten(daut.alsSitzung())).logoName).toBeNull();
    await setLogo(formular(pngDatei("hauslogo.png")));
    expect((await firmendaten(daut.alsSitzung())).logoName).toBe("hauslogo.png");
  });
});
