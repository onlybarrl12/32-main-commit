"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getAccessibleCostCentreIds } from "@/lib/rbac";
import { ApprovalActionType } from "@prisma/client";
import { ACTOR_ROLE_FOR_STATUS, approve, returnToL1, STATUS_LEVEL, freezeQtyRateOnApproval } from "@/lib/workflow";
import { BudgetStatus } from "@prisma/client";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireApprover(headerId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const header = await prisma.budgetHeader.findUnique({ where: { id: headerId }, include: { cycle: true } });
  if (!header) throw new Error("Budget not found");

  const requiredRole = ACTOR_ROLE_FOR_STATUS[header.status];
  if (!requiredRole) throw new Error(`Budget in status ${header.status} is not awaiting any approval action`);

  const grantsForRole = user.access.filter((a) => a.role === requiredRole);
  if (grantsForRole.length === 0) {
    throw new Error(`You do not hold the ${requiredRole} role`);
  }
  const accessibleIds = await getAccessibleCostCentreIds(grantsForRole);
  if (accessibleIds !== "ALL" && !accessibleIds.includes(header.costCentreId)) {
    throw new Error("This budget's location is outside your approval scope");
  }

  return { user, header };
}

/** Single action handling both Approve and Return, branching on formData's "action" field. */
export async function actOnHeader(formData: FormData): Promise<ActionResult> {
  try {
    const headerId = String(formData.get("headerId") ?? "");
    const action = String(formData.get("action") ?? "");
    const remarks = String(formData.get("remarks") ?? "").trim();

    if (action !== "approve" && action !== "return") {
      return { ok: false, error: "Invalid action" };
    }
    if (action === "return" && remarks === "") {
      return { ok: false, error: "Remarks are required when returning a budget." };
    }

    const { user, header } = await requireApprover(headerId);
    const fromStatus = header.status;
    // Return always goes all the way back to L1/Draft (MAIN SHEET's matrix — see lib/workflow.ts).
    const toStatus = action === "approve" ? approve(fromStatus) : returnToL1(fromStatus);

    // Freeze POWER/CHEMICAL Sub Head rates the instant this is the final
    // (Finance) approval reaching APPROVED — see lib/workflow.ts's
    // freezeQtyRateOnApproval and the 2026-08-24 "Rate change impact"
    // decision. Must happen before the status update below, using the
    // still-live master rate right up to this moment.
    if (toStatus === BudgetStatus.APPROVED) {
      await freezeQtyRateOnApproval(headerId, header.cycle);
    }

    await prisma.$transaction([
      prisma.budgetHeader.update({
        where: { id: headerId },
        data: { status: toStatus, currentLevel: STATUS_LEVEL[toStatus] },
      }),
      prisma.approvalAction.create({
        data: {
          headerId,
          level: STATUS_LEVEL[fromStatus],
          actionByUserId: user.id,
          action: action === "approve" ? ApprovalActionType.APPROVE : ApprovalActionType.RETURN,
          remarks: remarks || null,
        },
      }),
      prisma.auditLog.create({
        data: {
          entityType: "BudgetHeader",
          entityId: headerId,
          action: action === "approve" ? "APPROVE" : "RETURN",
          performedByUserId: user.id,
          diff: { from: fromStatus, to: toStatus },
        },
      }),
    ]);

    revalidatePath("/approvals");
    revalidatePath(`/budgets/${headerId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Action failed" };
  }
}
