import { prisma } from "@/lib/prisma";
import { getActiveCycle } from "@/lib/cycle";
import { getSubHeadRateUomMap } from "@/lib/sub-head-rate-uom";
import { BROAD_PNL_HEAD_LABELS, BUDGET_SUB_HEAD_LABEL, cfyLabel, nfyLabel } from "@/lib/labels";
import { RateUomForm } from "./RateUomForm";
import { BroadPnlHead } from "@prisma/client";

export async function RatesUomTab() {
  const [heads, cycle] = await Promise.all([
    prisma.budgetHead.findMany({
      where: { broadPnlHead: { in: [BroadPnlHead.POWER, BroadPnlHead.CHEMICAL] } },
      include: { subHeads: { orderBy: { code: "asc" } } },
      orderBy: [{ broadPnlHead: "asc" }, { name: "asc" }],
    }),
    getActiveCycle(),
  ]);

  const subHeadIds = heads.flatMap((h) => h.subHeads.map((s) => s.id));
  const rateUomMap = cycle
    ? await getSubHeadRateUomMap(subHeadIds, cycle)
    : {};

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-stone-200 p-4 text-xs text-stone-500">
        UOM here applies to both <span className="font-medium">Power</span> and{" "}
        <span className="font-medium">Chemical</span> Budget Sub Heads — R&amp;M keeps its Material/Service split and
        has no UOM/Rate. UOM is shown inline (e.g. &ldquo;Qty (Ltr)&rdquo;) on every entry row for these Sub Heads.
        Only <span className="font-medium">Chemical</span>&apos;s Rate is admin-maintained here, set per fiscal year
        (per kg) — the Location User enters only Qty for Chemical. <span className="font-medium">Power</span>&apos;s
        Rate is entered by the Location User directly on the entry grid, just like its Qty.
        {!cycle && (
          <p className="mt-1 text-amber-600">
            No budget cycle is currently open — Rate cannot be set until one is (see Settings tab).
          </p>
        )}
      </div>

      {(["POWER", "CHEMICAL"] as const).map((broadPnlHead) => {
        const headsForGroup = heads.filter((h) => h.broadPnlHead === broadPnlHead);
        if (headsForGroup.length === 0) return null;
        return (
          <div key={broadPnlHead} className="space-y-3">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
              {BROAD_PNL_HEAD_LABELS[broadPnlHead]}
            </h3>
            {headsForGroup.map((h) => (
              <div key={h.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <div className="px-4 py-2 bg-stone-50 border-b border-stone-100">
                  <span className="text-sm font-semibold text-stone-800">
                    {h.name} <span className="font-mono text-xs text-stone-400">({h.code})</span>
                  </span>
                </div>
                <div className="divide-y divide-stone-50">
                  {h.subHeads.map((sh) => {
                    const info = rateUomMap[sh.id];
                    return (
                      <div key={sh.id} className="px-4 py-3">
                        <div className="text-xs font-medium text-stone-700 mb-1.5">
                          {sh.code} — {sh.name}
                        </div>
                        <RateUomForm
                          subHeadId={sh.id}
                          uom={info?.uom ?? ""}
                          showRate={broadPnlHead === "CHEMICAL"}
                          cfyLabel={cycle ? cfyLabel(cycle) : ""}
                          nfyLabel={cycle ? nfyLabel(cycle) : ""}
                          cfyFiscalYear={cycle?.financialYearRBE ?? ""}
                          nfyFiscalYear={cycle?.financialYearBE ?? ""}
                          cfyRate={info?.rbeRate ?? null}
                          nfyRate={info?.beRate ?? null}
                        />
                      </div>
                    );
                  })}
                  {h.subHeads.length === 0 && (
                    <div className="px-4 py-3 text-xs text-stone-400 italic">
                      No {BUDGET_SUB_HEAD_LABEL.toLowerCase()}s under this head yet.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {heads.length === 0 && (
        <p className="text-sm text-stone-400 bg-white rounded-xl border border-stone-200 p-4">
          No Power/Chemical Budget Heads exist yet — add one in the Funds tab first.
        </p>
      )}
    </div>
  );
}
