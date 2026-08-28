"use client";

import { useActionState } from "react";
import { saveSubHeadRateUom, type ActionResult } from "./actions";

const initialState: ActionResult | null = null;

export function RateUomForm({
  subHeadId,
  uom,
  showRate,
  cfyLabel,
  nfyLabel,
  cfyFiscalYear,
  nfyFiscalYear,
  cfyRate,
  nfyRate,
}: {
  subHeadId: string;
  uom: string;
  /** Rate fields only apply to Chemical (admin-maintained per kg) — Power's Rate is user-entered on the entry grid, just like its Qty, so this form only ever manages UOM for Power. */
  showRate: boolean;
  cfyLabel: string;
  nfyLabel: string;
  cfyFiscalYear: string;
  nfyFiscalYear: string;
  cfyRate: number | null;
  nfyRate: number | null;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, formData) => saveSubHeadRateUom(formData),
    initialState
  );

  return (
    <form action={formAction} className={`grid grid-cols-2 ${showRate ? "sm:grid-cols-5" : "sm:grid-cols-3"} gap-2 items-end`}>
      <input type="hidden" name="subHeadId" value={subHeadId} />
      {showRate && (
        <>
          <input type="hidden" name="cfyFiscalYear" value={cfyFiscalYear} />
          <input type="hidden" name="nfyFiscalYear" value={nfyFiscalYear} />
        </>
      )}
      <div>
        <label className="text-[10px] font-medium text-stone-400 block mb-0.5">UOM</label>
        <input
          name="uom"
          defaultValue={uom}
          placeholder="e.g. Ltr, kWh"
          required
          className="w-full text-xs border border-stone-200 rounded-lg px-2 py-1"
        />
      </div>
      {showRate && (
        <>
          <div>
            <label className="text-[10px] font-medium text-stone-400 block mb-0.5">Rate — {cfyLabel || "current FY"}</label>
            <input
              name="cfyRate"
              type="number"
              min={0}
              step="0.01"
              defaultValue={cfyRate ?? ""}
              placeholder={cfyFiscalYear ? "unset" : "no open cycle"}
              disabled={!cfyFiscalYear}
              className="w-full text-xs border border-stone-200 rounded-lg px-2 py-1 disabled:bg-stone-50"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-stone-400 block mb-0.5">Rate — {nfyLabel || "next FY"}</label>
            <input
              name="nfyRate"
              type="number"
              min={0}
              step="0.01"
              defaultValue={nfyRate ?? ""}
              placeholder={nfyFiscalYear ? "unset" : "no open cycle"}
              disabled={!nfyFiscalYear}
              className="w-full text-xs border border-stone-200 rounded-lg px-2 py-1 disabled:bg-stone-50"
            />
          </div>
        </>
      )}
      <div className="sm:col-span-1">
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand-orange px-3 py-1 text-xs font-medium text-white hover:bg-brand-orange-dark disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
      {state && !state.ok && <div className="col-span-full text-[11px] text-red-600">{state.error}</div>}
    </form>
  );
}
