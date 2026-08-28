"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcrypt";
import { Role, ScopeType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/rbac";
import { encryptPassword, generatePassword } from "@/lib/password-crypto";

async function requireAdmin() {
  const user = await getCurrentUser();
  const isAdmin = user?.access.some((a) => a.role === Role.ADMIN) ?? false;
  if (!user || !isAdmin) throw new Error("Not authorized");
  return user;
}

async function audit(
  performedByUserId: string,
  entityType: string,
  entityId: string,
  action: string,
  diff?: unknown
) {
  await prisma.auditLog.create({
    data: { entityType, entityId, action, performedByUserId, diff: diff ? JSON.parse(JSON.stringify(diff)) : undefined },
  });
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Creates a User for an Employee who doesn't have one yet, and auto-grants
 * LOCATION_USER scoped to the employee's Base (all cost centres under it)
 * per CLAUDE.md §4/§6 — "default access is to all locations under the
 * employee's Base".
 */
export async function createUserForEmployee(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const employeeId = String(formData.get("employeeId") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!employeeId || !username || !password) {
    return { ok: false, error: "Employee, username, and password are all required." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  if (!employee) return { ok: false, error: "Employee not found." };
  if (employee.user) return { ok: false, error: "This employee already has a user account." };
  if (!employee.baseId) return { ok: false, error: "This employee has no Base on file, cannot auto-grant access." };

  const usernameTaken = await prisma.user.findUnique({ where: { username } });
  if (usernameTaken) return { ok: false, error: "That username is already taken." };

  const passwordHash = await bcrypt.hash(password, 12);
  // Also stored reversibly-encrypted so admin can download it later via
  // "Download current passwords" — see src/lib/password-crypto.ts.
  const passwordEncrypted = encryptPassword(password);

  const user = await prisma.user.create({
    data: {
      employeeId,
      username,
      passwordHash,
      passwordEncrypted,
      isActive: true,
      access: {
        create: { role: Role.LOCATION_USER, scopeType: ScopeType.BASE, scopeId: employee.baseId },
      },
    },
  });

  await audit(admin.id, "User", user.id, "CREATE", { username, employeeId });

  revalidatePath("/admin/authorization");
  return { ok: true };
}

/**
 * LOCATION scope accepts a multi-select of Cost Centres (MAIN SHEET: "1
 * Location user may have Multiple Cost center" / "1 SIC may have Multiple
 * Cost center") — one UserAccess row is created per selected Cost Centre.
 * BASE/REGION/ALL scope still take a single scopeId (or none, for ALL).
 */
export async function addAccessGrant(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  const scopeType = String(formData.get("scopeType") ?? "") as ScopeType;
  const scopeIds = formData.getAll("scopeId").map(String).filter(Boolean);

  if (!userId || !Object.values(Role).includes(role) || !Object.values(ScopeType).includes(scopeType)) {
    return { ok: false, error: "Invalid role/scope selection." };
  }
  if (scopeType !== ScopeType.ALL && scopeIds.length === 0) {
    return { ok: false, error: "At least one scope is required unless scope type is ALL." };
  }
  if (scopeType !== ScopeType.LOCATION && scopeIds.length > 1) {
    return { ok: false, error: "Only Location scope supports selecting multiple entries at once." };
  }

  const targets = scopeType === ScopeType.ALL ? [null] : scopeIds;
  for (const scopeId of targets) {
    const grant = await prisma.userAccess.create({ data: { userId, role, scopeType, scopeId } });
    await audit(admin.id, "UserAccess", grant.id, "CREATE", { userId, role, scopeType, scopeId });
  }

  revalidatePath("/admin/authorization");
  return { ok: true };
}

export async function revokeAccessGrant(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const accessId = String(formData.get("accessId") ?? "");
  if (!accessId) return { ok: false, error: "Missing grant id." };

  await prisma.userAccess.delete({ where: { id: accessId } });
  await audit(admin.id, "UserAccess", accessId, "DELETE");

  revalidatePath("/admin/authorization");
  return { ok: true };
}

/** Thin void-returning wrappers for plain `<form action={...}>` usage (no useActionState). */
export async function revokeAccessGrantForm(formData: FormData): Promise<void> {
  await revokeAccessGrant(formData);
}

export async function toggleUserActiveForm(formData: FormData): Promise<void> {
  await toggleUserActive(formData);
}

export async function toggleUserActive(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const nextActive = formData.get("nextActive") === "true";
  if (!userId) return { ok: false, error: "Missing user id." };

  await prisma.user.update({ where: { id: userId }, data: { isActive: nextActive } });
  await audit(admin.id, "User", userId, nextActive ? "ACTIVATE" : "DEACTIVATE");

  revalidatePath("/admin/authorization");
  return { ok: true };
}

// ── Bulk assign (Employee <-> Cost Centre grants via Excel) ─────────────
// Per the user's ask: "admin may have an upload format through which he can
// determine which user shall do upload for which kind of location, and how
// many location". One row per (Employee No, Role, Cost Centre Code) grant —
// see /api/templates/user-location-mapping for the downloadable template.
// This only ADDS access grants — it does not create logins (an employee
// must already have one, via "Create login for an employee" above).

const ROLE_TEXT_MAP: Record<string, Role> = {
  "location user": Role.LOCATION_USER,
  sic: Role.STATION_INCHARGE,
  "station in-charge": Role.STATION_INCHARGE,
  "station incharge": Role.STATION_INCHARGE,
  bic: Role.BASE_INCHARGE,
  "base in-charge": Role.BASE_INCHARGE,
  "base incharge": Role.BASE_INCHARGE,
  "ts department": Role.TS_DEPT,
  ts: Role.TS_DEPT,
  "ts dept": Role.TS_DEPT,
  "finance department": Role.FINANCE_DEPT,
  finance: Role.FINANCE_DEPT,
  "finance dept": Role.FINANCE_DEPT,
};

export type BulkAssignResult =
  | { ok: true; created: number; skipped: number; errors: string[] }
  | { ok: false; error: string };

export async function bulkAssignAccess(formData: FormData): Promise<BulkAssignResult> {
  const admin = await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please choose a file to upload." };
  }

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch (e) {
    return { ok: false, error: `Could not read file: ${e instanceof Error ? e.message : "unknown error"}` };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { ok: false, error: "Workbook has no sheets." };

  function cellStr(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "object" && v !== null && "text" in (v as Record<string, unknown>)) {
      return String((v as Record<string, unknown>).text).trim();
    }
    return String(v).trim();
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const employeeNo = cellStr(row.getCell(1).value);
    const roleText = cellStr(row.getCell(2).value);
    const costCentreCode = cellStr(row.getCell(3).value);
    if (!employeeNo && !roleText && !costCentreCode) continue; // blank row

    if (!employeeNo || !roleText || !costCentreCode) {
      errors.push(`Row ${rowNumber}: Employee No, Role, and Cost Centre Code are all required.`);
      continue;
    }

    const role = ROLE_TEXT_MAP[roleText.toLowerCase()];
    if (!role) {
      errors.push(`Row ${rowNumber}: unrecognized Role "${roleText}".`);
      continue;
    }

    const employee = await prisma.employee.findUnique({ where: { employeeNo }, include: { user: true } });
    if (!employee) {
      errors.push(`Row ${rowNumber}: no Employee found with Employee No "${employeeNo}".`);
      continue;
    }
    if (!employee.user) {
      errors.push(`Row ${rowNumber}: Employee ${employeeNo} has no login yet — create one first, then re-upload.`);
      continue;
    }

    const costCentre = await prisma.costCentre.findUnique({ where: { code: costCentreCode } });
    if (!costCentre) {
      errors.push(`Row ${rowNumber}: no Cost Centre found with code "${costCentreCode}".`);
      continue;
    }

    const existing = await prisma.userAccess.findFirst({
      where: { userId: employee.user.id, role, scopeType: ScopeType.LOCATION, scopeId: costCentre.id },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const grant = await prisma.userAccess.create({
      data: { userId: employee.user.id, role, scopeType: ScopeType.LOCATION, scopeId: costCentre.id },
    });
    await audit(admin.id, "UserAccess", grant.id, "CREATE", {
      userId: employee.user.id,
      role,
      scopeType: ScopeType.LOCATION,
      scopeId: costCentre.id,
      source: "bulk-upload",
    });
    created++;
  }

  revalidatePath("/admin/authorization");
  return { ok: true, created, skipped, errors };
}

// ── Bulk create logins (Excel: Employee No only) ─────────────────────────
// Per the user's 2026-08-25 ask: "a bulk upload for creating user id and
// password, so that admin can create multiple id and password at once".
// Username and password are both auto-generated (an admin can't feasibly
// type either per row for a bulk batch) — username from the employee's
// name, deduped with a numeric suffix on collision; password random (see
// generatePassword). Every created row's username+password is returned
// immediately for one-time display, and is also captured (encrypted) for
// the always-available "Download current passwords" button.

function slugifyUsername(firstName: string, lastName: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const first = clean(firstName) || "user";
  const last = clean(lastName);
  return last ? `${first}.${last}` : first;
}

export type BulkCreateLoginsResult =
  | { ok: true; created: { employeeNo: string; username: string; password: string }[]; errors: string[] }
  | { ok: false; error: string };

export async function bulkCreateLogins(formData: FormData): Promise<BulkCreateLoginsResult> {
  const admin = await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please choose a file to upload." };
  }

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch (e) {
    return { ok: false, error: `Could not read file: ${e instanceof Error ? e.message : "unknown error"}` };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { ok: false, error: "Workbook has no sheets." };

  function cellStr(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "object" && v !== null && "text" in (v as Record<string, unknown>)) {
      return String((v as Record<string, unknown>).text).trim();
    }
    return String(v).trim();
  }

  const created: { employeeNo: string; username: string; password: string }[] = [];
  const errors: string[] = [];

  for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber++) {
    const employeeNo = cellStr(ws.getRow(rowNumber).getCell(1).value);
    if (!employeeNo) continue; // blank row

    const employee = await prisma.employee.findUnique({ where: { employeeNo }, include: { user: true } });
    if (!employee) {
      errors.push(`Row ${rowNumber}: no Employee found with Employee No "${employeeNo}".`);
      continue;
    }
    if (employee.user) {
      errors.push(`Row ${rowNumber}: Employee ${employeeNo} already has a login (${employee.user.username}) — skipped.`);
      continue;
    }
    if (!employee.baseId) {
      errors.push(`Row ${rowNumber}: Employee ${employeeNo} has no Base on file, cannot auto-grant access — skipped.`);
      continue;
    }

    let username = slugifyUsername(employee.firstName, employee.lastName);
    let suffix = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await prisma.user.findUnique({ where: { username } })) {
      suffix += 1;
      username = `${slugifyUsername(employee.firstName, employee.lastName)}${suffix}`;
    }

    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 12);
    const passwordEncrypted = encryptPassword(password);

    const user = await prisma.user.create({
      data: {
        employeeId: employee.id,
        username,
        passwordHash,
        passwordEncrypted,
        isActive: true,
        access: { create: { role: Role.LOCATION_USER, scopeType: ScopeType.BASE, scopeId: employee.baseId } },
      },
    });
    await audit(admin.id, "User", user.id, "CREATE", { username, employeeId: employee.id, source: "bulk-upload" });
    created.push({ employeeNo, username, password });
  }

  revalidatePath("/admin/authorization");
  return { ok: true, created, errors };
}
