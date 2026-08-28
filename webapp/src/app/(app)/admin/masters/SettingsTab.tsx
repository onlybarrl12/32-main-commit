import { prisma } from "@/lib/prisma";
import { toggleCycleOpen } from "./actions";
import { CreateCycleForm } from "./CreateCycleForm";

export async function SettingsTab() {
  const cycles = await prisma.budgetCycle.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500">
        Exactly one cycle is ever <strong>Open</strong> at a time — its RBE Year is the &ldquo;current FY&rdquo; and
        its BE Year is the &ldquo;next FY&rdquo; used everywhere in the app (Home, Reports, Create Budget), and its
        RBE Year minus one is the &ldquo;last FY&rdquo; LY Actual is looked up against. Opening a cycle automatically
        closes any other open one.
      </p>

      <CreateCycleForm />

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-400 border-b border-stone-100 bg-stone-50">
            <tr>
              <th className="px-4 py-2 font-medium">RBE Year</th>
              <th className="px-4 py-2 font-medium">BE Year</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {cycles.map((c) => (
              <tr key={c.id} className="border-b border-stone-50 last:border-0">
                <td className="px-4 py-2 text-stone-800 font-medium">{c.financialYearRBE}</td>
                <td className="px-4 py-2 text-stone-700">{c.financialYearBE}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs border ${
                      c.isOpen ? "bg-brand-navy-light text-brand-navy border-brand-navy-light" : "bg-stone-100 text-stone-500 border-stone-200"
                    }`}
                  >
                    {c.isOpen ? "Open" : "Closed"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={toggleCycleOpen}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="nextOpen" value={(!c.isOpen).toString()} />
                    <button type="submit" className="text-xs text-stone-500 underline hover:text-stone-700">
                      {c.isOpen ? "Close" : "Open (closes any other open cycle)"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
