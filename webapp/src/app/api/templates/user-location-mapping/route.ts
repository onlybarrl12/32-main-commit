import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/rbac";

// Downloadable sample template for the bulk User <-> Cost Centre assignment
// upload (Authorization > Bulk Assign) — lets admin determine, in one file,
// which user covers which location(s) and how many, per the user's ask.
// One row per (Employee, Role, Cost Centre) grant — an employee needing
// several Cost Centres is several rows. The employee must already have a
// login (created singly via "Create login for an employee") — this upload
// only adds access grants, it does not create logins.
export async function GET() {
  const user = await getCurrentUser();
  const isAdmin = user?.access.some((a) => a.role === "ADMIN") ?? false;
  if (!user || !isAdmin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("User-Location Mapping");
  ws.addRow(["Employee No", "Role", "Cost Centre Code"]);
  ws.getRow(1).font = { bold: true };
  ws.addRow(["10001234", "Location User", "P5142"]);
  ws.addRow(["10001234", "Location User", "P5151"]);
  ws.addRow(["10005678", "SIC", "P5142"]);
  ws.getCell("E1").value = "Role must be one of: Location User, SIC, BIC, TS Department, Finance Department";
  ws.columns.forEach((col) => {
    col.width = 22;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="user-location-mapping-template.xlsx"`,
    },
  });
}
