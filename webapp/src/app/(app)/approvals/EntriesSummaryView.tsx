"use client";

import { Fragment, useMemo, useState } from "react";
import { formatLakh, formatINR } from "@/lib/format";
import { rbeAmount, beAmount, resolveRate, isQtyRateHead, type BroadPnlHeadCode } from "@/lib/entry-amount";
import { BUDGET_SUB_HEAD_LABEL } from "@/lib/labels";

export type SummaryEntry = {
  id: string;
  subHeadId: string;
  subHeadCode: string;
  subHeadName: string;
  budgetHeadId: string;
  budgetHeadName: string;
  broadPnlHead: BroadPnlHeadCode;
  broadPnlHeadLabel: string;
  rbeMaterial: number;
  rbeService: number;
  beMaterial: number;
  beService: number;
  rbeQty: number;
  rbeRate: number;
  beQty: number;
  beRate: number;
  workType: string;
  recurringOneTime: string;
  referenceTakenFrom: string;
  justification: string;
  remarks: string;
  attachments: { id: string; fileName: string }[];
};

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
 * Category-Summary-with-drill-down view, per the user's UXSAMPLE design
 * reference (UXSAMPLE/SERPL_L2_SIC_Review_Approver Screen...html): one row
 * per Budget Head with its financial roll-up and a "View" toggle that
 * expands a detail table of every line item under it. This is the shared
 * READ display used at every approval level (SIC/BIC/TS/Finance) so the
 * screen looks and works identically regardless of who's looking — the
 * only per-level difference is whether an "Edit Entries" affordance is
 * shown alongside it (see approvals/page.tsx: only TS/Finance get one,
 * per the Modify column of the approval matrix).
 *
 * Row list = union, not just heads with a submission (fixed 2026-08-25):
 * every Budget Head that has admin-uploaded actuals for this Cost Centre
 * is included even if the user proposed nothing under it this cycle — such
 * rows show Proposed RBE/BE = 0.00 Lakh, Items = 0. This matches Create
 * Budget's "Reference: Actuals" panel, which is likewise visible
 * independent of what's been proposed.
 */
