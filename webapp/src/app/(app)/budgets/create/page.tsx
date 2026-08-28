import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getAccessibleCostCentreIds } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { STATUS_LABELS } from "@/lib/workflow";
import { getActiveCycle } from "@/lib/cycle";
import { formatCycleLabel } from "@/lib/labels";
import { openBudgetHeader } from "./actions";

export default async function CreateBudgetPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const locationAccess = user.access.filter((a) => a.role === Role.LOCATION_USER);
  const accessibleIds = await getAccessibleCostCentreIds(locationAccess);
  const cycle = await getActiveCycle();

  const [costCentres, myHeaders] = await Promise.all([
    accessibleIds === "ALL"
      ? prisma.costCentre.findMany({ orderBy: { code: "asc" } })
      : prisma.costCentre.findMany({ where: { id: { in: accessibleIds } }, orderBy: { code: "asc" } }),
    prisma.budgetHeader.findMany({
      where: { createdByUserId: user.id },
      include: { costCentre: true, cycle: true, entries: true },
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
  ]);

  const hasAnyLocationAccess = locationAccess.length > 0 && costCentres.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Create Budget</h2>
        <p className="mt-1 text-sm text-stone-500">
          Select a location to start or continue its Budget Creation Proposal. Financial Year is admin-controlled —
          {cycle ? ` currently ${formatCycleLabel(cycle)}.` : " no cycle is currently open."}
        </p>
      </div>

      {!hasAnyLocationAccess ? (
        <div className="bg-white rounded-xl border border-stone-200 p-5 text-sm text-stone-500">
          You don&apos;t have Location User access to any operating location yet. Ask an admin to grant it via
          Authorization.
        </div>
      ) : !cycle ? (
        <div className="bg-white rounded-xl border border-stone-200 p-5 text-sm text-stone-500">
          No budget cycle is currently open. Ask an admin to open one in Masters → Settings.
        </div>
      ) : (
        <form action={openBudgetHeader} className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-stone-500 block mb-1">Operating Location</label>
              <select
                name="costCentreId"
                required
                defaultValue=""
                className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
              >
                <option value="" disabled>
                  -- select --
                </option>
                {costCentres.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 block mb-1">Financial Year</label>
              <div className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 bg-stone-50 text-stone-500">
                {formatCycleLabel(cycle)}
              </div>
            </div>
          </div>
          <button type="submit" className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark">
            Load
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-400 border-b border-stone-100 bg-stone-50">
            <tr>
              <th className="px-4 py-2 font-medium">Location</th>
              <th className="px-4 py-2 font-medium">Financial Year</th>
              <th className="px-4 py-2 font-medium">Budget Heads</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {myHeaders.map((h) => (
              <tr key={h.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50">
                <td className="px-4 py-2 text-stone-800">
                  {h.costCentre.code} — {h.costCentre.name}
                </td>
                <td className="px-4 py-2 text-stone-500">{formatCycleLabel(h.cycle)}</td>
                <td className="px-4 py-2 text-stone-500 tabular-nums">{h.entries.length} entries</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs border ${
                      h.status === "APPROVED"
                        ? "bg-brand-navy-light text-brand-navy border-brand-navy-light"
                        : h.status === "DRAFT"
                          ? "bg-stone-100 text-stone-500 border-stone-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    {STATUS_LABELS[h.status]}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/budgets/${h.id}`} className="text-xs font-medium text-brand-orange hover:text-brand-orange-dark">
                    {h.status === "DRAFT" ? "Continue" : "View"}
                  </Link>
                </td>
              </tr>
            ))}
            {myHeaders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-stone-400">
                  You haven&apos;t created any budgets yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
