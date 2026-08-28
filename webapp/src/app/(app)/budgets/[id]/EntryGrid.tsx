"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDraftEntries, submitBudget, type EntryInput } from "./actions";
import { AttachmentUploader, type AttachmentInfo } from "./AttachmentUploader";
import { BUDGET_SUB_HEAD_LABEL } from "@/lib/labels";
import { rbeAmount as calcRbeAmount, beAmount as calcBeAmount, isQtyRateHead, isAdminRateHead, resolveRate, type BroadPnlHeadCode } from "@/lib/entry-amount";
import { formatLakh, formatINR } from "@/lib/format";
import { ReviewPanel } from "./ReviewPanel";
import { ExcelUploadButton } from "./ExcelUploadButton";

type SubHeadOption = { id: string; code: string; name: string };
type BudgetHeadOption = {
  id: string;
  name: string;
  broadPnlHead: BroadPnlHeadCode;
  broadPnlHeadLabel: string;
  subHeads: SubHeadOption[];
};
type SubHeadActuals = { lyActual: number; approvedBe: number; ytdActual: number };
type RateUomInfo = { uom: string | null; rbeRate: number | null; beRate: number | null };

const WORK_TYPES: { value: string; label: string }[] = [
  { value: "EXISTING_WORK_ORDER", label: "Existing Work Order" },
  { value: "APPROVED_PR", label: "Approved PR" },
  { value: "AUDIT_RECOMMENDATION", label: "Audit Recommendation" },
  { value: "PMC_ATR_POINT", label: "PMC ATR Point" },
  { value: "NEW", label: "New" },
];

let rowKeySeq = 0;
function newRowKey() {
  rowKeySeq += 1;
  return `new-${Date.now()}-${rowKeySeq}`;
}

export type Row = EntryInput & { key: string };

function blankRow(subHeadId: string): Row {
  return {
    key: newRowKey(),
    id: null,
    subHeadId,
    rbeMaterial: 0,
    rbeService: 0,
    beMaterial: 0,
    beService: 0,
    rbeQty: 0,
    rbeRate: 0,
    beQty: 0,
    beRate: 0,
    workType: "NEW" as EntryInput["workType"],
    recurringOneTime: "ONE_TIME" as EntryInput["recurringOneTime"],
    referenceTakenFrom: "",
    justification: "",
    remarks: "",
  };
}

/**
 * The RBE/BE Rate actually in effect for a row right now — see
 * lib/entry-amount.ts's resolveRate: for Chemical this is the LIVE admin
 * master rate as long as the header isn't APPROVED yet (once APPROVED, the
 * frozen stored value is authoritative — see lib/workflow.ts's
 * freezeQtyRateOnApproval); for Power it's always the row's own typed
 * value; R&M doesn't use Rate at all.
 */
export function rowAmounts(r: Row, broadPnlHead: BroadPnlHeadCode, rateUom: RateUomInfo | undefined, headerStatus: string) {
  const rbeRate = resolveRate(broadPnlHead, r.rbeRate, rateUom?.rbeRate, headerStatus);
  const beRate = resolveRate(broadPnlHead, r.beRate, rateUom?.beRate, headerStatus);
  const rbe = calcRbeAmount({ ...r, rbeRate }, broadPnlHead);
  const be = calcBeAmount({ ...r, beRate }, broadPnlHead);
  return { rbe, be, rbeRate, beRate };
}

