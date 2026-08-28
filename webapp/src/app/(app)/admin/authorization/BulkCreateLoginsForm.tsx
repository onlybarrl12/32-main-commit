"use client";

import { useActionState } from "react";
import { bulkCreateLogins, type BulkCreateLoginsResult } from "./actions";

const initialState: BulkCreateLoginsResult | null = null;

export function BulkCreateLoginsForm() {
  const [state, formAction, pending] = useActionState<BulkCreateLoginsResult | null, FormData>(
    (_prev, formData) => bulkCreateLogins(formData),
    initialState
  );

  return (
    <form action={formAction} className="bg-white rounded-xl border border-stone-200 p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-1">Bulk Create Logins</h3>
      <p className="text-xs text-stone-500 mb-3">
        Upload a sheet of Employee Numbers to create many logins at once — username and password are
        generated automatically for each.{" "}
        <a href="/api/templates/bulk-create-logins" className="text-brand-orange hover:text-brand-orange-dark underline">
          Download template
        </a>{" "}
        (pre-filled with every employee who doesn&apos;t have a login yet).
      </p>
      <div className="flex items-center gap-3">
        <input type="file" name="file" accept=".xlsx,.xls" required className="text-sm" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark disabled:opacity-50"
        >
          {pending ? "Creating..." : "Upload"}
        </button>
      </div>
      {state && !state.ok && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state && state.ok && (
        <div className="mt-3 text-sm">
          <p className="text-brand-navy font-medium">{state.created.length} login(s) created.</p>
          {state.created.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="text-xs border border-stone-200 rounded-lg overflow-hidden">
                <thead className="bg-stone-50 text-stone-500">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Employee No</th>
                    <th className="px-3 py-1.5 text-left font-medium">Username</th>
                    <th className="px-3 py-1.5 text-left font-medium">Password</th>
                  </tr>
                </thead>
                <tbody>
                  {state.created.map((c) => (
                    <tr key={c.employeeNo} className="border-t border-stone-100">
                      <td className="px-3 py-1.5 font-mono">{c.employeeNo}</td>
                      <td className="px-3 py-1.5 font-mono">{c.username}</td>
                      <td className="px-3 py-1.5 font-mono">{c.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-amber-600 mt-1">
                Note these down now if needed — they&apos;re also available any time via &ldquo;Download current
                passwords&rdquo; below.
              </p>
            </div>
          )}
          {state.errors.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-xs text-red-600 space-y-0.5">
              {state.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
