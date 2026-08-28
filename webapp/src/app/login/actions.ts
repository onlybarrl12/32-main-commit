"use server";

import { prisma } from "@/lib/prisma";

export type ForgotPasswordResult = { ok: true; message: string };

/**
 * Public (unauthenticated) — a user on the login page clicks "Forgot
 * Password" and types their username. Creates a PasswordResetRequest that
 * shows up as a bubble/badge for admin (Topbar), who can reset it directly
 * from there. Always returns the same generic success message regardless
 * of whether the username actually exists, so this can't be used to probe
 * which usernames are real.
 */
export async function requestPasswordReset(formData: FormData): Promise<ForgotPasswordResult> {
  const username = String(formData.get("username") ?? "").trim();
  const genericMessage = "If that username exists, an admin has been notified and will help you reset your password shortly.";

  if (!username) return { ok: true, message: genericMessage };

  const user = await prisma.user.findUnique({ where: { username } });
  if (user) {
    const existing = await prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, resolvedAt: null },
    });
    if (!existing) {
      await prisma.passwordResetRequest.create({ data: { userId: user.id } });
    }
  }

  return { ok: true, message: genericMessage };
}
