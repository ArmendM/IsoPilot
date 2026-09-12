import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Seit Prisma 7 verbindet der Client über einen Treiber-Adapter,
// die URL steht nicht mehr im Schema.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Ohne Singleton öffnet jeder Hot Reload neue Verbindungen,
// bis Postgres keine mehr annimmt.
const g = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  g.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") g.prisma = db;
