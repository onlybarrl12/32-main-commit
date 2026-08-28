"use client";

import { useState } from "react";
import { EntryGrid } from "../budgets/[id]/EntryGrid";
import type { EntryInput } from "../budgets/[id]/actions";
import type { AttachmentInfo } from "../budgets/[id]/AttachmentUploader";
import { EntriesSummaryView, type SummaryEntry } from "./EntriesSummaryView";
import type { BroadPnlHeadCode } from "@/lib/entry-amount";

type RateUomInfo = { uom: string | null; rbeRate: number | null; beRate: number | null };
type SubHeadActuals = { lyActual: number; approvedBe: number; ytdActual: number };
type BudgetHeadOption = {
  id: string;
  name: string;
  broadPnlHead: BroadPnlHeadCode;
  broadPnlHeadLabel: string;
  subHeads: { id: string; code: string; name: string }[];
};

/**
 * Every approval level (SIC/BIC/TS/Finance) sees the same Category Summary
 * view by default — per the user's UXSAMPLE design reference and explicit
 * "this will remain same for all the approvers" instruction. The only
 * per-level difference is this toggle: TS/Finance (Modify=Yes on the
 * approval matrix) get an "Edit Entries" button that swaps in the full
 * editable Create-Budget-style grid; SIC/BIC (Modify=No) never see it, so
 * they can only view + Approve/Return, never touched by design.
 */
export function ApprovalEntriesPanel({
  editable,
  summaryEntries,
  headerId,
  headerStatus,
  costCentreName,
  cycleLabel,
  lyFyLabel,
  cfyFyLabel,
  nfyFyLabel,
  initialEntries,
  budgetHeads,
  subHeadActuals,
  rateUomMap,
  attachmentsByEntryId,
}: {
  editable: boolean;
  summaryEntries: SummaryEntry[];
  headerId: string;
  headerStatus: string;
  costCentreName: string;
  cycleLabel: string;
  lyFyLabel: string;
  cfyFyLabel: string;
  nfyFyLabel: string;
  initialEntries: EntryInput[];
  budgetHeads: BudgetHeadOption[];
  subHeadActuals: Record<string, SubHeadActuals>;
  rateUomMap: Record<string, RateUomInfo>;
  attachmentsByEntryId: Record<string, AttachmentInfo[]>;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");

  if (!editable) {
    return (
      <EntriesSummaryView
        entries={summaryEntries}
        allBudgetHeads={budgetHeads}
        subHeadActuals={subHeadActuals}
        rateUomMap={rateUomMap}
        headerStatus={headerStatus}
        costCentreName={costCentreName}
        cycleLabel={cycleLabel}
        lyFyLabel={lyFyLabel}
        cfyFyLabel={cfyFyLabel}
        nfyFyLabel={nfyFyLabel}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-stone-500">
          {mode === "view"
            ? "You hold Modify rights at this level — switch to Edit to change entries in place."
            : "Editing in place — Save records every change to the Audit Log below."}
        </div>
        <button
          type="button"
          onClick={() => setMode((m) => (m === "view" ? "edit" : "view"))}
          className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${
            mode === "edit"
              ? "border-stone-300 text-stone-700 hover:bg-stone-50"
              : "border-brand-orange text-brand-orange hover:bg-brand-orange/5"
          }`}
        >
          {mode === "view" ? "✎ Edit Entries" : "Done Editing — Back to Summary"}
        </button>
      </div>

      {mode === "view" ? (
        <EntriesSummaryView
          entries={summaryEntries}
          allBudgetHeads={budgetHeads}
          subHeadActuals={subHeadActuals}
          rateUomMap={rateUomMap}
          headerStatus={headerStatus}
          costCentreName={costCentreName}
          cycleLabel={cycleLabel}
          lyFyLabel={lyFyLabel}
          cfyFyLabel={cfyFyLabel}
          nfyFyLabel={nfyFyLabel}
        />
      ) : (
        <EntryGrid
          headerId={headerId}
          headerStatus={headerStatus}
          costCentreName={costCentreName}
          cycleLabel={cycleLabel}
          lyFyLabel={lyFyLabel}
          cfyFyLabel={cfyFyLabel}
          nfyFyLabel={nfyFyLabel}
          initialEntries={initialEntries}
          budgetHeads={budgetHeads}
          subHeadActuals={subHeadActuals}
          rateUomMap={rateUomMap}
          editable
          attachmentsByEntryId={attachmentsByEntryId}
        />
      )}
    </div>
  );
}
