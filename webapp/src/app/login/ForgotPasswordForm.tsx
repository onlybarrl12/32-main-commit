"use client";

import { useActionState, useState } from "react";
import { requestPasswordReset, type ForgotPasswordResult } from "./actions";

const initialState: ForgotPasswordResult | null = null;

export function ForgotPasswordForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ForgotPasswordResult | null, FormData>(
    (_prev, formData) => requestPasswordReset(formData),
    initialState
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-stone-500 hover:text-brand-orange underline"
      >
        Forgot password?
      </button>
    );
  }

  if (state) {
    return <p className="text-xs text-brand-navy">{state.message}</p>;
  }

  return (
    <form action={formAction} className="space-y-2 pt-1 border-t border-stone-100">
      <label htmlFor="reset-username" className="text-xs font-medium text-stone-500 block">
        Enter your username and an admin will be notified to help you reset your password.
      </label>
      <div className="flex gap-2">
        <input
          id="reset-username"
          name="username"
          type="text"
          required
          className="flex-1 text-sm border border-stone-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          {pending ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
