import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getAccessibleCostCentreIds } from "@/lib/rbac";
import { Prisma } from "@prisma/client";
import { getActiveCycle } from "@/lib/cycle";
import { BASE_LOC_LABEL, cfyLabel, formatCycleLabel, nfyLabel, lyFyLabel, previousFinancialYear } from "@/lib/labels";
import { BudgetOverviewChart, type OverviewDatum } from "@/components/charts/BudgetOverviewChart";
import { BudgetHeadComparisonChart, type HeadDatum } from "@/components/charts/BudgetHeadComparisonChart";
import { getSubHeadRateUomMap } from "@/lib/sub-head-rate-uom";
import { rbeAmount, beAmount, resolveRate, type BroadPnlHeadCode } from "@/lib/entry-amount";

const inr = (v: number) => `₹${(v / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Lakh`;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ pipeline?: string; base?: string; location?: string; cycleId?: string }>;
}) {
  const { pipeline, base, location, cycleId } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const accessibleIds = await getAccessibleCostCentreIds(user.access);
  const scopeWhere: Prisma.CostCentreWhereInput = accessibleIds === "ALL" ? {} : { id: { in: accessibleIds } };

  const [pipelines, cycles] = await Promise.all([
    prisma.pipeline.findMany({ where: { costCentres: { some: scopeWhere } }, orderBy: { code: "asc" } }),
    prisma.budgetCycle.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const baseFilterWhere: Prisma.CostCentreWhereInput = { ...scopeWhere, ...(pipeline ? { pipelineId: pipeline } : {}) };
  const bases = await prisma.base.findMany({ where: { costCentres: { some: baseFilterWhere } }, orderBy: { name: "asc" } });

  const locationFilterWhere: Prisma.CostCentreWhereInput = { ...baseFilterWhere, ...(base ? { baseId: base } : {}) };
  const locations = await prisma.costCentre.findMany({ where: locationFilterWhere, orderBy: { code: "asc" } });

  const dataWhere: Prisma.CostCentreWhereInput = { ...locationFilterWhere, ...(location ? { id: location } : {}) };
  const matchingCostCentres = await prisma.costCentre.findMany({
    where: dataWhere,
    include: { companyCode: true },
  });
  const matchingIds = matchingCostCentres.map((c) => c.id);
  const costCentreById = new Map(matchingCostCentres.map((c) => [c.id, c]));

  const cycle = cycleId ? await prisma.budgetCycle.findUnique({ where: { id: cycleId } }) : await getActiveCycle();

  const headers = cycle
    ? await prisma.budgetHeader.findMany({
        where: { costCentreId: { in: matchingIds }, cycleId: cycle.id, status: { not: "DRAFT" } },
        include: { entries: { include: { subHead: { include: { budgetHead: true } } } } },
      })
    : [];

  const subHeads = await prisma.budgetSubHead.findMany({ include: { budgetHead: true } });
  const budgetHeadIdBySubHeadCode = new Map(subHeads.map((s) => [s.code, s.budgetHeadId]));

  // Not filtered by fiscalYear at the query level: LY_ACTUAL rows are tagged
  // with the FY *before* the cycle's RBE year, while APPROVED_BE/YTD_ACTUAL
  // are tagged with the RBE year itself — a single fiscalYear filter here
  // would silently return zero LY_ACTUAL rows (fixed 2026-08-25, the same
  // bug class as the Create/Approve "top cards show zero" report). Each
  // dataType is matched to its own correct fiscal year below instead,
  // mirroring src/lib/sub-head-actuals.ts's getSubHeadActualsMap exactly so
  // Home's totals can't drift from Create/Approve's.
  const actualsRows = cycle
    ? await prisma.actualsRow.findMany({
        where: { costCentreCode: { in: matchingCostCentres.map((c) => c.code) } },
      })
    : [];
  const lyFy = cycle ? previousFinancialYear(cycle.financialYearRBE) : null;

  // Live Power/Chemical rate lookup (pre-approval) so these totals match Create
  // Budget/Approve Budget/Reports exactly — see entry-amount.ts and the
  // "Rate change impact" decision.
  const touchedSubHeadIds = [...new Set(headers.flatMap((h) => h.entries.map((e) => e.subHeadId)))];
  const rateUomMap = cycle ? await getSubHeadRateUomMap(touchedSubHeadIds, cycle) : {};

  let proposedRBE = 0;
  let proposedBE = 0;
  const headTotals = new Map<string, HeadDatum>();
  const companyTotals = new Map<string, { code: string; proposedRBE: number; proposedBE: number; approvedBE: number }>();

  for (const h of headers) {
    const cc = costCentreById.get(h.costCentreId);
    const ct = cc ? companyTotals.get(cc.companyCodeId) ?? { code: cc.companyCode.code, proposedRBE: 0, proposedBE: 0, approvedBE: 0 } : null;

    for (const e of h.entries) {
      const broadPnlHead: BroadPnlHeadCode = e.subHead.budgetHead.broadPnlHead;
      const live = rateUomMap[e.subHeadId];
      const rbeRate = resolveRate(broadPnlHead, Number(e.rbeRate), live?.rbeRate, h.status);
      const beRate = resolveRate(broadPnlHead, Number(e.beRate), live?.beRate, h.status);
      const rbe = rbeAmount(
        { rbeMaterial: Number(e.rbeMaterial), rbeService: Number(e.rbeService), rbeQty: Number(e.rbeQty), rbeRate, beMaterial: 0, beService: 0, beQty: 0, beRate: 0 },
        broadPnlHead
      );
      const be = beAmount(
        { beMaterial: Number(e.beMaterial), beService: Number(e.beService), beQty: Number(e.beQty), beRate, rbeMaterial: 0, rbeService: 0, rbeQty: 0, rbeRate: 0 },
        broadPnlHead
      );
      proposedRBE += rbe;
      proposedBE += be;

      const headId = e.subHead.budgetHeadId;
      const hd = headTotals.get(headId) ?? { head: e.subHead.budgetHead.name, actual: 0, approvedBE: 0, proposedRBE: 0 };
      hd.proposedRBE += rbe;
      headTotals.set(headId, hd);

      if (ct) {
        ct.proposedRBE += rbe;
        ct.proposedBE += be;
      }
    }
    if (cc && ct) companyTotals.set(cc.companyCodeId, ct);
  }

  let lyActualTotal = 0;
  let approvedBETotal = 0;
  let ytdActualTotal = 0;
  const costCentreByCode = new Map(matchingCostCentres.map((c) => [c.code, c]));
  for (const r of actualsRows) {
    const amt = Number(r.amount);
    const isLyActual = r.dataType === "LY_ACTUAL" && r.fiscalYear === lyFy;
    const isApprovedBe = r.dataType === "APPROVED_BE" && r.fiscalYear === cycle?.financialYearRBE;
    const isYtdActual = r.dataType === "YTD_ACTUAL" && r.fiscalYear === cycle?.financialYearRBE;
    if (isLyActual) lyActualTotal += amt;
    else if (isApprovedBe) approvedBETotal += amt;
    else if (isYtdActual) ytdActualTotal += amt;

    if (isLyActual || isApprovedBe) {
      const headId = budgetHeadIdBySubHeadCode.get(r.subHeadCode);
      if (headId) {
        const hd = headTotals.get(headId) ?? { head: "", actual: 0, approvedBE: 0, proposedRBE: 0 };
        if (isLyActual) hd.actual += amt;
        else hd.approvedBE += amt;
        headTotals.set(headId, hd);
      }
    }
    if (isApprovedBe) {
      const cc = costCentreByCode.get(r.costCentreCode);
      if (cc) {
        const ct = companyTotals.get(cc.companyCodeId);
        if (ct) ct.approvedBE += amt;
      }
    }
  }

  const overviewData: OverviewDatum[] = [
    { label: "LY Actual", value: lyActualTotal },
    { label: "Approved BE", value: approvedBETotal },
    { label: "Proposed RBE", value: proposedRBE },
    { label: "YTD Actual", value: ytdActualTotal },
    { label: "Proposed BE", value: proposedBE },
  ];

  const headData = [...headTotals.values()].filter((h) => h.head);

  // New table added 2026-08-26, per UXSAMPLE/SERPL_Report_Formats (1).xlsx
  // sheet "1. Home Screen - Summary Report" — a from-scratch computation
  // (independent of headTotals/headData above, which the existing "Budget
  // Head-wise Summary" table keeps using untouched) so this addition can't
  // perturb that table's figures. R&M's 10 Budget Heads always appear as
  // individual rows in the template's exact given order (even one with no
  // data this cycle), rolled up into an R&M Total row; Power & Fuel and
  // Chemical each collapse to one aggregate row; everything sums to one
  // Grand Total.
  type CategorySummaryRow = { lyActual: number; approvedBe: number; ytdActual: number; rbe: number; be: number };
  const blankCategoryRow = (): CategorySummaryRow => ({ lyActual: 0, approvedBe: 0, ytdActual: 0, rbe: 0, be: 0 });
  const RM_HEAD_ORDER = [
    "Mainline",
    "S.B.M./ Jetty",
    "Mechanical",
    "Electrical",
    "Instrumentation",
    "Civil",
    "Telesupervisory",
    "Telecommunication",
    "Miscellaneous",
    "Lube Oil",
  ];
  const rmHeadRows = new Map<string, CategorySummaryRow>(RM_HEAD_ORDER.map((name) => [name, blankCategoryRow()]));
  const powerFuelRow = blankCategoryRow();
  const chemicalRow = blankCategoryRow();
  const budgetHeadInfoBySubHeadCode = new Map(subHeads.map((s) => [s.code, { name: s.budgetHead.name, broadPnlHead: s.budgetHead.broadPnlHead }]));

  const targetRowFor = (broadPnlHead: string, headName: string): CategorySummaryRow | undefined =>
    broadPnlHead === "RM" ? rmHeadRows.get(headName) : broadPnlHead === "POWER" ? powerFuelRow : chemicalRow;

  for (const r of actualsRows) {
    const info = budgetHeadInfoBySubHeadCode.get(r.subHeadCode);
    if (!info) continue;
    const target = targetRowFor(info.broadPnlHead, info.name);
    if (!target) continue;
    const amt = Number(r.amount);
    if (r.dataType === "LY_ACTUAL" && r.fiscalYear === lyFy) target.lyActual += amt;
    else if (r.dataType === "APPROVED_BE" && r.fiscalYear === cycle?.financialYearRBE) target.approvedBe += amt;
    else if (r.dataType === "YTD_ACTUAL" && r.fiscalYear === cycle?.financialYearRBE) target.ytdActual += amt;
  }
  for (const h of headers) {
    for (const e of h.entries) {
      const broadPnlHead: BroadPnlHeadCode = e.subHead.budgetHead.broadPnlHead;
      const target = targetRowFor(broadPnlHead, e.subHead.budgetHead.name);
      if (!target) continue;
      const live = rateUomMap[e.subHeadId];
      const rbeRate = resolveRate(broadPnlHead, Number(e.rbeRate), live?.rbeRate, h.status);
      const beRate = resolveRate(broadPnlHead, Number(e.beRate), live?.beRate, h.status);
      target.rbe += rbeAmount(
        { rbeMaterial: Number(e.rbeMaterial), rbeService: Number(e.rbeService), rbeQty: Number(e.rbeQty), rbeRate, beMaterial: 0, beService: 0, beQty: 0, beRate: 0 },
        broadPnlHead
      );
      target.be += beAmount(
        { beMaterial: Number(e.beMaterial), beService: Number(e.beService), beQty: Number(e.beQty), beRate, rbeMaterial: 0, rbeService: 0, rbeQty: 0, rbeRate: 0 },
        broadPnlHead
      );
    }
  }
  const sumRows = (rows: CategorySummaryRow[]): CategorySummaryRow =>
    rows.reduce(
      (s, r) => ({ lyActual: s.lyActual + r.lyActual, approvedBe: s.approvedBe + r.approvedBe, ytdActual: s.ytdActual + r.ytdActual, rbe: s.rbe + r.rbe, be: s.be + r.be }),
      blankCategoryRow()
    );
  const rmRows = RM_HEAD_ORDER.map((name) => ({ name, ...rmHeadRows.get(name)! }));
  const rmTotalRow = sumRows(rmRows);
  const categoryGrandTotal = sumRows([rmTotalRow, powerFuelRow, chemicalRow]);

  return (
    <div className="space-y-6">
      <form className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <FilterField label="Region" value="SERPL (Overall)" readOnly />
          <FilterSelect name="pipeline" label="Pipeline" defaultValue={pipeline ?? ""} options={pipelines.map((p) => ({ value: p.id, label: p.code }))} />
          <FilterSelect name="base" label={BASE_LOC_LABEL} defaultValue={base ?? ""} options={bases.map((b) => ({ value: b.id, label: b.name }))} />
          <FilterSelect
            name="location"
            label="Operating Location"
            defaultValue={location ?? ""}
            options={locations.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` }))}
          />
          <FilterSelect
            name="cycleId"
            label="Financial Year"
            defaultValue={cycle?.id ?? ""}
            options={cycles.map((c) => ({ value: c.id, label: formatCycleLabel(c) }))}
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark">
            Search
          </button>
          <a href="/" className="rounded-lg border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50">
            Reset
          </a>
        </div>
      </form>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiTile label={`LY Actual (${cycle ? lyFyLabel(cycle) : "—"})`} value={inr(lyActualTotal)} tone="navy" note="Admin Maintained" />
        <KpiTile label={`Approved BE (${cycle ? cfyLabel(cycle) : "—"})`} value={inr(approvedBETotal)} tone="orange" note="Admin Maintained" />
        <KpiTile label={`RBE (${cycle ? cfyLabel(cycle) : "—"})`} value={inr(proposedRBE)} tone="amber" note="Location User Entry" />
        <KpiTile label={`YTD Actual (${cycle ? cfyLabel(cycle) : "—"})`} value={inr(ytdActualTotal)} tone="amber" note="Admin Maintained" />
        <KpiTile label={`BE (${cycle ? nfyLabel(cycle) : "—"})`} value={inr(proposedBE)} tone="amber" note="Location User Entry" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Budget Overview (in Lakh)</h3>
          <BudgetOverviewChart data={overviewData} />
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Budget Head-wise Comparison</h3>
          <BudgetHeadComparisonChart data={headData} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 overflow-x-auto">
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Budget Head-wise Summary (in Lakh)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
              <th className="pb-2 font-medium">Budget Head</th>
              <th className="pb-2 font-medium text-right">LY Actual</th>
              <th className="pb-2 font-medium text-right">Approved BE</th>
              <th className="pb-2 font-medium text-right">Proposed RBE</th>
            </tr>
          </thead>
          <tbody>
            {headData.map((h) => (
              <tr key={h.head} className="border-b border-stone-50 last:border-0 hover:bg-stone-50">
                <td className="py-2 text-stone-800 font-medium">{h.head}</td>
                <td className="py-2 text-right tabular-nums text-stone-700">{(h.actual / 100000).toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums text-stone-700">{(h.approvedBE / 100000).toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums text-stone-700">{(h.proposedRBE / 100000).toFixed(2)}</td>
              </tr>
            ))}
            {headData.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-stone-400 text-xs italic">
                  No submitted budgets for this filter yet.
                </td>
              </tr>
            )}
          </tbody>
          {headData.length > 0 && (
            <tfoot>
              <tr className="border-t border-stone-200 font-semibold">
                <td className="py-2.5">Total</td>
                <td className="py-2.5 text-right tabular-nums text-brand-navy">
                  {(headData.reduce((s, h) => s + h.actual, 0) / 100000).toFixed(2)}
                </td>
                <td className="py-2.5 text-right tabular-nums text-brand-navy">
                  {(headData.reduce((s, h) => s + h.approvedBE, 0) / 100000).toFixed(2)}
                </td>
                <td className="py-2.5 text-right tabular-nums text-brand-navy">
                  {(headData.reduce((s, h) => s + h.proposedRBE, 0) / 100000).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 overflow-x-auto">
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Company Code Wise Break-up (in Lakh)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
              <th className="pb-2 font-medium">Company Code</th>
              <th className="pb-2 font-medium text-right">Approved BE</th>
              <th className="pb-2 font-medium text-right">Proposed RBE</th>
              <th className="pb-2 font-medium text-right">Difference (Approved BE − Proposed RBE)</th>
            </tr>
          </thead>
          <tbody>
            {[...companyTotals.values()].map((c) => {
              const diff = c.approvedBE - c.proposedRBE;
              return (
                <tr key={c.code} className="border-b border-stone-50 last:border-0 hover:bg-stone-50">
                  <td className="py-2 text-stone-800 font-medium">{c.code}</td>
                  <td className="py-2 text-right tabular-nums text-stone-700">{(c.approvedBE / 100000).toFixed(2)}</td>
                  <td className="py-2 text-right tabular-nums text-stone-700">{(c.proposedRBE / 100000).toFixed(2)}</td>
                  <td className={`py-2 text-right tabular-nums ${diff < 0 ? "text-red-600" : "text-stone-700"}`}>
                    {(diff / 100000).toFixed(2)}
                  </td>
                </tr>
              );
            })}
            {companyTotals.size === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-stone-400 text-xs italic">
                  No submitted budgets for this filter yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 overflow-x-auto">
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">R&amp;M / Power &amp; Fuel / Chemical — Budget Head Summary (in Lakh)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
              <th className="pb-2 font-medium">Budget Head</th>
              <th className="pb-2 font-medium text-right">{cycle ? `LY Actual (${lyFyLabel(cycle)})` : "LY Actual"}</th>
              <th className="pb-2 font-medium text-right">{cycle ? `Approved BE (${cfyLabel(cycle)})` : "Approved BE"}</th>
              <th className="pb-2 font-medium text-right">{cycle ? `YTD Actual (${cfyLabel(cycle)})` : "YTD Actual"}</th>
              <th className="pb-2 font-medium text-right">{cycle ? `RBE (${cfyLabel(cycle)})` : "RBE"}</th>
              <th className="pb-2 font-medium text-right">{cycle ? `BE (${nfyLabel(cycle)})` : "BE"}</th>
            </tr>
          </thead>
          <tbody>
            {rmRows.map((r) => (
              <tr key={r.name} className="border-b border-stone-50 last:border-0 hover:bg-stone-50">
                <td className="py-2 text-stone-800 font-medium">{r.name}</td>
                <td className="py-2 text-right tabular-nums text-stone-700">{(r.lyActual / 100000).toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums text-stone-700">{(r.approvedBe / 100000).toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums text-stone-700">{(r.ytdActual / 100000).toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums text-stone-700">{(r.rbe / 100000).toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums text-stone-700">{(r.be / 100000).toFixed(2)}</td>
              </tr>
            ))}
            <tr className="border-b border-t border-stone-200 font-semibold bg-stone-50">
              <td className="py-2">R&amp;M TOTAL</td>
              <td className="py-2 text-right tabular-nums text-brand-navy">{(rmTotalRow.lyActual / 100000).toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums text-brand-navy">{(rmTotalRow.approvedBe / 100000).toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums text-brand-navy">{(rmTotalRow.ytdActual / 100000).toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums text-brand-navy">{(rmTotalRow.rbe / 100000).toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums text-brand-navy">{(rmTotalRow.be / 100000).toFixed(2)}</td>
            </tr>
            <tr className="border-b border-stone-50">
              <td className="py-2 text-stone-800 font-medium">Power &amp; Fuel</td>
              <td className="py-2 text-right tabular-nums text-stone-700">{(powerFuelRow.lyActual / 100000).toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums text-stone-700">{(powerFuelRow.approvedBe / 100000).toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums text-stone-700">{(powerFuelRow.ytdActual / 100000).toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums text-stone-700">{(powerFuelRow.rbe / 100000).toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums text-stone-700">{(powerFuelRow.be / 100000).toFixed(2)}</td>
            </tr>
            <tr className="border-b border-stone-200">
              <td className="py-2 text-stone-800 font-medium">Chemical</td>
              <td className="py-2 text-right tabular-nums text-stone-700">{(chemicalRow.lyActual / 100000).toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums text-stone-700">{(chemicalRow.approvedBe / 100000).toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums text-stone-700">{(chemicalRow.ytdActual / 100000).toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums text-stone-700">{(chemicalRow.rbe / 100000).toFixed(2)}</td>
              <td className="py-2 text-right tabular-nums text-stone-700">{(chemicalRow.be / 100000).toFixed(2)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-stone-300 font-bold">
              <td className="py-2.5">GRAND TOTAL — ALL CATEGORIES</td>
              <td className="py-2.5 text-right tabular-nums text-brand-navy">{(categoryGrandTotal.lyActual / 100000).toFixed(2)}</td>
              <td className="py-2.5 text-right tabular-nums text-brand-navy">{(categoryGrandTotal.approvedBe / 100000).toFixed(2)}</td>
              <td className="py-2.5 text-right tabular-nums text-brand-navy">{(categoryGrandTotal.ytdActual / 100000).toFixed(2)}</td>
              <td className="py-2.5 text-right tabular-nums text-brand-navy">{(categoryGrandTotal.rbe / 100000).toFixed(2)}</td>
              <td className="py-2.5 text-right tabular-nums text-brand-navy">{(categoryGrandTotal.be / 100000).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function FilterField({ label, value, readOnly }: { label: string; value: string; readOnly?: boolean }) {
  return (
    <div>
      <label className="text-xs font-medium text-stone-500 block mb-1">{label}</label>
      <input
        value={value}
        readOnly={readOnly}
        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 bg-stone-50 text-stone-500"
      />
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

function KpiTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "navy" | "orange" | "amber" | "stone";
}) {
  const toneClasses =
    tone === "navy"
      ? "bg-brand-navy-light text-brand-navy border-brand-navy-light"
      : tone === "orange"
        ? "bg-brand-orange-light text-brand-orange border-brand-orange-light"
        : tone === "amber"
          ? "bg-amber-50 text-amber-700 border-amber-100"
          : "bg-stone-100 text-stone-500 border-stone-200";
  return (
    <div className={`rounded-xl border p-4 ${toneClasses}`}>
      <div className="flex items-center gap-2 text-xs font-medium">{label}</div>
      <div className="text-lg font-bold text-stone-900 tabular-nums mt-1">{value}</div>
      <div className="text-xs text-stone-500 mt-0.5">{note}</div>
    </div>
  );
}