export function EntryGrid({
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
  editable,
  attachmentsByEntryId,
}: {
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
  editable: boolean;
  attachmentsByEntryId: Record<string, AttachmentInfo[]>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => initialEntries.map((e) => ({ ...e, key: e.id ?? newRowKey() })));
  const [extraHeadIds, setExtraHeadIds] = useState<string[]>([]);
  const [addHeadSelection, setAddHeadSelection] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [collapsedHeadIds, setCollapsedHeadIds] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);

  const subHeadIndex = useMemo(() => {
    const map = new Map<string, { code: string; name: string; budgetHeadId: string }>();
    for (const h of budgetHeads) {
      for (const s of h.subHeads) map.set(s.id, { code: s.code, name: s.name, budgetHeadId: h.id });
    }
    return map;
  }, [budgetHeads]);

  const budgetHeadById = useMemo(() => new Map(budgetHeads.map((h) => [h.id, h])), [budgetHeads]);

  const activeHeadIds = useMemo(() => {
    const ids = new Set<string>(extraHeadIds);
    for (const r of rows) {
      const bh = subHeadIndex.get(r.subHeadId)?.budgetHeadId;
      if (bh) ids.add(bh);
    }
    return [...ids];
  }, [rows, extraHeadIds, subHeadIndex]);

  const availableHeadsToAdd = budgetHeads.filter((h) => !activeHeadIds.includes(h.id));

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow(subHeadId: string) {
    setRows((prev) => [...prev, blankRow(subHeadId)]);
  }

  function addRows(newRows: Omit<Row, "key">[]) {
    setRows((prev) => [...prev, ...newRows.map((r) => ({ ...r, key: newRowKey() }))]);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function addHead() {
    if (addHeadSelection && !activeHeadIds.includes(addHeadSelection)) {
      setExtraHeadIds((prev) => [...prev, addHeadSelection]);
      setAddHeadSelection("");
    }
  }

  function removeEmptyHead(headId: string) {
    setExtraHeadIds((prev) => prev.filter((id) => id !== headId));
  }

  function toggleCollapse(headId: string) {
    setCollapsedHeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(headId)) next.delete(headId);
      else next.add(headId);
      return next;
    });
  }

  function collapseAll() {
    setCollapsedHeadIds(new Set(activeHeadIds));
  }

  function expandAll() {
    setCollapsedHeadIds(new Set());
  }

  function handleSaveDraft() {
    setMessage(null);
    startTransition(async () => {
      const payload: EntryInput[] = rows.map(({ key: _key, ...rest }) => rest);
      const result = await saveDraftEntries(headerId, payload);
      if (result.ok) {
        setMessage({ ok: true, text: "Saved." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  function handleSubmit() {
    setMessage(null);
    startTransition(async () => {
      const payload: EntryInput[] = rows.map(({ key: _key, ...rest }) => rest);
      const saveResult = await saveDraftEntries(headerId, payload);
      if (!saveResult.ok) {
        setMessage({ ok: false, text: saveResult.error });
        return;
      }
      const result = await submitBudget(headerId);
      if (result.ok) {
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  function headOf(r: Row): BudgetHeadOption | undefined {
    const bhId = subHeadIndex.get(r.subHeadId)?.budgetHeadId;
    return bhId ? budgetHeadById.get(bhId) : undefined;
  }

  const grandRbe = rows.reduce((sum, r) => {
    const head = headOf(r);
    if (!head) return sum;
    return sum + rowAmounts(r, head.broadPnlHead, rateUomMap[r.subHeadId], headerStatus).rbe;
  }, 0);
  const grandBe = rows.reduce((sum, r) => {
    const head = headOf(r);
    if (!head) return sum;
    return sum + rowAmounts(r, head.broadPnlHead, rateUomMap[r.subHeadId], headerStatus).be;
  }, 0);

  // Reference panel — visible immediately for the whole Cost Centre, independent of
  // which Budget Heads have been added to this proposal yet (fixes the 2026-08-25
  // report: LY/Approved BE/YTD Actual only ever showed once a Sub Head row existed).
  // Skips a Sub Head only when ALL three admin-uploaded figures are zero/absent.
  // Grouped by Budget Head, each with its own subtotal row when it has more than
  // one qualifying Sub Head, plus one grand Subtotal row for the whole Cost Centre
  // (matching exactly what the KPI tiles above sum to — see budgets/[id]/page.tsx;
  // fixed 2026-08-25 alongside the KPI tiles for the same "top cards showed zero"
  // report).
  const referenceGroups = useMemo(() => {
    return budgetHeads
      .map((h) => ({
        head: h,
        rows: h.subHeads
          .map((s) => ({ subHead: s, actuals: subHeadActuals[s.code] }))
          .filter((r): r is { subHead: SubHeadOption; actuals: SubHeadActuals } => {
            const a = r.actuals;
            return !!a && (a.lyActual !== 0 || a.approvedBe !== 0 || a.ytdActual !== 0);
          }),
      }))
      .filter((g) => g.rows.length > 0);
  }, [budgetHeads, subHeadActuals]);

  const referenceSubtotal = referenceGroups.reduce(
    (s, g) => {
      for (const r of g.rows) {
        s.lyActual += r.actuals.lyActual;
        s.approvedBe += r.actuals.approvedBe;
        s.ytdActual += r.actuals.ytdActual;
      }
      return s;
    },
    { lyActual: 0, approvedBe: 0, ytdActual: 0 }
  );

  return (
    <div className="space-y-5">
      {referenceGroups.length > 0 && (
        <div className="border border-stone-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-stone-50 border-b border-stone-100">
            <span className="text-sm font-semibold text-stone-800">Reference: Actuals for this Cost Centre</span>
            <span className="ml-2 text-xs text-stone-400 font-normal">(admin-uploaded — visible for every Budget Head, not just ones added below; figures in ₹ Lakh)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-stone-400 border-b border-stone-100 bg-white">
                <tr>
                  <th className="px-4 py-2 font-medium">Budget Head</th>
                  <th className="px-4 py-2 font-medium">{BUDGET_SUB_HEAD_LABEL}</th>
                  <th className="px-4 py-2 font-medium text-right">LY Actual ({lyFyLabel})</th>
                  <th className="px-4 py-2 font-medium text-right">Approved BE ({cfyFyLabel})</th>
                  <th className="px-4 py-2 font-medium text-right">YTD Actual ({cfyFyLabel})</th>
                </tr>
              </thead>
              <tbody>
                {referenceGroups.map((g) => {
                  const headSubtotal = g.rows.reduce(
                    (s, r) => ({
                      lyActual: s.lyActual + r.actuals.lyActual,
                      approvedBe: s.approvedBe + r.actuals.approvedBe,
                      ytdActual: s.ytdActual + r.actuals.ytdActual,
                    }),
                    { lyActual: 0, approvedBe: 0, ytdActual: 0 }
                  );
                  return (
                    <Fragment key={g.head.id}>
                      {g.rows.map((r) => (
                        <tr key={r.subHead.id} className="border-b border-stone-50 last:border-0">
                          <td className="px-4 py-2 text-stone-500">
                            {g.head.name} <span className="text-stone-300">({g.head.broadPnlHeadLabel})</span>
                          </td>
                          <td className="px-4 py-2 text-stone-700">{r.subHead.name}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-stone-500">{formatLakh(r.actuals.lyActual)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-stone-500">{formatLakh(r.actuals.approvedBe)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-stone-500">{formatLakh(r.actuals.ytdActual)}</td>
                        </tr>
                      ))}
                      {/* Per-Budget-Head subtotal — only when the head has more than one
                          qualifying Sub Head, otherwise it would just repeat the single row. */}
                      {g.rows.length > 1 && (
                        <tr className="border-b border-stone-100 bg-stone-50/70 font-medium">
                          <td className="px-4 py-2 text-stone-500" colSpan={2}>
                            {g.head.name} subtotal
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-stone-600">{formatLakh(headSubtotal.lyActual)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-stone-600">{formatLakh(headSubtotal.approvedBe)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-stone-600">{formatLakh(headSubtotal.ytdActual)}</td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-stone-200 bg-stone-50 font-semibold">
                  <td className="px-4 py-2 text-stone-700" colSpan={2}>
                    Subtotal — Cost Centre
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-brand-navy">{formatLakh(referenceSubtotal.lyActual)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-brand-navy">{formatLakh(referenceSubtotal.approvedBe)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-brand-navy">{formatLakh(referenceSubtotal.ytdActual)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Budget Heads</h3>
        <div className="flex items-center gap-3">
          {activeHeadIds.length > 0 && (
            <div className="flex items-center gap-1">
              <button type="button" onClick={collapseAll} className="text-xs font-medium text-stone-500 hover:text-stone-800">
                Collapse All
              </button>
              <span className="text-stone-300">|</span>
              <button type="button" onClick={expandAll} className="text-xs font-medium text-stone-500 hover:text-stone-800">
                Expand All
              </button>
            </div>
          )}
          {editable && (
            <ExcelUploadButton headerId={headerId} budgetHeads={budgetHeads} onParsed={addRows} />
          )}
          {editable && availableHeadsToAdd.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={addHeadSelection}
                onChange={(e) => setAddHeadSelection(e.target.value)}
                className="text-xs border border-stone-200 rounded-lg px-2 py-1"
              >
                <option value="">-- select a Budget Head --</option>
                {["R & M", "Power", "Chemical"].map((group) => {
                  const opts = availableHeadsToAdd.filter((h) => h.broadPnlHeadLabel === group);
                  if (opts.length === 0) return null;
                  return (
                    <optgroup key={group} label={group}>
                      {opts.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              <button
                type="button"
                onClick={addHead}
                disabled={!addHeadSelection}
                className="text-xs font-medium text-brand-orange hover:text-brand-orange-dark disabled:opacity-40"
              >
                + Add Budget Head
              </button>
            </div>
          )}
        </div>
      </div>

      {activeHeadIds.length === 0 && (
        <p className="text-sm text-stone-400 border border-dashed border-stone-200 rounded-lg p-6 text-center">
          {editable ? "Add a Budget Head above to start." : "No Budget Heads in this proposal."}
        </p>
      )}

      {activeHeadIds.map((headId) => {
        const head = budgetHeadById.get(headId);
        if (!head) return null;
        const qtyRate = isQtyRateHead(head.broadPnlHead);
        const headRows = rows.filter((r) => subHeadIndex.get(r.subHeadId)?.budgetHeadId === headId);
        const collapsed = collapsedHeadIds.has(headId);

        // Group this head's rows by Sub Head for the summary/roll-up.
        const bySubHead = new Map<string, Row[]>();
        for (const r of headRows) {
          const list = bySubHead.get(r.subHeadId) ?? [];
          list.push(r);
          bySubHead.set(r.subHeadId, list);
        }

        const headRbe = headRows.reduce((s, r) => s + rowAmounts(r, head.broadPnlHead, rateUomMap[r.subHeadId], headerStatus).rbe, 0);
        const headBe = headRows.reduce((s, r) => s + rowAmounts(r, head.broadPnlHead, rateUomMap[r.subHeadId], headerStatus).be, 0);
        const headLyActual = head.subHeads.reduce((s, sh) => s + (subHeadActuals[sh.code]?.lyActual ?? 0), 0);
        const headApprovedBe = head.subHeads.reduce((s, sh) => s + (subHeadActuals[sh.code]?.approvedBe ?? 0), 0);
        const headYtdActual = head.subHeads.reduce((s, sh) => s + (subHeadActuals[sh.code]?.ytdActual ?? 0), 0);

        return (
          <div key={headId} className="border border-stone-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
              <button type="button" onClick={() => toggleCollapse(headId)} className="flex items-center gap-2 text-left">
                <span className="text-stone-400 text-xs">{collapsed ? "▶" : "▼"}</span>
                <span className="text-sm font-semibold text-stone-800">
                  {head.name} <span className="text-xs text-stone-400 font-normal">({head.broadPnlHeadLabel})</span>
                </span>
              </button>
              <div className="flex items-center gap-4">
                {collapsed && (
                  <span className="text-xs text-stone-500">
                    RBE {formatLakh(headRbe)} · BE {formatLakh(headBe)}
                  </span>
                )}
                {editable && headRows.length === 0 && (
                  <button type="button" onClick={() => removeEmptyHead(headId)} className="text-xs text-stone-400 hover:text-red-600">
                    Remove
                  </button>
                )}
              </div>
            </div>

            {!collapsed && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-stone-400 border-b border-stone-100 bg-white">
                      <tr>
                        <th className="px-4 py-2 font-medium">{BUDGET_SUB_HEAD_LABEL}</th>
                        <th className="px-4 py-2 font-medium text-right">LY Actual ({lyFyLabel})</th>
                        <th className="px-4 py-2 font-medium text-right">Approved BE ({cfyFyLabel})</th>
                        <th className="px-4 py-2 font-medium text-right">YTD Actual ({cfyFyLabel})</th>
                        <th className="px-4 py-2 font-medium text-right">RBE ({cfyFyLabel})</th>
                        <th className="px-4 py-2 font-medium text-right">BE ({nfyFyLabel})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Every Sub Head under this head, not just ones with an added row — so
                          admin-uploaded actuals show immediately (2026-08-25 fix). */}
                      {head.subHeads.map((s) => {
                        const subHeadId = s.id;
                        const subRows = bySubHead.get(subHeadId) ?? [];
                        const actuals = subHeadActuals[s.code];
                        const lyActual = actuals?.lyActual ?? 0;
                        const approvedBe = actuals?.approvedBe ?? 0;
                        const ytdActual = actuals?.ytdActual ?? 0;
                        const rateUom = rateUomMap[subHeadId];
                        const rbeSum = subRows.reduce((s2, r) => s2 + rowAmounts(r, head.broadPnlHead, rateUom, headerStatus).rbe, 0);
                        const beSum = subRows.reduce((s2, r) => s2 + rowAmounts(r, head.broadPnlHead, rateUom, headerStatus).be, 0);
                        // No fallback of any kind — blank/zero is shown as exactly that, never
                        // substituted with Approved BE (see the 2026-08-24 decision).
                        const belowYtd = rbeSum > 0 && rbeSum < ytdActual;
                        return (
                          <tr key={subHeadId} className="border-b border-stone-50 last:border-0">
                            <td className="px-4 py-2 text-stone-700">{s.name}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-stone-500">{formatLakh(lyActual)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-stone-500">{formatLakh(approvedBe)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-stone-500">{formatLakh(ytdActual)}</td>
                            <td className={`px-4 py-2 text-right tabular-nums font-medium ${belowYtd ? "text-red-600" : "text-brand-navy"}`}>
                              {formatLakh(rbeSum)}
                              {belowYtd && <div className="text-[10px] font-normal">below YTD Actual</div>}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums font-medium text-brand-navy">{formatLakh(beSum)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {head.subHeads.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-stone-200 bg-stone-50 font-semibold">
                          <td className="px-4 py-2 text-stone-700">Total</td>
                          <td className="px-4 py-2 text-right tabular-nums text-stone-600">{formatLakh(headLyActual)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-stone-600">{formatLakh(headApprovedBe)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-stone-600">{formatLakh(headYtdActual)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-brand-navy">{formatLakh(headRbe)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-brand-navy">{formatLakh(headBe)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                <div className="p-4 space-y-4">
                  {headRows.map((r, idx) => {
                    const info = subHeadIndex.get(r.subHeadId);
                    const rateUom = rateUomMap[r.subHeadId];
                    const uom = rateUom?.uom ?? null;
                    const { rbe, be, rbeRate, beRate } = rowAmounts(r, head.broadPnlHead, rateUom, headerStatus);
                    const adminRate = isAdminRateHead(head.broadPnlHead);
                    const rateUnset = adminRate && rateUom?.rbeRate == null;
                    return (
                      <div key={r.key} className="border border-stone-100 rounded-lg p-3 bg-stone-50/50">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-stone-400">Item {idx + 1}</span>
                          {editable && (
                            <button
                              type="button"
                              onClick={() => removeRow(r.key)}
                              className="text-stone-400 hover:text-red-600"
                              aria-label="Remove item"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        <div className="mb-3">
                          <label className="text-xs font-medium text-stone-500 block mb-1">{BUDGET_SUB_HEAD_LABEL}</label>
                          <select
                            value={r.subHeadId}
                            disabled={!editable}
                            onChange={(e) => updateRow(r.key, { subHeadId: e.target.value })}
                            className="w-full text-sm border border-stone-200 rounded-lg px-2 py-1.5 disabled:bg-stone-50"
                          >
                            {head.subHeads.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.code} — {s.name}
                              </option>
                            ))}
                          </select>
                          {!info && <p className="text-[11px] text-red-600 mt-1">Unrecognized Sub Head.</p>}
                        </div>

                        {qtyRate ? (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                            <NumberField
                              label={`RBE Qty${uom ? ` (${uom})` : ""}`}
                              value={r.rbeQty}
                              editable={editable}
                              onChange={(v) => updateRow(r.key, { rbeQty: v })}
                            />
                            {adminRate ? (
                              <ReadOnlyField label="RBE Rate (Admin)" value={rbeRate} hint={rateUnset ? "Not set by admin" : undefined} />
                            ) : (
                              <NumberField label="RBE Rate" value={r.rbeRate} editable={editable} onChange={(v) => updateRow(r.key, { rbeRate: v })} />
                            )}
                            <NumberField
                              label={`BE Qty${uom ? ` (${uom})` : ""}`}
                              value={r.beQty}
                              editable={editable}
                              onChange={(v) => updateRow(r.key, { beQty: v })}
                            />
                            {adminRate ? (
                              <ReadOnlyField label="BE Rate (Admin)" value={beRate} hint={rateUnset ? "Not set by admin" : undefined} />
                            ) : (
                              <NumberField label="BE Rate" value={r.beRate} editable={editable} onChange={(v) => updateRow(r.key, { beRate: v })} />
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                            <NumberField label="RBE Material" value={r.rbeMaterial} editable={editable} onChange={(v) => updateRow(r.key, { rbeMaterial: v })} />
                            <NumberField label="RBE Service" value={r.rbeService} editable={editable} onChange={(v) => updateRow(r.key, { rbeService: v })} />
                            <NumberField label="BE Material" value={r.beMaterial} editable={editable} onChange={(v) => updateRow(r.key, { beMaterial: v })} />
                            <NumberField label="BE Service" value={r.beService} editable={editable} onChange={(v) => updateRow(r.key, { beService: v })} />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="text-xs font-medium text-stone-500 block mb-1">Work Type</label>
                            <select
                              value={r.workType}
                              disabled={!editable}
                              onChange={(e) => updateRow(r.key, { workType: e.target.value as Row["workType"] })}
                              className="w-full text-sm border border-stone-200 rounded-lg px-2 py-1.5 disabled:bg-stone-50"
                            >
                              {WORK_TYPES.map((w) => (
                                <option key={w.value} value={w.value}>
                                  {w.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-stone-500 block mb-1">Recurring / One-Time</label>
                            <select
                              value={r.recurringOneTime}
                              disabled={!editable}
                              onChange={(e) => updateRow(r.key, { recurringOneTime: e.target.value as Row["recurringOneTime"] })}
                              className="w-full text-sm border border-stone-200 rounded-lg px-2 py-1.5 disabled:bg-stone-50"
                            >
                              <option value="RECURRING">Recurring</option>
                              <option value="ONE_TIME">One-Time</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="text-xs font-medium text-stone-500 block mb-1">Reference Taken From</label>
                            <input
                              value={r.referenceTakenFrom}
                              disabled={!editable}
                              onChange={(e) => updateRow(r.key, { referenceTakenFrom: e.target.value })}
                              className="w-full text-sm border border-stone-200 rounded-lg px-2 py-1.5 disabled:bg-stone-50"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-stone-500 block mb-1">
                              Justification <span className="text-red-500">*</span>
                            </label>
                            <input
                              value={r.justification}
                              disabled={!editable}
                              required
                              onChange={(e) => updateRow(r.key, { justification: e.target.value })}
                              className="w-full text-sm border border-stone-200 rounded-lg px-2 py-1.5 disabled:bg-stone-50"
                            />
                          </div>
                        </div>

                        <div className="mb-3">
                          <label className="text-xs font-medium text-stone-500 block mb-1">Remarks</label>
                          <input
                            value={r.remarks}
                            disabled={!editable}
                            onChange={(e) => updateRow(r.key, { remarks: e.target.value })}
                            className="w-full text-sm border border-stone-200 rounded-lg px-2 py-1.5 disabled:bg-stone-50"
                          />
                        </div>

                        {r.id ? (
                          <AttachmentUploader entryId={r.id} initialAttachments={attachmentsByEntryId[r.id] ?? []} editable={editable} />
                        ) : (
                          editable && <p className="text-xs text-stone-400 italic">Save first to attach files.</p>
                        )}

                        <div className="mt-3 flex justify-end gap-6 text-xs border-t border-stone-100 pt-3">
                          <span className="text-stone-500">
                            RBE Amount: <span className="font-semibold text-brand-navy tabular-nums">{formatLakh(rbe)}</span>
                          </span>
                          <span className="text-stone-500">
                            BE Amount: <span className="font-semibold text-brand-navy tabular-nums">{formatLakh(be)}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {editable && (
                    <AddRowControl subHeads={head.subHeads} onAdd={addRow} />
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}

      {activeHeadIds.length > 0 && (
        <div className="flex justify-end gap-6 text-sm font-medium text-stone-700 bg-stone-100 rounded-lg px-3 py-2">
          <span>
            Total RBE ({cfyFyLabel}): <span className="text-brand-navy tabular-nums">{formatLakh(grandRbe)}</span>
          </span>
          <span>
            Total BE ({nfyFyLabel}): <span className="text-brand-navy tabular-nums">{formatLakh(grandBe)}</span>
          </span>
        </div>
      )}

      {editable && (
        <div className="flex justify-end gap-2">
          {message && (
            <span className={`self-center text-sm mr-auto ${message.ok ? "text-brand-navy" : "text-red-600"}`}>{message.text}</span>
          )}
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => setReviewOpen(true)}
            className="rounded-lg border border-brand-navy text-brand-navy px-4 py-1.5 text-sm font-medium hover:bg-brand-navy-light disabled:opacity-40"
          >
            Review
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleSaveDraft}
            className="rounded-lg border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
          {headerStatus === "DRAFT" && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark disabled:opacity-50"
            >
              {isPending ? "Submitting..." : "Submit"}
            </button>
          )}
        </div>
      )}

      {reviewOpen && (
        <ReviewPanel
          rows={rows}
          budgetHeads={budgetHeads}
          subHeadIndex={subHeadIndex}
          rateUomMap={rateUomMap}
          headerStatus={headerStatus}
          costCentreName={costCentreName}
          cycleLabel={cycleLabel}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  editable,
  onChange,
}: {
  label: string;
  value: number;
  editable: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-stone-500 block mb-1">{label}</label>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        disabled={!editable}
        onChange={(e) => onChange(Number(e.target.value))}
        onFocus={(e) => e.target.select()}
        className="w-full text-sm border border-stone-200 rounded-lg px-2 py-1.5 disabled:bg-stone-50"
      />
    </div>
  );
}

/** Read-only figure — used for Chemical's Rate, which the Location User never types (admin-maintained per kg, see SubHeadRate). Absolute rupees (not Lakhs — a per-unit rate in Lakhs would be meaningless), Indian-formatted. */
function ReadOnlyField({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-stone-500 block mb-1">{label}</label>
      <div className="w-full text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-stone-100 text-stone-600 tabular-nums">
        {formatINR(value)}
      </div>
      {hint && <p className="text-[10px] text-amber-600 mt-0.5">{hint}</p>}
    </div>
  );
}

function AddRowControl({ subHeads, onAdd }: { subHeads: SubHeadOption[]; onAdd: (subHeadId: string) => void }) {
  const [selection, setSelection] = useState(subHeads[0]?.id ?? "");
  return (
    <div className="flex items-center gap-2 pt-1">
      <select value={selection} onChange={(e) => setSelection(e.target.value)} className="text-xs border border-stone-200 rounded-lg px-2 py-1">
        {subHeads.map((s) => (
          <option key={s.id} value={s.id}>
            {s.code} — {s.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => selection && onAdd(selection)}
        disabled={!selection}
        className="text-xs font-medium text-brand-orange hover:text-brand-orange-dark disabled:opacity-40"
      >
        + Add Row
      </button>
    </div>
  );
}
