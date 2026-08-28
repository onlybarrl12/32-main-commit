import { Role, ScopeType, type UserAccess } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export { Role, ScopeType };

/** All UserAccess grants (role + scope) held by a given user. */
export async function getUserAccess(userId: string): Promise<UserAccess[]> {
  return prisma.userAccess.findMany({ where: { userId } });
}

/** The logged-in user (from the session), including their access grants and Employee master row. */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({
    where: { id: session.user.id },
    include: { access: true, employee: true },
  });
}

/**
 * Resolves a set of UserAccess grants to the concrete list of CostCentre ids
 * they cover. Used to scope BudgetHeader (and similar) queries server-side —
 * every query over budgets must go through this, per CLAUDE.md §6.
 *
 * - ALL scope: every cost centre.
 * - REGION scope: every cost centre under that Region (via CompanyCode → Pipeline → CostCentre).
 * - BASE scope: every cost centre under that Base.
 * - LOCATION scope: just that one cost centre.
 */
export async function getAccessibleCostCentreIds(access: UserAccess[]): Promise<string[] | "ALL"> {
  if (access.some((a) => a.scopeType === ScopeType.ALL)) return "ALL";

  const baseIds = access.filter((a) => a.scopeType === ScopeType.BASE && a.scopeId).map((a) => a.scopeId!);
  const locationIds = access
    .filter((a) => a.scopeType === ScopeType.LOCATION && a.scopeId)
    .map((a) => a.scopeId!);
  const regionIds = access.filter((a) => a.scopeType === ScopeType.REGION && a.scopeId).map((a) => a.scopeId!);

  const ids = new Set<string>(locationIds);

  if (baseIds.length > 0) {
    const rows = await prisma.costCentre.findMany({
      where: { baseId: { in: baseIds } },
      select: { id: true },
    });
    rows.forEach((r) => ids.add(r.id));
  }

  if (regionIds.length > 0) {
    const rows = await prisma.costCentre.findMany({
      where: { companyCode: { regionId: { in: regionIds } } },
      select: { id: true },
    });
    rows.forEach((r) => ids.add(r.id));
  }

  return [...ids];
}

/** True if the user holds the given role in any of their access grants. */
export function hasRole(access: UserAccess[], role: Role): boolean {
  return access.some((a) => a.role === role);
}
