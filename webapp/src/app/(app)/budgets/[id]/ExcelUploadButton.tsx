"use client";

import { useRef, useState, useTransition } from "react";
import { uploadBudgetEntriesExcel } from "./upload-actions";
import type { EntryInput } from "./actions";
import type { BroadPnlHeadCode } from "@/lib/entry-amount";

type BudgetHeadOption = { id: string; name: string; broadPnlHead: BroadPnlHeadCode; subHeads: { id: string; code: string; name: string }[] };

/**
 * Bulk Excel upload for Create Budget entries — download the template
 * (3 data sheets + README, dropdown-constrained Broad PNL/Head/Sub Head
 * columns), fill it in, upload it back. Validation is entirely
 * deterministic (exceljs + plain JS in upload-actions.ts) — no AI
 * involved. On success, parsed rows are appended to the in-memory grid for
 * review, same as a hand-added row — nothing is persisted until Save.
 */
export function ExcelUploadButton({
  headerId,
  onParsed,
}: {
  headerId: string;
  budgetHeads: BudgetHeadOption[];
  onParsed: (rows: EntryInput[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<{ sheet: string; row: number; message: string }[] | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrors(null);
    setSuccessCount(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadBudgetEntriesExcel(headerId, formData);
      if (result.ok) {
        onParsed(
          result.rows.map(
            (r): EntryInput => ({
              ...r,
              id: null,
              rbeRate: 0,
              beRate: 0,
              workType: r.workType as EntryInput["workType"],
              recurringOneTime: r.recurringOneTime as EntryInput["recurringOneTime"],
            })
          )
        );
        setSuccessCount(result.rows.length);
      } else {
        setErrors(result.errors);
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <a href="/api/templates/budget-entries" className="text-xs font-medium text-stone-500 hover:text-stone-800 underline">
          Download Template
        </a>
        <span className="text-stone-300">|</span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => inputRef.current?.click()}
          className="text-xs font-medium text-brand-orange hover:text-brand-orange-dark disabled:opacity-50"
        >
          {isPending ? "Uploading..." : "Upload Excel"}
        </button>
        <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
      </div>

      {successCount !== null && (
        <div className="absolute right-0 mt-1 z-10 w-72 bg-white border border-brand-navy-light rounded-lg shadow-lg p-3 text-xs">
          <div className="flex items-start justify-between">
            <span className="text-brand-navy font-medium">
              {successCount} row{successCount === 1 ? "" : "s"} added below — review before Save/Submit.
            </span>
            <button type="button" onClick={() => setSuccessCount(null)} className="text-stone-400 hover:text-stone-700 ml-2">
              ✕
            </button>
          </div>
        </div>
      )}

      {errors && errors.length > 0 && (
        <div className="absolute right-0 mt-1 z-10 w-96 max-h-80 overflow-y-auto bg-white border border-red-200 rounded-lg shadow-lg p-3 text-xs">
          <div className="flex items-start justify-between mb-2">
            <span className="text-red-700 font-medium">
              {errors.length} error{errors.length === 1 ? "" : "s"} — nothing was added. Fix and re-upload.
            </span>
            <button type="button" onClick={() => setErrors(null)} className="text-stone-400 hover:text-stone-700 ml-2">
              ✕
            </button>
          </div>
          <ul className="space-y-1">
            {errors.map((e, i) => (
              <li key={i} className="text-stone-600">
                <span className="font-mono text-red-600">
                  [{e.sheet}{e.row > 0 ? ` row ${e.row}` : ""}]
                </span>{" "}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
