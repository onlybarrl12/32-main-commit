"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcrypt";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/rbac";
import { encryptPassword, generatePassword } from "@/lib/password-crypto";

async function requireAdmin() {
  const user = await getCurrentUser();
  const isAdmin = user?.access.some((a) => a.role === Role.ADMIN) ?? false;
  if (!user || !isAdmin) throw new Error("Not authorized");
  return user;
}

export type ResolveResetResult = { ok: true; username: string; password: string } | { ok: false; error: string };

/**
 * Admin resets the password for a pending "Forgot Password" request —
 * generates a new random password, updates it (hash + recoverable
 * encrypted copy, same as bulk-create), marks the request resolved, and
 * hands the new password back for a one-time on-screen reveal (also
 * captured for "Download current passwords" afterward).
 */
export async function resolvePasswordReset(formData: FormData): Promise<ResolveResetResult> {
  const admin = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { ok: false, error: "Missing request id." };

  const request = await prisma.passwordResetRequest.findUnique({ where: { id: requestId }, include: { user: true } });
  if (!request) return { ok: false, error: "Request not found." };
  if (request.resolvedAt) return { ok: false, error: "Already resolved." };

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);
  const passwordEncrypted = encryptPassword(password);

  await prisma.$transaction([
    prisma.user.update({ where: { id: request.userId }, data: { passwordHash, passwordEncrypted } }),
    prisma.passwordResetRequest.update({
      where: { id: requestId },
      data: { resolvedAt: new Date(), resolvedByUserId: admin.id },
    }),
    prisma.auditLog.create({
      data: {
        entityType: "User",
        entityId: request.userId,
        action: "PASSWORD_RESET",
        performedByUserId: admin.id,
        diff: { requestId },
      },
    }),
  ]);

  revalidatePath("/admin/password-resets");
  return { ok: true, username: request.user.username, password };
}

/** Dismiss a request without resetting the password (e.g. it was a mistake / handled another way). */
export async function dismissPasswordReset(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return;
  await prisma.passwordResetRequest.update({
    where: { id: requestId },
    data: { resolvedAt: new Date(), resolvedByUserId: admin.id },
  }).catch(() => {});
  revalidatePath("/admin/password-resets");
}
