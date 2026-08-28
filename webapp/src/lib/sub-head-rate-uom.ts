import { prisma } from "@/lib/prisma";
import type { CycleLike } from "@/lib/labels";

export type SubHeadRateUom = { uom: string | null; rbeRate: number | null; beRate: number | null };

/**
 * Admin-maintained UOM (Power + Chemical Sub Heads) and per-fiscal-year Rate
 * (Chemical Sub Heads only) for a set of Budget Sub Heads, resolved against
 * one cycle's RBE-year and BE-year fiscal years. Called fresh on every
 * Create Budget page render / save — this IS the "live-linked until
 * approval" behavior (see MAIN_SHEET_REWORK_PLAN.md's addendum): there is no
 * caching, so an admin's Rate edit is reflected the moment anyone next
 * views or saves a not-yet-approved proposal.
 */
export async function getSubHeadRateUomMap(
  subHeadIds: string[],
  cycle: CycleLike
): Promise<Record<string, SubHeadRateUom>> {
  if (subHeadIds.length === 0) return {};

  const [uoms, rates] = await Promise.all([
    prisma.subHeadUom.findMany({ where: { subHeadId: { in: subHeadIds } } }),
    prisma.subHeadRate.findMany({
      where: { subHeadId: { in: subHeadIds }, fiscalYear: { in: [cycle.financialYearRBE, cycle.financialYearBE] } },
    }),
  ]);

  const map: Record<string, SubHeadRateUom> = {};
  const get = (id: string) => (map[id] ??= { uom: null, rbeRate: null, beRate: null });

  for (const u of uoms) get(u.subHeadId).uom = u.uom;
  for (const r of rates) {
    const entry = get(r.subHeadId);
    const rate = Number(r.rate);
    if (r.fiscalYear === cycle.financialYearRBE) entry.rbeRate = rate;
    if (r.fiscalYear === cycle.financialYearBE) entry.beRate = rate;
  }

  return map;
}
