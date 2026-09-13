import { config } from "dotenv";

/* Muss laufen, BEVOR irgendetwas @/lib/db importiert: dort wird der
 * Prisma-Client schon beim Import mit process.env.DATABASE_URL gebaut.
 * Deshalb eine eigene Datei, die in setup.ts als erste importiert wird.
 * Steht der dotenv-Aufruf erst im Rumpf von setup.ts, ist er zu spät,
 * und die Tests laufen gegen die Standarddatenbank des Betriebssystems. */
config({ path: ".env.test", override: true, quiet: true });

const url = process.env.DATABASE_URL ?? "";
const datenbank = url ? decodeURIComponent(new URL(url).pathname.slice(1)) : "";

/* Eine Bremse, bevor etwas gelöscht wird: diese Schicht leert zwischen
 * den Tests alle Tabellen. Zeigt sie auf die Entwicklungsdatenbank, sind
 * echte Zeiteinträge weg. */
if (!/test/i.test(datenbank)) {
  throw new Error(
    `tests/server läuft gegen die Datenbank "${datenbank || "(keine)"}". ` +
      `Erwartet wird eine, deren Name "test" enthält. Anzulegen mit:\n` +
      `  createdb isopilot_test\n` +
      `  cp .env.test.example .env.test\n` +
      `  DATABASE_URL=… npx prisma migrate deploy`,
  );
}
