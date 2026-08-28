"use client";

import { useActionState } from "react";
import { bulkAssignAccess, type BulkAssignResult } from "./actions";

const initialState: BulkAssignResult | null = null;

export function BulkAssignForm() {
  const [state, formAction, pending] = useActionState<BulkAssignResult | null, FormData>(
    (_prev, formData) => bulkAssignAccess(formData),
    initialState
  );

  return (
    <form action={formAction} className="bg-white rounded-xl border border-stone-200 p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-1">Bulk Assign User → Cost Centre</h3>
      <p className="text-xs text-stone-500 mb-3">
        Upload an Employee No / Role / Cost Centre Code sheet to add many access grants at once — lets
        you determine which user covers which location(s), and how many, in one file. The employee must
        already have a login (create one above first).{" "}
        <a href="/api/templates/user-location-mapping" className="text-brand-orange hover:text-brand-orange-dark underline">
          Download sample template
        </a>
      </p>
      <div className="flex items-center gap-3">
        <input type="file" name="file" accept=".xlsx,.xls" required className="text-sm" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark disabled:opacity-50"
        >
          {pending ? "Uploading..." : "Upload"}
        </button>
      </div>
      {state && !state.ok && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state && state.ok && (
        <div className="mt-2 text-sm">
          <p className="text-brand-navy">
            {state.created} grant(s) created, {state.skipped} already existed.
          </p>
          {state.errors.length > 0 && (
            <ul className="mt-1 list-disc list-inside text-xs text-red-600 space-y-0.5">
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
