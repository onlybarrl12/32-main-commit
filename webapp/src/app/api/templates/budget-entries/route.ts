import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/rbac";
import { BROAD_PNL_HEAD_LABELS, BUDGET_SUB_HEAD_LABEL } from "@/lib/labels";
import { BroadPnlHead } from "@prisma/client";
import { WORK_TYPES, RECURRING_OPTIONS } from "@/lib/budget-entries-upload";

// Downloadable bulk-upload template for Create Budget entries, per the
// user's 2026-08-25 ask. Layout:
//   Sheet 1 "README" — rules & validations, always the first sheet.
//   Sheet 2 "R & M" — Material/Service columns.
//   Sheet 3 "Power & Fuel" — Qty-only columns (Rate is admin-maintained,
//     same as Chemical — corrected 2026-08-25, Power was originally
//     mis-specced as user-typed Rate).
//   Sheet 4 "Chemical" — Qty-only columns, identical layout to Power & Fuel.
//   Hidden sheet "Lists" — backs every dropdown (Budget Head/Sub Head per
//     Broad PNL Head, Work Type, Recurring/One-Time) via range references,
//     not inline lists, so long Sub Head names/counts don't hit Excel's
//     ~255-char inline-list limit. Sub Head dropdowns are NOT cascaded to
//     the chosen Budget Head (every Sub Head for that Broad PNL Head is
//     offered) — a mismatched pair is caught with a precise row error at
//     upload time instead (see budget-entries-upload.ts), which keeps this
//     template simple while still catching the mistake.
// Dropdown columns use Excel data validation with errorStyle "stop", which
// rejects (with a popup) anything not in the list — the practical way to
// keep those columns "not allowed to edit" outside the dropdown. All other
// columns are free text/number entry.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const heads = await prisma.budgetHead.findMany({
    include: { subHeads: { orderBy: { code: "asc" } } },
    orderBy: { name: "asc" },
  });
  const subHeadIds = heads.flatMap((h) => h.subHeads.map((s) => s.id));
  const uoms = await prisma.subHeadUom.findMany({ where: { subHeadId: { in: subHeadIds } } });
  const uomBySubHeadId = new Map(uoms.map((u) => [u.subHeadId, u.uom]));

  const byBroad = (bh: BroadPnlHead) => heads.filter((h) => h.broadPnlHead === bh);

  const wb = new ExcelJS.Workbook();

  // ---- README (first sheet) ----------------------------------------
  const readme = wb.addWorksheet("README");
  readme.columns = [{ width: 100 }];
  const readmeLines = [
    "SERPL Budget Portal — Bulk Budget Entry Upload — README",
    "",
    "HOW TO USE THIS FILE",
    "1. Fill in one row per line item on the sheet matching its Broad PNL Head: 'R & M', 'Power & Fuel', or 'Chemical'.",
    "2. Do not add, remove, reorder, or rename columns or sheets — the upload parser matches them by position and name.",
    "3. Leave the README sheet as-is (it is not read by the upload).",
    "4. Save the file and upload it from the Create Budget screen's 'Upload Excel' button.",
    "",
    "DROPDOWN COLUMNS (Budget Head, Budget Sub Head, Work Type, Recurring/One-Time)",
    "- These columns only accept a value picked from their dropdown list — typing anything else is rejected by Excel.",
    "- Budget Sub Head options are NOT filtered by the Budget Head you picked in the same row — make sure the Sub Head you",
    "  choose actually belongs to that Budget Head. A mismatch is rejected at upload time with the exact row/error.",
    "",
    "R & M SHEET COLUMNS",
    "- Budget Head, " + BUDGET_SUB_HEAD_LABEL + " (dropdowns).",
    "- RBE Material, RBE Service, BE Material, BE Service — absolute rupees, up to 2 decimal places, 0 or more.",
    "- Work Type, Recurring/One-Time (dropdowns).",
    "- Reference Taken From, Remarks — free text, optional.",
    "- Justification — free text, REQUIRED, cannot be blank.",
    "",
    "POWER & FUEL / CHEMICAL SHEET COLUMNS (identical layout — both are admin-rate-maintained)",
    "- Budget Head, " + BUDGET_SUB_HEAD_LABEL + " (dropdowns).",
    "- UOM (auto) — filled in for reference only from the Sub Head you chose; do not edit, it is not read by the upload.",
    "- RBE Qty, BE Qty — quantity only, up to 3 decimal places, 0 or more. Do NOT enter Rate or Amount — Rate is",
    "  maintained by the admin (Masters > Rates & UOM) and Amount is calculated automatically as Qty x Rate.",
    "- Work Type, Recurring/One-Time (dropdowns).",
    "- Reference Taken From, Remarks — free text, optional.",
    "- Justification — free text, REQUIRED, cannot be blank.",
    "",
    "VALIDATION RUN AT UPLOAD (deterministic, script-driven — not AI-driven)",
    "- Every row's Budget Head must be a real Budget Head under that sheet's Broad PNL Head.",
    "- Every row's " + BUDGET_SUB_HEAD_LABEL + " must be a real Sub Head, and must belong to the Budget Head in that row.",
    "- Every amount/quantity must be a non-negative number (blank is treated as 0).",
    "- Work Type and Recurring/One-Time must exactly match one of the dropdown options.",
    "- Justification must not be blank.",
    "- If ANY row on ANY sheet fails validation, NOTHING is added — you get the exact sheet name, row number, and what",
    "  was wrong for every failing row, fix them, and re-upload.",
    "- The RBE >= YTD Actual rule (per " + BUDGET_SUB_HEAD_LABEL + ") is checked separately when you Save/Submit in the",
    "  entry grid, same as rows added by hand — it is not re-checked at upload time.",
    "",
    "Generated " + new Date().toLocaleString("en-IN"),
  ];
  readmeLines.forEach((line, i) => {
    const cell = readme.getCell(i + 1, 1);
    cell.value = line;
    if (i === 0) cell.font = { bold: true, size: 14 };
    else if (line && !line.startsWith(" ") && !line.startsWith("-") && line === line.toUpperCase() && line.length > 3) {
      cell.font = { bold: true };
    }
    cell.alignment = { wrapText: false };
  });

  // ---- Hidden Lists sheet --------------------------------------------
  const lists = wb.addWorksheet("Lists");
  lists.state = "veryHidden";
  const listCols: { header: string; values: string[] }[] = [
    { header: "RM_HEADS", values: byBroad(BroadPnlHead.RM).map((h) => h.name) },
    { header: "RM_SUBHEADS", values: byBroad(BroadPnlHead.RM).flatMap((h) => h.subHeads.map((s) => s.name)) },
    { header: "POWER_HEADS", values: byBroad(BroadPnlHead.POWER).map((h) => h.name) },
    { header: "POWER_SUBHEADS", values: byBroad(BroadPnlHead.POWER).flatMap((h) => h.subHeads.map((s) => s.name)) },
    { header: "CHEMICAL_HEADS", values: byBroad(BroadPnlHead.CHEMICAL).map((h) => h.name) },
    { header: "CHEMICAL_SUBHEADS", values: byBroad(BroadPnlHead.CHEMICAL).flatMap((h) => h.subHeads.map((s) => s.name)) },
    { header: "WORK_TYPES", values: [...WORK_TYPES] },
    { header: "RECURRING", values: [...RECURRING_OPTIONS] },
  ];
  listCols.forEach((col, colIdx) => {
    const colLetter = String.fromCharCode(65 + colIdx);
    lists.getCell(`${colLetter}1`).value = col.header;
    col.values.forEach((v, i) => {
      lists.getCell(i + 2, colIdx + 1).value = v;
    });
  });
  const rangeFor = (colIdx: number, count: number) => {
    const colLetter = String.fromCharCode(65 + colIdx);
    return `Lists!$${colLetter}$2:$${colLetter}$${Math.max(2, count + 1)}`;
  };
  const ranges = {
    rmHeads: rangeFor(0, listCols[0].values.length),
    rmSubHeads: rangeFor(1, listCols[1].values.length),
    powerHeads: rangeFor(2, listCols[2].values.length),
    powerSubHeads: rangeFor(3, listCols[3].values.length),
    chemicalHeads: rangeFor(4, listCols[4].values.length),
    chemicalSubHeads: rangeFor(5, listCols[5].values.length),
    workTypes: rangeFor(6, listCols[6].values.length),
    recurring: rangeFor(7, listCols[7].values.length),
  };

  function addDropdown(ws: ExcelJS.Worksheet, colLetter: string, range: string, rowsCount: number) {
    for (let r = 2; r <= rowsCount + 1; r++) {
      ws.getCell(`${colLetter}${r}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [range],
        showErrorMessage: true,
        errorStyle: "stop",
        error: "Pick a value from the dropdown list — free text is not allowed in this column.",
        errorTitle: "Invalid entry",
      };
    }
  }

  const SAMPLE_ROWS = 30;

  // ---- R & M sheet -----------------------------------------------------
  const rm = wb.addWorksheet("R & M");
  rm.columns = [
    { header: "Budget Head", width: 26 },
    { header: BUDGET_SUB_HEAD_LABEL, width: 30 },
    { header: "RBE Material", width: 14 },
    { header: "RBE Service", width: 14 },
    { header: "BE Material", width: 14 },
    { header: "BE Service", width: 14 },
    { header: "Work Type", width: 20 },
    { header: "Recurring/One-Time", width: 18 },
    { header: "Reference Taken From", width: 22 },
    { header: "Justification (required)", width: 30 },
    { header: "Remarks", width: 24 },
  ];
  rm.getRow(1).font = { bold: true };
  addDropdown(rm, "A", ranges.rmHeads, SAMPLE_ROWS);
  addDropdown(rm, "B", ranges.rmSubHeads, SAMPLE_ROWS);
  addDropdown(rm, "G", ranges.workTypes, SAMPLE_ROWS);
  addDropdown(rm, "H", ranges.recurring, SAMPLE_ROWS);

  // ---- Power & Fuel sheet (Qty only) ------------------------------------
  const power = wb.addWorksheet("Power & Fuel");
  power.columns = [
    { header: "Budget Head", width: 26 },
    { header: BUDGET_SUB_HEAD_LABEL, width: 30 },
    { header: "UOM (auto)", width: 12 },
    { header: "RBE Qty", width: 12 },
    { header: "BE Qty", width: 12 },
    { header: "Work Type", width: 20 },
    { header: "Recurring/One-Time", width: 18 },
    { header: "Reference Taken From", width: 22 },
    { header: "Justification (required)", width: 30 },
    { header: "Remarks", width: 24 },
  ];
  power.getRow(1).font = { bold: true };
  addDropdown(power, "A", ranges.powerHeads, SAMPLE_ROWS);
  addDropdown(power, "B", ranges.powerSubHeads, SAMPLE_ROWS);
  addDropdown(power, "F", ranges.workTypes, SAMPLE_ROWS);
  addDropdown(power, "G", ranges.recurring, SAMPLE_ROWS);
  for (let r = 2; r <= SAMPLE_ROWS + 1; r++) {
    power.getCell(`C${r}`).value = { formula: `IFERROR(VLOOKUP(B${r},Lists!$I$2:$J$1000,2,FALSE),"")` };
  }

  // ---- Chemical sheet (Qty only, identical layout to Power & Fuel) -----
  const chem = wb.addWorksheet("Chemical");
  chem.columns = [
    { header: "Budget Head", width: 26 },
    { header: BUDGET_SUB_HEAD_LABEL, width: 30 },
    { header: "UOM (auto)", width: 12 },
    { header: "RBE Qty", width: 12 },
    { header: "BE Qty", width: 12 },
    { header: "Work Type", width: 20 },
    { header: "Recurring/One-Time", width: 18 },
    { header: "Reference Taken From", width: 22 },
    { header: "Justification (required)", width: 30 },
    { header: "Remarks", width: 24 },
  ];
  chem.getRow(1).font = { bold: true };
  addDropdown(chem, "A", ranges.chemicalHeads, SAMPLE_ROWS);
  addDropdown(chem, "B", ranges.chemicalSubHeads, SAMPLE_ROWS);
  addDropdown(chem, "F", ranges.workTypes, SAMPLE_ROWS);
  addDropdown(chem, "G", ranges.recurring, SAMPLE_ROWS);
  for (let r = 2; r <= SAMPLE_ROWS + 1; r++) {
    chem.getCell(`C${r}`).value = { formula: `IFERROR(VLOOKUP(B${r},Lists!$I$2:$J$1000,2,FALSE),"")` };
  }

  // Helper lookup table (Sub Head name -> UOM) backing the VLOOKUP columns above.
  const allPowerChemSubHeads = [...byBroad(BroadPnlHead.POWER), ...byBroad(BroadPnlHead.CHEMICAL)].flatMap((h) => h.subHeads);
  allPowerChemSubHeads.forEach((s, i) => {
    lists.getCell(i + 2, 9).value = s.name; // column I
    lists.getCell(i + 2, 10).value = uomBySubHeadId.get(s.id) ?? ""; // column J
  });

  readme.getCell(readmeLines.length + 3, 1).value =
    "(Reference only) Broad PNL Heads in this workbook: " +
    Object.values(BROAD_PNL_HEAD_LABELS).join(", ") +
    ". Work Type options: " +
    WORK_TYPES.join(", ") +
    ". Recurring/One-Time options: " +
    RECURRING_OPTIONS.join(", ") +
    ".";

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="budget-entries-upload-template.xlsx"`,
    },
  });
}
