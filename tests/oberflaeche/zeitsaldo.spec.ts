import { test, expect } from "@playwright/test";
import { angemeldet, aufraeumen, db } from "./hilfen";

/* Das Formular wirklich ausfüllen und abschicken.
 *
 * Drei Fehler in Folge sind im Betrieb gemeldet worden, die weder die
 * Tests noch Abrufe über HTTP gefunden haben: der Saldo rechnete ab dem
 * falschen Tag, die Tagesansicht wurde nach dem Speichern nicht
 * nachgeführt, und das Feld hiess nicht so, wie die Fehlermeldung es
 * nannte. Alle drei lagen zwischen Knopf und Datenbank, und genau dort
 * schaut diese Schicht hin.
 */

test.afterEach(aufraeumen);
test.afterAll(() => db.$disconnect());

test("Datum allein eintragen lässt den Saldo in der Tagesansicht erscheinen", async ({
  page,
  context,
}) => {
  const user = await angemeldet(context, "Saldo");

  // Vorher steht dort der Hinweis, nicht eine Zahl.
  await page.goto("/zeiten");
  await expect(page.getByText("Für den Saldo fehlt das Datum")).toBeVisible();

  await page.goto("/personen");
  const karte = page.locator("li", { hasText: user.name }).first();
  await karte.getByRole("button", { name: "Arbeitszeit und Saldo" }).click();

  // Nur das Datum, der mitgebrachte Saldo bleibt leer.
  await karte.getByLabel("IsoPilot rechnet ab").fill("2026-09-01");
  await karte.getByRole("button", { name: "Speichern", exact: true }).click();

  // Gespeichert heisst: es steht in der Datenbank, nicht nur auf dem Schirm.
  await expect
    .poll(async () => {
      const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      return u.balanceFrom?.toISOString().slice(0, 10) ?? null;
    })
    .toBe("2026-09-01");

  // Ein leeres Feld heisst "keiner mitgebracht", nicht "null Stunden".
  const nachher = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(nachher.startBalance).toBeNull();

  /* Und jetzt der Fehler, der dreimal gemeldet wurde: die Tagesansicht
   * muss die Zahl zeigen, nicht weiter den Hinweis. Genau hier hat das
   * fehlende Nachführen zugeschlagen. */
  await page.goto("/zeiten");
  await expect(page.getByText("Für den Saldo fehlt das Datum")).toHaveCount(0);
  await expect(page.getByText(/Zeitsaldo [+-]?[\d.,]+ h/)).toBeVisible();
  await expect(page.getByText("gerechnet ab 01.09.2026")).toBeVisible();
});

test("mitgebrachter Saldo wird mitgezählt und angezeigt", async ({ page, context }) => {
  const user = await angemeldet(context, "Mitgebracht");

  await page.goto("/personen");
  const karte = page.locator("li", { hasText: user.name }).first();
  await karte.getByRole("button", { name: "Arbeitszeit und Saldo" }).click();
  await karte.getByLabel("IsoPilot rechnet ab").fill("2026-09-14");
  await karte.getByLabel("mitgebrachter Saldo").fill("-4.5");
  await karte.getByRole("button", { name: "Speichern", exact: true }).click();

  await expect
    .poll(async () => {
      const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      return u.startBalance === null ? null : Number(u.startBalance);
    })
    .toBe(-4.5);

  await page.goto("/zeiten");
  await expect(page.getByText("einschliesslich Anfangssaldo")).toBeVisible();
});

test("ein Saldo ohne Datum wird abgewiesen, mit einer Meldung am Bildschirm", async ({
  page,
  context,
}) => {
  const user = await angemeldet(context, "OhneDatum");

  await page.goto("/personen");
  const karte = page.locator("li", { hasText: user.name }).first();
  await karte.getByRole("button", { name: "Arbeitszeit und Saldo" }).click();
  await karte.getByLabel("mitgebrachter Saldo").fill("12");
  await karte.getByRole("button", { name: "Speichern", exact: true }).click();

  // Eine Meldung, die sagt was fehlt, und nichts in der Datenbank.
  await expect(karte.getByRole("alert")).toContainText("ab wann IsoPilot rechnet");
  const nachher = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(nachher.balanceFrom).toBeNull();
});

test("das Pensum lässt sich eintragen und steht danach in der Liste", async ({
  page,
  context,
}) => {
  const user = await angemeldet(context, "Pensum");

  await page.goto("/personen");
  const karte = page.locator("li", { hasText: user.name }).first();
  await karte.getByRole("button", { name: "Arbeitszeit und Saldo" }).click();

  await karte.getByLabel("Stunden je Woche").fill("33.6");
  await karte.getByLabel("gültig ab").fill("2026-09-01");
  await karte.getByRole("button", { name: "Pensum eintragen" }).click();

  await expect
    .poll(async () => db.workload.count({ where: { userId: user.id } }))
    .toBe(1);

  await expect(
    page.locator("li", { hasText: user.name }).first(),
  ).toContainText("ab 01.09.2026: 33.6 Stunden je Woche");
});
