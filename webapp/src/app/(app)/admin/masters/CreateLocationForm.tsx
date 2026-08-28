"use client";

import { useActionState } from "react";
import { createCostCentre, type ActionResult } from "./actions";

type Option = { id: string; label: string };
const initialState: ActionResult | null = null;

export function CreateLocationForm({
  companyCodes,
  pipelines,
  bases,
}: {
  companyCodes: Option[];
  pipelines: Option[];
  bases: Option[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, formData) => createCostCentre(formData),
    initialState
  );

  return (
    <form action={formAction} className="bg-white rounded-xl border border-stone-200 p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-3">Add Location</h3>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
        <input name="code" placeholder="Code (e.g. P9999)" required className="text-sm border border-stone-200 rounded-lg px-2 py-1.5" />
        <input name="name" placeholder="Name" required className="text-sm border border-stone-200 rounded-lg px-2 py-1.5" />
        <select name="companyCodeId" required defaultValue="" className="text-sm border border-stone-200 rounded-lg px-2 py-1.5">
          <option value="" disabled>Company Code</option>
          {companyCodes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select name="pipelineId" required defaultValue="" className="text-sm border border-stone-200 rounded-lg px-2 py-1.5">
          <option value="" disabled>Pipeline</option>
          {pipelines.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select name="baseId" required defaultValue="" className="text-sm border border-stone-200 rounded-lg px-2 py-1.5">
          <option value="" disabled>Base</option>
          {bases.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark disabled:opacity-50">
        {pending ? "Adding..." : "Add Location"}
      </button>
      {state && !state.ok && <span className="ml-3 text-sm text-red-600">{state.error}</span>}
    </form>
  );
}
