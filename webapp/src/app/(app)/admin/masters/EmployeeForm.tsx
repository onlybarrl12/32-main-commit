"use client";

import { useActionState, useState } from "react";
import { createEmployee, updateEmployee, type ActionResult } from "./actions";

type Option = { id: string; label: string };
const initialState: ActionResult | null = null;

export function CreateEmployeeForm({ bases, companyCodes }: { bases: Option[]; companyCodes: Option[] }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, formData) => createEmployee(formData),
    initialState
  );

  return (
    <form action={formAction} className="bg-white rounded-xl border border-stone-200 p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-3">Add Employee</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <input name="employeeNo" placeholder="Employee No" required className="text-sm border border-stone-200 rounded-lg px-2 py-1.5" />
        <input name="title" placeholder="Title (Mr/Ms/...)" className="text-sm border border-stone-200 rounded-lg px-2 py-1.5" />
        <input name="firstName" placeholder="First Name" required className="text-sm border border-stone-200 rounded-lg px-2 py-1.5" />
        <input name="lastName" placeholder="Last Name" required className="text-sm border border-stone-200 rounded-lg px-2 py-1.5" />
        <input name="designationShort" placeholder="Designation" className="text-sm border border-stone-200 rounded-lg px-2 py-1.5" />
        <select name="baseId" defaultValue="" className="text-sm border border-stone-200 rounded-lg px-2 py-1.5">
          <option value="">Base/LOC — none</option>
          {bases.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="companyCodeId" defaultValue="" className="text-sm border border-stone-200 rounded-lg px-2 py-1.5">
          <option value="">Company Code — none</option>
          {companyCodes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-brand-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-orange-dark disabled:opacity-50">
        {pending ? "Adding..." : "Add Employee"}
      </button>
      {state && !state.ok && <span className="ml-3 text-sm text-red-600">{state.error}</span>}
    </form>
  );
}

export function EditEmployeeForm({
  employee,
  bases,
  companyCodes,
}: {
  employee: {
    id: string;
    title: string;
    firstName: string;
    lastName: string;
    designationShort: string;
    baseId: string;
    companyCodeId: string;
  };
  bases: Option[];
  companyCodes: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, formData) => updateEmployee(formData),
    initialState
  );

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand-orange hover:text-brand-orange-dark">
        Edit
      </button>
    );
  }

  return (
    <div className="text-left bg-stone-50 border border-stone-200 rounded-lg p-3 mt-2 w-72">
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="id" value={employee.id} />
        <input name="title" defaultValue={employee.title} placeholder="Title" className="w-full text-xs border border-stone-200 rounded px-2 py-1" />
        <input name="firstName" defaultValue={employee.firstName} required placeholder="First Name" className="w-full text-xs border border-stone-200 rounded px-2 py-1" />
        <input name="lastName" defaultValue={employee.lastName} required placeholder="Last Name" className="w-full text-xs border border-stone-200 rounded px-2 py-1" />
        <input
          name="designationShort"
          defaultValue={employee.designationShort}
          placeholder="Designation"
          className="w-full text-xs border border-stone-200 rounded px-2 py-1"
        />
        <select name="baseId" defaultValue={employee.baseId} className="w-full text-xs border border-stone-200 rounded px-2 py-1">
          <option value="">Base/LOC — none</option>
          {bases.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="companyCodeId" defaultValue={employee.companyCodeId} className="w-full text-xs border border-stone-200 rounded px-2 py-1">
          <option value="">Company Code — none</option>
          {companyCodes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="rounded bg-brand-orange px-3 py-1 text-xs font-medium text-white hover:bg-brand-orange-dark disabled:opacity-50">
            {pending ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded border border-stone-300 px-3 py-1 text-xs text-stone-700 hover:bg-stone-50">
            Cancel
          </button>
        </div>
        {state && !state.ok && <p className="text-xs text-red-600">{state.error}</p>}
      </form>
    </div>
  );
}
