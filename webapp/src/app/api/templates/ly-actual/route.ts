import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/rbac";
import { buildActualsSampleWorkbook } from "@/lib/actuals";

// Downloadable sample template for the LY Actual admin upload — see
// src/lib/actuals.ts for the column format shared by all three actuals templates.
export async function GET() {
  const user = await getCurrentUser();
  const isAdmin = user?.access.some((a) => a.role === "ADMIN") ?? false;
  if (!user || !isAdmin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const wb = await buildActualsSampleWorkbook("LY Actual");
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ly-actual-template.xlsx"`,
    },
  });
}
