"use server";

import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/rbac";
import { canEditHeader } from "@/lib/workflow";
import { parseAndValidateBudgetEntriesWorkbook, type UploadResult } from "@/lib/budget-entries-upload";

// Bulk Excel upload for Create Budget entries, per the user's 2026-08-25
// ask — deterministic, script-driven parsing/validation only (exceljs +
// plain JS checks in src/lib/budget-entries-upload.ts), no AI involved
// anywhere in this path. This file is just the auth/permission gate +
// file-load; the actual parsing/validation logic lives in that shared lib
// (kept dependency-light and directly testable, unlike this "use server"
// file). On success, parsed rows are handed back to the client to append
// to the in-memory grid (not persisted directly) — the user still reviews
// and hits Save/Submit as normal, same as a hand-added row.

export async function uploadBudgetEntriesExcel(headerId: string, formData: FormData): Promise<UploadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, errors: [{ sheet: "-", row: 0, message: "Not authenticated." }] };

  const header = await prisma.budgetHeader.findUnique({ where: { id: headerId } });
  if (!header) return { ok: false, errors: [{ sheet: "-", row: 0, message: "Budget not found." }] };
  const editable = await canEditHeader(user.access, header);
  if (!editable) return { ok: false, errors: [{ sheet: "-", row: 0, message: "This budget is not currently editable by you." }] };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, errors: [{ sheet: "-", row: 0, message: "No file uploaded." }] };
  if (!/\.xlsx$/i.test(file.name)) {
    return { ok: false, errors: [{ sheet: "-", row: 0, message: "Only .xlsx files are accepted." }] };
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return { ok: false, errors: [{ sheet: "-", row: 0, message: "Could not read this file — is it a valid .xlsx?" }] };
  }

  return parseAndValidateBudgetEntriesWorkbook(wb);
}
