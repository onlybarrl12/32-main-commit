// One-off: creates a single ADMIN user so someone can log in and use the
// Authorization module (§9 step 8) to grant real roles to everyone else.
// Not part of prisma/seed.ts on purpose — seed.ts is reference/master data
// from the Excel workbook and is safe to re-run anytime; this touches
// login credentials and should not run unattended as part of that.
//
// Usage: npm run db:bootstrap-admin
// Optional env overrides: ADMIN_BOOTSTRAP_USERNAME, ADMIN_BOOTSTRAP_PASSWORD
//
// Safe to re-run: if the user already exists, the password is NOT reset
// (so re-running this doesn't lock you out by silently rotating it) —
// delete the row yourself first if you actually need to reset it.

import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "../src/lib/prisma";

const USERNAME = process.env.ADMIN_BOOTSTRAP_USERNAME || "admin";

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: USERNAME } });
  if (existing) {
    console.log(
      `Admin user "${USERNAME}" already exists (id=${existing.id}) — leaving password as-is. ` +
        `Delete the row yourself if you need to reset it.`
    );
    return;
  }

  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || crypto.randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      username: USERNAME,
      passwordHash,
      isActive: true,
      access: { create: { role: "ADMIN", scopeType: "ALL" } },
    },
  });

  console.log("Bootstrap admin created — store these credentials now, they will not be printed again:");
  console.log(`  username: ${USERNAME}`);
  console.log(`  password: ${password}`);
  console.log(`  userId:   ${user.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
