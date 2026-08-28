import path from "node:path";
import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/rbac";
import { getReportData } from "@/lib/reports";
import { formatCycleLabel } from "@/lib/labels";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const filters = {
    pipeline: searchParams.get("pipeline") ?? undefined,
    companyCode: searchParams.get("companyCode") ?? undefined,
    location: searchParams.get("location") ?? undefined,
    cycleId: searchParams.get("cycleId") ?? undefined,
  };

  const data = await getReportData(user.access, filters);

  const wb = new ExcelJS.Workbook();
  wb.creator = "SERPL Budget Management Portal";
  wb.created = new Date();
  const ws = wb.addWorksheet("R&M Budget Report");

  // Letterhead — real IndianOil logo embedded in the exported file too, not
  // just the on-screen page (user's explicit "very good branding" ask).
  const logoId = wb.addImage({
    filename: path.join(process.cwd(), "public", "brand", "indianoil-logo.png"),
    extension: "png",
  });
  ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 56, height: 56 } });
  ws.mergeCells("B1:F1");
  ws.getCell("B1").value = "Indian Oil Corporation Limited";
  ws.getCell("B1").font = { bold: true, size: 14, color: { argb: "FF312D73" } };
  ws.mergeCells("B2:F2");
  ws.getCell("B2").value = "South Eastern Region Pipelines (SERPL)";
  ws.getCell("B2").font = { bold: true, size: 11, color: { argb: "FFEC6519" } };
  ws.mergeCells("B3:F3");
  ws.getCell("B3").value = data.cycle ? `R&M Budget Report — ${formatCycleLabel(data.cycle)}` : "R&M Budget Report";
  ws.getCell("B3").font = { size: 10, color: { argb: "FF57534E" } };
  ws.mergeCells("B4:F4");
  ws.getCell("B4").value = `Generated ${new Date().toLocaleString("en-IN")} by ${user.username}`;
  ws.getCell("B4").font = { size: 9, italic: true, color: { argb: "FFA8A29E" } };
  ws.getRow(5).values = [];

  const headerRowIdx = 6;
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.values = ["Cost Centre Code", "Cost Centre Name", "Pipeline", "LY Actual (₹L)", "Approved BE (₹L)", "Proposed RBE (₹L)", "Proposed BE (₹L)"];
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF312D73" } };
    cell.alignment = { vertical: "middle" };
  });

  let r = headerRowIdx + 1;
  for (const row of data.rows) {
    ws.getRow(r).values = [
      row.costCentre.code,
      row.costCentre.name,
      row.costCentre.pipelineCode,
      Number((row.lyActual / 100000).toFixed(2)),
      Number((row.approvedBE / 100000).toFixed(2)),
      Number((row.proposedRBE / 100000).toFixed(2)),
      Number((row.proposedBE / 100000).toFixed(2)),
    ];
    r++;
  }
  const totalRow = ws.getRow(r);
  totalRow.values = [
    "Total",
    "",
    "",
    Number((data.grand.lyActual / 100000).toFixed(2)),
    Number((data.grand.approvedBE / 100000).toFixed(2)),
    Number((data.grand.proposedRBE / 100000).toFixed(2)),
    Number((data.grand.proposedBE / 100000).toFixed(2)),
  ];
  totalRow.font = { bold: true, color: { argb: "FFEC6519" } };
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: "thin", color: { argb: "FF312D73" } } };
  });

  ws.columns = [{ width: 16 }, { width: 32 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `SERPL_RM_Budget_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
