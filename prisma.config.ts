import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Seit Prisma 7 steht die Verbindung nicht mehr im Schema, sondern hier.
// Die Anwendung selbst verbindet über den Adapter in src/lib/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
