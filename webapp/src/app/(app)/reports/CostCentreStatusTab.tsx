import { getCurrentUser } from "@/lib/rbac";
import { getCostCentreStatusReport, getExtraReportFilterOptions, type ExtraReportFilters } from "@/lib/reports-extra";
import { formatCycleLabel } from "@/lib/labels";
import { BASE_LOC_LABEL } from "@/lib/labels";
import { ExtraReportFilterBar } from "./ExtraReportFilterBar";

export async function CostCentreStatusTab({ filters }: { filters: Pick<ExtraReportFilters, "pipeline" | "base"> }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const [options, data] = await Promise.all([
    getExtraReportFilterOptions(user.access, filters),
    getCostCentreStatusReport(user.access, filters),
  ]);

  return (
    <div className="space-y-4">
      <ExtraReportFilterBar
        tab="status"
        filters={filters}
        pipelines={options.pipelines}
        bases={options.bases}
        locations={[]}
        cycles={options.cycles.map((c) => ({ id: c.id, label: formatCycleLabel(c) }))}
        activeCycleId={data.cycle?.id}
      />

      <div className="bg-white rounded-xl border border-stone-200 p-5 overflow-x-auto">
        <div className="text-xs text-stone-400 mb-3">
          Cost Centre Wise Status Report{data.cycle && ` · ${formatCycleLabel(data.cycle)}`} — where every Cost Centre's proposal currently stands
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
              <th className="pb-2 font-medium">Cost Centre</th>
              <th className="pb-2 font-medium">Operating Location</th>
              <th className="pb-2 font-medium">Company Code</th>
              <th className="pb-2 font-medium">Pipeline</th>
              <th className="pb-2 font-medium">{BASE_LOC_LABEL}</th>
              <th className="pb-2 font-medium">Current Approval Stage</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.costCentreCode} className="border-b border-stone-50 last:border-0 hover:bg-stone-50">
                <td className="py-2 text-stone-800 font-medium">{r.costCentreCode}</td>
                <td className="py-2 text-stone-600">{r.costCentreName}</td>
                <td className="py-2 text-stone-500">{r.companyCode}</td>
                <td className="py-2 text-stone-500">{r.pipelineCode}</td>
                <td className="py-2 text-stone-500">{r.baseName}</td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs border ${
                      r.status === "Approved"
                        ? "bg-brand-navy-light text-brand-navy border-brand-navy-light"
                        : r.status === "No Proposal Yet"
                          ? "bg-stone-100 text-stone-400 border-stone-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-stone-400 text-xs italic">
                  No Cost Centres for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
