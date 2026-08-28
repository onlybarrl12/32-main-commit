import Image from "next/image";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getAccessibleCostCentreIds } from "@/lib/rbac";
import { Prisma } from "@prisma/client";
import { getReportData } from "@/lib/reports";
import { formatCycleLabel } from "@/lib/labels";
import { ReportTabs } from "./ReportTabs";
import { RmFundWiseTab } from "./RmFundWiseTab";
import { RmCompiledTab } from "./RmCompiledTab";
import { QtyRateReportTab } from "./QtyRateReportTab";
import { CostCentreStatusTab } from "./CostCentreStatusTab";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; pipeline?: string; companyCode?: string; base?: string; location?: string; cycleId?: string }>;
}) {
  const filters = await searchParams;
  const tab = filters.tab ?? "summary";
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // The original Summary report's own data — only fetched for that tab so
  // switching to one of the newer tabs (added 2026-08-26) doesn't run these
  // queries pointlessly; each other tab fetches its own data independently.
  const accessibleIds = tab === "summary" ? await getAccessibleCostCentreIds(user.access) : "ALL" as const;
  const scopeWhere: Prisma.CostCentreWhereInput = accessibleIds === "ALL" ? {} : { id: { in: accessibleIds } };

  const [pipelines, companyCodes, cycles, locationsForFilter, data] =
    tab === "summary"
      ? await Promise.all([
          prisma.pipeline.findMany({ where: { costCentres: { some: scopeWhere } }, orderBy: { code: "asc" } }),
          prisma.companyCode.findMany({ where: { costCentres: { some: scopeWhere } }, orderBy: { code: "asc" } }),
          prisma.budgetCycle.findMany({ orderBy: { createdAt: "desc" } }),
          prisma.costCentre.findMany({
            where: {
              ...scopeWhere,
              ...(filters.pipeline ? { pipelineId: filters.pipeline } : {}),
              ...(filters.companyCode ? { companyCodeId: filters.companyCode } : {}),
            },
            orderBy: { code: "asc" },
          }),
          getReportData(user.access, filters),
        ])
      : [[], [], [], [], { cycle: null, rows: [], grand: { lyActual: 0, approvedBE: 0, proposedRBE: 0, proposedBE: 0 } }] as const;

  const exportQuery = new URLSearchParams();
  if (filters.pipeline) exportQuery.set("pipeline", filters.pipeline);
  if (filters.companyCode) exportQuery.set("companyCode", filters.companyCode);
  if (filters.location) exportQuery.set("location", filters.location);
  if (data.cycle) exportQuery.set("cycleId", data.cycle.id);

  return (
    <div className="space-y-6">
      {/* Letterhead — deliberately distinct from the app's teal/stone chrome elsewhere,
          using IndianOil's real brand colors (sampled from the provided logo asset). */}
      <div className="bg-white rounded-xl border-2 p-6 flex items-center gap-4" style={{ borderColor: "#312D73" }}>
        <Image src="/brand/indianoil-logo.png" alt="IndianOil" width={56} height={56} priority />
        <div className="flex-1">
          <div className="text-lg font-bold" style={{ color: "#312D73" }}>
            Indian Oil Corporation Limited
          </div>
          <div className="text-sm font-medium" style={{ color: "#EC6519" }}>
            South Eastern Region Pipelines (SERPL)
          </div>
          <div className="text-xs text-stone-500 mt-1">
            R&amp;M Budget Report
            {data.cycle && ` — ${formatCycleLabel(data.cycle)}`}
          </div>
        </div>
        <div className="text-right text-xs text-stone-400">
          Generated {new Date().toLocaleString("en-IN")}
          <br />
          by {user.username}
        </div>
      </div>

      <ReportTabs />

      {tab === "summary" && (
        <>
          <form className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <FilterSelect name="pipeline" label="Pipeline" defaultValue={filters.pipeline ?? ""} options={pipelines.map((p) => ({ value: p.id, label: p.code }))} />
              <FilterSelect name="companyCode" label="Company Code" defaultValue={filters.companyCode ?? ""} options={companyCodes.map((c) => ({ value: c.id, label: c.code }))} />
              <FilterSelect
                name="location"
                label="Cost Centre"
                defaultValue={filters.location ?? ""}
                options={locationsForFilter.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` }))}
              />
              <FilterSelect
                name="cycleId"
                label="Financial Year"
                defaultValue={data.cycle?.id ?? ""}
                options={cycles.map((c) => ({ value: c.id, label: formatCycleLabel(c) }))}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark">
                Search
              </button>
              <a href="/reports" className="rounded-lg border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50">
                Reset
              </a>
              <a
                href={`/reports/export?${exportQuery.toString()}`}
                className="ml-auto rounded-lg border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Export Excel
              </a>
            </div>
          </form>

          <div className="bg-white rounded-xl border border-stone-200 p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
                  <th className="pb-2 font-medium">Cost Centre</th>
                  <th className="pb-2 font-medium">Pipeline</th>
                  <th className="pb-2 font-medium text-right">LY Actual (L)</th>
                  <th className="pb-2 font-medium text-right">Approved BE (L)</th>
                  <th className="pb-2 font-medium text-right">Proposed RBE (L)</th>
                  <th className="pb-2 font-medium text-right">Proposed BE (L)</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.costCentre.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50">
                    <td className="py-2 text-stone-800 font-medium">
                      {r.costCentre.code} — {r.costCentre.name}
                    </td>
                    <td className="py-2 text-stone-500">{r.costCentre.pipelineCode}</td>
                    <td className="py-2 text-right tabular-nums text-stone-700">{(r.lyActual / 100000).toFixed(2)}</td>
                    <td className="py-2 text-right tabular-nums text-stone-700">{(r.approvedBE / 100000).toFixed(2)}</td>
                    <td className="py-2 text-right tabular-nums text-stone-700">{(r.proposedRBE / 100000).toFixed(2)}</td>
                    <td className="py-2 text-right tabular-nums text-stone-700">{(r.proposedBE / 100000).toFixed(2)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-stone-400 text-xs italic">
                      No data for this filter yet.
                    </td>
                  </tr>
                )}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-stone-200 font-semibold">
                    <td className="py-2.5" colSpan={2}>
                      Total
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-brand-navy">{(data.grand.lyActual / 100000).toFixed(2)}</td>
                    <td className="py-2.5 text-right tabular-nums text-brand-navy">{(data.grand.approvedBE / 100000).toFixed(2)}</td>
                    <td className="py-2.5 text-right tabular-nums text-brand-navy">{(data.grand.proposedRBE / 100000).toFixed(2)}</td>
                    <td className="py-2.5 text-right tabular-nums text-brand-navy">{(data.grand.proposedBE / 100000).toFixed(2)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {tab === "rm-fund-wise" && <RmFundWiseTab filters={filters} />}
      {tab === "rm-compiled" && <RmCompiledTab filters={filters} />}
      {tab === "power-fuel" && <QtyRateReportTab broadPnlHead="POWER" tab="power-fuel" title="Power & Fuel Report" filters={filters} />}
      {tab === "chemical" && <QtyRateReportTab broadPnlHead="CHEMICAL" tab="chemical" title="Chemical Report" filters={filters} />}
      {tab === "status" && <CostCentreStatusTab filters={filters} />}

      <p className="text-xs text-stone-400 text-center">
        © {new Date().getFullYear()} Indian Oil Corporation Limited. All rights reserved.
      </p>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-xs font-medium text-stone-500 block mb-1">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
