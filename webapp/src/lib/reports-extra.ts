import { prisma } from "@/lib/prisma";
import { getAccessibleCostCentreIds } from "@/lib/rbac";
import { getActiveCycle } from "@/lib/cycle";
import { getActualsMapForCostCentres, type SubHeadActuals } from "@/lib/sub-head-actuals";
import { getSubHeadRateUomMap } from "@/lib/sub-head-rate-uom";
import { resolveRate, rbeAmount, beAmount, type BroadPnlHeadCode } from "@/lib/entry-amount";
import { STATUS_LABELS } from "@/lib/workflow";
import { Prisma, UserAccess, BudgetStatus } from "@prisma/client";

// Additional read-only Reports tabs, added 2026-08-26 per the user's
// UXSAMPLE/SERPL_Report_Formats (1).xlsx reference — pure information
// dissemination, no change to the workflow/state machine or to any of the
// existing shared computation helpers (resolveRate, rbeAmount/beAmount,
// getActualsMapForCostCentres) they all reuse exactly as Create/Approve
// Budget do, so figures here can never drift from those screens. Deliberately
// kept separate from lib/reports.ts (the original Summary report + its
// Excel export) rather than folding in, so that existing file/behavior is
// untouched.

export type ExtraReportFilters = {
  pipeline?: string;
  base?: string;
  location?: string;
  cycleId?: string;
};

async function resolveScope(userAccess: UserAccess[], filters: ExtraReportFilters) {
  const accessibleIds = await getAccessibleCostCentreIds(userAccess);
  const scopeWhere: Prisma.CostCentreWhereInput = accessibleIds === "ALL" ? {} : { id: { in: accessibleIds } };
  const filterWhere: Prisma.CostCentreWhereInput = {
    ...scopeWhere,
    ...(filters.pipeline ? { pipelineId: filters.pipeline } : {}),
    ...(filters.base ? { baseId: filters.base } : {}),
    ...(filters.location ? { id: filters.location } : {}),
  };
  const costCentres = await prisma.costCentre.findMany({
    where: filterWhere,
    include: { pipeline: true, base: true, companyCode: true },
    orderBy: { code: "asc" },
  });
  const cycle = filters.cycleId ? await prisma.budgetCycle.findUnique({ where: { id: filters.cycleId } }) : await getActiveCycle();
  return { costCentres, cycle };
}

