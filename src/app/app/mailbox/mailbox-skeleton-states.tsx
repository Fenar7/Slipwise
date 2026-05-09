"use client";

/**
 * Sprint 1.6 — Skeleton loading states for all major mailbox surfaces.
 *
 * Skeletons match the actual layout hierarchy so there is no jarring shift
 * when real content loads. Each skeleton is independently usable.
 */

import { cn } from "@/lib/utils";

// ─── Shared pulse primitive ───────────────────────────────────────────────────

function Bone({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[#E2E5EA]", className)}
      style={style}
      aria-hidden="true"
    />
  );
}

// ─── Thread list skeleton ─────────────────────────────────────────────────────

function ThreadRowSkeleton() {
  return (
    <div className="flex items-start gap-3 border-b px-4 py-3" style={{ borderColor: "#E2E5EA" }}>
      {/* Avatar */}
      <Bone className="mt-0.5 h-8 w-8 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        {/* Row 1: sender + timestamp */}
        <div className="flex items-center gap-2">
          <Bone className="h-3 w-24" />
          <Bone className="ml-auto h-3 w-12" />
        </div>
        {/* Row 2: subject */}
        <Bone className="h-3 w-4/5" />
        {/* Row 3: snippet */}
        <Bone className="h-3 w-full" />
      </div>
    </div>
  );
}

export function ThreadListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      className="flex h-full flex-col overflow-hidden border-r bg-white"
      style={{ borderColor: "#E2E5EA" }}
      aria-label="Loading threads…"
      aria-busy="true"
      data-testid="skeleton-thread-list"
    >
      {/* List header bone */}
      <div
        className="flex h-10 shrink-0 items-center border-b px-4"
        style={{ borderColor: "#E2E5EA" }}
      >
        <Bone className="h-3 w-20" />
        <Bone className="ml-auto h-3 w-10" />
      </div>
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <ThreadRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// ─── Reading pane skeleton ────────────────────────────────────────────────────

export function ReadingPaneSkeleton() {
  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: "#F7F8FB" }}
      aria-label="Loading thread…"
      aria-busy="true"
      data-testid="skeleton-reading-pane"
    >
      {/* Thread header */}
      <div
        className="shrink-0 border-b bg-white px-6 py-4"
        style={{ borderColor: "#E2E5EA" }}
      >
        <Bone className="h-5 w-2/3" />
        <div className="mt-2 flex items-center gap-3">
          <Bone className="h-3 w-32" />
          <Bone className="h-3 w-20" />
          <Bone className="ml-auto h-6 w-16 rounded-lg" />
          <Bone className="h-6 w-16 rounded-lg" />
        </div>
      </div>

      {/* Message stack */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Collapsed older message */}
        <div className="rounded-xl border bg-white px-4 py-3" style={{ borderColor: "#E2E5EA" }}>
          <div className="flex items-center gap-3">
            <Bone className="h-7 w-7 rounded-full" />
            <Bone className="h-3 w-28" />
            <Bone className="ml-auto h-3 w-16" />
          </div>
        </div>

        {/* Expanded latest message */}
        <div className="rounded-xl border bg-white px-5 py-4 space-y-3" style={{ borderColor: "#E2E5EA" }}>
          <div className="flex items-center gap-3">
            <Bone className="h-8 w-8 rounded-full" />
            <div className="space-y-1.5">
              <Bone className="h-3 w-32" />
              <Bone className="h-2.5 w-48" />
            </div>
            <Bone className="ml-auto h-3 w-16" />
          </div>
          <div className="space-y-2 pt-2">
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-5/6" />
            <Bone className="h-3 w-4/5" />
            <Bone className="h-3 w-3/4" />
          </div>
        </div>
      </div>

      {/* Reply bar */}
      <div
        className="shrink-0 border-t bg-white px-6 py-3"
        style={{ borderColor: "#E2E5EA" }}
      >
        <Bone className="h-9 w-full rounded-lg" />
      </div>
    </div>
  );
}

// ─── Left rail skeleton ───────────────────────────────────────────────────────

