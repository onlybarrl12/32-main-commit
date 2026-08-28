import { getCurrentUser } from "@/lib/rbac";
import { getRmCompiledReport, getExtraReportFilterOptions, type ExtraReportFilters } from "@/lib/reports-extra";
import { formatCycleLabel, lyFyLabel, cfyLabel, nfyLabel } from "@/lib/labels";
import { formatLakh } from "@/lib/format";
import { ExtraReportFilterBar } from "./ExtraReportFilterBar";

export async function RmCompiledTab({ filters }: { filters: ExtraReportFilters }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const [options, data] = await Promise.all([
    getExtraReportFilterOptions(user.access, filters),
    getRmCompiledReport(user.access, filters),
  ]);

  return (
    <div className="space-y-4">
      <ExtraReportFilterBar
        tab="rm-compiled"
        filters={filters}
        pipelines={options.pipelines}
        bases={options.bases}
        locations={options.locations}
        cycles={options.cycles.map((c) => ({ id: c.id, label: formatCycleLabel(c) }))}
        activeCycleId={data.cycle?.id}
      />

      <div className="bg-white rounded-xl border border-stone-200 p-5 overflow-x-auto">
        <div className="text-xs text-stone-400 mb-3">
          R&amp;M — Compiled Report{data.cycle && ` · ${formatCycleLabel(data.cycle)}`} · every line item, every status · figures in ₹ Lakh
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-stone-400 border-b border-stone-100">
              <th className="pb-2 pr-3 font-medium">Pipeline</th>
              <th className="pb-2 pr-3 font-medium">Base</th>
              <th className="pb-2 pr-3 font-medium">Operating Location</th>
              <th className="pb-2 pr-3 font-medium">Budget Head</th>
              <th className="pb-2 pr-3 font-medium">Budget Sub Head</th>
              <th className="pb-2 pr-3 font-medium">Work Type</th>
              <th className="pb-2 pr-3 font-medium">Recurring / One-Time</th>
              <th className="pb-2 pr-3 font-medium text-right">{data.cycle ? `LY Actual (${lyFyLabel(data.cycle)})` : "LY Actual"}</th>
              <th className="pb-2 pr-3 font-medium text-right">{data.cycle ? `Approved BE (${cfyLabel(data.cycle)})` : "Approved BE"}</th>
              <th className="pb-2 pr-3 font-medium text-right">{data.cycle ? `YTD Actual (${cfyLabel(data.cycle)})` : "YTD Actual"}</th>
              <th className="pb-2 pr-3 font-medium text-right">RBE Material</th>
              <th className="pb-2 pr-3 font-medium text-right">RBE Service</th>
              <th className="pb-2 pr-3 font-medium text-right">{data.cycle ? `RBE Total (${cfyLabel(data.cycle)})` : "RBE Total"}</th>
              <th className="pb-2 pr-3 font-medium text-right">BE Material</th>
              <th className="pb-2 pr-3 font-medium text-right">BE Service</th>
              <th className="pb-2 pr-3 font-medium text-right">{data.cycle ? `BE Total (${nfyLabel(data.cycle)})` : "BE Total"}</th>
              <th className="pb-2 pr-3 font-medium">Justification</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i} className="border-b border-stone-50 last:border-0 hover:bg-stone-50 align-top">
                <td className="py-2 pr-3 text-stone-500">{r.pipelineCode}</td>
                <td className="py-2 pr-3 text-stone-500">{r.baseName}</td>
                <td className="py-2 pr-3 text-stone-800 font-medium">
                  {r.costCentreCode} — {r.costCentreName}
                </td>
                <td className="py-2 pr-3 text-stone-500">{r.budgetHeadName}</td>
                <td className="py-2 pr-3 text-stone-600">
                  {r.subHeadCode} — {r.subHeadName}
                </td>
                <td className="py-2 pr-3 text-stone-500">{r.workType.replace(/_/g, " ")}</td>
                <td className="py-2 pr-3 text-stone-500">{r.recurringOneTime === "RECURRING" ? "Recurring" : "One-Time"}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{formatLakh(r.lyActual)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{formatLakh(r.approvedBe)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{formatLakh(r.ytdActual)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{formatLakh(r.rbeMaterial)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{formatLakh(r.rbeService)}</td>
                <td className="py-2 pr-3 text-right tabular-nums font-medium text-brand-navy">{formatLakh(r.rbeTotal)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{formatLakh(r.beMaterial)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-stone-600">{formatLakh(r.beService)}</td>
                <td className="py-2 pr-3 text-right tabular-nums font-medium text-brand-navy">{formatLakh(r.beTotal)}</td>
                <td className="py-2 pr-3 text-stone-500 max-w-[220px]">{r.justification}</td>
                <td className="py-2 text-stone-500 whitespace-nowrap">{r.status}</td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={17} className="py-6 text-center text-stone-400 text-xs italic">
                  {data.cycle ? "No R&M line items for this filter yet." : "No budget cycle is currently open."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
