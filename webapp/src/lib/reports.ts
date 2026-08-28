import { prisma } from "@/lib/prisma";
import { getAccessibleCostCentreIds } from "@/lib/rbac";
import { getActiveCycle } from "@/lib/cycle";
import { previousFinancialYear } from "@/lib/labels";
import { getSubHeadRateUomMap } from "@/lib/sub-head-rate-uom";
import { rbeAmount, beAmount, resolveRate, type BroadPnlHeadCode } from "@/lib/entry-amount";
import { Prisma, UserAccess } from "@prisma/client";

export type ReportFilters = {
  pipeline?: string;
  companyCode?: string;
  location?: string;
  cycleId?: string;
};

export type ReportRow = {
  costCentre: { id: string; code: string; name: string; pipelineCode: string };
  lyActual: number;
  approvedBE: number;
  proposedRBE: number;
  proposedBE: number;
};

export type ReportData = {
  cycle: { id: string; financialYearRBE: string; financialYearBE: string } | null;
  rows: ReportRow[];
  grand: { lyActual: number; approvedBE: number; proposedRBE: number; proposedBE: number };
};

/**
 * Shared aggregation behind both /reports (on-screen) and /reports/export
 * (Excel download) — one implementation so the two never drift apart.
 * "LY Actual" / "Approved BE" come from the admin's separate LY Actual /
 * Approved BE uploads (see src/lib/actuals.ts) — each is single-purpose, so
 * unlike the original combined workbook there's no sheet-name classification
 * needed. Cycle defaults to the one open (admin-controlled) cycle unless a
 * specific cycleId filter is passed (e.g. to view a past cycle's report).
 */
export async function getReportData(userAccess: UserAccess[], filters: ReportFilters): Promise<ReportData> {
  const accessibleIds = await getAccessibleCostCentreIds(userAccess);
  const scopeWhere: Prisma.CostCentreWhereInput = accessibleIds === "ALL" ? {} : { id: { in: accessibleIds } };

  const filterWhere: Prisma.CostCentreWhereInput = {
    ...scopeWhere,
    ...(filters.pipeline ? { pipelineId: filters.pipeline } : {}),
    ...(filters.companyCode ? { companyCodeId: filters.companyCode } : {}),
    ...(filters.location ? { id: filters.location } : {}),
  };

  const costCentres = await prisma.costCentre.findMany({
    where: filterWhere,
    include: { pipeline: true },
    orderBy: { code: "asc" },
  });
  const costCentreIds = costCentres.map((c) => c.id);
  const costCentreByCode = new Map(costCentres.map((c) => [c.code, c]));

  const cycle = filters.cycleId ? await prisma.budgetCycle.findUnique({ where: { id: filters.cycleId } }) : await getActiveCycle();

  const headers = cycle
    ? await prisma.budgetHeader.findMany({
        where: { costCentreId: { in: costCentreIds }, cycleId: cycle.id, status: { not: "DRAFT" } },
        include: { entries: { include: { subHead: { include: { budgetHead: true } } } } },
      })
    : [];

  // Live Power/Chemical rate lookup (pre-approval — see entry-amount.ts / the "Rate
  // change impact" decision) for every Power/Chemical Sub Head touched by
  // these headers, so Proposed RBE/BE here matches exactly what Create
  // Budget/Approve Budget show, not just the R&M Material+Service figure.
  const touchedSubHeadIds = [...new Set(headers.flatMap((h) => h.entries.map((e) => e.subHeadId)))];
  const rateUomMap = cycle ? await getSubHeadRateUomMap(touchedSubHeadIds, cycle) : {};

  // Not filtered by fiscalYear at the query level: LY_ACTUAL rows are tagged
  // with the FY *before* the cycle's RBE year, APPROVED_BE with the RBE year
  // itself — a single fiscalYear filter would silently drop one or the
  // other. Each dataType is matched to its own correct fiscal year below
  // (fixed 2026-08-25, the same "top cards show zero"/wrong-total bug class
  // as Create/Approve/Home — see budgets/[id]/page.tsx and (app)/page.tsx),
  // mirroring sub-head-actuals.ts's getSubHeadActualsMap so Reports can't
  // drift from what Create/Approve/Home show for the same Cost Centre.
  const actualsRows = cycle
    ? await prisma.actualsRow.findMany({
        where: { costCentreCode: { in: costCentres.map((c) => c.code) } },
      })
    : [];
  const lyFy = cycle ? previousFinancialYear(cycle.financialYearRBE) : null;

  type Totals = { lyActual: number; approvedBE: number; proposedRBE: number; proposedBE: number };
  const byCostCentre = new Map<string, Totals>();
  const get = (id: string) => byCostCentre.get(id) ?? { lyActual: 0, approvedBE: 0, proposedRBE: 0, proposedBE: 0 };

  for (const h of headers) {
    const t = get(h.costCentreId);
    for (const e of h.entries) {
      const broadPnlHead: BroadPnlHeadCode = e.subHead.budgetHead.broadPnlHead;
      const live = rateUomMap[e.subHeadId];
      const rbeRate = resolveRate(broadPnlHead, Number(e.rbeRate), live?.rbeRate, h.status);
      const beRate = resolveRate(broadPnlHead, Number(e.beRate), live?.beRate, h.status);
      t.proposedRBE += rbeAmount(
        { rbeMaterial: Number(e.rbeMaterial), rbeService: Number(e.rbeService), rbeQty: Number(e.rbeQty), rbeRate, beMaterial: 0, beService: 0, beQty: 0, beRate: 0 },
        broadPnlHead
      );
      t.proposedBE += beAmount(
        { beMaterial: Number(e.beMaterial), beService: Number(e.beService), beQty: Number(e.beQty), beRate, rbeMaterial: 0, rbeService: 0, rbeQty: 0, rbeRate: 0 },
        broadPnlHead
      );
    }
    byCostCentre.set(h.costCentreId, t);
  }
  for (const r of actualsRows) {
    const cc = costCentreByCode.get(r.costCentreCode);
    if (!cc) continue;
    const t = get(cc.id);
    if (r.dataType === "LY_ACTUAL" && r.fiscalYear === lyFy) t.lyActual += Number(r.amount);
    else if (r.dataType === "APPROVED_BE" && r.fiscalYear === cycle?.financialYearRBE) t.approvedBE += Number(r.amount);
    byCostCentre.set(cc.id, t);
  }

  const rows: ReportRow[] = costCentres
    .filter((c) => byCostCentre.has(c.id))
    .map((c) => {
      const t = byCostCentre.get(c.id)!;
      return { costCentre: { id: c.id, code: c.code, name: c.name, pipelineCode: c.pipeline.code }, ...t };
    });

  const grand = rows.reduce(
    (acc, r) => ({
      lyActual: acc.lyActual + r.lyActual,
      approvedBE: acc.approvedBE + r.approvedBE,
      proposedRBE: acc.proposedRBE + r.proposedRBE,
      proposedBE: acc.proposedBE + r.proposedBE,
    }),
    { lyActual: 0, approvedBE: 0, proposedRBE: 0, proposedBE: 0 }
  );

  return { cycle, rows, grand };
}
