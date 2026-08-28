import { BroadPnlHead, Role } from "@prisma/client";

// Single source of truth for display terminology, per the terminology
// mandate (2026-08-21 rework): SIC / BIC / Base/LOC / Budget Sub Head used
// consistently everywhere — no loose "Description"/"Category" labels, no
// inconsistent full-name-vs-abbreviation switching between screens.

/** Short role labels, matching MAIN SHEET's own approval matrix column text. */
export const ROLE_LABELS: Record<Role, string> = {
  LOCATION_USER: "Location User",
  STATION_INCHARGE: "SIC",
  BASE_INCHARGE: "BIC",
  TS_DEPT: "TS Department",
  FINANCE_DEPT: "Finance Department",
  ADMIN: "Admin",
};

/** Full names, for first-mention/reference contexts (e.g. the Roles tab). */
export const ROLE_FULL_NAMES: Record<Role, string> = {
  LOCATION_USER: "Location User",
  STATION_INCHARGE: "Station In-charge (SIC)",
  BASE_INCHARGE: "Base In-charge (BIC)",
  TS_DEPT: "Technical Services (TS) Department",
  FINANCE_DEPT: "Finance Department",
  ADMIN: "Admin",
};

export const BROAD_PNL_HEAD_LABELS: Record<BroadPnlHead, string> = {
  RM: "R & M",
  POWER: "Power",
  CHEMICAL: "Chemical",
};

/** "Base" is always displayed as "Base/LOC" per the terminology mandate. */
export const BASE_LOC_LABEL = "Base/LOC";

/** "Budget Sub Head" — never "Line Item"/"Item Description"/bare "Description". */
export const BUDGET_SUB_HEAD_LABEL = "Budget Sub Head";

export type CycleLike = { financialYearRBE: string; financialYearBE: string };

/**
 * "2026-27" -> "2025-26" — used to look up LY Actual (last FY) against a
 * cycle's current-FY (RBE) year. Lives here (not cycle.ts) so labels.ts can
 * use it for lyFyLabel below without a circular import (cycle.ts imports
 * CycleLike from this file).
 */
export function previousFinancialYear(fy: string): string {
  const m = /^(\d{4})-(\d{2,4})$/.exec(fy.trim());
  if (!m) return fy;
  const startYear = Number(m[1]) - 1;
  const endYY = String(startYear + 1).slice(-2);
  return `${startYear}-${endYY}`;
}

/** "2026-27" -> "FY 26-27" — the short two-digit-year form used for every dynamic FY-labeled figure app-wide (see the 2026-08-25 "replace CFY/NFY with actual years" fix). */
function shortFy(fy: string): string {
  const m = /^(\d{4})-(\d{2,4})$/.exec(fy.trim());
  if (!m) return fy;
  const endYY = m[2].length === 4 ? m[2].slice(-2) : m[2].padStart(2, "0");
  return `FY ${m[1].slice(-2)}-${endYY}`;
}

/**
 * "RBE 2026-27 · BE 2027-28" — the one shared FY display format, admin-
 * controlled via the open BudgetCycle. Named after the two years it
 * actually distinguishes (the RBE year and the BE year) rather than the
 * old literal "CFY"/"NFY" jargon, per the 2026-08-25 fix — this is a
 * general "which cycle" descriptor (e.g. a dropdown option, a page
 * subtitle), so it keeps the full 4-digit years; for a compact per-figure
 * label (a KPI tile, a table column) use lyFyLabel/cfyLabel/nfyLabel
 * below instead, which return the short 2-digit form.
 */
export function formatCycleLabel(cycle: CycleLike): string {
  return `RBE ${cycle.financialYearRBE} · BE ${cycle.financialYearBE}`;
}

/** The cost centre's Last FY, short form — e.g. "FY 25-26" when the cycle's RBE year is 2026-27. For the "LY Actual" figure's dynamic label. */
export function lyFyLabel(cycle: CycleLike): string {
  return shortFy(previousFinancialYear(cycle.financialYearRBE));
}

/** The cycle's current (RBE) FY, short form — e.g. "FY 26-27". Replaces the old literal "CFY" label on every figure that's for the current FY (Approved BE, YTD Actual, RBE). */
export function cfyLabel(cycle: CycleLike): string {
  return shortFy(cycle.financialYearRBE);
}

/** The cycle's next (BE) FY, short form — e.g. "FY 27-28". Replaces the old literal "NFY" label on the BE figure. */
export function nfyLabel(cycle: CycleLike): string {
  return shortFy(cycle.financialYearBE);
}
