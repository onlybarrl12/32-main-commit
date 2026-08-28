import { prisma } from "@/lib/prisma";
import { ActualsUploadForm } from "./ActualsUploadForm";
import { importApprovedBe, importLyActual, importYtdActual } from "./actuals-actions";
import { ActualsDataType } from "@prisma/client";

const SECTIONS: { dataType: ActualsDataType; title: string; description: string; templateHref: string; action: typeof importLyActual }[] = [
  {
    dataType: ActualsDataType.LY_ACTUAL,
    title: "LY Actual",
    description: "Last financial year's final actual expenditure, per Cost Centre and Budget Sub Head.",
    templateHref: "/api/templates/ly-actual",
    action: importLyActual,
  },
  {
    dataType: ActualsDataType.APPROVED_BE,
    title: "Approved BE (Current FY)",
    description:
      "Current financial year's approved Budget Estimate — the fallback figure shown when a Location User leaves Proposed RBE/BE blank.",
    templateHref: "/api/templates/approved-be",
    action: importApprovedBe,
  },
  {
    dataType: ActualsDataType.YTD_ACTUAL,
    title: "YTD Actual (Current FY)",
    description: "Current financial year's actual expenditure to date — Proposed RBE must be at least this figure.",
    templateHref: "/api/templates/ytd-actual",
    action: importYtdActual,
  },
];

export async function ActualsTab() {
  const batches = await prisma.actualsImportBatch.findMany({
    include: { uploadedByUser: true, _count: { select: { rows: true } } },
    orderBy: { uploadedAt: "desc" },
    take: 30,
  });

  return (
    <div className="space-y-4">
      {SECTIONS.map((s) => (
        <ActualsUploadForm key={s.dataType} title={s.title} description={s.description} templateHref={s.templateHref} action={s.action} />
      ))}

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-400 border-b border-stone-100 bg-stone-50">
            <tr>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">Rows</th>
              <th className="px-4 py-2 font-medium">Uploaded By</th>
              <th className="px-4 py-2 font-medium">Uploaded At</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-stone-50 last:border-0">
                <td className="px-4 py-2">
                  <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
                    {SECTIONS.find((s) => s.dataType === b.dataType)?.title ?? b.dataType}
                  </span>
                </td>
                <td className="px-4 py-2 text-stone-800">{b.fileName}</td>
                <td className="px-4 py-2 text-stone-500 tabular-nums">{b._count.rows}</td>
                <td className="px-4 py-2 text-stone-500">{b.uploadedByUser.username}</td>
                <td className="px-4 py-2 text-stone-500">{b.uploadedAt.toLocaleString("en-IN")}</td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-xs text-stone-400 italic">
                  No uploads yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
