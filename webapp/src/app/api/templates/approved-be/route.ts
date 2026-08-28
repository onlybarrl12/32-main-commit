import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/rbac";
import { buildActualsSampleWorkbook } from "@/lib/actuals";

// Downloadable sample template for the Approved BE (current FY) admin upload.
export async function GET() {
  const user = await getCurrentUser();
  const isAdmin = user?.access.some((a) => a.role === "ADMIN") ?? false;
  if (!user || !isAdmin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const wb = await buildActualsSampleWorkbook("Approved BE");
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="approved-be-template.xlsx"`,
    },
  });
}
