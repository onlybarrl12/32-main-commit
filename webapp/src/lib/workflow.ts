import { BudgetStatus, Role, type UserAccess } from "@prisma/client";
import { getAccessibleCostCentreIds } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSubHeadRateUomMap } from "@/lib/sub-head-rate-uom";
import { isAdminRateHead } from "@/lib/entry-amount";
import type { CycleLike } from "@/lib/labels";

// The 5-level approval state machine, per MAIN SHEET's Final L1-L5
// Approval/Processing Matrix (business_knowledge/Data for R&M Portal.xlsx,
// "MAIN SHEET" rows 13-19 — see CLAUDE.md's 2026-08-21 rework note).
//
// L1 Cost Centre User (Location User) -> L2 SIC -> L3 BIC -> L4 TS Dept -> L5 Finance.
// Modify: L1=Yes(Draft/Returned), SIC/BIC=No, TS/Finance=Yes.
// Return: every level (SIC/BIC/TS/Finance) returns all the way to L1/Draft —
// NOT one-level-back (that was the original, now-superseded, design; see
// returnToL1 below). No "Reject" action exists.

export const STATUS_LEVEL: Record<BudgetStatus, number> = {
  DRAFT: 0,
  PENDING_STATION: 1,
  PENDING_BASE: 2,
  PENDING_TS: 3,
  PENDING_FINANCE: 4,
  APPROVED: 5,
};

/** The role allowed to Approve/Return a header currently in this status. */
export const ACTOR_ROLE_FOR_STATUS: Partial<Record<BudgetStatus, Role>> = {
  PENDING_STATION: Role.STATION_INCHARGE,
  PENDING_BASE: Role.BASE_INCHARGE,
  PENDING_TS: Role.TS_DEPT,
  PENDING_FINANCE: Role.FINANCE_DEPT,
};

/** Reverse of ACTOR_ROLE_FOR_STATUS: which status a given approval role acts on. */
export const PENDING_STATUS_FOR_ROLE: Partial<Record<Role, BudgetStatus>> = {
  [Role.STATION_INCHARGE]: BudgetStatus.PENDING_STATION,
  [Role.BASE_INCHARGE]: BudgetStatus.PENDING_BASE,
  [Role.TS_DEPT]: BudgetStatus.PENDING_TS,
  [Role.FINANCE_DEPT]: BudgetStatus.PENDING_FINANCE,
};

/** Roles allowed to Modify (edit) budget entries in-place, per the Modify column of the matrix. Only TS/Finance — SIC/BIC are read-only. */
export const MODIFY_ROLE_FOR_STATUS: Partial<Record<BudgetStatus, Role>> = {
  PENDING_TS: Role.TS_DEPT,
  PENDING_FINANCE: Role.FINANCE_DEPT,
};

export const STATUS_LABELS: Record<BudgetStatus, string> = {
  DRAFT: "Draft",
  PENDING_STATION: "Pending SIC Approval",
  PENDING_BASE: "Pending BIC Approval",
  PENDING_TS: "Pending TS Approval",
  PENDING_FINANCE: "Pending Finance Approval",
  APPROVED: "Approved",
};

export function submitForApproval(status: BudgetStatus): BudgetStatus {
  if (status !== BudgetStatus.DRAFT) {
    throw new Error(`Cannot submit a header in status ${status} (must be DRAFT)`);
  }
  return BudgetStatus.PENDING_STATION;
}

export function approve(status: BudgetStatus): BudgetStatus {
  switch (status) {
    case BudgetStatus.PENDING_STATION:
      return BudgetStatus.PENDING_BASE;
    case BudgetStatus.PENDING_BASE:
      return BudgetStatus.PENDING_TS;
    case BudgetStatus.PENDING_TS:
      return BudgetStatus.PENDING_FINANCE;
    case BudgetStatus.PENDING_FINANCE:
      return BudgetStatus.APPROVED;
    default:
      throw new Error(`Cannot approve a header in status ${status}`);
  }
}

