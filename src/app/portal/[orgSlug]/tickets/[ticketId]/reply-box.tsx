"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { submitPortalTicketReply } from "../actions";
import { uploadPortalAttachmentAction } from "../attachment-actions";
import { Paperclip, Send, X, FileIcon, Loader2 } from "lucide-react";

interface PortalReplyBoxProps {
  ticketId: string;
  orgSlug: string;
}

interface Attachment {
  id: string;
  name: string;
}

export function PortalReplyBox({ ticketId, orgSlug }: PortalReplyBoxProps) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      // In a real implementation, we would upload to storage (Supabase/S3) here.
      // For this sprint, we mock the storage key and register the attachment in the DB.
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          setError("File too large (max 5MB)");
          continue;
        }

        const mockStorageKey = `portal/attachments/${Date.now()}_${file.name}`;
        
        const result = await uploadPortalAttachmentAction(
          file.name,
          file.size,
          file.type,
          mockStorageKey,
          orgSlug
        );

        if (result.success && result.id) {
          setAttachments((prev) => [...prev, { id: result.id!, name: file.name }]);
        } else {
          setError(result.error ?? "Failed to upload file");
        }
      }
    } catch (err) {
      setError("Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await submitPortalTicketReply(ticketId, {
        message: message.trim(),
        attachmentIds: attachments.map((a) => a.id),
      }, orgSlug);

      if (result.success) {
        setMessage("");
        setAttachments([]);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("Failed to send message");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your reply..."
          className="w-full min-h-[120px] resize-none rounded-lg border-slate-200 bg-slate-50 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          disabled={isSubmitting}
        />

        {/* Attachment Preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                <FileIcon className="h-3 w-3 text-slate-400" />
                <span className="max-w-[120px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(file.id)}
                  className="ml-1 rounded-full p-0.5 hover:bg-slate-200 text-slate-400"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-xs font-medium text-red-600">{error}</p>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            disabled={isSubmitting || isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
            <span>Attach files</span>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              multiple
            />
          </button>

          <button
            type="submit"
            disabled={!message.trim() || isSubmitting || isUploading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span>Send Reply</span>
          </button>
        </div>
      </form>
    </div>
  );
}
