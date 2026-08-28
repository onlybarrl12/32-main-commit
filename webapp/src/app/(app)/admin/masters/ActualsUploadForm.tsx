"use client";

import { useActionState } from "react";
import { type ActionResult } from "./actuals-actions";

const initialState: ActionResult | null = null;

/** One of the three separate actuals uploads (LY Actual / Approved BE / YTD Actual) — see admin/masters/ActualsTab.tsx. */
export function ActualsUploadForm({
  title,
  description,
  templateHref,
  action,
}: {
  title: string;
  description: string;
  templateHref: string;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, formData) => action(formData),
    initialState
  );

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-1">{title}</h3>
      <p className="text-xs text-stone-500 mb-3">
        {description}{" "}
        <a href={templateHref} className="text-brand-orange hover:text-brand-orange-dark underline">
          Download sample template
        </a>
      </p>
      <form action={formAction} className="flex items-center gap-3">
        <input type="file" name="file" accept=".xlsx,.xls" required className="text-sm" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark disabled:opacity-50"
        >
          {pending ? "Uploading..." : "Upload"}
        </button>
      </form>
      {state && !state.ok && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state && state.ok && (
        <p className="mt-2 text-sm text-brand-navy">
          Imported {state.rowCount} rows.
          {state.warnings.length > 0 && ` (${state.warnings.length} warning(s) — see console)`}
        </p>
      )}
    </div>
  );
}
