"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/rbac";
import { BudgetStatus, WorkType, RecurringType } from "@prisma/client";
import { canEditHeader, submitForApproval } from "@/lib/workflow";
import { getSubHeadActualsMap } from "@/lib/sub-head-actuals";
import { getSubHeadRateUomMap } from "@/lib/sub-head-rate-uom";
import { rbeAmount, isQtyRateHead, isAdminRateHead, numOrZero, type BroadPnlHeadCode } from "@/lib/entry-amount";
import {
  saveAttachmentFile,
  deleteAttachmentFile,
  isAllowedAttachmentName,
  MAX_ATTACHMENT_SIZE_BYTES,
  ALLOWED_ATTACHMENT_EXTENSIONS,
} from "@/lib/attachments";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type EntryInput = {
  id: string | null; // null = new row not yet persisted
  subHeadId: string;
  rbeMaterial: number;
  rbeService: number;
  beMaterial: number;
  beService: number;
  // Power/Chemical rows — see src/lib/entry-amount.ts. Chemical's Rate is
  // admin-maintained (via SubHeadRate) — the client-submitted rbeRate/beRate
  // for a Chemical row is display-only and never trusted, the server always
  // re-resolves it from the live master. Power's Rate is user-entered, just
  // like its Qty, and is trusted (subject to the same >=0 validation as
  // every other amount field below).
  rbeQty: number;
  rbeRate: number;
  beQty: number;
  beRate: number;
  workType: WorkType;
  recurringOneTime: RecurringType;
  referenceTakenFrom: string;
  justification: string;
  remarks: string;
};

const DIFFABLE_FIELDS = [
  "rbeMaterial",
  "rbeService",
  "beMaterial",
  "beService",
  "rbeQty",
  "rbeRate",
  "beQty",
  "beRate",
  "workType",
  "recurringOneTime",
  "referenceTakenFrom",
  "justification",
  "remarks",
] as const;

async function requireEditableHeader(headerId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const header = await prisma.budgetHeader.findUnique({ where: { id: headerId }, include: { costCentre: true, cycle: true } });
  if (!header) throw new Error("Budget not found");

  const editable = await canEditHeader(user.access, header);
  if (!editable) throw new Error("This budget is not currently editable by you.");

  // Anything other than the original author's DRAFT window is a TS/Finance
  // in-place modification (per src/lib/workflow.ts's canEditHeader) — those
  // changes get real field-level audit diffs (see saveDraftEntries below).
  const isModifyPath = header.status !== BudgetStatus.DRAFT;

  return { user, header, isModifyPath };
}

