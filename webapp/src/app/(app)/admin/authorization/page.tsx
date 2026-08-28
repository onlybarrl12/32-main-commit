import { prisma } from "@/lib/prisma";
import { CreateUserForm } from "./CreateUserForm";
import { AddAccessGrantForm } from "./AddAccessGrantForm";
import { BulkAssignForm } from "./BulkAssignForm";
import { BulkCreateLoginsForm } from "./BulkCreateLoginsForm";
import { revokeAccessGrantForm, toggleUserActiveForm } from "./actions";
import { ROLE_LABELS } from "@/lib/labels";

export default async function AuthorizationPage() {
  const [employeesWithoutLogin, users, bases, regions, costCentres] = await Promise.all([
    prisma.employee.findMany({
      where: { user: null },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, employeeNo: true, firstName: true, lastName: true, base: { select: { name: true } } },
    }),
    prisma.user.findMany({
      orderBy: { username: "asc" },
      include: { employee: true, access: true },
    }),
    prisma.base.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.region.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.costCentre.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);

  const baseNameById = new Map(bases.map((b) => [b.id, b.name]));
  const regionNameById = new Map(regions.map((r) => [r.id, r.name]));
  const costCentreLabelById = new Map(costCentres.map((c) => [c.id, `${c.code} — ${c.name}`]));

  function describeScope(scopeType: string, scopeId: string | null): string {
    if (scopeType === "ALL") return "All";
    if (!scopeId) return scopeType;
    if (scopeType === "BASE") return baseNameById.get(scopeId) ?? scopeId;
    if (scopeType === "REGION") return regionNameById.get(scopeId) ?? scopeId;
    if (scopeType === "LOCATION") return costCentreLabelById.get(scopeId) ?? scopeId;
    return scopeId;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-stone-900">Authorization</h2>
        <p className="mt-1 text-sm text-stone-500">
          Create logins for employees and assign role + scope grants (CLAUDE.md §7 module 5).
        </p>
      </div>

      <CreateUserForm
        employees={employeesWithoutLogin.map((e) => ({
          id: e.id,
          employeeNo: e.employeeNo,
          name: `${e.firstName} ${e.lastName}`,
          baseName: e.base?.name ?? null,
        }))}
      />

      <div className="grid sm:grid-cols-2 gap-4">
        <BulkCreateLoginsForm />
        <BulkAssignForm />
      </div>

      <div className="flex justify-end">
        <a
          href="/api/admin/passwords/download"
          className="rounded-lg border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          ⬇ Download current passwords
        </a>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-400 border-b border-stone-100 bg-stone-50">
            <tr>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Access grants</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-stone-50 last:border-0 align-top">
                <td className="px-4 py-3 font-medium text-stone-800">{u.username}</td>
                <td className="px-4 py-3 text-stone-500">
                  {u.employee ? `${u.employee.firstName} ${u.employee.lastName} (${u.employee.employeeNo})` : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs border ${
                      u.isActive
                        ? "bg-brand-navy-light text-brand-navy border-brand-navy-light"
                        : "bg-stone-100 text-stone-500 border-stone-200"
                    }`}
                  >
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                  <form action={toggleUserActiveForm} className="mt-1">
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="nextActive" value={(!u.isActive).toString()} />
                    <button type="submit" className="text-xs text-stone-500 underline hover:text-stone-700">
                      {u.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3">
                  <ul className="mb-2 space-y-1">
                    {u.access.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-xs">
                        <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-700">
                          {ROLE_LABELS[a.role] ?? a.role} @ {describeScope(a.scopeType, a.scopeId)}
                        </span>
                        <form action={revokeAccessGrantForm}>
                          <input type="hidden" name="accessId" value={a.id} />
                          <button type="submit" className="text-red-500 hover:text-red-700">
                            revoke
                          </button>
                        </form>
                      </li>
                    ))}
                    {u.access.length === 0 && <li className="text-xs text-stone-400">No access grants</li>}
                  </ul>
                  <AddAccessGrantForm
                    userId={u.id}
                    bases={bases.map((b) => ({ id: b.id, label: b.name }))}
                    regions={regions.map((r) => ({ id: r.id, label: r.name }))}
                    costCentres={costCentres.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
