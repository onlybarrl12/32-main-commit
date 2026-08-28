import ExcelJS from "exceljs";
import { ActualsDataType } from "@prisma/client";

// Replaces the original single combined AE/BE/ongoing.xlsx upload with
// three separate, single-purpose upload types (confirmed with the user
// 2026-08-21): LY Actual, Approved BE (current FY), YTD Actual (current FY,
// to-date). Each has its own upload endpoint and its own downloadable
// sample template (see src/app/api/templates/*/route.ts), all sharing this
// one column format — my call per the user's "decide the format" ask,
// trimmed to exactly the columns actually consumed downstream (Home,
// Reports, Create Budget's per-Sub-Head reference figures all match on
// costCentreCode + subHeadCode + dataType + fiscalYear).
//
// Column layout (1-indexed, header row 1):
// 1 Company Code | 2 Cost Centre Code | 3 Cost Centre Name (reference only)
// | 4 Budget Sub Head Code (Fund code) | 5 Budget Sub Head Name (reference only)
// | 6 Fiscal Year (e.g. "2026-27") | 7 Amount (INR Lakh)

export const ACTUALS_TEMPLATE_HEADERS = [
  "Company Code",
  "Cost Centre Code",
  "Cost Centre Name",
  "Budget Sub Head Code",
  "Budget Sub Head Name",
  "Fiscal Year",
  "Amount",
] as const;

export const ACTUALS_TEMPLATE_SAMPLE_ROW = ["9320", "P9101", "PRRPL_Paradip", "1103", "Township Maintenance", "2026-27", 12.5];

export type ParsedActualsRow = {
  companyCode: string;
  costCentreCode: string;
  costCentreName: string | null;
  subHeadCode: string;
  subHeadName: string | null;
  fiscalYear: string;
  amount: number;
  dataType: ActualsDataType;
};

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>).text).trim() || null;
  }
  if (typeof v === "object" && v !== null && "result" in (v as Record<string, unknown>)) {
    return str((v as Record<string, unknown>).result);
  }
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Shared parser — the three exported functions below just fix `dataType`. */
async function parseActualsWorkbook(
  buffer: ArrayBuffer,
  dataType: ActualsDataType
): Promise<{ rows: ParsedActualsRow[]; warnings: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  const warnings: string[] = [];
  if (!ws) return { rows: [], warnings: ["Workbook has no sheets."] };

  const rows: ParsedActualsRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const companyCode = str(row.getCell(1).value);
    const costCentreCode = str(row.getCell(2).value);
    const subHeadCode = str(row.getCell(4).value);
    if (!companyCode || !costCentreCode || !subHeadCode) return; // skip stray blank rows

    const amountRaw = row.getCell(7).value;
    const amount = typeof amountRaw === "number" ? amountRaw : Number(amountRaw);

    rows.push({
      companyCode,
      costCentreCode,
      costCentreName: str(row.getCell(3).value),
      subHeadCode,
      subHeadName: str(row.getCell(5).value),
      fiscalYear: str(row.getCell(6).value) ?? "",
      amount: Number.isFinite(amount) ? amount : 0,
      dataType,
    });
  });

  return { rows, warnings };
}

export function parseLyActualWorkbook(buffer: ArrayBuffer) {
  return parseActualsWorkbook(buffer, ActualsDataType.LY_ACTUAL);
}

export function parseApprovedBeWorkbook(buffer: ArrayBuffer) {
  return parseActualsWorkbook(buffer, ActualsDataType.APPROVED_BE);
}

export function parseYtdActualWorkbook(buffer: ArrayBuffer) {
  return parseActualsWorkbook(buffer, ActualsDataType.YTD_ACTUAL);
}

/** Generates the downloadable sample template workbook (used by src/app/api/templates/*). */
export async function buildActualsSampleWorkbook(sheetTitle: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetTitle);
  ws.addRow([...ACTUALS_TEMPLATE_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.addRow(ACTUALS_TEMPLATE_SAMPLE_ROW);
  ws.columns.forEach((col) => {
    col.width = 22;
  });
  return wb;
}
