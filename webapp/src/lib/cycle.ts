import { prisma } from "@/lib/prisma";

// The one canonical "current" BudgetCycle. Before this rework, three
// independent call sites each guessed the "active" cycle by most-recent
// createdAt (not isOpen) — see CLAUDE.md's 2026-08-21 rework note. Now:
// admin controls FY entirely via BudgetCycle.isOpen, and setActiveCycle()
// (used by admin/masters/actions.ts) enforces at most one open cycle at a
// time, so this lookup is unambiguous.

/** The single open BudgetCycle, or null if none is open. Its RBE year is the "current FY" and its BE year is the "next FY" app-wide — see lib/labels.ts's cfyLabel/nfyLabel/lyFyLabel for the dynamic-year display labels derived from it. */
export async function getActiveCycle() {
  return prisma.budgetCycle.findFirst({ where: { isOpen: true }, orderBy: { createdAt: "desc" } });
}

/**
 * Opens the given cycle and closes every other one, so exactly one cycle is
 * ever open at a time — the admin-controlled FY switch. Pass null to close
 * all cycles (no open FY).
 */
export async function setActiveCycle(cycleId: string | null): Promise<void> {
  await prisma.$transaction([
    prisma.budgetCycle.updateMany({ where: { isOpen: true }, data: { isOpen: false } }),
    ...(cycleId ? [prisma.budgetCycle.update({ where: { id: cycleId }, data: { isOpen: true } })] : []),
  ]);
}
