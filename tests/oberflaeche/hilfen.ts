/* Aufbau für die Browsertests: eine Prüfperson und eine echte Sitzung.
 *
 * Die Sitzung wird direkt in die Datenbank gesetzt und als Cookie in den
 * Browser gelegt. Über die Anmeldung zu gehen hiesse, bei Infomaniak
 * vorbeizuschauen, und das gehört nicht in einen Test der eigenen
 * Oberfläche.
 *
 * Es wird gegen den laufenden Entwicklungsserver und dessen Datenbank
 * geprüft. Angelegt werden ausschliesslich Konten mit dem Namenspräfix
 * `Pruefbrowser-`, und aufgeräumt wird ausschliesslich danach: in dieser
 * Datenbank stehen echte Zeiteinträge.
 */
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { BrowserContext } from "@playwright/test";

export const PRAEFIX = "Pruefbrowser-";

export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Eine Person mit Sitzung, angemeldet im übergebenen Browserkontext. */
export async function angemeldet(
  kontext: BrowserContext,
  name: string,
  rolle: "ADMIN" | "EMPLOYEE" = "ADMIN",
) {
  const company = await db.company.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const user = await db.user.create({
    data: { companyId: company.id, name: PRAEFIX + name, role: rolle, isActive: true },
  });

  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3_600_000),
      mfaVerified: true,
    },
  });

  await kontext.addCookies([
    {
      name: "sid",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  return user;
}

/** Alles wieder weg, was die Browsertests angelegt haben. */
export async function aufraeumen() {
  const ids = (
    await db.user.findMany({
      where: { name: { startsWith: PRAEFIX } },
      select: { id: true },
    })
  ).map((u) => u.id);
  if (ids.length === 0) return;

  await db.workload.deleteMany({ where: { userId: { in: ids } } });
  await db.timeEntry.deleteMany({ where: { userId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}
