import { defineConfig } from "vitest/config";

/* Drei Arten von Tests, siehe CLAUDE.md, Abschnitt "Tests". Getrennt
 * aufrufbar, damit man für eine Rechenregel nicht auf eine Datenbank
 * wartet:
 *
 *   einheit  reine Logik, nichts als Node, Millisekunden   npm test
 *   server   Server Actions gegen ein echtes Postgres      npm run test:server
 *   (offen)  Browser gegen die laufende App, Playwright
 *
 * Die Zeitzone wird hier bewusst NICHT festgenagelt. Produktion läuft
 * laut Dockerfile auf Europe/Zurich, die CI auf UTC, und die Rechnungen
 * in lib/dates.ts müssen in beiden stimmen. Wer das hier pinnt, versteckt
 * genau den Fehler, den diese Tests finden sollen. */
export default defineConfig({
  test: {
    projects: [
      {
        // Vite löst @/… seit 8 selbst aus der tsconfig auf.
        resolve: { tsconfigPaths: true },
        test: {
          name: "einheit",
          environment: "node",
          include: ["tests/einheit/**/*.test.ts"],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "server",
          environment: "node",
          include: ["tests/server/**/*.test.ts"],
          setupFiles: ["tests/server/setup.ts"],
          // Eine Datenbank, geleert zwischen den Dateien. Parallel liefen
          // sie sich gegenseitig die Tabellen leer.
          fileParallelism: false,
        },
      },
    ],
  },
});
