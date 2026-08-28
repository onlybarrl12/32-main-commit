import { prisma } from "@/lib/prisma";
import { previousFinancialYear } from "@/lib/labels";
import { ActualsDataType } from "@prisma/client";

export type SubHeadActuals = { lyActual: number; approvedBe: number; ytdActual: number };

/**
 * Per-Budget-Sub-Head reference figures (LY Actual / Approved BE / YTD
 * Actual) for one Cost Centre under one cycle — the read-only figures shown
 * in Create Budget's Sub Head summary, and the values Proposed RBE/BE
 * fall back to / are validated against (see EntryGrid.tsx, actions.ts).
 * LY Actual matches the FY before the cycle's current (RBE) FY; Approved BE
 * and YTD Actual match the cycle's current (RBE) FY.
 */
export async function getSubHeadActualsMap(
  costCentreCode: string,
  cycle: { financialYearRBE: string }
): Promise<Record<string, SubHeadActuals>> {
  const byCostCentre = await getActualsMapForCostCentres([costCentreCode], cycle);
  return byCostCentre[costCentreCode] ?? {};
}

/**
 * Same figures as getSubHeadActualsMap, for many Cost Centres in one query —
 * used by the multi-location Reports tabs (R&M Fund-wise, Power & Fuel,
 * Chemical) added 2026-08-26, which need this per Cost Centre rather than
 * one at a time. Kept as a separate function (getSubHeadActualsMap now
 * delegates to it for a single Cost Centre) rather than changing
 * getSubHeadActualsMap's signature, so Create Budget/Approve Budget's
 * existing call sites are untouched.
 */
export async function getActualsMapForCostCentres(
  costCentreCodes: string[],
  cycle: { financialYearRBE: string }
): Promise<Record<string, Record<string, SubHeadActuals>>> {
  if (costCentreCodes.length === 0) return {};
  const lyFy = previousFinancialYear(cycle.financialYearRBE);
  const rows = await prisma.actualsRow.findMany({ where: { costCentreCode: { in: costCentreCodes } } });

  const byCostCentre: Record<string, Record<string, SubHeadActuals>> = {};
  const get = (costCentreCode: string, subHeadCode: string) => {
    const ccMap = (byCostCentre[costCentreCode] ??= {});
    return (ccMap[subHeadCode] ??= { lyActual: 0, approvedBe: 0, ytdActual: 0 });
  };

  for (const r of rows) {
    const amount = Number(r.amount);
    if (r.dataType === ActualsDataType.LY_ACTUAL && r.fiscalYear === lyFy) {
      get(r.costCentreCode, r.subHeadCode).lyActual += amount;
    } else if (r.dataType === ActualsDataType.APPROVED_BE && r.fiscalYear === cycle.financialYearRBE) {
      get(r.costCentreCode, r.subHeadCode).approvedBe += amount;
    } else if (r.dataType === ActualsDataType.YTD_ACTUAL && r.fiscalYear === cycle.financialYearRBE) {
      get(r.costCentreCode, r.subHeadCode).ytdActual += amount;
    }
  }

  return byCostCentre;
}
