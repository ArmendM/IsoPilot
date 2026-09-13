import { defineConfig } from "vitest/config";

/* Drei Arten von Tests, siehe CLAUDE.md, Abschnitt "Tests". Getrennt
 * aufrufbar, damit man für eine Rechenregel nicht auf eine Datenbank
 * wartet. Heute gibt es nur die erste Schicht:
 *
 *   tests/einheit      reine Logik, nichts als Node, Sekunden
 *   tests/server       Server Actions gegen ein echtes Postgres  (offen)
 *   tests/oberflaeche  Browser gegen die laufende App, Playwright (offen)
 *
 * Die Zeitzone wird hier bewusst NICHT festgenagelt. Produktion läuft
 * laut Dockerfile auf Europe/Zurich, die CI auf UTC, und die Rechnungen
 * in lib/dates.ts müssen in beiden stimmen. Wer das hier pinnt, versteckt
 * genau den Fehler, den diese Tests finden sollen. */
export default defineConfig({
  // Löst @/… aus tsconfig.json auf. Vite kann das seit 8 selbst,
  // vite-tsconfig-paths braucht es dafür nicht mehr.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/einheit/**/*.test.ts"],
  },
});
