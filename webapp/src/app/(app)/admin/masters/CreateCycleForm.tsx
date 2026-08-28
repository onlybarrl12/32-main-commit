"use client";

import { useActionState } from "react";
import { createBudgetCycle, type ActionResult } from "./actions";

const initialState: ActionResult | null = null;

export function CreateCycleForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, formData) => createBudgetCycle(formData),
    initialState
  );

  return (
    <form action={formAction} className="bg-white rounded-xl border border-stone-200 p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-3">Open a New Budget Cycle</h3>
      <div className="flex gap-3 mb-3">
        <input name="financialYearRBE" placeholder="RBE Year (e.g. 2027-28)" required className="flex-1 text-sm border border-stone-200 rounded-lg px-2 py-1.5" />
        <input name="financialYearBE" placeholder="BE Year (e.g. 2028-29)" required className="flex-1 text-sm border border-stone-200 rounded-lg px-2 py-1.5" />
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark disabled:opacity-50">
        {pending ? "Creating..." : "Create Cycle"}
      </button>
      {state && !state.ok && <span className="ml-3 text-sm text-red-600">{state.error}</span>}
    </form>
  );
}
