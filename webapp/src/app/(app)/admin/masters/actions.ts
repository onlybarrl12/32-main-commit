"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/rbac";
import { setActiveCycle } from "@/lib/cycle";
import { BroadPnlHead, Role } from "@prisma/client";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const user = await getCurrentUser();
  const isAdmin = user?.access.some((a) => a.role === Role.ADMIN) ?? false;
  if (!user || !isAdmin) throw new Error("Not authorized");
  return user;
}

async function audit(userId: string, entityType: string, entityId: string, action: string, diff?: unknown) {
  await prisma.auditLog.create({
    data: { entityType, entityId, action, performedByUserId: userId, diff: diff ? JSON.parse(JSON.stringify(diff)) : undefined },
  });
}

function friendlyDbError(e: unknown, deleteContext: string): string {
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code?: string }).code;
    if (code === "P2003") return `Cannot delete — other records still reference this ${deleteContext}.`;
    if (code === "P2002") return "That code/name is already in use.";
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

// ── Locations (CostCentre) ──────────────────────────────────────────────

export async function createCostCentre(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAdmin();
    const data = {
      code: String(formData.get("code") ?? "").trim(),
      name: String(formData.get("name") ?? "").trim(),
      companyCodeId: String(formData.get("companyCodeId") ?? ""),
      pipelineId: String(formData.get("pipelineId") ?? ""),
      baseId: String(formData.get("baseId") ?? ""),
    };
    if (!data.code || !data.name || !data.companyCodeId || !data.pipelineId || !data.baseId) {
      return { ok: false, error: "All fields are required." };
    }
    const cc = await prisma.costCentre.create({ data });
    await audit(user.id, "CostCentre", cc.id, "CREATE", data);
    revalidatePath("/admin/masters");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyDbError(e, "location") };
  }
}

export async function deleteCostCentre(formData: FormData): Promise<void> {
  try {
    const user = await requireAdmin();
    const id = String(formData.get("id") ?? "");
    await prisma.costCentre.delete({ where: { id } });
    await audit(user.id, "CostCentre", id, "DELETE");
  } catch {
    // Swallowed for this plain-form action — the row simply won't disappear if it's referenced;
    // createCostCentre/deleteCostCentre pairs used via useActionState show real errors instead.
  }
  revalidatePath("/admin/masters");
}

// ── Funds (BudgetHead / BudgetSubHead) ──────────────────────────────────

export async function createBudgetHead(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAdmin();
    const code = String(formData.get("code") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const broadPnlHead = String(formData.get("broadPnlHead") ?? "") as BroadPnlHead;
    if (!code || !name) return { ok: false, error: "Code and name are required." };
    if (!Object.values(BroadPnlHead).includes(broadPnlHead)) {
      return { ok: false, error: "A Broad PNL Head (R & M / Power / Chemical) is required." };
    }
    const bh = await prisma.budgetHead.create({ data: { code, name, broadPnlHead } });
    await audit(user.id, "BudgetHead", bh.id, "CREATE", { code, name, broadPnlHead });
    revalidatePath("/admin/masters");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyDbError(e, "budget head") };
  }
}

export async function createBudgetSubHead(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAdmin();
    const code = String(formData.get("code") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const budgetHeadId = String(formData.get("budgetHeadId") ?? "");
    if (!code || !name || !budgetHeadId) return { ok: false, error: "All fields are required." };
    const sh = await prisma.budgetSubHead.create({ data: { code, name, budgetHeadId } });
    await audit(user.id, "BudgetSubHead", sh.id, "CREATE", { code, name, budgetHeadId });
    revalidatePath("/admin/masters");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyDbError(e, "budget sub head") };
  }
}

export async function deleteBudgetSubHead(formData: FormData): Promise<void> {
  try {
    const user = await requireAdmin();
    const id = String(formData.get("id") ?? "");
    await prisma.budgetSubHead.delete({ where: { id } });
    await audit(user.id, "BudgetSubHead", id, "DELETE");
  } catch {
    // See deleteCostCentre note.
  }
  revalidatePath("/admin/masters");
}

