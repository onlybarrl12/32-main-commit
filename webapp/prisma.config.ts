import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved Migrate's connection URL out of schema.prisma and into
// this config file (see CLAUDE.md §8 for the local Postgres connection
// details). The PrismaClient used by application code at runtime is
// configured separately with a driver adapter — see src/lib/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
    shadowDatabaseUrl: env("SHADOW_DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
