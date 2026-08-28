import { prisma } from "@/lib/prisma";
import { deleteCostCentre } from "./actions";
import { CreateLocationForm } from "./CreateLocationForm";
import { BASE_LOC_LABEL } from "@/lib/labels";

export async function LocationsTab() {
  const [costCentres, companyCodes, pipelines, bases] = await Promise.all([
    prisma.costCentre.findMany({
      include: { companyCode: true, pipeline: true, base: true },
      orderBy: { code: "asc" },
    }),
    prisma.companyCode.findMany({ orderBy: { code: "asc" } }),
    prisma.pipeline.findMany({ orderBy: { code: "asc" } }),
    prisma.base.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <CreateLocationForm
        companyCodes={companyCodes.map((c) => ({ id: c.id, label: c.code }))}
        pipelines={pipelines.map((p) => ({ id: p.id, label: p.code }))}
        bases={bases.map((b) => ({ id: b.id, label: b.name }))}
      />

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-400 border-b border-stone-100 bg-stone-50">
            <tr>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Pipeline</th>
              <th className="px-4 py-2 font-medium">{BASE_LOC_LABEL}</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {costCentres.map((c) => (
              <tr key={c.id} className="border-b border-stone-50 last:border-0">
                <td className="px-4 py-2 font-mono text-xs text-brand-orange">{c.code}</td>
                <td className="px-4 py-2 text-stone-700">{c.name}</td>
                <td className="px-4 py-2 text-stone-500">{c.companyCode.code}</td>
                <td className="px-4 py-2 text-stone-500">{c.pipeline.code}</td>
                <td className="px-4 py-2 text-stone-500">{c.base.name}</td>
                <td className="px-4 py-2 text-right">
                  <form action={deleteCostCentre}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="text-xs text-red-500 hover:text-red-700">
                      Delete
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
