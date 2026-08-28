"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { actOnHeader, type ActionResult } from "./actions";

const initialState: ActionResult | null = null;

export function ApprovalActionForm({ headerId }: { headerId: string }) {
  const router = useRouter();
  const [remarks, setRemarks] = useState("");
  const [pendingAction, setPendingAction] = useState<"approve" | "return" | null>(null);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => {
      const result = await actOnHeader(formData);
      if (result.ok) router.refresh();
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} className="border-t border-stone-100 pt-4 space-y-3">
      <input type="hidden" name="headerId" value={headerId} />
      <div>
        <label className="text-xs font-medium text-stone-500 block mb-1">Remarks</label>
        <textarea
          name="remarks"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={2}
          placeholder="Add a comment (required for Return)"
          className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
        />
      </div>
      {state && !state.ok && <p className="text-xs text-red-600">{state.error}</p>}
      <div className="flex gap-2 justify-end flex-wrap">
        <button
          type="submit"
          name="action"
          value="return"
          disabled={pending}
          onClick={() => setPendingAction("return")}
          className="text-xs font-medium text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 disabled:opacity-50"
        >
          {pending && pendingAction === "return" ? "Returning..." : "Return"}
        </button>
        <button
          type="submit"
          name="action"
          value="approve"
          disabled={pending}
          onClick={() => setPendingAction("approve")}
          className="text-xs font-medium text-white bg-brand-orange rounded-lg px-3 py-1.5 hover:bg-brand-orange-dark disabled:opacity-50"
        >
          {pending && pendingAction === "approve" ? "Approving..." : "Approve & Forward"}
        </button>
      </div>
    </form>
  );
}
