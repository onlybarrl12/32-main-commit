import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { BroadPnlHead } from "@prisma/client";

// Shared constants + parsing/validation logic for the bulk budget-entry
// Excel upload (template: src/app/api/templates/budget-entries/route.ts;
// auth-gated entry point: src/app/(app)/budgets/[id]/upload-actions.ts).
// Kept in one dependency-light module (no "use server", no session/auth
// logic) so the parsing itself is directly unit-testable and the
// template's dropdown options can never drift from what the parser
// accepts. Deterministic, script-driven only — no AI involved anywhere
// in this path, per the user's explicit requirement.

export const WORK_TYPES = ["Existing Work Order", "Approved PR", "Audit Recommendation", "PMC ATR Point", "New"] as const;

export const WORK_TYPE_ENUM: Record<string, string> = {
  "Existing Work Order": "EXISTING_WORK_ORDER",
  "Approved PR": "APPROVED_PR",
  "Audit Recommendation": "AUDIT_RECOMMENDATION",
  "PMC ATR Point": "PMC_ATR_POINT",
  New: "NEW",
};

export const RECURRING_OPTIONS = ["Recurring", "One-Time"] as const;

export const RECURRING_ENUM: Record<string, string> = {
  Recurring: "RECURRING",
  "One-Time": "ONE_TIME",
};

export type UploadRowError = { sheet: string; row: number; message: string };

export type ParsedUploadRow = {
  subHeadId: string;
  rbeMaterial: number;
  rbeService: number;
  beMaterial: number;
  beService: number;
  rbeQty: number;
  beQty: number;
  workType: string; // enum value, e.g. "NEW"
  recurringOneTime: string; // enum value, e.g. "ONE_TIME"
  referenceTakenFrom: string;
  justification: string;
  remarks: string;
};

export type UploadResult = { ok: true; rows: ParsedUploadRow[] } | { ok: false; errors: UploadRowError[] };

const SHEETS: { name: string; broadPnlHead: BroadPnlHead; qtyOnly: boolean }[] = [
  { name: "R & M", broadPnlHead: BroadPnlHead.RM, qtyOnly: false },
  { name: "Power & Fuel", broadPnlHead: BroadPnlHead.POWER, qtyOnly: true },
  { name: "Chemical", broadPnlHead: BroadPnlHead.CHEMICAL, qtyOnly: true },
];

function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value == null) return "";
  const v = cell.value;
  if (typeof v === "object" && v !== null) {
    // Formula cell (e.g. the template's "UOM (auto)" VLOOKUP column): use the
    // cached result if Excel has ever calculated it; a file fresh off our own
    // generator has no cached result at all — treat that as blank, not as
    // "[object Object]" (which would make every templated-but-unfilled row
    // look non-blank and block the blank-row skip below).
    if ("result" in v) return String((v as { result: unknown }).result ?? "").trim();
    if ("formula" in v) return "";
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("").trim();
    return "";
  }
  return String(v).trim();
}

function cellNumber(cell: ExcelJS.Cell | undefined): { value: number; invalid: boolean } {
  if (!cell || cell.value == null || cell.value === "") return { value: 0, invalid: false };
  const raw = typeof cell.value === "object" && cell.value !== null && "result" in cell.value ? (cell.value as { result: unknown }).result : cell.value;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { value: 0, invalid: true };
  return { value: n, invalid: false };
}

/**
 * All-or-nothing: if ANY row on ANY sheet fails validation, `rows` is
 * dropped entirely and every failing row's sheet/row/message is returned
 * so the whole batch can be fixed and re-uploaded in one pass. Does not
 * touch the database except to read the current Budget Head/Sub Head
 * masters — nothing is persisted here (see upload-actions.ts).
 */
