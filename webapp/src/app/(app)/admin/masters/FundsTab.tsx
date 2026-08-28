import { prisma } from "@/lib/prisma";
import { deleteBudgetSubHead } from "./actions";
import { CreateBudgetHeadForm, CreateBudgetSubHeadForm } from "./CreateFundForms";
import { BROAD_PNL_HEAD_LABELS, BUDGET_SUB_HEAD_LABEL } from "@/lib/labels";
import { BroadPnlHead } from "@prisma/client";

export async function FundsTab() {
  const budgetHeads = await prisma.budgetHead.findMany({
    include: { subHeads: { orderBy: { code: "asc" } } },
    orderBy: { code: "asc" },
  });

  const headsByBroadPnlHead = new Map<BroadPnlHead, typeof budgetHeads>();
  for (const h of budgetHeads) {
    const list = headsByBroadPnlHead.get(h.broadPnlHead) ?? [];
    list.push(h);
    headsByBroadPnlHead.set(h.broadPnlHead, list);
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <CreateBudgetHeadForm />
        <CreateBudgetSubHeadForm
          budgetHeads={budgetHeads.map((h) => ({ id: h.id, label: `${h.name} (${BROAD_PNL_HEAD_LABELS[h.broadPnlHead]})` }))}
        />
      </div>

      {(Object.keys(BROAD_PNL_HEAD_LABELS) as BroadPnlHead[]).map((broadPnlHead) => {
        const heads = headsByBroadPnlHead.get(broadPnlHead) ?? [];
        if (heads.length === 0) return null;
        return (
          <div key={broadPnlHead} className="space-y-3">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
              {BROAD_PNL_HEAD_LABELS[broadPnlHead]}
            </h3>
            {heads.map((h) => (
              <div key={h.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <div className="px-4 py-2 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-800">
                    {h.name} <span className="font-mono text-xs text-stone-400">({h.code})</span>
                  </span>
                  <span className="text-xs text-stone-400">{h.subHeads.length} {BUDGET_SUB_HEAD_LABEL}(s)</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {h.subHeads.map((sh) => (
                      <tr key={sh.id} className="border-b border-stone-50 last:border-0">
                        <td className="px-4 py-2 font-mono text-xs text-brand-orange w-20">{sh.code}</td>
                        <td className="px-4 py-2 text-stone-700">{sh.name}</td>
                        <td className="px-4 py-2 text-right w-16">
                          <form action={deleteBudgetSubHead}>
                            <input type="hidden" name="id" value={sh.id} />
                            <button type="submit" className="text-xs text-red-500 hover:text-red-700">
                              Delete
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                    {h.subHeads.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-xs text-stone-400 italic">
                          No {BUDGET_SUB_HEAD_LABEL.toLowerCase()}s under this head yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
