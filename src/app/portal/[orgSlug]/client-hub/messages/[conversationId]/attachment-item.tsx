"use client";

import { useState } from "react";
import { getPortalAttachmentDownloadUrl } from "../actions";
import { Paperclip, Download, Loader2, ShieldAlert } from "lucide-react";

interface AttachmentItemProps {
  attachmentId: string;
  fileName: string;
  sizeBytes: number;
  scanStatus: string;
  orgSlug: string;
  isFromClient: boolean;
}

export function PortalAttachmentItem({
  attachmentId,
  fileName,
  sizeBytes,
  scanStatus,
  orgSlug,
  isFromClient,
}: AttachmentItemProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (scanStatus !== "clean" && scanStatus !== "CLEAN") return;
    setLoading(true);
    setError(null);
    try {
      const result = await getPortalAttachmentDownloadUrl(orgSlug, attachmentId);
      if (result.success && result.data?.signedUrl) {
        window.open(result.data.signedUrl, "_blank");
      } else {
        setError(result.error || "Failed to download");
      }
    } catch (err) {
      setError("Download failed");
    } finally {
      setLoading(false);
    }
  };

  const formattedSize = (sizeBytes / 1024).toFixed(1) + " KB";

  if (scanStatus === "PENDING" || scanStatus === "pending") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-xs text-slate-400 select-none">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300 flex-shrink-0" />
        <span className="font-medium truncate max-w-[180px]">{fileName}</span>
        <span className="text-[10px] text-slate-305 flex-shrink-0">(Scanning...)</span>
      </div>
    );
  }

  if (scanStatus === "BLOCKED" || scanStatus === "blocked") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-150 bg-red-50/50 px-3 py-2 text-xs text-red-500 select-none">
        <ShieldAlert className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
        <span className="font-medium truncate max-w-[180px]">{fileName}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 flex-shrink-0">(Blocked)</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleDownload}
        disabled={loading}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all text-left ${
          isFromClient
            ? "bg-blue-700/30 border-blue-500/30 text-white hover:bg-blue-700/40"
            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
        }`}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
        ) : (
          <Paperclip className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
        )}
        <span className="font-medium truncate max-w-[180px]">{fileName}</span>
        <span className="text-[10px] opacity-60 flex-shrink-0">({formattedSize})</span>
        <Download className="ml-auto h-3.5 w-3.5 opacity-55 hover:opacity-100 transition-opacity flex-shrink-0" />
      </button>
      {error && (
        <span className="text-[10px] text-red-500 font-medium px-1">
          {error}
        </span>
      )}
    </div>
  );
}
