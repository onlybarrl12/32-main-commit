"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/rbac";
import { ActualsDataType, Role } from "@prisma/client";
import {
  parseApprovedBeWorkbook,
  parseLyActualWorkbook,
  parseYtdActualWorkbook,
  type ParsedActualsRow,
} from "@/lib/actuals";

export type ActionResult = { ok: true; rowCount: number; warnings: string[] } | { ok: false; error: string };

async function importParsed(
  file: File,
  user: { id: string },
  dataType: ActualsDataType,
  parse: (buffer: ArrayBuffer) => Promise<{ rows: ParsedActualsRow[]; warnings: string[] }>
): Promise<ActionResult> {
  let parsed;
  try {
    const buffer = await file.arrayBuffer();
    parsed = await parse(buffer);
  } catch (e) {
    return { ok: false, error: `Could not read file: ${e instanceof Error ? e.message : "unknown error"}` };
  }

  if (parsed.rows.length === 0) {
    return { ok: false, error: `No recognizable rows found. ${parsed.warnings.join(" ")}` };
  }

  const batch = await prisma.actualsImportBatch.create({
    data: { fileName: file.name, dataType, uploadedByUserId: user.id, rowCount: parsed.rows.length },
  });

  // createMany in chunks — a real Finance extract can be several thousand rows.
  const CHUNK = 1000;
  for (let i = 0; i < parsed.rows.length; i += CHUNK) {
    const chunk = parsed.rows.slice(i, i + CHUNK).map((r) => ({ ...r, batchId: batch.id }));
    await prisma.actualsRow.createMany({ data: chunk });
  }

  await prisma.auditLog.create({
    data: {
      entityType: "ActualsImportBatch",
      entityId: batch.id,
      action: "IMPORT",
      performedByUserId: user.id,
      diff: { fileName: file.name, dataType, rowCount: parsed.rows.length, warnings: parsed.warnings },
    },
  });

  revalidatePath("/admin/masters");
  revalidatePath("/reports");
  revalidatePath("/budgets");
  revalidatePath("/");

  return { ok: true, rowCount: parsed.rows.length, warnings: parsed.warnings };
}

async function requireAdminUser() {
  const user = await getCurrentUser();
  const isAdmin = user?.access.some((a) => a.role === Role.ADMIN) ?? false;
  if (!user || !isAdmin) return null;
  return user;
}

function fileFromForm(formData: FormData): File | null {
  const file = formData.get("file");
  return file instanceof File && file.size > 0 ? file : null;
}

/** Last FY's final actuals — admin-maintained reference figure shown per Budget Sub Head in Create Budget. */
export async function importLyActual(formData: FormData): Promise<ActionResult> {
  const user = await requireAdminUser();
  if (!user) return { ok: false, error: "Not authorized" };
  const file = fileFromForm(formData);
  if (!file) return { ok: false, error: "Please choose a file to upload." };
  return importParsed(file, user, ActualsDataType.LY_ACTUAL, parseLyActualWorkbook);
}

/** Current FY's Approved Budget Estimate — the fallback figure for Proposed RBE/BE when left blank. */
export async function importApprovedBe(formData: FormData): Promise<ActionResult> {
  const user = await requireAdminUser();
  if (!user) return { ok: false, error: "Not authorized" };
  const file = fileFromForm(formData);
  if (!file) return { ok: false, error: "Please choose a file to upload." };
  return importParsed(file, user, ActualsDataType.APPROVED_BE, parseApprovedBeWorkbook);
}

/** Current FY's actual expenditure to date — the floor Proposed RBE must meet or exceed. */
export async function importYtdActual(formData: FormData): Promise<ActionResult> {
  const user = await requireAdminUser();
  if (!user) return { ok: false, error: "Not authorized" };
  const file = fileFromForm(formData);
  if (!file) return { ok: false, error: "Please choose a file to upload." };
  return importParsed(file, user, ActualsDataType.YTD_ACTUAL, parseYtdActualWorkbook);
}
