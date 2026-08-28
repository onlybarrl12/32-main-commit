import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/rbac";
import { decryptPassword } from "@/lib/password-crypto";

// Admin-only "Download current passwords" — always-available (not
// one-time), per the user's explicit 2026-08-25 choice over a safer
// one-time-reveal design (see MAIN_SHEET_REWORK_PLAN.md). Decrypts every
// User.passwordEncrypted at request time; accounts with none stored (never
// set/reset since this feature shipped) show a blank password with a note,
// since bcrypt's passwordHash alone can never recover the original.
export async function GET() {
  const user = await getCurrentUser();
  const isAdmin = user?.access.some((a) => a.role === "ADMIN") ?? false;
  if (!user || !isAdmin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { username: "asc" },
    include: { employee: true },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Current Passwords");
  ws.columns = [
    { header: "Username", width: 20 },
    { header: "Password", width: 20 },
    { header: "Employee", width: 28 },
    { header: "Status", width: 14 },
    { header: "Note", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const u of users) {
    const password = u.passwordEncrypted ? decryptPassword(u.passwordEncrypted) : null;
    ws.addRow([
      u.username,
      password ?? "",
      u.employee ? `${u.employee.firstName} ${u.employee.lastName} (${u.employee.employeeNo})` : "—",
      u.isActive ? "Active" : "Inactive",
      password ? "" : "Never set/reset since password recovery was added — cannot be shown; use Reset to give this user a new one.",
    ]);
  }

  ws.getCell(`A${users.length + 3}`).value = `Generated ${new Date().toLocaleString("en-IN")} by ${user.username} — SERPL Budget Portal, internal use only.`;

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="current-passwords.xlsx"`,
    },
  });
}
