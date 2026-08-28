"use client";

import { useActionState, useState } from "react";
import { addAccessGrant, type ActionResult } from "./actions";

type Option = { id: string; label: string };

const ROLES: { value: string; label: string }[] = [
  { value: "LOCATION_USER", label: "Location User" },
  { value: "STATION_INCHARGE", label: "SIC (Station In-charge)" },
  { value: "BASE_INCHARGE", label: "BIC (Base In-charge)" },
  { value: "TS_DEPT", label: "TS Department" },
  { value: "FINANCE_DEPT", label: "Finance Department" },
  { value: "ADMIN", label: "Admin" },
];

const initialState: ActionResult | null = null;

export function AddAccessGrantForm({
  userId,
  bases,
  regions,
  costCentres,
}: {
  userId: string;
  bases: Option[];
  regions: Option[];
  costCentres: Option[];
}) {
  const [scopeType, setScopeType] = useState("BASE");
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, formData) => addAccessGrant(formData),
    initialState
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <label className="block text-[11px] text-stone-500">Role</label>
        <select name="role" required className="text-xs border border-stone-200 rounded-lg px-2 py-1">
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[11px] text-stone-500">Scope type</label>
        <select
          name="scopeType"
          value={scopeType}
          onChange={(e) => setScopeType(e.target.value)}
          className="text-xs border border-stone-200 rounded-lg px-2 py-1"
        >
          <option value="LOCATION">Location (multi-select)</option>
          <option value="BASE">Base/LOC</option>
          <option value="REGION">Region</option>
          <option value="ALL">All</option>
        </select>
      </div>
      {scopeType === "LOCATION" && (
        <div>
          <label className="block text-[11px] text-stone-500">
            Cost Centres — ctrl/cmd-click to select several (one Location User/SIC/BIC may cover multiple Cost Centres)
          </label>
          <select
            name="scopeId"
            multiple
            required
            size={Math.min(6, Math.max(3, costCentres.length))}
            className="text-xs border border-stone-200 rounded-lg px-2 py-1 min-w-[220px]"
          >
            {costCentres.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {scopeType === "BASE" && (
        <div>
          <label className="block text-[11px] text-stone-500">Base/LOC</label>
          <select name="scopeId" required className="text-xs border border-stone-200 rounded-lg px-2 py-1">
            <option value="">-- select --</option>
            {bases.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {scopeType === "REGION" && (
        <div>
          <label className="block text-[11px] text-stone-500">Region</label>
          <select name="scopeId" required className="text-xs border border-stone-200 rounded-lg px-2 py-1">
            <option value="">-- select --</option>
            {regions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-orange px-3 py-1 text-xs font-medium text-white hover:bg-brand-orange-dark disabled:opacity-50"
      >
        {pending ? "Adding..." : "Add grant"}
      </button>
      {state && !state.ok && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
