// One-off: creates one test login per role (in addition to the existing
// bootstrap admin), all scoped consistently to the SAME cost centre/base so
// a single budget can be walked through the entire 5-level approval chain
// during testing. Usernames match the ones already shown in the UXSAMPLE
// demo reference (location.user, station.incharge, etc.) for familiarity.
//
// Usage: npx tsx prisma/bootstrap-test-users.ts
// Safe to re-run: skips any username that already exists (does not reset
// passwords), same pattern as bootstrap-admin.ts.

import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../src/lib/prisma";
import { Role, ScopeType } from "@prisma/client";

const TEST_PASSWORD = "Test@1234";

async function main() {
  // Anchor every scoped test account to the same real cost centre so their
  // access grants actually overlap for a single test budget.
  const costCentre = await prisma.costCentre.findFirstOrThrow({ include: { base: true } });
  const region = await prisma.region.findFirstOrThrow();
  console.log(`Anchoring test accounts to ${costCentre.code} (${costCentre.name}), Base: ${costCentre.base.name}`);

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  const accounts: { username: string; role: Role; scopeType: ScopeType; scopeId: string | null }[] = [
    { username: "location.user", role: Role.LOCATION_USER, scopeType: ScopeType.LOCATION, scopeId: costCentre.id },
    { username: "station.incharge", role: Role.STATION_INCHARGE, scopeType: ScopeType.LOCATION, scopeId: costCentre.id },
    { username: "base.incharge", role: Role.BASE_INCHARGE, scopeType: ScopeType.BASE, scopeId: costCentre.baseId },
    { username: "ts.dept", role: Role.TS_DEPT, scopeType: ScopeType.REGION, scopeId: region.id },
    { username: "finance.dept", role: Role.FINANCE_DEPT, scopeType: ScopeType.ALL, scopeId: null },
  ];

  const created: { username: string; role: Role; scope: string }[] = [];

  for (const acc of accounts) {
    const existing = await prisma.user.findUnique({ where: { username: acc.username } });
    if (existing) {
      console.log(`Skipping "${acc.username}" — already exists.`);
      continue;
    }
    await prisma.user.create({
      data: {
        username: acc.username,
        passwordHash,
        isActive: true,
        access: { create: { role: acc.role, scopeType: acc.scopeType, scopeId: acc.scopeId } },
      },
    });
    const scopeLabel =
      acc.scopeType === ScopeType.ALL
        ? "ALL"
        : acc.scopeType === ScopeType.BASE
          ? `BASE (${costCentre.base.name})`
          : acc.scopeType === ScopeType.REGION
            ? `REGION (${region.name})`
            : `LOCATION (${costCentre.code})`;
    created.push({ username: acc.username, role: acc.role, scope: scopeLabel });
    console.log(`Created "${acc.username}" — ${acc.role} @ ${scopeLabel}`);
  }

  console.log(`\nDone. Password for all test accounts: ${TEST_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