export function EntriesSummaryView({
  entries,
  allBudgetHeads,
  subHeadActuals,
  rateUomMap,
  headerStatus,
  costCentreName,
  cycleLabel,
  lyFyLabel,
  cfyFyLabel,
  nfyFyLabel,
}: {
  entries: SummaryEntry[];
  allBudgetHeads: BudgetHeadOption[];
  subHeadActuals: Record<string, SubHeadActuals>;
  rateUomMap: Record<string, RateUomInfo>;
  headerStatus: string;
  costCentreName: string;
  cycleLabel: string;
  lyFyLabel: string;
  cfyFyLabel: string;
  nfyFyLabel: string;
}) {
  const [openHeads, setOpenHeads] = useState<Set<string>>(new Set());

  const heads = useMemo(() => {
    type HeadGroup = {
      id: string;
      name: string;
      broadPnlHeadLabel: string;
      rows: (SummaryEntry & { rbe: number; be: number; rbeRate: number; beRate: number })[];
      rbe: number;
      be: number;
      lyActual: number;
      approvedBe: number;
    };

    const map = new Map<string, HeadGroup>();
    const groupFor = (h: BudgetHeadOption) =>
      map.get(h.id) ?? { id: h.id, name: h.name, broadPnlHeadLabel: h.broadPnlHeadLabel, rows: [], rbe: 0, be: 0, lyActual: 0, approvedBe: 0 };

    // Seed every Budget Head that has admin-uploaded actuals for any of its
    // Sub Heads under this Cost Centre — the union part of the fix.
    for (const h of allBudgetHeads) {
      let lyActual = 0;
      let approvedBe = 0;
      let hasAnyActuals = false;
      for (const s of h.subHeads) {
        const a = subHeadActuals[s.code];
        if (!a) continue;
        if (a.lyActual !== 0 || a.approvedBe !== 0 || a.ytdActual !== 0) hasAnyActuals = true;
        lyActual += a.lyActual;
        approvedBe += a.approvedBe;
      }
      if (hasAnyActuals) {
        const g = groupFor(h);
        g.lyActual = lyActual;
        g.approvedBe = approvedBe;
        map.set(h.id, g);
      }
    }

    // Fold in every proposed line item (this cycle's submission), matching it to
    // its Budget Head — a head can arrive here for the first time (no actuals,
    // only a proposal) or add rows/RBE/BE onto a head already seeded above.
    const budgetHeadById = new Map(allBudgetHeads.map((h) => [h.id, h]));
    for (const e of entries) {
      const bh = budgetHeadById.get(e.budgetHeadId);
      const g = map.get(e.budgetHeadId) ?? groupFor(bh ?? { id: e.budgetHeadId, name: e.budgetHeadName, broadPnlHead: e.broadPnlHead, broadPnlHeadLabel: e.broadPnlHeadLabel, subHeads: [] });
      const rateUom = rateUomMap[e.subHeadId];
      const rbeRate = resolveRate(e.broadPnlHead, e.rbeRate, rateUom?.rbeRate, headerStatus);
      const beRate = resolveRate(e.broadPnlHead, e.beRate, rateUom?.beRate, headerStatus);
      const rbe = rbeAmount({ ...e, rbeRate }, e.broadPnlHead);
      const be = beAmount({ ...e, beRate }, e.broadPnlHead);
      g.rows.push({ ...e, rbe, be, rbeRate, beRate });
      g.rbe += rbe;
      g.be += be;
      map.set(e.budgetHeadId, g);
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, allBudgetHeads, subHeadActuals, rateUomMap, headerStatus]);

  const grandRbe = heads.reduce((s, h) => s + h.rbe, 0);
  const grandBe = heads.reduce((s, h) => s + h.be, 0);
  const grandLyActual = heads.reduce((s, h) => s + h.lyActual, 0);
  const grandApprovedBe = heads.reduce((s, h) => s + h.approvedBe, 0);
  const grandItems = heads.reduce((s, h) => s + h.rows.length, 0);

  function toggle(headId: string) {
    setOpenHeads((prev) => {
      const next = new Set(prev);
      if (next.has(headId)) next.delete(headId);
      else next.add(headId);
      return next;
    });
  }

  function downloadCsv() {
    const rows: string[][] = [
      ["Budget Head", BUDGET_SUB_HEAD_LABEL, "Work Type", "Recurring / One-Time", "Reference Taken From", "Justification", "RBE (Rs.)", "BE (Rs.)"],
    ];
    for (const h of heads) {
      for (const r of h.rows) {
        rows.push([
          h.name,
          `${r.subHeadCode} - ${r.subHeadName}`,
          r.workType.replace(/_/g, " "),
          r.recurringOneTime === "RECURRING" ? "Recurring" : "One-Time",
          r.referenceTakenFrom,
          r.justification,
          r.rbe.toFixed(2),
          r.be.toFixed(2),
        ]);
      }
    }
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${costCentreName.split(" ")[0]}_${cycleLabel.replace(/[^\dA-Za-z-]/g, "")}_Detail.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (heads.length === 0) {
    return (
      <p className="text-sm text-stone-400 border border-dashed border-stone-200 rounded-lg p-6 text-center">
        No line items and no admin-uploaded actuals for this Cost Centre.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Category Summary</h3>
        <button
          type="button"
          onClick={downloadCsv}
          className="text-xs font-medium text-brand-navy border border-brand-navy-light rounded-lg px-3 py-1 hover:bg-brand-navy-light"
        >
          ⬇ Download Detailed CSV
        </button>
      </div>

      <div className="overflow-x-auto border border-stone-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="text-left text-stone-400 border-b border-stone-100 bg-stone-50">
            <tr>
              <th className="px-4 py-2 font-medium">Budget Head</th>
              <th className="px-4 py-2 font-medium text-right">LY Actual ({lyFyLabel})</th>
              <th className="px-4 py-2 font-medium text-right">Approved BE ({cfyFyLabel})</th>
              <th className="px-4 py-2 font-medium text-right">RBE ({cfyFyLabel})</th>
              <th className="px-4 py-2 font-medium text-right">BE ({nfyFyLabel})</th>
              <th className="px-4 py-2 font-medium text-right">Items</th>
              <th className="px-4 py-2 font-medium text-center">View</th>
            </tr>
          </thead>
          <tbody>
            {heads.map((h) => {
              const open = openHeads.has(h.id);
              return (
                <Fragment key={h.id}>
                  <tr className="border-b border-stone-50 last:border-0">
                    <td className="px-4 py-2 text-stone-700">
                      {h.name} <span className="text-stone-300">({h.broadPnlHeadLabel})</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-stone-500">{formatLakh(h.lyActual)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-stone-500">{formatLakh(h.approvedBe)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-brand-navy">{formatLakh(h.rbe)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-brand-navy">{formatLakh(h.be)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-stone-400">{h.rows.length}</td>
                    <td className="px-4 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(h.id)}
                        className="text-xs font-medium text-stone-600 border border-stone-200 rounded-md px-2.5 py-1 hover:bg-stone-50 hover:border-stone-300"
                      >
                        {open ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-stone-50/60">
                      <td colSpan={7} className="p-3">
                        {h.rows.length === 0 ? (
                          <p className="text-xs text-stone-400 italic px-2 py-3">
                            No line items proposed under this Budget Head this cycle — the figures above are admin-uploaded actuals only.
                          </p>
                        ) : (
                          <table className="w-full text-xs bg-white border border-stone-200 rounded-lg overflow-hidden">
                            <thead className="text-left text-stone-400 bg-stone-50 border-b border-stone-100">
                              <tr>
                                <th className="px-3 py-2 font-medium">{BUDGET_SUB_HEAD_LABEL}</th>
                                <th className="px-3 py-2 font-medium">Work Type</th>
                                <th className="px-3 py-2 font-medium">Recurring / One-Time</th>
                                <th className="px-3 py-2 font-medium">Reference</th>
                                <th className="px-3 py-2 font-medium">Justification</th>
                                <th className="px-3 py-2 font-medium text-right">RBE</th>
                                <th className="px-3 py-2 font-medium text-right">BE</th>
                              </tr>
                            </thead>
                            <tbody>
                              {h.rows.map((r) => (
                                <tr key={r.id} className="border-b border-stone-50 last:border-0 align-top">
                                  <td className="px-3 py-2 text-stone-700">
                                    {r.subHeadCode} — {r.subHeadName}
                                    {isQtyRateHead(r.broadPnlHead) && (
                                      <div className="text-[10px] text-stone-400 mt-0.5">
                                        Qty {r.rbeQty} × Rate {formatINR(r.rbeRate)} (RBE) · Qty {r.beQty} × Rate {formatINR(r.beRate)} (BE)
                                      </div>
                                    )}
                                    {r.attachments.length > 0 && (
                                      <div className="mt-1 flex flex-wrap gap-x-3">
                                        {r.attachments.map((a) => (
                                          <a
                                            key={a.id}
                                            href={`/api/attachments/${a.id}`}
                                            className="text-[10px] text-brand-orange hover:text-brand-orange-dark underline"
                                          >
                                            📎 {a.fileName}
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-stone-500">{r.workType.replace(/_/g, " ")}</td>
                                  <td className="px-3 py-2 text-stone-500">{r.recurringOneTime === "RECURRING" ? "Recurring" : "One-Time"}</td>
                                  <td className="px-3 py-2 text-stone-500">{r.referenceTakenFrom || "—"}</td>
                                  <td className="px-3 py-2 text-stone-500">{r.justification}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-brand-navy">{formatLakh(r.rbe)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-brand-navy">{formatLakh(r.be)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-stone-200 bg-stone-50 font-semibold">
              <td className="px-4 py-2 text-stone-700">Total</td>
              <td className="px-4 py-2 text-right tabular-nums text-stone-600">{formatLakh(grandLyActual)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-stone-600">{formatLakh(grandApprovedBe)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-brand-navy">{formatLakh(grandRbe)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-brand-navy">{formatLakh(grandBe)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-stone-500">{grandItems}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
