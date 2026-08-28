import path from "node:path";
import fs from "node:fs/promises";

// Local-disk storage per CLAUDE.md §3 (not SharePoint — see the 2026-08-12
// decision in §3). Stored outside `public/` so files can't be fetched
// without going through the access-controlled route at
// src/app/api/attachments/[id]/route.ts.
const ATTACHMENTS_ROOT = path.join(process.cwd(), ".data", "attachments");

// Bumped from 10MB to 30MB, and restricted to office-document types
// (2026-08-21 rework — supporting evidence for a budget line is expected to
// be a PDF, spreadsheet, or Office document, not arbitrary files).
export const MAX_ATTACHMENT_SIZE_BYTES = 30 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  ".pdf",
  ".xls",
  ".xlsx",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".csv",
] as const;

export function isAllowedAttachmentName(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return (ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext);
}

export function attachmentDirFor(entryId: string): string {
  return path.join(ATTACHMENTS_ROOT, entryId);
}

/** Resolves a storedPath (as saved on BudgetAttachment) back to an absolute path, refusing traversal outside the attachments root. */
export function resolveStoredPath(storedPath: string): string {
  const resolved = path.resolve(ATTACHMENTS_ROOT, storedPath);
  if (!resolved.startsWith(ATTACHMENTS_ROOT)) {
    throw new Error("Invalid attachment path");
  }
  return resolved;
}

export async function saveAttachmentFile(entryId: string, originalName: string, data: Buffer): Promise<string> {
  const dir = attachmentDirFor(entryId);
  await fs.mkdir(dir, { recursive: true });
  const safeName = originalName.replace(/[/\\]/g, "_");
  const storedName = `${Date.now()}-${safeName}`;
  await fs.writeFile(path.join(dir, storedName), data);
  // storedPath is relative to ATTACHMENTS_ROOT so it stays portable across machines.
  return path.join(entryId, storedName);
}

export async function deleteAttachmentFile(storedPath: string): Promise<void> {
  try {
    await fs.unlink(resolveStoredPath(storedPath));
  } catch {
    // Already gone — fine, DB row deletion is what actually matters.
  }
}
