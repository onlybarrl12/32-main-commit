import { prisma } from "@/lib/prisma";

export async function AuditTrailTab() {
  const logs = await prisma.auditLog.findMany({
    include: { performedByUser: true },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-stone-400 border-b border-stone-100 bg-stone-50">
          <tr>
            <th className="px-4 py-2 font-medium">When</th>
            <th className="px-4 py-2 font-medium">By</th>
            <th className="px-4 py-2 font-medium">Action</th>
            <th className="px-4 py-2 font-medium">Entity</th>
            <th className="px-4 py-2 font-medium">Detail</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-stone-50 last:border-0">
              <td className="px-4 py-2 text-stone-500 whitespace-nowrap">{l.timestamp.toLocaleString("en-IN")}</td>
              <td className="px-4 py-2 text-stone-700">{l.performedByUser?.username ?? "—"}</td>
              <td className="px-4 py-2">
                <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-700">{l.action}</span>
              </td>
              <td className="px-4 py-2 text-stone-500 font-mono text-xs">
                {l.entityType} <span className="text-stone-400">{l.entityId.slice(0, 8)}</span>
              </td>
              <td className="px-4 py-2 text-stone-400 text-xs font-mono max-w-xs truncate">
                {l.diff ? JSON.stringify(l.diff) : ""}
              </td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-xs text-stone-400 italic">
                No activity recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
