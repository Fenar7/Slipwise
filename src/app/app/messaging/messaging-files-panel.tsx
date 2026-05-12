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
} from "lucide-react";
import type { MessagingFile, FileFilterCategory, FileSortOrder } from "./types";
import { MOCK_FILES } from "./mock-data";
import { RadioPill } from "./messaging-ui-primitives";

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

function fileIconConfig(category: MessagingFile["category"]) {
  switch (category) {
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

export function MessagingFilesPanel() {
  const [category, setCategory] = React.useState<FileFilterCategory>("all");
  const [sort, setSort] = React.useState<FileSortOrder>("newest");

  const filtered = React.useMemo(() => {
    let list =
      category === "all"
        ? [...MOCK_FILES]
        : MOCK_FILES.filter((f) => f.category === category);

    list.sort((a, b) => {
      if (sort === "newest") {
        return b.uploadedAt.localeCompare(a.uploadedAt);
      }
      if (sort === "oldest") {
        return a.uploadedAt.localeCompare(b.uploadedAt);
      }
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [category, sort]);

  return (
    <div className="flex flex-col h-full" data-testid="file-panel">
      {/* Sprint 1.1 regression compat */}
      <div className="sr-only" aria-hidden="true" data-testid="messaging-pane-files" />
      {/* Header */}
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
              {MOCK_FILES.length} shared files
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

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {filtered.length === 0 ? (
          <div
            className="py-8 text-center text-sm"
            style={{ color: "#79747E" }}
            data-testid="file-list-empty"
          >
            No files match this filter.
          </div>
        ) : (
          filtered.map((file) => {
            const { Icon, bg, color } = fileIconConfig(file.category);
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
                    {file.sizeLabel} · {file.uploadedBy} · {formatFileDate(file.uploadedAt)}
                  </p>
                  {file.conversationRef && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: "#E0E0E0", color: "#79747E", borderWidth: 1 }}>
                      <Link className="h-2.5 w-2.5" />
                      in {file.conversationRef}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                  aria-label="File options"
                  data-testid={`file-actions-${file.id}`}
                >
                  <MoreVertical className="h-4 w-4" style={{ color: "#79747E" }} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