// ── Rates & UOM (SubHeadUom / SubHeadRate) — Power/Chemical only ───────────
// Added 2026-08-24, see MAIN_SHEET_REWORK_PLAN.md's addendum. UOM applies to
// both Power and Chemical Sub Heads. Rate only ever applies to Chemical
// (admin-maintained, per kg, per fiscal year — chemical prices can escalate
// year to year) — Power's Rate is entered by the Location User directly on
// the entry grid, just like its Qty (see src/lib/entry-amount.ts's
// isAdminRateHead; an intermediate 2026-08-25 pass had briefly made Power's
// Rate admin-maintained too, reverted the same day per the user's explicit
// instruction — RateUomForm/RatesUomTab now only render Rate inputs for
// Chemical, so this action simply never receives Power Rate fields to
// begin with). A blank Rate input means "leave unchanged", not "set to
// zero" — blank/zero on the *entry* side is always zero (per the
// 2026-08-24 "no default value" decision), but here on the *admin master*
// side leaving a field blank must not silently zero out an
// existing rate.

export async function saveSubHeadRateUom(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAdmin();
    const subHeadId = String(formData.get("subHeadId") ?? "");
    if (!subHeadId) return { ok: false, error: "Missing Budget Sub Head." };

    const uom = String(formData.get("uom") ?? "").trim();
    if (!uom) return { ok: false, error: "UOM is required." };

    const cfyFiscalYear = String(formData.get("cfyFiscalYear") ?? "").trim();
    const nfyFiscalYear = String(formData.get("nfyFiscalYear") ?? "").trim();
    const cfyRateRaw = String(formData.get("cfyRate") ?? "").trim();
    const nfyRateRaw = String(formData.get("nfyRate") ?? "").trim();

    const ops: Promise<unknown>[] = [
      prisma.subHeadUom.upsert({ where: { subHeadId }, update: { uom }, create: { subHeadId, uom } }),
    ];

    if (cfyRateRaw !== "") {
      const rate = Number(cfyRateRaw);
      if (!Number.isFinite(rate) || rate < 0) return { ok: false, error: "Current-FY Rate must be a non-negative number." };
      if (!cfyFiscalYear) return { ok: false, error: "No open budget cycle — cannot set a current-FY rate right now." };
      ops.push(
        prisma.subHeadRate.upsert({
          where: { subHeadId_fiscalYear: { subHeadId, fiscalYear: cfyFiscalYear } },
          update: { rate },
          create: { subHeadId, fiscalYear: cfyFiscalYear, rate },
        })
      );
    }
    if (nfyRateRaw !== "") {
      const rate = Number(nfyRateRaw);
      if (!Number.isFinite(rate) || rate < 0) return { ok: false, error: "Next-FY Rate must be a non-negative number." };
      if (!nfyFiscalYear) return { ok: false, error: "No open budget cycle — cannot set a next-FY rate right now." };
      ops.push(
        prisma.subHeadRate.upsert({
          where: { subHeadId_fiscalYear: { subHeadId, fiscalYear: nfyFiscalYear } },
          update: { rate },
          create: { subHeadId, fiscalYear: nfyFiscalYear, rate },
        })
      );
    }

    await Promise.all(ops);
    await audit(user.id, "SubHeadUom/SubHeadRate", subHeadId, "UPSERT", { uom, cfyFiscalYear, cfyRateRaw, nfyFiscalYear, nfyRateRaw });
    revalidatePath("/admin/masters");
    revalidatePath("/budgets");
    revalidatePath("/approvals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyDbError(e, "rate/UOM") };
  }
}

// ── Employees ────────────────────────────────────────────────────────────
// Admin CRUD over the Employee master (initial 311 rows come from
// prisma/seed.ts; this is for ongoing add/edit/update per the user's ask).