export function LeftRailSkeleton() {
  return (
    <aside
      className="flex h-full w-56 shrink-0 flex-col overflow-hidden border-r bg-white"
      style={{ borderColor: "#E2E5EA" }}
      aria-label="Loading mailbox navigation…"
      aria-busy="true"
      data-testid="skeleton-left-rail"
    >
      {/* Header */}
      <div
        className="flex h-12 shrink-0 items-center justify-between border-b px-3"
        style={{ borderColor: "#E2E5EA" }}
      >
        <Bone className="h-4 w-16" />
        <Bone className="h-6 w-6 rounded-md" />
      </div>

      <div className="flex-1 overflow-hidden px-2 py-2.5 space-y-1">
        {/* Section label */}
        <Bone className="mx-2.5 mb-2 h-2.5 w-10" />
        {/* Smart view items */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5">
            <Bone className="h-3.5 w-3.5 rounded" />
            <Bone className="h-3 flex-1" />
          </div>
        ))}

        <div className="my-2 border-t" style={{ borderColor: "#E2E5EA" }} />

        {/* Account section label */}
        <Bone className="mx-2.5 mb-2 h-2.5 w-14" />
        {/* Account groups */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5">
            <Bone className="h-5 w-5 rounded-full" />
            <Bone className="h-3 flex-1" />
          </div>
        ))}
      </div>
    </aside>
  );
}

// ─── Shell skeleton (full workspace) ─────────────────────────────────────────

export function MailboxShellSkeleton() {
  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ background: "#F7F8FB" }}
      aria-label="Loading mailbox…"
      aria-busy="true"
      data-testid="skeleton-mailbox-shell"
    >
      <LeftRailSkeleton />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Command bar */}
        <div
          className="flex h-12 shrink-0 items-center gap-3 border-b bg-white px-4"
          style={{ borderColor: "#E2E5EA" }}
        >
          <Bone className="h-4 w-24" />
          <Bone className="h-7 flex-1 max-w-xs rounded-lg" />
          <Bone className="ml-auto h-7 w-24 rounded-lg" />
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="w-full shrink-0 overflow-hidden md:w-80 lg:w-96">
            <ThreadListSkeleton />
          </div>
          <div className="hidden min-w-0 flex-1 overflow-hidden md:flex md:flex-col">
            <ReadingPaneSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings page skeleton ───────────────────────────────────────────────────

export function SettingsPageSkeleton() {
  return (
    <div
      className="mx-auto max-w-3xl px-6 py-8"
      aria-label="Loading settings…"
      aria-busy="true"
      data-testid="skeleton-settings-page"
    >
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Bone className="h-2.5 w-20" />
          <Bone className="h-6 w-48" />
          <Bone className="h-3 w-80" />
        </div>
        <Bone className="h-9 w-36 rounded-lg" />
      </div>

      {/* Admin notice */}
      <Bone className="mb-6 h-10 w-full rounded-lg" />

      {/* Connection cards */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border bg-white p-5"
            style={{ borderColor: "#E2E5EA" }}
          >
            <div className="flex items-start gap-3">
              <Bone className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Bone className="h-4 w-32" />
                <Bone className="h-3 w-48" />
              </div>
              <Bone className="h-7 w-7 rounded-lg" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3" style={{ borderColor: "#F1F3F7" }}>
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="space-y-1.5">
                  <Bone className="h-2.5 w-12" />
                  <Bone className="h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Linked context panel skeleton ───────────────────────────────────────────

export function LinkedContextSkeleton() {
  return (
    <div
      className="flex h-full w-72 shrink-0 flex-col overflow-hidden border-l bg-white"
      style={{ borderColor: "#E2E5EA" }}
      aria-label="Loading context…"
      aria-busy="true"
      data-testid="skeleton-linked-context"
    >
      {/* Header */}
      <div
        className="flex h-11 shrink-0 items-center justify-between border-b px-4"
        style={{ borderColor: "#E2E5EA" }}
      >
        <Bone className="h-3.5 w-20" />
        <Bone className="h-6 w-6 rounded-md" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Status + assignee block */}
        <div className="space-y-2">
          <Bone className="h-2.5 w-12" />
          <Bone className="h-7 w-full rounded-lg" />
        </div>
        <div className="space-y-2">
          <Bone className="h-2.5 w-16" />
          <Bone className="h-7 w-full rounded-lg" />
        </div>

        <div className="border-t" style={{ borderColor: "#E2E5EA" }} />

        {/* Linked records */}
        <div className="space-y-2">
          <Bone className="h-2.5 w-20" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border p-3 space-y-1.5"
              style={{ borderColor: "#E2E5EA" }}
            >
              <div className="flex items-center gap-2">
                <Bone className="h-5 w-5 rounded" />
                <Bone className="h-3 flex-1" />
              </div>
              <Bone className="h-2.5 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
