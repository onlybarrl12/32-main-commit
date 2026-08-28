"use client";

import { useMemo } from "react";
import { formatLakh } from "@/lib/format";
import { isQtyRateHead, type BroadPnlHeadCode } from "@/lib/entry-amount";
import { BROAD_PNL_HEAD_LABELS, BUDGET_SUB_HEAD_LABEL } from "@/lib/labels";
import { rowAmounts, type Row } from "./EntryGrid";

type BudgetHeadOption = {
  id: string;
  name: string;
  broadPnlHead: BroadPnlHeadCode;
  broadPnlHeadLabel: string;
  subHeads: { id: string; code: string; name: string }[];
};
type RateUomInfo = { uom: string | null; rbeRate: number | null; beRate: number | null };
type SubHeadInfo = { code: string; name: string; budgetHeadId: string };

/**
 * "Review" summary shown before Submit, per the user's ask: a crisp
 * Broad-PNL-wise, then Budget-Head-wise, then Sub-Head-wise breakdown of
 * whatever's currently in the grid (saved or not). "Download PDF" opens a
 * clean print-only window and triggers the browser's print dialog — the
 * user Save-as-PDFs from there (no new PDF-generation dependency, per the
 * user's explicit choice).
 */
export function ReviewPanel({
  rows,
  budgetHeads,
  subHeadIndex,
  rateUomMap,
  headerStatus,
  costCentreName,
  cycleLabel,
  onClose,
}: {
  rows: Row[];
  budgetHeads: BudgetHeadOption[];
  subHeadIndex: Map<string, SubHeadInfo>;
  rateUomMap: Record<string, RateUomInfo>;
  headerStatus: string;
  costCentreName: string;
  cycleLabel: string;
  onClose: () => void;
}) {
  const budgetHeadById = useMemo(() => new Map(budgetHeads.map((h) => [h.id, h])), [budgetHeads]);

  const summary = useMemo(() => {
    type SubHeadRow = { name: string; rbe: number; be: number };
    type HeadRow = { name: string; broadPnlHeadLabel: string; rbe: number; be: number; subHeads: Map<string, SubHeadRow> };
    type BroadRow = { label: string; rbe: number; be: number; heads: Map<string, HeadRow> };

    const broad = new Map<string, BroadRow>();
    for (const r of rows) {
      const info = subHeadIndex.get(r.subHeadId);
      if (!info) continue;
      const head = budgetHeadById.get(info.budgetHeadId);
      if (!head) continue;
      const { rbe, be } = rowAmounts(r, head.broadPnlHead, rateUomMap[r.subHeadId], headerStatus);

      const br = broad.get(head.broadPnlHead) ?? { label: head.broadPnlHeadLabel, rbe: 0, be: 0, heads: new Map() };
      br.rbe += rbe;
      br.be += be;
      const hr = br.heads.get(head.id) ?? { name: head.name, broadPnlHeadLabel: head.broadPnlHeadLabel, rbe: 0, be: 0, subHeads: new Map() };
      hr.rbe += rbe;
      hr.be += be;
      const sr = hr.subHeads.get(r.subHeadId) ?? { name: info.name, rbe: 0, be: 0 };
      sr.rbe += rbe;
      sr.be += be;
      hr.subHeads.set(r.subHeadId, sr);
      br.heads.set(head.id, hr);
      broad.set(head.broadPnlHead, br);
    }
    return broad;
  }, [rows, subHeadIndex, budgetHeadById, rateUomMap, headerStatus]);

  const grandRbe = [...summary.values()].reduce((s, b) => s + b.rbe, 0);
  const grandBe = [...summary.values()].reduce((s, b) => s + b.be, 0);

  function buildPrintHtml(): string {
    const rowsHtml: string[] = [];
    for (const [, br] of summary) {
      rowsHtml.push(
        `<tr class="broad"><td colspan="2">${escapeHtml(br.label)}</td><td class="num">${formatLakh(br.rbe)}</td><td class="num">${formatLakh(br.be)}</td></tr>`
      );
      for (const [, hr] of br.heads) {
        rowsHtml.push(
          `<tr class="head"><td></td><td>${escapeHtml(hr.name)}</td><td class="num">${formatLakh(hr.rbe)}</td><td class="num">${formatLakh(hr.be)}</td></tr>`
        );
        for (const [, sr] of hr.subHeads) {
          rowsHtml.push(
            `<tr class="sub"><td></td><td class="indent">${escapeHtml(sr.name)}</td><td class="num">${formatLakh(sr.rbe)}</td><td class="num">${formatLakh(sr.be)}</td></tr>`
          );
        }
      }
    }
    return `<!doctype html><html><head><meta charset="utf-8"><title>Budget Review — ${escapeHtml(costCentreName)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1c1917; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #78716c; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e7e5e4; text-align: left; }
  th { color: #78716c; font-weight: 600; text-transform: uppercase; font-size: 10px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.broad td { font-weight: 700; background: #f5f5f4; }
  tr.head td { font-weight: 600; }
  tr.sub td.indent { padding-left: 24px; color: #44403c; }
  tfoot td { font-weight: 700; border-top: 2px solid #1c1917; border-bottom: none; }
  @media print { body { margin: 0.5in; } }
</style></head><body>
<h1>Budget Creation Proposal — Review Summary</h1>
<div class="meta">${escapeHtml(costCentreName)} · ${escapeHtml(cycleLabel)} · Generated ${new Date().toLocaleString("en-IN")}</div>
<table>
<thead><tr><th>Broad PNL / Budget Head / ${escapeHtml(BUDGET_SUB_HEAD_LABEL)}</th><th></th><th class="num">Proposed RBE (₹ Lakh)</th><th class="num">Proposed BE (₹ Lakh)</th></tr></thead>
<tbody>${rowsHtml.join("")}</tbody>
<tfoot><tr><td colspan="2">Grand Total</td><td class="num">${formatLakh(grandRbe)}</td><td class="num">${formatLakh(grandBe)}</td></tr></tfoot>
</table>
</body></html>`;
  }

  function handleDownloadPdf() {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(buildPrintHtml());
    win.document.close();
    win.focus();
    // Give the new window a tick to lay out before invoking print.
    setTimeout(() => win.print(), 250);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl border border-stone-200 max-w-3xl w-full max-h-[85vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-stone-900">Review Summary</h3>
            <p className="text-xs text-stone-500">
              {costCentreName} · {cycleLabel}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700 text-lg leading-none" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex justify-end gap-6 bg-stone-100 rounded-lg px-3 py-2 mb-4 text-sm font-medium text-stone-700">
          <span>
            Grand Total Proposed RBE: <span className="text-brand-navy tabular-nums">{formatLakh(grandRbe)}</span>
          </span>
          <span>
            Grand Total Proposed BE: <span className="text-brand-navy tabular-nums">{formatLakh(grandBe)}</span>
          </span>
        </div>

        {summary.size === 0 ? (
          <p className="text-sm text-stone-400 text-center py-8">No entries to review yet.</p>
        ) : (
          <div className="space-y-4">
            {[...summary.entries()].map(([broadPnlHead, br]) => (
              <div key={broadPnlHead} className="border border-stone-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-stone-100 flex justify-between text-sm font-semibold text-stone-800">
                  <span>{br.label}</span>
                  <span className="tabular-nums">
                    RBE {formatLakh(br.rbe)} · BE {formatLakh(br.be)}
                  </span>
                </div>
                {[...br.heads.entries()].map(([headId, hr]) => (
                  <div key={headId} className="border-t border-stone-100">
                    <div className="px-3 py-1.5 bg-stone-50 flex justify-between text-xs font-semibold text-stone-700">
                      <span>{hr.name}</span>
                      <span className="tabular-nums">
                        RBE {formatLakh(hr.rbe)} · BE {formatLakh(hr.be)}
                      </span>
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {[...hr.subHeads.entries()].map(([subHeadId, sr]) => (
                          <tr key={subHeadId} className="border-t border-stone-50">
                            <td className="px-3 py-1.5 pl-6 text-stone-600">{sr.name}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-stone-500">RBE {formatLakh(sr.rbe)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-stone-500">BE {formatLakh(sr.be)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-stone-100">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="rounded-lg border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Download PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