export async function createEmployee(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAdmin();
    const data = {
      employeeNo: String(formData.get("employeeNo") ?? "").trim(),
      title: String(formData.get("title") ?? "").trim() || null,
      firstName: String(formData.get("firstName") ?? "").trim(),
      lastName: String(formData.get("lastName") ?? "").trim(),
      designationShort: String(formData.get("designationShort") ?? "").trim() || null,
      baseId: String(formData.get("baseId") ?? "") || null,
      companyCodeId: String(formData.get("companyCodeId") ?? "") || null,
    };
    if (!data.employeeNo || !data.firstName || !data.lastName) {
      return { ok: false, error: "Employee No, First Name, and Last Name are required." };
    }
    const emp = await prisma.employee.create({ data });
    await audit(user.id, "Employee", emp.id, "CREATE", data);
    revalidatePath("/admin/masters");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyDbError(e, "employee") };
  }
}

export async function updateEmployee(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAdmin();
    const id = String(formData.get("id") ?? "");
    const data = {
      title: String(formData.get("title") ?? "").trim() || null,
      firstName: String(formData.get("firstName") ?? "").trim(),
      lastName: String(formData.get("lastName") ?? "").trim(),
      designationShort: String(formData.get("designationShort") ?? "").trim() || null,
      baseId: String(formData.get("baseId") ?? "") || null,
      companyCodeId: String(formData.get("companyCodeId") ?? "") || null,
    };
    if (!id || !data.firstName || !data.lastName) {
      return { ok: false, error: "First Name and Last Name are required." };
    }
    await prisma.employee.update({ where: { id }, data });
    await audit(user.id, "Employee", id, "UPDATE", data);
    revalidatePath("/admin/masters");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyDbError(e, "employee") };
  }
}

export async function deleteEmployee(formData: FormData): Promise<void> {
  try {
    const user = await requireAdmin();
    const id = String(formData.get("id") ?? "");
    await prisma.employee.delete({ where: { id } });
    await audit(user.id, "Employee", id, "DELETE");
  } catch {
    // See deleteCostCentre note — blocked (e.g. employee already has a User login) shows no inline error here.
  }
  revalidatePath("/admin/masters");
}

// ── Settings (BudgetCycle) — admin-controlled current/next FY ───────────
// At most one cycle is ever open at a time (src/lib/cycle.ts's
// setActiveCycle) — this is what "FY moves as per admin control only" means
// app-wide: Home, Reports, and Create Budget all read the one open cycle.

export async function createBudgetCycle(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAdmin();
    const financialYearRBE = String(formData.get("financialYearRBE") ?? "").trim();
    const financialYearBE = String(formData.get("financialYearBE") ?? "").trim();
    if (!financialYearRBE || !financialYearBE) return { ok: false, error: "Both financial years are required." };
    const cycle = await prisma.budgetCycle.create({ data: { financialYearRBE, financialYearBE, isOpen: false } });
    // New cycles are created closed by default — admin opens it explicitly via toggleCycleOpen,
    // which is also where the single-open-cycle rule is enforced.
    await audit(user.id, "BudgetCycle", cycle.id, "CREATE", { financialYearRBE, financialYearBE });
    revalidatePath("/admin/masters");
    revalidatePath("/budgets/create");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyDbError(e, "cycle") };
  }
}

export async function toggleCycleOpen(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const nextOpen = formData.get("nextOpen") === "true";
  if (nextOpen) {
    await setActiveCycle(id); // closes every other cycle first
  } else {
    await prisma.budgetCycle.update({ where: { id }, data: { isOpen: false } });
  }
  await audit(user.id, "BudgetCycle", id, nextOpen ? "OPEN" : "CLOSE");
  revalidatePath("/admin/masters");
  revalidatePath("/budgets/create");
  revalidatePath("/");
  revalidatePath("/reports");
}
