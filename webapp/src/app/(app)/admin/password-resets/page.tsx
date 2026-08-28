import { prisma } from "@/lib/prisma";
import { ResetRequestRow } from "./ResetRequestRow";

export default async function PasswordResetsPage() {
  const pending = await prisma.passwordResetRequest.findMany({
    where: { resolvedAt: null },
    include: { user: true },
    orderBy: { requestedAt: "asc" },
  });

  const resolved = await prisma.passwordResetRequest.findMany({
    where: { resolvedAt: { not: null } },
    include: { user: true, resolvedByUser: true },
    orderBy: { resolvedAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Password Reset Requests</h2>
        <p className="mt-1 text-sm text-stone-500">
          Users click &ldquo;Forgot Password&rdquo; on the login page — this lists everyone waiting on you.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-400 border-b border-stone-100 bg-stone-50">
            <tr>
              <th className="px-4 py-2 font-medium">Username</th>
              <th className="px-4 py-2 font-medium">Requested</th>
              <th className="px-4 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => (
              <ResetRequestRow key={r.id} requestId={r.id} username={r.user.username} requestedAt={r.requestedAt.toLocaleString("en-IN")} />
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-stone-400">
                  Nothing pending.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {resolved.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Recently Resolved</h3>
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {resolved.map((r) => (
                  <tr key={r.id} className="border-b border-stone-50 last:border-0">
                    <td className="px-4 py-2 text-stone-700">{r.user.username}</td>
                    <td className="px-4 py-2 text-stone-400">
                      resolved {r.resolvedAt?.toLocaleString("en-IN")} by {r.resolvedByUser?.username ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
