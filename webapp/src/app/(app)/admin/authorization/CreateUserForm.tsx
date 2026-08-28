"use client";

import { useActionState } from "react";
import { createUserForEmployee, type ActionResult } from "./actions";

type EmployeeOption = { id: string; employeeNo: string; name: string; baseName: string | null };

const initialState: ActionResult | null = null;

export function CreateUserForm({ employees }: { employees: EmployeeOption[] }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, formData) => createUserForEmployee(formData),
    initialState
  );

  return (
    <form action={formAction} className="space-y-3 bg-white rounded-xl border border-stone-200 p-5">
      <h3 className="text-sm font-semibold text-stone-900">Create login for an employee</h3>

      <div>
        <label className="text-xs font-medium text-stone-500 block mb-1">Employee</label>
        <select
          name="employeeId"
          required
          defaultValue=""
          className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
        >
          <option value="" disabled>
            -- select an employee without a login yet ({employees.length} available) --
          </option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} — {e.employeeNo} ({e.baseName ?? "no base"})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-stone-500 block mb-1">Username</label>
          <input
            name="username"
            required
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500 block mb-1">Initial password</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
          />
        </div>
      </div>

      <p className="text-xs text-stone-500">
        Automatically grants <strong>Location User</strong> access scoped to all cost centres under
        the employee&apos;s Base (CLAUDE.md §4/§6). Add further roles/scopes below after creating.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {pending ? "Creating..." : "Create login"}
      </button>

      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      {state && state.ok && <p className="text-sm text-brand-navy">User created.</p>}
    </form>
  );
}
