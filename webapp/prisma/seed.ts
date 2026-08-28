// Seeds Region / CompanyCode / Pipeline / Base / CostCentre / BudgetHead /
// BudgetSubHead / Employee from business_knowledge/Data for R&M Portal.xlsx
// (CLAUDE.md §9 build order step 6).
//
// Sheet → model mapping (verified against the actual workbook, not just
// CLAUDE.md's summary, since sheet names/columns don't always match the
// prose exactly):
//   "Location Mapping" (34 rows) -> CompanyCode, Pipeline, Base, CostCentre
//     (authoritative per CLAUDE.md §4 — NOT the "Location"/"CostCentreList"/
//     "MAIN SHEET" sheets — MAIN SHEET has no location data of its own,
//     verified by inspection: its used range stops at row 58 / column F).
//   "MAIN SHEET" rows 26-58 (32 rows) -> BudgetHead (17 unique names, each
//     tagged with a broadPnlHead of R&M/Power/Chemical), BudgetSubHead.
//     Reworked 2026-08-21 — supersedes the old "Fund Centre" sheet (10 heads
//     / 25 items), which MAIN SHEET's own "NEW RULES" section replaces.
//   "Data base Emplyee" (311 rows) -> Employee
//
// Idempotent: every row is upserted on its natural business key, so this
// can be re-run safely.

import "dotenv/config";
import path from "node:path";
import ExcelJS from "exceljs";
import { BroadPnlHead } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const WORKBOOK_PATH = path.resolve(
  __dirname,
  "../../business_knowledge/Data for R&M Portal.xlsx"
);

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

function requireSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const ws = wb.getWorksheet(name);
  if (!ws) {
    throw new Error(
      `Sheet "${name}" not found. Available sheets: ${wb.worksheets.map((w) => w.name).join(", ")}`
    );
  }
  return ws;
}

