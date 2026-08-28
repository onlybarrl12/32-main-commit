import { prisma } from "@/lib/prisma";

// Shared timeline: Approve/Return actions (ApprovalAction) merged with
// TS/Finance in-place edits (AuditLog entityType="BudgetHeader", action
// MODIFY_ENTRY/ADD_ENTRY/DELETE_ENTRY) — "who returned when with what
// comment" and "who changed/added/removed which line item" all visible in
// one place, per the user's ask that every approver-stage change be
// auditable, not just written silently to AuditLog. Used on both
// /budgets/[id] (so the Location User sees the full history on their own
// draft) and /approvals.
export async function History({ headerId }: { headerId: string }) {
  const [approvalActions, entryLogs] = await Promise.all([
    prisma.approvalAction.findMany({
      where: { headerId },
      include: { actionByUser: true },
      orderBy: { actionAt: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { entityType: "BudgetHeader", entityId: headerId, action: { in: ["MODIFY_ENTRY", "ADD_ENTRY", "DELETE_ENTRY"] } },
      include: { performedByUser: true },
      orderBy: { timestamp: "asc" },
    }),
  ]);

  type Event =
    | { kind: "approval"; at: Date; by: string; text: string; remarks: string | null }
    | { kind: "modify"; at: Date; by: string; text: string };

  const events: Event[] = [
    ...approvalActions.map((a) => ({
      kind: "approval" as const,
      at: a.actionAt,
      by: a.actionByUser.username,
      text: `${a.action === "APPROVE" ? "Approved" : "Returned"} (Level ${a.level})`,
      remarks: a.remarks,
    })),
    ...entryLogs.map((l) => {
      const diff = (l.diff ?? {}) as { subHeadCode?: string; changes?: Record<string, { old: unknown; new: unknown }> };
      const text =
        l.action === "ADD_ENTRY"
          ? `Added a line item — ${diff.subHeadCode ?? "entry"}`
          : l.action === "DELETE_ENTRY"
            ? `Removed a line item — ${diff.subHeadCode ?? "entry"}`
            : `Modified ${diff.subHeadCode ?? "entry"} — ${diff.changes ? Object.keys(diff.changes).join(", ") : "field change"}`;
      return {
        kind: "modify" as const,
        at: l.timestamp,
        by: l.performedByUser?.username ?? "—",
        text,
      };
    }),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  if (events.length === 0) {
    return <p className="text-xs text-stone-400 italic">No actions yet.</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((e, idx) => (
        <div key={idx} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                e.kind === "modify"
                  ? "bg-stone-200 text-stone-600"
                  : e.text.startsWith("Approved")
                    ? "bg-brand-navy-light text-brand-navy"
                    : "bg-amber-100 text-amber-700"
              }`}
            >
              {e.kind === "modify" ? "✎" : e.text.startsWith("Approved") ? "✓" : "↩"}
            </span>
            {idx < events.length - 1 && <span className="w-px flex-1 bg-stone-200 my-1" />}
          </div>
          <div className="pb-2">
            <div className="text-xs font-medium text-stone-700">
              {e.by} — {e.text}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">{e.at.toLocaleString("en-IN")}</div>
            {e.kind === "approval" && e.remarks && <div className="text-xs text-stone-400 italic mt-0.5">&quot;{e.remarks}&quot;</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
