"use client";

import { useActionState } from "react";
import { resolvePasswordReset, dismissPasswordReset, type ResolveResetResult } from "./actions";

const initialState: ResolveResetResult | null = null;

export function ResetRequestRow({ requestId, username, requestedAt }: { requestId: string; username: string; requestedAt: string }) {
  const [state, formAction, pending] = useActionState<ResolveResetResult | null, FormData>(
    (_prev, formData) => resolvePasswordReset(formData),
    initialState
  );

  if (state && state.ok) {
    return (
      <tr className="border-b border-stone-50 bg-brand-navy-light/30">
        <td className="px-4 py-2 font-medium text-stone-800">{username}</td>
        <td colSpan={2} className="px-4 py-2 text-xs">
          New password: <span className="font-mono font-semibold text-brand-navy">{state.password}</span> — note it down
          now, it won&apos;t be shown again here (it stays available via Download current passwords).
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-stone-50">
      <td className="px-4 py-2 font-medium text-stone-800">{username}</td>
      <td className="px-4 py-2 text-stone-500">{requestedAt}</td>
      <td className="px-4 py-2 text-right">
        <form action={formAction} className="inline">
          <input type="hidden" name="requestId" value={requestId} />
          <button type="submit" disabled={pending} className="text-xs font-medium text-brand-orange hover:text-brand-orange-dark disabled:opacity-50 mr-3">
            {pending ? "Resetting..." : "Reset"}
          </button>
        </form>
        <form action={dismissPasswordReset} className="inline">
          <input type="hidden" name="requestId" value={requestId} />
          <button type="submit" className="text-xs text-stone-400 hover:text-stone-700">
            Dismiss
          </button>
        </form>
        {state && !state.ok && <p className="text-[11px] text-red-600 mt-1">{state.error}</p>}
      </td>
    </tr>
  );
}
