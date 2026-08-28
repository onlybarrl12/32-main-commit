// Shared RBE/BE Amount computation for a BudgetEntry row, branching on its
// Sub Head's parent Budget Head's Broad PNL Head (added 2026-08-24 — see
// MAIN_SHEET_REWORK_PLAN.md's addendum). Used by both the client EntryGrid
// (live display) and server actions (validation/persistence), so the two
// can never drift apart — deliberately dependency-free (no prisma import)
// so it's safe to import from a "use client" component.
//
// R&M: Amount = Material + Service (unchanged, original behavior).
// Power / Chemical: Amount = Qty x Rate. Power: both Qty and Rate are
// user-entered by the Location User, exactly like Material/Service for R&M.
// Chemical: Qty user-entered, Rate admin-maintained per kg (see
// sub-head-rate-uom.ts) — corrected 2026-08-25 per the user's explicit
// instruction; an earlier same-day pass had mistakenly made Power's Rate
// admin-maintained too, which this reverts.
//
// No fallback of any kind: blank/zero inputs are treated as zero and the
// Amount is exactly what the entered fields compute to — see the 2026-08-24
// "no default value" decision in MAIN_SHEET_REWORK_PLAN.md.

export type BroadPnlHeadCode = "RM" | "POWER" | "CHEMICAL";

export type EntryAmountFields = {
  rbeMaterial: number;
  rbeService: number;
  beMaterial: number;
  beService: number;
  rbeQty: number;
  rbeRate: number;
  beQty: number;
  beRate: number;
};

/** Blank, zero, negative, or non-numeric input all normalize to 0 — never a fallback to any other figure. */
export function numOrZero(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function isQtyRateHead(broadPnlHead: BroadPnlHeadCode): boolean {
  return broadPnlHead === "POWER" || broadPnlHead === "CHEMICAL";
}

/** Only Chemical's Rate is admin-maintained (per kg, via SubHeadRate). Power's Rate is user-entered, just like its Qty — R&M has no Rate concept at all. */
export function isAdminRateHead(broadPnlHead: BroadPnlHeadCode): boolean {
  return broadPnlHead === "CHEMICAL";
}

/**
 * The Rate actually in effect for a row right now, shared by every place
 * that computes or displays a Power/Chemical Amount (EntryGrid, the budget
 * detail KPI tiles, Home dashboard, Reports, and the server-side save/
 * approval logic) so they can never drift apart.
 * - R&M: unused (no Rate concept) — `stored` is a safe fallback.
 * - Power: always the row's own stored/typed value — never any admin master.
 * - Chemical: the live admin-maintained master rate, until the header
 *   reaches APPROVED, at which point the frozen stored value (captured at
 *   approval time — see lib/workflow.ts's freezeQtyRateOnApproval) is
 *   authoritative.
 */
export function resolveRate(
  broadPnlHead: BroadPnlHeadCode,
  stored: number,
  liveMasterRate: number | null | undefined,
  headerStatus: string
): number {
  if (!isAdminRateHead(broadPnlHead)) return stored;
  if (headerStatus === "APPROVED") return stored;
  return liveMasterRate ?? 0;
}

export function rbeAmount(e: EntryAmountFields, broadPnlHead: BroadPnlHeadCode): number {
  if (isQtyRateHead(broadPnlHead)) return numOrZero(e.rbeQty) * numOrZero(e.rbeRate);
  return numOrZero(e.rbeMaterial) + numOrZero(e.rbeService);
}

export function beAmount(e: EntryAmountFields, broadPnlHead: BroadPnlHeadCode): number {
  if (isQtyRateHead(broadPnlHead)) return numOrZero(e.beQty) * numOrZero(e.beRate);
  return numOrZero(e.beMaterial) + numOrZero(e.beService);
}