function broadPnlHeadFromText(text: string): BroadPnlHead {
  const t = text.trim().toUpperCase();
  if (t === "R & M" || t === "R&M") return BroadPnlHead.RM;
  if (t === "POWER") return BroadPnlHead.POWER;
  if (t === "CHEMICAL") return BroadPnlHead.CHEMICAL;
  throw new Error(`Unrecognized Broad PNL Head "${text}" in MAIN SHEET`);
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(WORKBOOK_PATH);

  // ── Region ───────────────────────────────────────────────────────────
  // Only SERPL matters for this portal (CLAUDE.md §4).
  const region = await prisma.region.upsert({
    where: { code: "SERPL" },
    update: {},
    create: { code: "SERPL", name: "South Eastern Region Pipelines" },
  });

  // ── Location Mapping → CompanyCode / Pipeline / Base / CostCentre ──────
  const locSheet = requireSheet(wb, "Location Mapping");
  type LocRow = {
    costCentre: string;
    pipeline: string;
    base: string;
    locationName: string;
    companyCode: string;
  };
  const locRows: LocRow[] = [];
  locSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const costCentre = str(row.getCell(1).value);
    if (!costCentre) return; // skip stray blank rows
    locRows.push({
      costCentre,
      pipeline: str(row.getCell(2).value)!,
      base: str(row.getCell(3).value)!,
      locationName: str(row.getCell(4).value)!,
      companyCode: String(row.getCell(5).value),
    });
  });
  if (locRows.length !== 34) {
    console.warn(`⚠ Expected 34 cost centres in "Location Mapping", found ${locRows.length}`);
  }

  const companyCodeIdByCode = new Map<string, string>();
  for (const code of new Set(locRows.map((r) => r.companyCode))) {
    const cc = await prisma.companyCode.upsert({
      where: { code },
      update: { regionId: region.id },
      create: { code, regionId: region.id },
    });
    companyCodeIdByCode.set(code, cc.id);
  }

  const pipelineToCompanyCode = new Map<string, string>();
  for (const r of locRows) {
    if (!pipelineToCompanyCode.has(r.pipeline)) pipelineToCompanyCode.set(r.pipeline, r.companyCode);
  }
  const pipelineIdByCode = new Map<string, string>();
  for (const [pipelineCode, companyCode] of pipelineToCompanyCode) {
    const p = await prisma.pipeline.upsert({
      where: { code: pipelineCode },
      update: { companyCodeId: companyCodeIdByCode.get(companyCode)! },
      create: { code: pipelineCode, companyCodeId: companyCodeIdByCode.get(companyCode)! },
    });
    pipelineIdByCode.set(pipelineCode, p.id);
  }

  const baseIdByName = new Map<string, string>();
  for (const name of new Set(locRows.map((r) => r.base))) {
    const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    const b = await prisma.base.upsert({
      where: { name },
      update: {},
      create: { code, name },
    });
    baseIdByName.set(name, b.id);
  }
  if (baseIdByName.size !== 5) {
    console.warn(`⚠ Expected 5 bases, found ${baseIdByName.size}: ${[...baseIdByName.keys()].join(", ")}`);
  }

  for (const r of locRows) {
    const data = {
      name: r.locationName,
      companyCodeId: companyCodeIdByCode.get(r.companyCode)!,
      pipelineId: pipelineIdByCode.get(r.pipeline)!,
      baseId: baseIdByName.get(r.base)!,
    };
    await prisma.costCentre.upsert({
      where: { code: r.costCentre },
      update: data,
      create: { code: r.costCentre, ...data },
    });
  }

  // ── MAIN SHEET rows 26-58 → BudgetHead / BudgetSubHead ─────────────────
  // Columns: A=SN, B=Broad PNL Head, C=FUND, D=Budget Head, E=Budget Sub Head.
  const mainSheet = requireSheet(wb, "MAIN SHEET");
  type SubHeadRow = { broadPnlHead: BroadPnlHead; fund: string; budgetHead: string; subHead: string };
  const subHeadRows: SubHeadRow[] = [];
  for (let rowNumber = 27; rowNumber <= mainSheet.rowCount; rowNumber++) {
    const row = mainSheet.getRow(rowNumber);
    const broadPnlHeadText = str(row.getCell(2).value);
    const fund = str(row.getCell(3).value);
    const budgetHead = str(row.getCell(4).value);
    const subHead = str(row.getCell(5).value);
    if (!broadPnlHeadText || !fund || !budgetHead || !subHead) continue; // skip stray blank rows
    subHeadRows.push({ broadPnlHead: broadPnlHeadFromText(broadPnlHeadText), fund, budgetHead, subHead });
  }
  if (subHeadRows.length !== 32) {
    console.warn(`⚠ Expected 32 Budget Sub Heads in "MAIN SHEET", found ${subHeadRows.length}`);
  }

  const budgetHeadNames = [...new Set(subHeadRows.map((r) => r.budgetHead))];
  if (budgetHeadNames.length !== 17) {
    console.warn(`⚠ Expected 17 Budget Heads, found ${budgetHeadNames.length}: ${budgetHeadNames.join(", ")}`);
  }
  const budgetHeadIdByName = new Map<string, string>();
  for (const name of budgetHeadNames) {
    const broadPnlHead = subHeadRows.find((r) => r.budgetHead === name)!.broadPnlHead;
    const code = name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const bh = await prisma.budgetHead.upsert({
      where: { name },
      update: { code, broadPnlHead },
      create: { code, name, broadPnlHead },
    });
    budgetHeadIdByName.set(name, bh.id);
  }

  for (const r of subHeadRows) {
    await prisma.budgetSubHead.upsert({
      where: { code: r.fund },
      update: { name: r.subHead, budgetHeadId: budgetHeadIdByName.get(r.budgetHead)! },
      create: { code: r.fund, name: r.subHead, budgetHeadId: budgetHeadIdByName.get(r.budgetHead)! },
    });
  }

  // ── Data base Emplyee → Employee ────────────────────────────────────
  const empSheet = requireSheet(wb, "Data base Emplyee");
  let empCount = 0;
  let empSkippedBase = 0;
  let empSkippedCompany = 0;

  for (let rowNumber = 2; rowNumber <= empSheet.rowCount; rowNumber++) {
    const row = empSheet.getRow(rowNumber);
    const employeeNo = str(row.getCell(1).value);
    if (!employeeNo) continue; // skip stray blank rows

    const companyCodeRaw = str(row.getCell(6).value);
    const baseNameRaw = str(row.getCell(19).value);

    const companyCodeId = companyCodeRaw ? companyCodeIdByCode.get(companyCodeRaw) ?? null : null;
    if (companyCodeRaw && !companyCodeId) empSkippedCompany++;

    const baseId = baseNameRaw ? baseIdByName.get(baseNameRaw) ?? null : null;
    if (baseNameRaw && !baseId) empSkippedBase++;

    const data = {
      title: str(row.getCell(2).value),
      firstName: str(row.getCell(3).value) ?? "",
      lastName: str(row.getCell(4).value) ?? "",
      companyCodeId,
      personnelArea: str(row.getCell(8).value),
      personnelSubArea: str(row.getCell(9).value),
      employeeGroup: str(row.getCell(10).value),
      employeeSubgroup: str(row.getCell(11).value),
      designationLong: str(row.getCell(13).value),
      designationShort: str(row.getCell(14).value),
      employeeCategory: str(row.getCell(15).value),
      empContrlOff: str(row.getCell(16).value),
      function: str(row.getCell(17).value),
      functionalArea: str(row.getCell(18).value),
      baseId,
    };

    await prisma.employee.upsert({
      where: { employeeNo },
      update: data,
      create: { employeeNo, ...data },
    });
    empCount++;
  }

  if (empSkippedCompany > 0) {
    console.warn(`⚠ ${empSkippedCompany} employee rows had a Company Code with no matching CompanyCode`);
  }
  if (empSkippedBase > 0) {
    console.warn(`⚠ ${empSkippedBase} employee rows had a Base with no matching Base row`);
  }
  if (empCount !== 311) {
    console.warn(`⚠ Expected 311 employees, upserted ${empCount}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const counts = {
    costCentres: await prisma.costCentre.count(),
    budgetHeads: await prisma.budgetHead.count(),
    subHeads: await prisma.budgetSubHead.count(),
    employees: await prisma.employee.count(),
  };
  console.log("Seed complete:", counts);

  const expected = { costCentres: 34, budgetHeads: 17, subHeads: 32, employees: 311 };
  const mismatches = Object.entries(expected).filter(
    ([k, v]) => counts[k as keyof typeof counts] !== v
  );
  if (mismatches.length > 0) {
    console.warn("⚠ Row count mismatches vs CLAUDE.md §9 expectations:", Object.fromEntries(mismatches));
  } else {
    console.log("✓ All row counts match CLAUDE.md §9 expectations (34 / 17 / 32 / 311).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
