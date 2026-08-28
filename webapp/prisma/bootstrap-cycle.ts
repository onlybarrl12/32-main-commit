// One-off: creates the current BudgetCycle (RBE 2026-27 / BE 2027-28, per
// CLAUDE.md §1) so Create Budget has something to write against before the
// Settings screen (under Masters, §9 step 14/§7) exists to manage cycles
// properly. Safe to re-run — upserts on the [financialYearRBE, financialYearBE]
// unique constraint.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const cycle = await prisma.budgetCycle.upsert({
    where: { financialYearRBE_financialYearBE: { financialYearRBE: "2026-27", financialYearBE: "2027-28" } },
    update: {},
    create: { financialYearRBE: "2026-27", financialYearBE: "2027-28", isOpen: true },
  });
  console.log("Budget cycle ready:", cycle);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
