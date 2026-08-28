import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/rbac";

// Downloadable sample template for the Bulk Create Logins upload — one
// column, Employee No, pre-filled with every employee who doesn't already
// have a login (a genuine convenience, not just a blank example row).
export async function GET() {
  const user = await getCurrentUser();
  const isAdmin = user?.access.some((a) => a.role === "ADMIN") ?? false;
  if (!user || !isAdmin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const employeesWithoutLogin = await prisma.employee.findMany({
    where: { user: null },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { employeeNo: true, firstName: true, lastName: true },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Bulk Create Logins");
  ws.columns = [
    { header: "Employee No", width: 16 },
    { header: "Name (reference only, not read by upload)", width: 34 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const e of employeesWithoutLogin) {
    ws.addRow([e.employeeNo, `${e.firstName} ${e.lastName}`]);
  }
  if (employeesWithoutLogin.length === 0) {
    ws.addRow(["(no employees currently without a login)", ""]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bulk-create-logins-template.xlsx"`,
    },
  });
}
