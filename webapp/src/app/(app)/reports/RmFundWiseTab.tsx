import { getCurrentUser } from "@/lib/rbac";
import { getRmFundWiseReport, getExtraReportFilterOptions, type ExtraReportFilters } from "@/lib/reports-extra";
import { formatCycleLabel, lyFyLabel, cfyLabel, nfyLabel } from "@/lib/labels";
import { formatLakh } from "@/lib/format";
import { ExtraReportFilterBar } from "./ExtraReportFilterBar";

export async function RmFundWiseTab({ filters }: { filters: ExtraReportFilters }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const [options, data] = await Promise.all([
    getExtraReportFilterOptions(user.access, filters),
    getRmFundWiseReport(user.access, filters),
  ]);

  const grand = data.rows.reduce(
    (s, r) => ({ lyActual: s.lyActual + r.lyActual, approvedBe: s.approvedBe + r.approvedBe, ytdActual: s.ytdActual + r.ytdActual, rbe: s.rbe + r.rbe, be: s.be + r.be }),
    { lyActual: 0, approvedBe: 0, ytdActual: 0, rbe: 0, be: 0 }
  );

  return (
    <div className="space-y-4">
      <ExtraReportFilterBar
        tab="rm-fund-wise"
        filters={filters}
        pipelines={options.pipelines}
        bases={options.bases}
        locations={options.locations}
        cycles={options.cycles.map((c) => ({ id: c.id, label: formatCycleLabel(c) }))}
        activeCycleId={data.cycle?.id}
      />

      <div className="bg-white rounded-xl border border-stone-200 p-5 overflow-x-auto">
        <div className="text-xs text-stone-400 mb-3">
          R&amp;M — Fund-wise Report{data.cycle && ` · ${formatCycleLabel(data.cycle)}`} · figures in ₹ Lakh
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
              <th className="pb-2 font-medium">Location Code</th>
              <th className="pb-2 font-medium">Location Name</th>
              <th className="pb-2 font-medium">Budget Head</th>
              <th className="pb-2 font-medium">Budget Sub Head</th>
              <th className="pb-2 font-medium">Fund No.</th>
              <th className="pb-2 font-medium text-right">{data.cycle ? `LY Actual (${lyFyLabel(data.cycle)})` : "LY Actual"}</th>
              <th className="pb-2 font-medium text-right">{data.cycle ? `Approved BE (${cfyLabel(data.cycle)})` : "Approved BE"}</th>
              <th className="pb-2 font-medium text-right">{data.cycle ? `RBE (${cfyLabel(data.cycle)})` : "RBE"}</th>
              <th className="pb-2 font-medium text-right">{data.cycle ? `BE (${nfyLabel(data.cycle)})` : "BE"}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={`${r.costCentreCode}-${r.subHeadCode}`} className="border-b border-stone-50 last:border-0 hover:bg-stone-50">
                <td className="py-2 text-stone-800 font-medium">{r.costCentreCode}</td>
                <td className="py-2 text-stone-600">{r.costCentreName}</td>
                <td className="py-2 text-stone-500">{r.budgetHeadName}</td>
                <td className="py-2 text-stone-500">{r.subHeadName}</td>
                <td className="py-2 text-stone-400 font-mono">{r.subHeadCode}</td>
                <td className="py-2 text-right tabular-nums text-stone-700">{formatLakh(r.lyActual)}</td>
                <td className="py-2 text-right tabular-nums text-stone-700">{formatLakh(r.approvedBe)}</td>
                <td className="py-2 text-right tabular-nums text-brand-navy">{formatLakh(r.rbe)}</td>
                <td className="py-2 text-right tabular-nums text-brand-navy">{formatLakh(r.be)}</td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-stone-400 text-xs italic">
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
                <td className="py-2.5 text-right tabular-nums text-brand-navy">{formatLakh(grand.rbe)}</td>
                <td className="py-2.5 text-right tabular-nums text-brand-navy">{formatLakh(grand.be)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
