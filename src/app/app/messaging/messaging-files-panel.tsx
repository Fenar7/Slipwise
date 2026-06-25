"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  FileText,
  Image,
  FileSpreadsheet,
  Paperclip,
  Link,
  MoreVertical,
  Download,
  Eye,
  Lock,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type { FileFilterCategory, FileSortOrder } from "./types";
import { RadioPill } from "./messaging-ui-primitives";
import { useAttachmentFiles, type AttachmentFileSummary } from "./lib/use-attachment-files";

const CATEGORY_OPTIONS: { value: FileFilterCategory; label: string }[] = [
  { value: "all", label: "All" },
  { value: "document", label: "Documents" },
  { value: "image", label: "Images" },
  { value: "spreadsheet", label: "Spreadsheets" },
  { value: "other", label: "Other" },
];

const SORT_OPTIONS: { value: FileSortOrder; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name" },
];

function fileIconConfig(mimeCategory: AttachmentFileSummary["mimeCategory"]) {
  switch (mimeCategory) {
    case "document":
      return { Icon: FileText, bg: "bg-blue-50", color: "text-blue-600" };
    case "image":
      return { Icon: Image, bg: "bg-green-50", color: "text-green-600" };
    case "spreadsheet":
      return { Icon: FileSpreadsheet, bg: "bg-amber-50", color: "text-amber-600" };
    case "other":
    default:
      return { Icon: Paperclip, bg: "bg-gray-100", color: "text-gray-600" };
  }
}

function formatFileDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export interface MessagingFilesPanelProps {
  conversationId?: string | null;
}

export function MessagingFilesPanel({ conversationId }: MessagingFilesPanelProps) {
  const [category, setCategory] = React.useState<FileFilterCategory>("all");
  const [sort, setSort] = React.useState<FileSortOrder>("newest");
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const [openError, setOpenError] = React.useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = React.useState<FilePreviewAttachment | null>(null);

  const { files, loading, error, fetchFiles, fetchDownloadUrl, clearError } = useAttachmentFiles();

  React.useEffect(() => {
    if (conversationId) {
      fetchFiles(conversationId, { category: category === "all" ? undefined : category, sort });
    }
  }, [conversationId, category, sort]);

  // Client-side filtering/sorting for real-time responsiveness after data is cached
  const displayFiles = React.useMemo(() => {
    let list = [...files];
    if (category !== "all") {
      list = list.filter((f) => f.mimeCategory === category);
    }
    list.sort((a, b) => {
      if (sort === "newest") return b.uploadedAt.localeCompare(a.uploadedAt);
      if (sort === "oldest") return a.uploadedAt.localeCompare(b.uploadedAt);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [files, category, sort]);

  function triggerAnchorDownload(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleDownload(attachment: AttachmentFileSummary, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setDownloading(attachment.id);
    setOpenError(null);
    try {
      const result = await fetchDownloadUrl(attachment.id);
      if (!result) {
        setOpenError("Access denied or file unavailable.");
        return;
      }
      triggerAnchorDownload(result.signedUrl, attachment.name);
    } catch {
      setOpenError("Failed to download file.");
    } finally {
      setDownloading(null);
    }
  }

  async function handleRowClick(attachment: AttachmentFileSummary) {
    if (attachment.scanStatus === "BLOCKED" || attachment.scanStatus === "PENDING") return;
    setDownloading(attachment.id);
    setOpenError(null);
    try {
      const result = await fetchDownloadUrl(attachment.id);
      if (!result) {
        setOpenError("Access denied or file unavailable.");
        return;
      }
      setPreviewAttachment({
        name: attachment.name,
        mimeType: attachment.mimeType ?? "application/octet-stream",
        sizeBytes: attachment.sizeBytes,
        signedUrl: result.signedUrl,
        attachmentId: attachment.id,
      });
    } catch {
      setOpenError("Failed to open file preview.");
    } finally {
      setDownloading(null);
    }
  }


  return (
    <div className="flex flex-col h-full" data-testid="file-panel">
      <div className="sr-only" aria-hidden="true" data-testid="messaging-pane-files" />
      <div
        className="flex flex-col gap-3 border-b px-6 py-4"
        style={{ borderColor: "#E0E0E0" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold" style={{ color: "#1C1B1F" }}>
              Files
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
              {files.length} shared files
            </p>
          </div>
          <RadioPill
            name="file-sort"
            options={SORT_OPTIONS}
            value={sort}
            onChange={(v) => setSort(v as FileSortOrder)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCategory(opt.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]",
                category === opt.value
                  ? "border-[#DC2626] bg-red-50 text-[#DC2626]"
                  : "border-[#E0E0E0] bg-white text-[#49454F] hover:bg-gray-50"
              )}
              data-testid={`file-filter-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {loading && (
          <div className="flex items-center gap-3 py-8 justify-center" data-testid="file-list-loading">
            <Loader2 className="h-4 w-4 animate-spin text-[#DC2626]" />
            <span className="text-sm" style={{ color: "#79747E" }}>Loading files…</span>
          </div>
        )}

        {error && (
          <div className="py-4 px-3 rounded-lg bg-red-50 text-xs text-red-700" data-testid="file-list-error">
            {error}
            <button onClick={clearError} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {openError && (
          <div className="py-2 px-3 rounded-lg bg-amber-50 text-xs text-amber-700" data-testid="file-open-error">
            {openError}
            <button onClick={() => setOpenError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {!loading && !error && displayFiles.length === 0 ? (
          conversationId ? (
            <div className="py-8 text-center text-sm" style={{ color: "#79747E" }} data-testid="file-list-empty">
              No files shared in this conversation yet.
            </div>
          ) : (
            <div className="py-8 text-center text-sm" style={{ color: "#79747E" }} data-testid="file-list-empty">
              Select a conversation to view shared files.
            </div>
          )
        ) : (
          displayFiles.map((file) => {
            const { Icon, bg, color } = fileIconConfig(file.mimeCategory);
            const isBlocked = file.scanStatus === "BLOCKED";
            const isPending = file.scanStatus === "PENDING";
            return (
              <div
                key={file.id}
                className="flex items-center gap-3 rounded-xl border p-3"
                aria-label={file.name}
                style={{ borderColor: "#F0F0F0" }}
                data-testid={`file-row-${file.id}`}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    bg
                  )}
                >
                  <Icon className={cn("h-4 w-4", color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold truncate"
                    style={{ color: "#1C1B1F" }}
                  >
                    {file.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
                    {file.sizeLabel} · {formatFileDate(file.uploadedAt)}
                  </p>
                  {isPending && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      Scanning…
                    </span>
                  )}
                  {isBlocked && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                      <Lock className="h-2.5 w-2.5" />
                      Blocked
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!isBlocked && (
                    <button
                      type="button"
                      disabled={downloading === file.id}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                      aria-label={`Download ${file.name}`}
                      data-testid={`file-download-${file.id}`}
                      onClick={(e) => handleDownload(file, e)}
                    >
                      {downloading === file.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#79747E]" />
                      ) : (
                        <Download className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                    aria-label="File options"
                    data-testid={`file-actions-${file.id}`}
                  >
                    <MoreVertical className="h-4 w-4" style={{ color: "#79747E" }} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      {previewAttachment && (
        <FilePreviewModal isOpen={!!previewAttachment} onClose={() => setPreviewAttachment(null)} attachment={previewAttachment} onDownload={(url) => triggerAnchorDownload(url, previewAttachment.name)} />
      )}
    </div>
  );
}
