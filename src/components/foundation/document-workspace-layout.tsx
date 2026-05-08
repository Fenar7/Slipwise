"use client";

import { useEffect, useState, type ReactNode, useCallback } from "react";
import { cn } from "@/lib/utils";
import { FileDown } from "lucide-react";
import { useWorkspaceTopBar } from "@/components/layout/workspace-topbar-context";

export type WorkspaceAction = {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant: "primary" | "secondary" | "subtle";
};

export type WorkspaceSectionMeta = {
  id: string;
  label: string;
};

export type WorkspaceExportDialog =
  | { state: "pending"; format: "pdf" | "png"; onClose: () => void }
  | { state: "success"; format: "pdf" | "png"; onClose: () => void; onRetry: () => void }
  | { state: "error"; format: "pdf" | "png"; onClose: () => void; onRetry: () => void; errorMessage: string };

type DocumentWorkspaceLayoutProps = {
  actions: WorkspaceAction[];
  errorMessage?: string;
  sections: WorkspaceSectionMeta[];
  builderContent: ReactNode;
  previewContent: ReactNode;
  exportDialog?: WorkspaceExportDialog;
  documentEditorContent?: ReactNode;
  headerContent?: ReactNode;
};

type ViewMode = "form" | "document";
type MobileTab = "build" | "preview" | "export" | "document";

const formMobileTabs = [
  { id: "build", label: "Build" },
  { id: "preview", label: "Preview" },
  { id: "export", label: "Export" },
] as const;

const documentMobileTabs = [
  { id: "document", label: "Document" },
  { id: "export", label: "Export" },
] as const;

export function DocumentWorkspaceLayout({
  actions,
  errorMessage,
  sections,
  builderContent,
  previewContent,
  exportDialog,
  documentEditorContent,
  headerContent,
}: DocumentWorkspaceLayoutProps) {
  const [mobileTab, setMobileTab] = useState<MobileTab>("build");
  const [isDesktopWorkspace, setIsDesktopWorkspace] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("form");
  const { registerActions, registerHeaderContent, registerViewToggle, clear } = useWorkspaceTopBar();

  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setMobileTab(mode === "document" ? "document" : "build");
  }, []);

  // Register actions in the top bar
  useEffect(() => {
    registerActions(actions);
    return () => clear();
  }, [actions, registerActions, clear]);

  // Register header content (tags) in the top bar
  useEffect(() => {
    registerHeaderContent(headerContent);
  }, [headerContent, registerHeaderContent]);

  // Register view toggle in the top bar
  useEffect(() => {
    if (documentEditorContent) {
      registerViewToggle({ mode: viewMode, onChange: handleSetViewMode });
    }
  }, [viewMode, documentEditorContent, registerViewToggle, handleSetViewMode]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(min-width: 1280px)");
    const syncMatches = () => setIsDesktopWorkspace(mediaQuery.matches);
    syncMatches();
    mediaQuery.addEventListener("change", syncMatches);
    return () => mediaQuery.removeEventListener("change", syncMatches);
  }, []);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-white">
      {/* Mobile tabs */}
      {!isDesktopWorkspace ? (
        <div className="border-b border-[var(--border-soft)] bg-white px-4 py-2">
          {documentEditorContent ? (
            <div className="mb-2 flex gap-1">
              <button
                type="button"
                onClick={() => handleSetViewMode("form")}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  viewMode === "form" ? "bg-[var(--brand-cta)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]",
                )}
              >
                Form
              </button>
              <button
                type="button"
                onClick={() => handleSetViewMode("document")}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  viewMode === "document" ? "bg-[var(--brand-cta)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]",
                )}
              >
                Document
              </button>
            </div>
          ) : null}
          <div className="flex gap-2">
            {(viewMode === "document" && documentEditorContent ? documentMobileTabs : formMobileTabs).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMobileTab(tab.id)}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  mobileTab === tab.id ? "bg-[var(--brand-cta)] text-white" : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden">
        {viewMode === "form" ? (
          <>
            {/* Left: Form panel */}
            <div
              className={cn(
                "flex w-full flex-col overflow-y-auto border-r border-[var(--border-soft)] bg-white xl:w-[520px] xl:shrink-0",
                !isDesktopWorkspace && mobileTab !== "build" && "hidden xl:flex",
              )}
            >
              <div className="p-6">
                {errorMessage ? (
                  <div className="mb-4 text-sm text-red-600">{errorMessage}</div>
                ) : null}

                {/* Section quick nav */}
                <div className="mb-6 flex flex-wrap gap-x-4 gap-y-2">
                  {sections.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--brand-cta)] transition-colors"
                    >
                      {section.label}
                    </a>
                  ))}
                </div>
                {builderContent}
              </div>
            </div>

            {/* Right: Preview panel */}
            <div
              className={cn(
                "flex flex-1 flex-col overflow-hidden bg-[var(--surface)]",
                !isDesktopWorkspace && mobileTab !== "preview" && "hidden xl:flex",
              )}
            >
              <div className="flex-1 overflow-hidden p-6">
                {previewContent}
              </div>
            </div>
          </>
        ) : null}

        {/* Document editor */}
        {documentEditorContent && viewMode === "document" && (!isDesktopWorkspace ? mobileTab === "document" : true) ? (
          <div className="flex-1 overflow-y-auto p-6">{documentEditorContent}</div>
        ) : null}
      </div>

      {/* Export dialog */}
      {exportDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-export-dialog-title"
            className="relative w-full max-w-sm overflow-hidden rounded-lg bg-white p-6 shadow-xl"
          >
            <button
              type="button"
              onClick={() => exportDialog.onClose()}
              className="absolute right-4 top-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              aria-label="Close export dialog"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-[var(--brand-cta)]">
                <FileDown className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Export {exportDialog.format.toUpperCase()}
              </span>
            </div>

            <h3 id="workspace-export-dialog-title" className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
              {exportDialog.state === "pending" ? "Preparing your download" : exportDialog.state === "success" ? "Download ready" : "Export failed"}
            </h3>

            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {exportDialog.state === "pending"
                ? "We're preparing your file. This will only take a moment."
                : exportDialog.state === "success"
                  ? "Your download should start automatically."
                  : exportDialog.errorMessage}
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              {exportDialog.state !== "pending" ? (
                <button
                  type="button"
                  onClick={exportDialog.onRetry}
                  className="inline-flex flex-1 items-center justify-center rounded-md bg-[var(--brand-cta)] px-4 py-2 text-sm font-medium text-white hover:bg-[#B91C1C]"
                >
                  {exportDialog.state === "success" ? "Download Again" : "Try Again"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex flex-1 items-center justify-center rounded-md bg-[var(--brand-cta)] px-4 py-2 text-sm font-medium text-white opacity-60"
                >
                  Preparing...
                </button>
              )}
              <button
                type="button"
                onClick={() => exportDialog.onClose()}
                className="inline-flex flex-1 items-center justify-center rounded-md bg-[var(--surface-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}