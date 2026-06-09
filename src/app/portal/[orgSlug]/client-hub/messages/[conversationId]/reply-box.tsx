"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitPortalConversationReply, uploadPortalAttachment } from "../actions";
import { Send, Loader2, Paperclip, X } from "lucide-react";

interface PortalMessageReplyBoxProps {
  conversationId: string;
  orgSlug: string;
}

export function PortalMessageReplyBox({
  conversationId,
  orgSlug,
}: PortalMessageReplyBoxProps) {
  const [message, setMessage] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<Array<{
    storageRef: string;
    uploadToken: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleUpload = async (files: File[]) => {
    setIsUploading(true);
    setError(null);
    try {
      const results = [];
      for (const file of files) {
        if (file.size > 50 * 1024 * 1024) {
          setError(`File ${file.name} exceeds the 50 MB limit.`);
          setIsUploading(false);
          return;
        }
        const formData = new FormData();
        formData.append("file", file);
        const result = await uploadPortalAttachment(orgSlug, formData);
        if (result.success && result.data) {
          results.push(result.data);
        } else {
          setError(result.error);
          setIsUploading(false);
          return;
        }
      }
      setUploadedFiles((prev) => [...prev, ...results]);
    } catch (err: any) {
      setError("File upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if ((!trimmed && uploadedFiles.length === 0) || isSubmitting || isUploading) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await submitPortalConversationReply(
        orgSlug,
        conversationId,
        trimmed,
        uploadedFiles
      );

      if (result.success) {
        setMessage("");
        setUploadedFiles([]);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("Failed to send message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message here..."
          className="w-full min-h-[80px] max-h-[200px] resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
          disabled={isSubmitting || isUploading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />

        {/* Uploaded File Badges */}
        {uploadedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2">
            {uploadedFiles.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-100"
              >
                <Paperclip className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <span className="truncate max-w-[150px]">{file.fileName}</span>
                <span className="text-[10px] text-slate-400">
                  ({(file.sizeBytes / 1024).toFixed(1)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => setUploadedFiles((prev) => prev.filter((_, i) => i !== idx))}
                  className="rounded-full p-0.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-xs font-medium text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label
              className={`flex items-center gap-1.5 cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 ${
                isUploading || isSubmitting ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <Paperclip className="h-3.5 w-3.5 text-slate-400" />
              <span>Attach File</span>
              <input
                type="file"
                multiple
                className="hidden"
                disabled={isUploading || isSubmitting}
                onChange={async (e) => {
                  if (e.target.files) {
                    const files = Array.from(e.target.files);
                    if (files.length > 0) {
                      await handleUpload(files);
                    }
                  }
                }}
              />
            </label>
            {isUploading && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Uploading...</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={(!message.trim() && uploadedFiles.length === 0) || isSubmitting || isUploading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span>Send</span>
          </button>
        </div>
      </form>
    </div>
  );
}
