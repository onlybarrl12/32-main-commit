import { getCurrentUser } from "@/lib/rbac";
import { getQtyRateReport, getExtraReportFilterOptions, type ExtraReportFilters } from "@/lib/reports-extra";
import { formatCycleLabel, lyFyLabel, cfyLabel, nfyLabel } from "@/lib/labels";
import { formatLakh, formatINR } from "@/lib/format";
import { ExtraReportFilterBar } from "./ExtraReportFilterBar";
import type { BroadPnlHeadCode } from "@/lib/entry-amount";

/** Shared by the Power & Fuel and Chemical report tabs — both are Qty x Rate reports with an identical column layout, per UXSAMPLE/SERPL_Report_Formats (1).xlsx sheets 4 and 5. */
export async function QtyRateReportTab({
  broadPnlHead,
  tab,
  title,
  filters,
}: {
  broadPnlHead: BroadPnlHeadCode;
  tab: string;
  title: string;
  filters: ExtraReportFilters;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const [options, data] = await Promise.all([
    getExtraReportFilterOptions(user.access, filters),
    getQtyRateReport(broadPnlHead, user.access, filters),
  ]);

  const grand = data.rows.reduce(
    (s, r) => ({
      lyActual: s.lyActual + r.lyActual,
      approvedBe: s.approvedBe + r.approvedBe,
      ytdActual: s.ytdActual + r.ytdActual,
      rbeAmount: s.rbeAmount + r.rbeAmount,
      beAmount: s.beAmount + r.beAmount,
    }),
    { lyActual: 0, approvedBe: 0, ytdActual: 0, rbeAmount: 0, beAmount: 0 }
  );

  return (
    <div className="space-y-4">
      <ExtraReportFilterBar
        tab={tab}
        filters={filters}
        pipelines={options.pipelines}
        bases={options.bases}
        locations={options.locations}
        cycles={options.cycles.map((c) => ({ id: c.id, label: formatCycleLabel(c) }))}
        activeCycleId={data.cycle?.id}
      />

      <div className="bg-white rounded-xl border border-stone-200 p-5 overflow-x-auto">
        <div className="text-xs text-stone-400 mb-3">
          {title}
          {data.cycle && ` · ${formatCycleLabel(data.cycle)}`} · Actual/BE figures in ₹ Lakh, Rate in ₹
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-stone-400 border-b border-stone-100">
              <th className="pb-2 pr-3 font-medium">Location Code</th>
              <th className="pb-2 pr-3 font-medium">Location Name</th>
              <th className="pb-2 pr-3 font-medium">Fund No.</th>
              <th className="pb-2 pr-3 font-medium">Budget Sub Head</th>
              <th className="pb-2 pr-3 font-medium">UOM</th>
              <th className="pb-2 pr-3 font-medium text-right">{data.cycle ? `LY Actual (${lyFyLabel(data.cycle)})` : "LY Actual"}</th>
              <th className="pb-2 pr-3 font-medium text-right">{data.cycle ? `Approved BE (${cfyLabel(data.cycle)})` : "Approved BE"}</th>
              <th className="pb-2 pr-3 font-medium text-right">{data.cycle ? `YTD Actual (${cfyLabel(data.cycle)})` : "YTD Actual"}</th>
              <th className="pb-2 pr-3 font-medium text-right">RBE Qty</th>
              <th className="pb-2 pr-3 font-medium text-right">RBE Rate</th>
              <th className="pb-2 pr-3 font-medium text-right">{data.cycle ? `RBE Amount (${cfyLabel(data.cycle)})` : "RBE Amount"}</th>
              <th className="pb-2 pr-3 font-medium text-right">BE Qty</th>
              <th className="pb-2 pr-3 font-medium text-right">BE Rate</th>
              <th className="pb-2 font-medium text-right">{data.cycle ? `BE Amount (${nfyLabel(data.cycle)})` : "BE Amount"}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={`${r.costCentreCode}-${r.subHeadCode}`} className="border-b border-stone-50 last:border-0 hover:bg-stone-50">
                <td className="py-2 pr-3 text-stone-800 font-medium">{r.costCentreCode}</td>
                <td className="py-2 pr-3 text-stone-600">{r.costCentreName}</td>
                <td className="py-2 pr-3 text-stone-400 font-mono">{r.subHeadCode}</td>
                <td className="py-2 pr-3 text-stone-500">{r.subHeadName}</td>
                <td className="py-2 pr-3 text-stone-400">{r.uom ?? "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{formatLakh(r.lyActual)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{formatLakh(r.approvedBe)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{formatLakh(r.ytdActual)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{r.rbeQty}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{formatINR(r.rbeRate)}</td>
                <td className="py-2 pr-3 text-right tabular-nums font-medium text-brand-navy">{formatLakh(r.rbeAmount)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{r.beQty}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{formatINR(r.beRate)}</td>
                <td className="py-2 text-right tabular-nums font-medium text-brand-navy">{formatLakh(r.beAmount)}</td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={14} className="py-6 text-center text-stone-400 text-xs italic">
                  {data.cycle ? "No data for this filter yet." : "No budget cycle is currently open."}
                </td>
              </tr>
            )}
          </tbody>
          {data.rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-stone-200 font-semibold">
                <td className="py-2.5" colSpan={5}>
                  Total
                </td>
                <td className="py-2.5 text-right tabular-nums text-brand-navy">{formatLakh(grand.lyActual)}</td>
                <td className="py-2.5 text-right tabular-nums text-brand-navy">{formatLakh(grand.approvedBe)}</td>
                <td className="py-2.5 text-right tabular-nums text-brand-navy">{formatLakh(grand.ytdActual)}</td>
                <td colSpan={2}></td>
                <td className="py-2.5 text-right tabular-nums text-brand-navy">{formatLakh(grand.rbeAmount)}</td>
                <td colSpan={2}></td>
                <td className="py-2.5 text-right tabular-nums text-brand-navy">{formatLakh(grand.beAmount)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
