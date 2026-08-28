"use client";

import { useActionState } from "react";
import { createBudgetHead, createBudgetSubHead, type ActionResult } from "./actions";
import { BUDGET_SUB_HEAD_LABEL } from "@/lib/labels";

type Option = { id: string; label: string };
const initialState: ActionResult | null = null;

export function CreateBudgetHeadForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, formData) => createBudgetHead(formData),
    initialState
  );
  return (
    <form action={formAction} className="bg-white rounded-xl border border-stone-200 p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-3">Add Budget Head</h3>
      <div className="flex gap-3 mb-3">
        <input name="code" placeholder="Code" required className="flex-1 text-sm border border-stone-200 rounded-lg px-2 py-1.5" />
        <input name="name" placeholder="Name" required className="flex-1 text-sm border border-stone-200 rounded-lg px-2 py-1.5" />
        <select name="broadPnlHead" required defaultValue="" className="text-sm border border-stone-200 rounded-lg px-2 py-1.5">
          <option value="" disabled>
            Broad PNL Head
          </option>
          <option value="RM">R &amp; M</option>
          <option value="POWER">Power</option>
          <option value="CHEMICAL">Chemical</option>
        </select>
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark disabled:opacity-50">
        {pending ? "Adding..." : "Add Head"}
      </button>
      {state && !state.ok && <span className="ml-3 text-sm text-red-600">{state.error}</span>}
    </form>
  );
}

export function CreateBudgetSubHeadForm({ budgetHeads }: { budgetHeads: Option[] }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, formData) => createBudgetSubHead(formData),
    initialState
  );
  return (
    <form action={formAction} className="bg-white rounded-xl border border-stone-200 p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-3">Add {BUDGET_SUB_HEAD_LABEL}</h3>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <input name="code" placeholder="Fund code (e.g. 3199)" required className="text-sm border border-stone-200 rounded-lg px-2 py-1.5" />
        <input name="name" placeholder={BUDGET_SUB_HEAD_LABEL} required className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 col-span-1" />
        <select name="budgetHeadId" required defaultValue="" className="text-sm border border-stone-200 rounded-lg px-2 py-1.5">
          <option value="" disabled>
            Budget Head
          </option>
          {budgetHeads.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark disabled:opacity-50">
        {pending ? "Adding..." : `Add ${BUDGET_SUB_HEAD_LABEL}`}
      </button>
      {state && !state.ok && <span className="ml-3 text-sm text-red-600">{state.error}</span>}
    </form>
  );
}