/** Filter-dropdown options (Pipeline/Base/Location/Cycle) for the new report tabs' shared ExtraReportFilterBar, scoped to the viewer's access. */
export async function getExtraReportFilterOptions(userAccess: UserAccess[], filters: Pick<ExtraReportFilters, "pipeline" | "base">) {
  const accessibleIds = await getAccessibleCostCentreIds(userAccess);
  const scopeWhere: Prisma.CostCentreWhereInput = accessibleIds === "ALL" ? {} : { id: { in: accessibleIds } };

  const [pipelines, cycles] = await Promise.all([
    prisma.pipeline.findMany({ where: { costCentres: { some: scopeWhere } }, orderBy: { code: "asc" } }),
    prisma.budgetCycle.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const baseFilterWhere: Prisma.CostCentreWhereInput = { ...scopeWhere, ...(filters.pipeline ? { pipelineId: filters.pipeline } : {}) };
  const bases = await prisma.base.findMany({ where: { costCentres: { some: baseFilterWhere } }, orderBy: { name: "asc" } });
  const locationFilterWhere: Prisma.CostCentreWhereInput = { ...baseFilterWhere, ...(filters.base ? { baseId: filters.base } : {}) };
  const locations = await prisma.costCentre.findMany({ where: locationFilterWhere, orderBy: { code: "asc" } });

  return { pipelines, bases, locations, cycles };
}

/** A row counts as worth showing when there's any real figure behind it — mirrors the same "hasAnyActuals" convention used in Create Budget's Reference table and Approve Budget's Category Summary, rather than a blanket cross-product of every Cost Centre x every Sub Head. */
function hasSignal(a: SubHeadActuals | undefined, proposed: boolean): boolean {
  return proposed || (!!a && (a.lyActual !== 0 || a.approvedBe !== 0 || a.ytdActual !== 0));
}

// ── 1. R&M Fund-wise Report ─────────────────────────────────────────────

export type RmFundWiseRow = {
  costCentreCode: string;
  costCentreName: string;
  budgetHeadName: string;
  subHeadCode: string;
  subHeadName: string;
  lyActual: number;
  approvedBe: number;
  ytdActual: number;
  rbe: number;
  be: number;
};

export async function getRmFundWiseReport(userAccess: UserAccess[], filters: ExtraReportFilters) {
  const { costCentres, cycle } = await resolveScope(userAccess, filters);
  if (!cycle) return { cycle: null, rows: [] as RmFundWiseRow[] };

  const costCentreCodes = costCentres.map((c) => c.code);
  const rmSubHeads = await prisma.budgetSubHead.findMany({
    where: { budgetHead: { broadPnlHead: "RM" } },
    include: { budgetHead: true },
    orderBy: [{ budgetHead: { name: "asc" } }, { code: "asc" }],
  });

  const [actualsMap, headers] = await Promise.all([
    getActualsMapForCostCentres(costCentreCodes, cycle),
    prisma.budgetHeader.findMany({
      where: { costCentreId: { in: costCentres.map((c) => c.id) }, cycleId: cycle.id, status: { not: BudgetStatus.DRAFT } },
      include: { entries: { include: { subHead: true } } },
    }),
  ]);

  const costCentreCodeById = new Map(costCentres.map((c) => [c.id, c.code]));
  const proposedByCcSub = new Map<string, Map<string, { rbe: number; be: number }>>();
  for (const h of headers) {
    const ccCode = costCentreCodeById.get(h.costCentreId);
    if (!ccCode) continue;
    const ccMap = proposedByCcSub.get(ccCode) ?? new Map<string, { rbe: number; be: number }>();
    for (const e of h.entries) {
      const rbe = Number(e.rbeMaterial) + Number(e.rbeService);
      const be = Number(e.beMaterial) + Number(e.beService);
      if (rbe === 0 && be === 0) continue; // Power/Chemical rows on a mixed header — R&M-only report
      const cur = ccMap.get(e.subHead.code) ?? { rbe: 0, be: 0 };
      cur.rbe += rbe;
      cur.be += be;
      ccMap.set(e.subHead.code, cur);
    }
    proposedByCcSub.set(ccCode, ccMap);
  }

  const rows: RmFundWiseRow[] = [];
  for (const cc of costCentres) {
    const ccActuals = actualsMap[cc.code] ?? {};
    const ccProposed = proposedByCcSub.get(cc.code);
    for (const sh of rmSubHeads) {
      const a = ccActuals[sh.code];
      const p = ccProposed?.get(sh.code);
      if (!hasSignal(a, !!p)) continue;
      rows.push({
        costCentreCode: cc.code,
        costCentreName: cc.name,
        budgetHeadName: sh.budgetHead.name,
        subHeadCode: sh.code,
        subHeadName: sh.name,
        lyActual: a?.lyActual ?? 0,
        approvedBe: a?.approvedBe ?? 0,
        ytdActual: a?.ytdActual ?? 0,
        rbe: p?.rbe ?? 0,
        be: p?.be ?? 0,
      });
    }
  }

  return { cycle, rows };
}

// ── 2. R&M Compiled Report (entry-level detail) ─────────────────────────

export type RmCompiledRow = {
  pipelineCode: string;
  baseName: string;
  costCentreCode: string;
  costCentreName: string;
  budgetHeadName: string;
  subHeadCode: string;
  subHeadName: string;
  workType: string;
  recurringOneTime: string;
  lyActual: number;
  approvedBe: number;
  ytdActual: number;
  rbeMaterial: number;
  rbeService: number;
  rbeTotal: number;
  beMaterial: number;
  beService: number;
  beTotal: number;
  justification: string;
  status: string;
};

export async function getRmCompiledReport(userAccess: UserAccess[], filters: ExtraReportFilters) {
  const { costCentres, cycle } = await resolveScope(userAccess, filters);
  if (!cycle) return { cycle: null, rows: [] as RmCompiledRow[] };

  const costCentreCodes = costCentres.map((c) => c.code);
  const [actualsMap, headers] = await Promise.all([
    getActualsMapForCostCentres(costCentreCodes, cycle),
    prisma.budgetHeader.findMany({
      where: { costCentreId: { in: costCentres.map((c) => c.id) }, cycleId: cycle.id },
      include: {
        costCentre: { include: { pipeline: true, base: true } },
        entries: { include: { subHead: { include: { budgetHead: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
  ]);

  const rows: RmCompiledRow[] = [];
  for (const h of headers) {
    const ccActuals = actualsMap[h.costCentre.code] ?? {};
    for (const e of h.entries) {
      if (e.subHead.budgetHead.broadPnlHead !== "RM") continue;
      const a = ccActuals[e.subHead.code];
      const rbeMaterial = Number(e.rbeMaterial);
      const rbeService = Number(e.rbeService);
      const beMaterial = Number(e.beMaterial);
      const beService = Number(e.beService);
      rows.push({
        pipelineCode: h.costCentre.pipeline.code,
        baseName: h.costCentre.base.name,
        costCentreCode: h.costCentre.code,
        costCentreName: h.costCentre.name,
        budgetHeadName: e.subHead.budgetHead.name,
        subHeadCode: e.subHead.code,
        subHeadName: e.subHead.name,
        workType: e.workType,
        recurringOneTime: e.recurringOneTime,
        lyActual: a?.lyActual ?? 0,
        approvedBe: a?.approvedBe ?? 0,
        ytdActual: a?.ytdActual ?? 0,
        rbeMaterial,
        rbeService,
        rbeTotal: rbeMaterial + rbeService,
        beMaterial,
        beService,
        beTotal: beMaterial + beService,
        justification: e.justification,
        status: STATUS_LABELS[h.status],
      });
    }
  }

  return { cycle, rows };
}

// ── 3/4. Power & Fuel / Chemical Report (shared: both are Qty x Rate) ───

export type QtyRateReportRow = {
  costCentreCode: string;
  costCentreName: string;
  subHeadCode: string;
  subHeadName: string;
  uom: string | null;
  lyActual: number;
  approvedBe: number;
  ytdActual: number;
  rbeQty: number;
  rbeRate: number;
  rbeAmount: number;
  beQty: number;
  beRate: number;
  beAmount: number;
};

export async function getQtyRateReport(broadPnlHead: BroadPnlHeadCode, userAccess: UserAccess[], filters: ExtraReportFilters) {
  const { costCentres, cycle } = await resolveScope(userAccess, filters);
  if (!cycle) return { cycle: null, rows: [] as QtyRateReportRow[] };

  const costCentreCodes = costCentres.map((c) => c.code);
  const subHeads = await prisma.budgetSubHead.findMany({
    where: { budgetHead: { broadPnlHead } },
    orderBy: { code: "asc" },
  });
  const subHeadIds = subHeads.map((s) => s.id);
  const subHeadIdSet = new Set(subHeadIds);

  const [actualsMap, rateUomMap, headers] = await Promise.all([
    getActualsMapForCostCentres(costCentreCodes, cycle),
    getSubHeadRateUomMap(subHeadIds, cycle),
    prisma.budgetHeader.findMany({
      where: { costCentreId: { in: costCentres.map((c) => c.id) }, cycleId: cycle.id, status: { not: BudgetStatus.DRAFT } },
      include: { entries: { include: { subHead: true } } },
    }),
  ]);

  const costCentreCodeById = new Map(costCentres.map((c) => [c.id, c.code]));
  type Accum = { rbeQty: number; rbeAmt: number; beQty: number; beAmt: number };
  const proposedByCcSub = new Map<string, Map<string, Accum>>();
  for (const h of headers) {
    const ccCode = costCentreCodeById.get(h.costCentreId);
    if (!ccCode) continue;
    const ccMap = proposedByCcSub.get(ccCode) ?? new Map<string, Accum>();
    for (const e of h.entries) {
      if (!subHeadIdSet.has(e.subHeadId)) continue;
      const rateUom = rateUomMap[e.subHeadId];
      const rbeRate = resolveRate(broadPnlHead, Number(e.rbeRate), rateUom?.rbeRate, h.status);
      const beRate = resolveRate(broadPnlHead, Number(e.beRate), rateUom?.beRate, h.status);
      const rbeQty = Number(e.rbeQty);
      const beQty = Number(e.beQty);
      const cur = ccMap.get(e.subHead.code) ?? { rbeQty: 0, rbeAmt: 0, beQty: 0, beAmt: 0 };
      cur.rbeQty += rbeQty;
      cur.rbeAmt += rbeQty * rbeRate;
      cur.beQty += beQty;
      cur.beAmt += beQty * beRate;
      ccMap.set(e.subHead.code, cur);
    }
    proposedByCcSub.set(ccCode, ccMap);
  }

  const rows: QtyRateReportRow[] = [];
  for (const cc of costCentres) {
    const ccActuals = actualsMap[cc.code] ?? {};
    const ccProposed = proposedByCcSub.get(cc.code);
    for (const sh of subHeads) {
      const a = ccActuals[sh.code];
      const p = ccProposed?.get(sh.code);
      if (!hasSignal(a, !!p)) continue;
      rows.push({
        costCentreCode: cc.code,
        costCentreName: cc.name,
        subHeadCode: sh.code,
        subHeadName: sh.name,
        uom: rateUomMap[sh.id]?.uom ?? null,
        lyActual: a?.lyActual ?? 0,
        approvedBe: a?.approvedBe ?? 0,
        ytdActual: a?.ytdActual ?? 0,
        rbeQty: p?.rbeQty ?? 0,
        rbeRate: p && p.rbeQty !== 0 ? p.rbeAmt / p.rbeQty : 0,
        rbeAmount: p?.rbeAmt ?? 0,
        beQty: p?.beQty ?? 0,
        beRate: p && p.beQty !== 0 ? p.beAmt / p.beQty : 0,
        beAmount: p?.beAmt ?? 0,
      });
    }
  }

  return { cycle, rows };
}

// ── 5. Cost Centre Wise Status Report ───────────────────────────────────

export type CostCentreStatusRow = {
  costCentreCode: string;
  costCentreName: string;
  companyCode: string;
  pipelineCode: string;
  baseName: string;
  status: string;
};

export async function getCostCentreStatusReport(userAccess: UserAccess[], filters: Pick<ExtraReportFilters, "pipeline" | "base">) {
  const { costCentres, cycle } = await resolveScope(userAccess, filters);

  const headers = cycle
    ? await prisma.budgetHeader.findMany({ where: { costCentreId: { in: costCentres.map((c) => c.id) }, cycleId: cycle.id } })
    : [];
  const statusByCc = new Map(headers.map((h) => [h.costCentreId, h.status]));

  const rows: CostCentreStatusRow[] = costCentres.map((cc) => {
    const status = statusByCc.get(cc.id);
    return {
      costCentreCode: cc.code,
      costCentreName: cc.name,
      companyCode: cc.companyCode.code,
      pipelineCode: cc.pipeline.code,
      baseName: cc.base.name,
      status: status ? STATUS_LABELS[status] : "No Proposal Yet",
    };
  });

  return { cycle, rows };
}
