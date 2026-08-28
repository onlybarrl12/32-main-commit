import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getAccessibleCostCentreIds } from "@/lib/rbac";
import { resolveStoredPath } from "@/lib/attachments";

// Any role covering the parent budget's cost centre may view its attachments
// (viewing is not restricted to Location User the way editing/uploading is).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const attachment = await prisma.budgetAttachment.findUnique({
    where: { id },
    include: { entry: { include: { header: true } } },
  });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const accessibleIds = await getAccessibleCostCentreIds(user.access);
  if (accessibleIds !== "ALL" && !accessibleIds.includes(attachment.entry.header.costCentreId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const buffer = await fs.readFile(resolveStoredPath(attachment.storedPath));
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${attachment.fileName.replace(/"/g, "")}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing on disk" }, { status: 410 });
  }
}
