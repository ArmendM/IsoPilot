import { config } from "dotenv";
import { defineConfig } from "@playwright/test";

/* Playwright lädt `.env` nicht von sich aus, anders als Next. Ohne das
 * zeigt der Prisma-Client der Tests auf die Standarddatenbank des
 * Betriebssystems, und die Meldung lautet nur "Database does not exist". */
config({ quiet: true });

/* Die dritte Art Test, siehe CLAUDE.md: Formulare, Anzeige, Wechsel
 * zwischen Datensätzen. Sie ist die teuerste und zugleich die, die
 * bisher die echten Fehler gefunden hat.
 *
 * Getrennt von Vitest aufrufbar, `npm run test:browser`: für eine reine
 * Rechenregel soll niemand auf einen Browser warten. */
export default defineConfig({
  testDir: "tests/oberflaeche",
  // Ein Arbeiter: die Tests schreiben in dieselbe Datenbank.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    // Der Browser ist der Punkt der Übung, headless reicht dafür.
    trace: "retain-on-failure",
  },
});