export async function saveDraftEntries(headerId: string, entries: EntryInput[]): Promise<ActionResult> {
  try {
    const { user, header, isModifyPath } = await requireEditableHeader(headerId);

    // Reject negative amounts up front (BE "at least zero or more"; applied to every amount/qty/rate field for consistency).
    for (const e of entries) {
      if (
        e.rbeMaterial < 0 || e.rbeService < 0 || e.beMaterial < 0 || e.beService < 0 ||
        e.rbeQty < 0 || e.rbeRate < 0 || e.beQty < 0 || e.beRate < 0
      ) {
        return { ok: false, error: "Amounts cannot be negative." };
      }
    }

    // RBE >= YTD Actual, aggregated per Budget Sub Head across the whole proposal
    // (multiple rows may share a Sub Head — see schema note on BudgetEntry).
    // Amount is computed per the row's Sub Head's Budget Head's Broad PNL Head
    // (R&M: Material+Service; Power/Chemical: Qty x Rate — see entry-amount.ts).
    // No fallback of any kind: blank/zero is exactly zero, never substituted
    // with Approved BE or any other figure (2026-08-24 decision).
    const subHeadIds = [...new Set(entries.map((e) => e.subHeadId).filter(Boolean))];
    const subHeads = await prisma.budgetSubHead.findMany({ where: { id: { in: subHeadIds } }, include: { budgetHead: true } });
    const subHeadById = new Map(subHeads.map((s) => [s.id, s]));
    const actualsBySubHeadCode = await getSubHeadActualsMap(header.costCentre.code, header.cycle);
    const rateUomMap = await getSubHeadRateUomMap(subHeadIds, header.cycle);

    // Chemical rows only: never trust a client-submitted Rate — always
    // re-resolve from the live admin master (see getSubHeadRateUomMap /
    // "Rate change impact" decision). This also fixes each entry's
    // rbeRate/beRate to the value actually used before persisting. Power
    // rows keep whatever Rate the client submitted (user-entered, just like
    // Qty) — reverted 2026-08-25 per the user's explicit instruction after
    // an earlier same-day pass had mistakenly treated Power's Rate as
    // admin-maintained too.
    for (const e of entries) {
      const subHead = subHeadById.get(e.subHeadId);
      if (subHead && isAdminRateHead(subHead.budgetHead.broadPnlHead)) {
        const live = rateUomMap[e.subHeadId];
        e.rbeRate = live?.rbeRate ?? 0;
        e.beRate = live?.beRate ?? 0;
      }
    }

    const rbeBySubHead = new Map<string, number>();
    for (const e of entries) {
      const subHead = subHeadById.get(e.subHeadId);
      const broadPnlHead: BroadPnlHeadCode = subHead?.budgetHead.broadPnlHead ?? "RM";
      const rbe = rbeAmount(e, broadPnlHead);
      rbeBySubHead.set(e.subHeadId, (rbeBySubHead.get(e.subHeadId) ?? 0) + rbe);
    }
    for (const [subHeadId, rbeSum] of rbeBySubHead) {
      if (rbeSum <= 0) continue; // a blank/untouched Sub Head isn't validated — nothing has been proposed for it yet
      const subHead = subHeadById.get(subHeadId);
      if (!subHead) continue;
      const ytd = actualsBySubHeadCode[subHead.code]?.ytdActual ?? 0;
      if (rbeSum < ytd) {
        return {
          ok: false,
          error: `Proposed RBE for "${subHead.name}" (₹${rbeSum.toFixed(2)}) is below YTD Actual — the actual expenditure already incurred (₹${ytd.toFixed(2)}) — it must be at least equal.`,
        };
      }
    }

    const existing = await prisma.budgetEntry.findMany({ where: { headerId } });
    const existingById = new Map(existing.map((e) => [e.id, e]));
    const keptIds = new Set(entries.filter((e) => e.id).map((e) => e.id as string));

    const toDelete = [...existingById.keys()].filter((id) => !keptIds.has(id));
    for (const id of toDelete) {
      if (isModifyPath) {
        const row = existingById.get(id)!;
        const subHead = await prisma.budgetSubHead.findUnique({ where: { id: row.subHeadId } });
        await prisma.auditLog.create({
          data: {
            entityType: "BudgetHeader",
            entityId: headerId,
            action: "DELETE_ENTRY",
            performedByUserId: user.id,
            diff: JSON.parse(JSON.stringify({ entryId: id, subHeadCode: subHead?.code })),
          },
        });
      }
    }
    if (toDelete.length > 0) {
      await prisma.budgetEntry.deleteMany({ where: { id: { in: toDelete } } });
    }

    for (const e of entries) {
      if (!e.subHeadId) continue; // skip incomplete rows silently on draft save
      const subHead = subHeadById.get(e.subHeadId);
      const broadPnlHead: BroadPnlHeadCode = subHead?.budgetHead.broadPnlHead ?? "RM";
      const qtyRate = isQtyRateHead(broadPnlHead);
      // Only the fields that apply to this row's Broad PNL Head are ever
      // stored — the other set is zeroed out, so a row can't carry stale
      // Material/Service left over from before its Sub Head was switched
      // to a Power/Chemical one (or vice versa).
      const data = {
        headerId,
        subHeadId: e.subHeadId,
        rbeMaterial: qtyRate ? 0 : numOrZero(e.rbeMaterial),
        rbeService: qtyRate ? 0 : numOrZero(e.rbeService),
        beMaterial: qtyRate ? 0 : numOrZero(e.beMaterial),
        beService: qtyRate ? 0 : numOrZero(e.beService),
        rbeQty: qtyRate ? numOrZero(e.rbeQty) : 0,
        rbeRate: qtyRate ? numOrZero(e.rbeRate) : 0, // already re-resolved server-side above for Power/Chemical
        beQty: qtyRate ? numOrZero(e.beQty) : 0,
        beRate: qtyRate ? numOrZero(e.beRate) : 0,
        workType: e.workType,
        recurringOneTime: e.recurringOneTime,
        referenceTakenFrom: e.referenceTakenFrom || null,
        justification: e.justification ?? "",
        remarks: e.remarks || null,
      };

      if (e.id && existingById.has(e.id)) {
        const before = existingById.get(e.id)!;
        if (isModifyPath) {
          const changes: Record<string, { old: unknown; new: unknown }> = {};
          for (const field of DIFFABLE_FIELDS) {
            const beforeVal = field.startsWith("rbe") || field.startsWith("be") ? Number(before[field]) : before[field];
            const afterVal = (data as Record<string, unknown>)[field];
            if (String(beforeVal ?? "") !== String(afterVal ?? "")) {
              changes[field] = { old: beforeVal, new: afterVal };
            }
          }
          if (Object.keys(changes).length > 0) {
            const subHead = subHeadById.get(e.subHeadId);
            await prisma.auditLog.create({
              data: {
                entityType: "BudgetHeader",
                entityId: headerId,
                action: "MODIFY_ENTRY",
                performedByUserId: user.id,
                diff: JSON.parse(JSON.stringify({ entryId: e.id, subHeadCode: subHead?.code, changes })),
              },
            });
          }
        }
        await prisma.budgetEntry.update({ where: { id: e.id }, data });
      } else {
        const created = await prisma.budgetEntry.create({ data });
        if (isModifyPath) {
          const subHead = subHeadById.get(e.subHeadId);
          await prisma.auditLog.create({
            data: {
              entityType: "BudgetHeader",
              entityId: headerId,
              action: "ADD_ENTRY",
              performedByUserId: user.id,
              diff: JSON.parse(JSON.stringify({ entryId: created.id, subHeadCode: subHead?.code })),
            },
          });
        }
      }
    }

    if (!isModifyPath) {
      await prisma.auditLog.create({
        data: { entityType: "BudgetHeader", entityId: header.id, action: "SAVE_DRAFT", performedByUserId: user.id },
      });
    }

    revalidatePath(`/budgets/${headerId}`);
    revalidatePath("/approvals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save draft" };
  }
}

