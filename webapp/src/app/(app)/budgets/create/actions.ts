"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getAccessibleCostCentreIds } from "@/lib/rbac";
import { getActiveCycle } from "@/lib/cycle";
import { Role, BudgetStatus } from "@prisma/client";

/**
 * Finds the existing Budget Creation Proposal for (costCentreId, the one
 * open cycle) or creates a fresh DRAFT one, then redirects to its detail
 * page. One proposal per Cost Centre per FY cycle — MAIN SHEET's MAIN RULE
 * (business_knowledge/Data for R&M Portal.xlsx) — the proposal itself may
 * span many Budget Heads/Sub Heads, selected inside the proposal page.
 */
export async function openBudgetHeader(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const costCentreId = String(formData.get("costCentreId") ?? "");
  if (!costCentreId) {
    throw new Error("Location is required.");
  }

  const locationAccess = user.access.filter((a) => a.role === Role.LOCATION_USER);
  const accessibleIds = await getAccessibleCostCentreIds(locationAccess);
  if (accessibleIds !== "ALL" && !accessibleIds.includes(costCentreId)) {
    throw new Error("You do not have Location User access to that location.");
  }

  const cycle = await getActiveCycle();
  if (!cycle) throw new Error("No budget cycle is currently open. Ask an admin to open one in Masters → Settings.");

  let header = await prisma.budgetHeader.findUnique({
    where: { costCentreId_cycleId: { costCentreId, cycleId: cycle.id } },
  });

  if (!header) {
    header = await prisma.budgetHeader.create({
      data: {
        costCentreId,
        cycleId: cycle.id,
        createdByUserId: user.id,
        status: BudgetStatus.DRAFT,
        currentLevel: 0,
      },
    });
    await prisma.auditLog.create({
      data: {
        entityType: "BudgetHeader",
        entityId: header.id,
        action: "CREATE",
        performedByUserId: user.id,
        diff: { costCentreId, cycleId: cycle.id },
      },
    });
  }

  redirect(`/budgets/${header.id}`);
}
