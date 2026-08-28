"use client";

import { useRef, useState, useTransition } from "react";
import { uploadAttachment, deleteAttachment } from "./actions";

export type AttachmentInfo = { id: string; fileName: string };

export function AttachmentUploader({
  entryId,
  initialAttachments,
  editable,
}: {
  entryId: string;
  initialAttachments: AttachmentInfo[];
  editable: boolean;
}) {
  const [attachments, setAttachments] = useState(initialAttachments);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUpload(file: File) {
    setError(null);
    startTransition(async () => {
      const result = await uploadAttachment(entryId, file);
      if (result.ok) {
        setAttachments((prev) => [...prev, { id: result.attachment.id, fileName: result.attachment.fileName }]);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        setError(result.error);
      }
    });
  }

  function handleDelete(attachmentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteAttachment(attachmentId);
      if (result.ok) {
        setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <label className="text-xs font-medium text-stone-500 block mb-1">Attachments</label>
      <ul className="space-y-1 mb-2">
        {attachments.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-xs">
            <a href={`/api/attachments/${a.id}`} className="text-brand-orange hover:text-brand-orange-dark underline">
              {a.fileName}
            </a>
            {editable && (
              <button
                type="button"
                onClick={() => handleDelete(a.id)}
                disabled={isPending}
                className="text-stone-400 hover:text-red-600"
              >
                ✕
              </button>
            )}
          </li>
        ))}
        {attachments.length === 0 && <li className="text-xs text-stone-400 italic">No attachments</li>}
      </ul>
      {editable && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xls,.xlsx,.doc,.docx,.ppt,.pptx,.csv"
            disabled={isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
            className="text-xs"
          />
          <p className="text-[11px] text-stone-400 mt-0.5">PDF, Excel, Word, PowerPoint, or CSV — max 30MB.</p>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </>
      )}
    </div>
  );
}