export type AttachmentActionResult =
  | { ok: true; attachment: { id: string; fileName: string; uploadedAt: string } }
  | { ok: false; error: string };

export async function uploadAttachment(entryId: string, file: File): Promise<AttachmentActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const entry = await prisma.budgetEntry.findUnique({
      where: { id: entryId },
      include: { header: { include: { costCentre: true, cycle: true } } },
    });
    if (!entry) return { ok: false, error: "Entry not found" };

    const editable = await canEditHeader(user.access, entry.header);
    if (!editable) return { ok: false, error: "This budget is not currently editable by you." };

    if (file.size === 0) return { ok: false, error: "Empty file" };
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) return { ok: false, error: "File too large (30MB limit)" };
    if (!isAllowedAttachmentName(file.name)) {
      return { ok: false, error: `Unsupported file type. Allowed: ${ALLOWED_ATTACHMENT_EXTENSIONS.join(", ")}` };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storedPath = await saveAttachmentFile(entryId, file.name, buffer);

    const attachment = await prisma.budgetAttachment.create({
      data: { entryId, fileName: file.name, storedPath, uploadedByUserId: user.id },
    });

    revalidatePath(`/budgets/${entry.headerId}`);
    return { ok: true, attachment: { id: attachment.id, fileName: attachment.fileName, uploadedAt: attachment.uploadedAt.toISOString() } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}

export async function deleteAttachment(attachmentId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const attachment = await prisma.budgetAttachment.findUnique({
      where: { id: attachmentId },
      include: { entry: { include: { header: { include: { costCentre: true, cycle: true } } } } },
    });
    if (!attachment) return { ok: false, error: "Attachment not found" };

    const editable = await canEditHeader(user.access, attachment.entry.header);
    if (!editable) return { ok: false, error: "This budget is not currently editable by you." };

    await deleteAttachmentFile(attachment.storedPath);
    await prisma.budgetAttachment.delete({ where: { id: attachmentId } });

    revalidatePath(`/budgets/${attachment.entry.headerId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}

export async function submitBudget(headerId: string): Promise<ActionResult> {
  try {
    const { user, header } = await requireEditableHeader(headerId);
    if (header.status !== BudgetStatus.DRAFT) {
      return { ok: false, error: "Only the original Draft can be submitted — TS/Finance modifications are saved in place, not resubmitted." };
    }

    const entries = await prisma.budgetEntry.findMany({ where: { headerId } });
    if (entries.length === 0) {
      return { ok: false, error: "Add at least one line item before submitting." };
    }
    const missingJustification = entries.some((e) => !e.justification || e.justification.trim() === "");
    if (missingJustification) {
      return { ok: false, error: "Every line item needs a Justification before submitting." };
    }

    const nextStatus = submitForApproval(header.status);
    await prisma.budgetHeader.update({
      where: { id: headerId },
      data: { status: nextStatus, currentLevel: 1 },
    });

    await prisma.auditLog.create({
      data: {
        entityType: "BudgetHeader",
        entityId: header.id,
        action: "SUBMIT",
        performedByUserId: user.id,
        diff: { from: header.status, to: nextStatus },
      },
    });

    revalidatePath(`/budgets/${headerId}`);
    revalidatePath("/budgets/create");
    revalidatePath("/approvals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to submit" };
  }
}
