import { prisma } from "@/lib/prisma";
import { deleteEmployee } from "./actions";
import { CreateEmployeeForm, EditEmployeeForm } from "./EmployeeForm";
import { BASE_LOC_LABEL } from "@/lib/labels";

export async function EmployeesTab() {
  const [employees, bases, companyCodes] = await Promise.all([
    prisma.employee.findMany({
      include: { base: true, companyCode: true, user: { select: { username: true } } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 400,
    }),
    prisma.base.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.companyCode.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } }),
  ]);

  return (
    <div className="space-y-4">
      <CreateEmployeeForm
        bases={bases.map((b) => ({ id: b.id, label: b.name }))}
        companyCodes={companyCodes.map((c) => ({ id: c.id, label: c.code }))}
      />

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-400 border-b border-stone-100 bg-stone-50">
            <tr>
              <th className="px-4 py-2 font-medium">Employee No</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Designation</th>
              <th className="px-4 py-2 font-medium">{BASE_LOC_LABEL}</th>
              <th className="px-4 py-2 font-medium">Company Code</th>
              <th className="px-4 py-2 font-medium">Login</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-b border-stone-50 last:border-0 align-top">
                <td className="px-4 py-2 font-mono text-xs text-brand-orange">{e.employeeNo}</td>
                <td className="px-4 py-2 text-stone-800">
                  {e.title ? `${e.title} ` : ""}
                  {e.firstName} {e.lastName}
                </td>
                <td className="px-4 py-2 text-stone-500">{e.designationShort ?? "—"}</td>
                <td className="px-4 py-2 text-stone-500">{e.base?.name ?? "—"}</td>
                <td className="px-4 py-2 text-stone-500">{e.companyCode?.code ?? "—"}</td>
                <td className="px-4 py-2 text-stone-500">{e.user?.username ?? "—"}</td>
                <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                  <EditEmployeeForm
                    employee={{
                      id: e.id,
                      title: e.title ?? "",
                      firstName: e.firstName,
                      lastName: e.lastName,
                      designationShort: e.designationShort ?? "",
                      baseId: e.baseId ?? "",
                      companyCodeId: e.companyCodeId ?? "",
                    }}
                    bases={bases.map((b) => ({ id: b.id, label: b.name }))}
                    companyCodes={companyCodes.map((c) => ({ id: c.id, label: c.code }))}
                  />
                  <form action={deleteEmployee} className="inline">
                    <input type="hidden" name="id" value={e.id} />
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