export async function parseAndValidateBudgetEntriesWorkbook(wb: ExcelJS.Workbook): Promise<UploadResult> {
  const budgetHeads = await prisma.budgetHead.findMany({ include: { subHeads: true } });
  const headByNameAndBroad = new Map<string, (typeof budgetHeads)[number]>();
  for (const h of budgetHeads) headByNameAndBroad.set(`${h.broadPnlHead}::${h.name}`, h);
  const subHeadByNameAndHead = new Map<string, (typeof budgetHeads)[number]["subHeads"][number]>();
  for (const h of budgetHeads) for (const s of h.subHeads) subHeadByNameAndHead.set(`${h.id}::${s.name}`, s);

  const errors: UploadRowError[] = [];
  const rows: ParsedUploadRow[] = [];

  for (const sheetDef of SHEETS) {
    const ws = wb.getWorksheet(sheetDef.name);
    if (!ws) {
      errors.push({ sheet: sheetDef.name, row: 0, message: `Sheet "${sheetDef.name}" is missing — do not rename or remove sheets from the template.` });
      continue;
    }

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const headName = cellText(row.getCell(1));
      const subHeadName = cellText(row.getCell(2));

      // Skip fully blank rows (unused template rows below the filled-in data).
      const restBlank = sheetDef.qtyOnly
        ? [3, 4, 5, 6, 7, 8, 9, 10].every((c) => cellText(row.getCell(c)) === "")
        : [3, 4, 5, 6, 7, 8, 9, 10, 11].every((c) => cellText(row.getCell(c)) === "");
      if (!headName && !subHeadName && restBlank) continue;

      if (!headName) {
        errors.push({ sheet: sheetDef.name, row: r, message: "Budget Head is required." });
        continue;
      }
      const head = headByNameAndBroad.get(`${sheetDef.broadPnlHead}::${headName}`);
      if (!head) {
        errors.push({ sheet: sheetDef.name, row: r, message: `"${headName}" is not a valid Budget Head for this sheet.` });
        continue;
      }
      if (!subHeadName) {
        errors.push({ sheet: sheetDef.name, row: r, message: "Budget Sub Head is required." });
        continue;
      }
      const subHead = subHeadByNameAndHead.get(`${head.id}::${subHeadName}`);
      if (!subHead) {
        errors.push({
          sheet: sheetDef.name,
          row: r,
          message: `"${subHeadName}" does not belong to Budget Head "${headName}" (or does not exist) — pick a matching pair.`,
        });
        continue;
      }

      let rbeMaterial = 0, rbeService = 0, beMaterial = 0, beService = 0, rbeQty = 0, beQty = 0;
      let workTypeCol: number, recurringCol: number, refCol: number, justificationCol: number, remarksCol: number;

      if (sheetDef.qtyOnly) {
        const rbeQtyCell = cellNumber(row.getCell(4));
        const beQtyCell = cellNumber(row.getCell(5));
        if (rbeQtyCell.invalid) errors.push({ sheet: sheetDef.name, row: r, message: "RBE Qty must be a non-negative number." });
        if (beQtyCell.invalid) errors.push({ sheet: sheetDef.name, row: r, message: "BE Qty must be a non-negative number." });
        rbeQty = rbeQtyCell.value;
        beQty = beQtyCell.value;
        workTypeCol = 6;
        recurringCol = 7;
        refCol = 8;
        justificationCol = 9;
        remarksCol = 10;
      } else {
        const rbeMaterialCell = cellNumber(row.getCell(3));
        const rbeServiceCell = cellNumber(row.getCell(4));
        const beMaterialCell = cellNumber(row.getCell(5));
        const beServiceCell = cellNumber(row.getCell(6));
        if (rbeMaterialCell.invalid) errors.push({ sheet: sheetDef.name, row: r, message: "RBE Material must be a non-negative number." });
        if (rbeServiceCell.invalid) errors.push({ sheet: sheetDef.name, row: r, message: "RBE Service must be a non-negative number." });
        if (beMaterialCell.invalid) errors.push({ sheet: sheetDef.name, row: r, message: "BE Material must be a non-negative number." });
        if (beServiceCell.invalid) errors.push({ sheet: sheetDef.name, row: r, message: "BE Service must be a non-negative number." });
        rbeMaterial = rbeMaterialCell.value;
        rbeService = rbeServiceCell.value;
        beMaterial = beMaterialCell.value;
        beService = beServiceCell.value;
        workTypeCol = 7;
        recurringCol = 8;
        refCol = 9;
        justificationCol = 10;
        remarksCol = 11;
      }

      const workTypeText = cellText(row.getCell(workTypeCol));
      if (!(WORK_TYPES as readonly string[]).includes(workTypeText)) {
        errors.push({ sheet: sheetDef.name, row: r, message: `Work Type must be one of: ${WORK_TYPES.join(", ")}.` });
      }
      const recurringText = cellText(row.getCell(recurringCol));
      if (!(RECURRING_OPTIONS as readonly string[]).includes(recurringText)) {
        errors.push({ sheet: sheetDef.name, row: r, message: `Recurring/One-Time must be one of: ${RECURRING_OPTIONS.join(", ")}.` });
      }
      const justification = cellText(row.getCell(justificationCol));
      if (!justification) {
        errors.push({ sheet: sheetDef.name, row: r, message: "Justification is required and cannot be blank." });
      }
      const referenceTakenFrom = cellText(row.getCell(refCol));
      const remarks = cellText(row.getCell(remarksCol));

      // Only materialize a row object once we know both enum values resolved —
      // if either was invalid the loop above already recorded the error, so
      // just skip adding to `rows` (errors.length > 0 blocks the whole batch anyway).
      if ((WORK_TYPES as readonly string[]).includes(workTypeText) && (RECURRING_OPTIONS as readonly string[]).includes(recurringText) && justification) {
        rows.push({
          subHeadId: subHead.id,
          rbeMaterial,
          rbeService,
          beMaterial,
          beService,
          rbeQty,
          beQty,
          workType: WORK_TYPE_ENUM[workTypeText],
          recurringOneTime: RECURRING_ENUM[recurringText],
          referenceTakenFrom,
          justification,
          remarks,
        });
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rows };
}
