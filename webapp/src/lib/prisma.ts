import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires a driver adapter at runtime (the schema.prisma
// `datasource` block no longer carries a connection URL — see
// prisma.config.ts for the Migrate-side connection, and CLAUDE.md §8 for
// the local Postgres connection details).
const adapter = new PrismaPg(process.env.DATABASE_URL!);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// Reuse the client across hot reloads in dev so we don't exhaust the
// Postgres connection pool.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