/**
 * A return at ANY level (SIC/BIC/TS/Finance) sends the budget all the way
 * back to L1 (DRAFT), per MAIN SHEET's matrix ("Return: Yes -> L1 User" for
 * every level) — confirmed with the user 2026-08-21, replacing the original
 * one-level-back design. Resubmission after any return always restarts the
 * full chain at L2 (SIC).
 */
export function returnToL1(status: BudgetStatus): BudgetStatus {
  if (status === BudgetStatus.DRAFT || status === BudgetStatus.APPROVED) {
    throw new Error(`Cannot return a header in status ${status}`);
  }
  return BudgetStatus.DRAFT;
}

/**
 * Freezes CHEMICAL Sub Head rates permanently at the moment a header reaches
 * APPROVED (Finance's final approve) — added 2026-08-24, scoped back down to
 * Chemical only on 2026-08-25 per the user's explicit instruction (an
 * intermediate same-day pass had mistakenly also treated Power's Rate as
 * admin-maintained; Power's Rate is user-entered, just like its Qty, so
 * there is nothing to freeze for it — its stored rbeRate/beRate is already
 * final). See MAIN_SHEET_REWORK_PLAN.md's addendum ("Rate change impact").
 * Up to this exact point, Chemical rows are live-linked to the current
 * SubHeadRate master (resolved fresh on every view/save — see
 * sub-head-rate-uom.ts); an admin Rate edit right up until approval is
 * reflected immediately. Once this runs, the resolved rate is written
 * directly onto BudgetEntry.rbeRate/beRate and nothing reads the live master
 * for this header again — an approved budget's figures can never move,
 * regardless of later admin Rate changes. R&M rows don't use Rate at all.
 * Must be called inside/alongside the same transaction that flips status to
 * APPROVED.
 */
export async function freezeQtyRateOnApproval(headerId: string, cycle: CycleLike): Promise<void> {
  const entries = await prisma.budgetEntry.findMany({
    where: { headerId },
    include: { subHead: { include: { budgetHead: true } } },
  });
  const chemicalEntries = entries.filter((e) => isAdminRateHead(e.subHead.budgetHead.broadPnlHead));
  if (chemicalEntries.length === 0) return;

  const subHeadIds = [...new Set(chemicalEntries.map((e) => e.subHeadId))];
  const rateUomMap = await getSubHeadRateUomMap(subHeadIds, cycle);

  await Promise.all(
    chemicalEntries.map((e) => {
      const live = rateUomMap[e.subHeadId];
      return prisma.budgetEntry.update({
        where: { id: e.id },
        data: {
          rbeRate: live?.rbeRate ?? Number(e.rbeRate) ?? 0,
          beRate: live?.beRate ?? Number(e.beRate) ?? 0,
        },
      });
    })
  );
}

/**
 * Whether `access` lets the viewer edit `header`'s entries right now:
 * - DRAFT: LOCATION_USER access to the header's Cost Centre (the original author's edit window).
 * - PENDING_TS / PENDING_FINANCE: TS_DEPT / FINANCE_DEPT access to the Cost Centre (in-place
 *   modification per the matrix's Modify column — SIC/BIC never qualify, they're read-only).
 * - Anything else (PENDING_STATION, PENDING_BASE, APPROVED): not editable by anyone here.
 *
 * This is the one shared source of truth for editability, used by both
 * /budgets/[id] and /approvals so their rules can't drift apart.
 */
export async function canEditHeader(
  access: UserAccess[],
  header: { status: BudgetStatus; costCentreId: string }
): Promise<boolean> {
  let requiredRole: Role | null = null;
  if (header.status === BudgetStatus.DRAFT) requiredRole = Role.LOCATION_USER;
  else if (header.status in MODIFY_ROLE_FOR_STATUS) requiredRole = MODIFY_ROLE_FOR_STATUS[header.status]!;
  else return false;

  const grants = access.filter((a) => a.role === requiredRole);
  if (grants.length === 0) return false;

  const accessibleIds = await getAccessibleCostCentreIds(grants);
  return accessibleIds === "ALL" || accessibleIds.includes(header.costCentreId);
}
