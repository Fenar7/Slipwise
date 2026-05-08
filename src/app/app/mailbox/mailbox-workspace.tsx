"use client";

import { useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MailboxLeftRail } from "./mailbox-left-rail";
import { MailboxCommandBar } from "./mailbox-command-bar";
import { MailboxThreadList, MOCK_THREADS } from "./mailbox-thread-list";
import { MailboxReadingPaneEmpty } from "./mailbox-reading-pane-empty";
import { MailboxReadingPane } from "./mailbox-reading-pane";
import { FloatingComposer } from "./mailbox-floating-composer";
import { ExpandedComposer } from "./mailbox-expanded-composer";
import { MailboxContextPanel, MailboxContextPanelEmpty } from "./mailbox-context-panel";
import { FilterChipsBar } from "./mailbox-filter-chips";
import { NoSearchResultsEmpty, NoMailboxesEmpty, SmartViewEmpty } from "./mailbox-empty-states";
import { ReconnectBanner } from "./mailbox-restricted-states";
import { MailboxRailDrawer, MobileTopBar, TabletTopBar, MobileTabBar } from "./mailbox-mobile-nav";
import {
  GLOBAL_SMART_VIEWS,
  MOCK_CONNECTIONS,
  MOCK_THREAD_DETAILS,
  MOCK_LINKED_CONTEXT,
} from "./mock-data";
import type {
  MailboxComposerState,
  ComposeMode,
  MailboxConnection,
  ActiveFilterState,
  ActiveFilter,
  LinkedContextState,
  MailboxResponsivePanel,
} from "./types";

export function resolveViewLabel(pathname: string): string {
  const smartView = GLOBAL_SMART_VIEWS.find(
    (v) =>
      v.href === "/app/mailbox"
        ? pathname === v.href
        : pathname === v.href || pathname.startsWith(`${v.href}/`)
  );
  if (smartView) return smartView.label;

  for (const conn of MOCK_CONNECTIONS) {
    if (pathname.includes(`/${conn.slug}/`)) {
      const folder = pathname.split("/").pop() ?? "Inbox";
      return `${conn.displayName} · ${folder.charAt(0).toUpperCase()}${folder.slice(1)}`;
    }
  }

  return "All Inboxes";
}

function makeComposerState(
  mode: ComposeMode,
  threadId: string | null,
  replyToMessageId: string | null,
  subject: string,
  to: string[],
  fromConnection: MailboxConnection,
  layout: MailboxComposerState["layout"] = "floating"
): MailboxComposerState {
  return {
    isOpen: true,
    layout,
    mode,
    fromConnectionId: fromConnection.id,
    fromLabel: fromConnection.displayName,
    fromEmail: fromConnection.emailAddress,
    to,
    cc: [],
    bcc: [],
    showCc: false,
    showBcc: false,
    subject,
    bodyHtml: "",
    attachments: [],
    sendState: "idle",
    threadId,
    replyToMessageId,
  };
}

function resolveActiveConnection(pathname: string): MailboxConnection | null {
  return (
    MOCK_CONNECTIONS.find(
      (conn) =>
        pathname === `/app/mailbox/${conn.slug}` ||
        pathname.startsWith(`/app/mailbox/${conn.slug}/`)
    ) ?? null
  );
}

function resolveVisibleThreads(pathname: string, filterState: ActiveFilterState) {
  const activeConnection = resolveActiveConnection(pathname);
  const smartView = GLOBAL_SMART_VIEWS.find(
    (view) => view.href !== "/app/mailbox" && (pathname === view.href || pathname.startsWith(`${view.href}/`))
  );

  let threads = MOCK_THREADS;

  // Smart view filtering
  if (smartView?.id === "unread") threads = threads.filter((t) => t.isUnread);
  else if (smartView?.id === "assigned-to-me") threads = threads.filter((t) => t.assignee === "You");
  else if (smartView?.id === "unassigned") threads = threads.filter((t) => !t.assignee);
  else if (smartView?.id === "flagged") threads = threads.filter((t) => t.isFlagged);
  else if (smartView?.id === "waiting") threads = threads.filter((t) => t.status === "pending");
  else if (smartView?.id === "linked") {
    threads = threads.filter((t) => (MOCK_LINKED_CONTEXT[t.id]?.links.length ?? 0) > 0);
  } else if (smartView?.id === "unlinked") {
    threads = threads.filter(
      (t) =>
        (MOCK_LINKED_CONTEXT[t.id]?.links.length ?? 0) === 0 &&
        (MOCK_LINKED_CONTEXT[t.id]?.suggestions.length ?? 0) === 0
    );
  } else if (activeConnection) {
    const folder = pathname.split("/").pop() ?? "inbox";
    const connectionThreads = threads.filter((t) => t.mailboxConnectionId === activeConnection.id);
    if (folder === "sent") {
      threads = connectionThreads.filter((t) => {
        const detail = MOCK_THREAD_DETAILS[t.id];
        return detail?.messages[detail.messages.length - 1]?.direction === "outbound";
      });
    } else if (folder === "drafts" || folder === "spam") {
      threads = [];
    } else if (folder === "archive") {
      threads = connectionThreads.filter((t) => t.status === "closed");
    } else {
      threads = connectionThreads.filter((t) => t.status !== "closed");
    }
  }

  // Active filter chips
  for (const filter of filterState.filters) {
    if (filter.field === "unread" && filter.value === "true") {
      threads = threads.filter((t) => t.isUnread);
    } else if (filter.field === "flagged" && filter.value === "true") {
      threads = threads.filter((t) => t.isFlagged);
    } else if (filter.field === "assignee" && filter.value === "me") {
      threads = threads.filter((t) => t.assignee === "You");
    } else if (filter.field === "assignee" && filter.value === "none") {
      threads = threads.filter((t) => !t.assignee);
    } else if (filter.field === "status") {
      threads = threads.filter((t) => t.status === filter.value);
    } else if (filter.field === "linked" && filter.value === "true") {
      threads = threads.filter((t) => (MOCK_LINKED_CONTEXT[t.id]?.links.length ?? 0) > 0);
    } else if (filter.field === "linked" && filter.value === "false") {
      threads = threads.filter(
        (t) =>
          (MOCK_LINKED_CONTEXT[t.id]?.links.length ?? 0) === 0 &&
          (MOCK_LINKED_CONTEXT[t.id]?.suggestions.length ?? 0) === 0
      );
    }
  }

  // Search query
  if (filterState.searchQuery) {
    const q = filterState.searchQuery.toLowerCase();
    threads = threads.filter(
      (t) =>
        t.subject.toLowerCase().includes(q) ||
        t.from.toLowerCase().includes(q) ||
        t.snippet.toLowerCase().includes(q)
    );
  }

  return threads;
}

/** Resolve the reconnect-required connection for the current view, if any */
function resolveReconnectConnection(pathname: string): MailboxConnection | null {
  const activeConnection = resolveActiveConnection(pathname);
  if (activeConnection?.status === "reconnect_required") return activeConnection;
  return null;
}

/** Resolve smart view description for empty state */
function resolveSmartViewDescription(pathname: string): { label: string; description: string } | null {
  const smartView = GLOBAL_SMART_VIEWS.find(
    (v) => v.href !== "/app/mailbox" && (pathname === v.href || pathname.startsWith(`${v.href}/`))
  );
  if (!smartView) return null;
  const descriptions: Record<string, string> = {
    unread: "All caught up — no unread threads right now.",
    "assigned-to-me": "No threads are currently assigned to you.",
    unassigned: "All threads have been assigned.",
    flagged: "No threads are flagged for follow-up.",
    waiting: "No threads are in a pending or waiting state.",
    linked: "No threads are linked to a Slipwise record yet.",
    unlinked: "All threads have been linked to records.",
  };
  return {
    label: smartView.label,
    description: descriptions[smartView.id] ?? "No threads in this view.",
  };
}

export function MailboxWorkspace() {
  const pathname = usePathname();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composer, setComposer] = useState<MailboxComposerState | null>(null);
  const [filterState, setFilterState] = useState<ActiveFilterState>({ filters: [], searchQuery: "" });
  const [contextOverrides, setContextOverrides] = useState<Record<string, Partial<LinkedContextState>>>({});

  // Responsive state
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MailboxResponsivePanel>("thread-list");

  const viewLabel = resolveViewLabel(pathname);
  const activeConnection = resolveActiveConnection(pathname);
  const visibleThreads = resolveVisibleThreads(pathname, filterState);
  const totalCount = visibleThreads.length;
  const unreadCount = visibleThreads.filter((t) => t.isUnread).length;
  const selectedDetail = selectedThreadId ? MOCK_THREAD_DETAILS[selectedThreadId] ?? null : null;
  const reconnectConnection = resolveReconnectConnection(pathname);
  const smartViewEmpty = resolveSmartViewDescription(pathname);

  const selectedContext: LinkedContextState | null = selectedThreadId
    ? { ...(MOCK_LINKED_CONTEXT[selectedThreadId] ?? null), ...(contextOverrides[selectedThreadId] ?? {}) } as LinkedContextState
    : null;

  const defaultComposeConnection =
    activeConnection ??
    MOCK_CONNECTIONS.find((c) => c.status === "connected") ??
    MOCK_CONNECTIONS[0];

  useEffect(() => {
    if (selectedThreadId && !visibleThreads.some((t) => t.id === selectedThreadId)) {
      setSelectedThreadId(null);
    }
  }, [selectedThreadId, visibleThreads]);

  // On mobile, selecting a thread navigates to reading pane
  const handleSelectThread = useCallback((id: string) => {
    setSelectedThreadId(id);
    setMobilePanel("reading-pane");
  }, []);

  const handleMobileBack = useCallback(() => {
    setMobilePanel("thread-list");
    setSelectedThreadId(null);
  }, []);

  const openNewCompose = useCallback(() => {
    setComposer(makeComposerState("new", null, null, "", [], defaultComposeConnection));
  }, [defaultComposeConnection]);

  const openInlineReply = useCallback(
    (mode: ComposeMode, threadId: string, messageId: string, subject: string, to: string[]) => {
      const threadConnection =
        MOCK_CONNECTIONS.find((c) => c.id === MOCK_THREAD_DETAILS[threadId]?.mailboxConnectionId) ??
        defaultComposeConnection;
      setComposer(makeComposerState(mode, threadId, messageId, subject, to, threadConnection, "inline"));
    },
    [defaultComposeConnection]
  );

  const closeComposer = useCallback(() => setComposer(null), []);
  const expandComposer = useCallback(() => setComposer((p) => p ? { ...p, layout: "expanded" } : p), []);
  const collapseComposer = useCallback(
    () => setComposer((p) => p ? { ...p, layout: p.threadId ? "inline" : "floating" } : p),
    []
  );
  const patchComposer = useCallback((patch: Partial<MailboxComposerState>) => {
    setComposer((p) => p ? { ...p, ...patch } : p);
  }, []);

  const patchContext = useCallback((patch: Partial<LinkedContextState>) => {
    if (!selectedThreadId) return;
    setContextOverrides((prev) => ({
      ...prev,
      [selectedThreadId]: { ...(prev[selectedThreadId] ?? {}), ...patch },
    }));
  }, [selectedThreadId]);

  const addFilter = useCallback((filter: ActiveFilter) => {
    setFilterState((prev) => ({
      ...prev,
      filters: prev.filters.some((f) => f.field === filter.field && f.value === filter.value)
        ? prev.filters
        : [...prev.filters, filter],
    }));
  }, []);

  const removeFilter = useCallback((field: string, value: string) => {
    setFilterState((prev) => ({
      ...prev,
      filters: prev.filters.filter((f) => !(f.field === field && f.value === value)),
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilterState({ filters: [], searchQuery: "" });
  }, []);

  const clearSearch = useCallback(() => {
    setFilterState((prev) => ({ ...prev, searchQuery: "" }));
  }, []);

  const hasActiveFilters = filterState.filters.length > 0 || !!filterState.searchQuery;

  // Resolve thread list empty state
  const threadListEmptyState = (() => {
    if (hasActiveFilters) {
      return (
        <NoSearchResultsEmpty
          query={filterState.searchQuery || undefined}
          hasActiveFilters={filterState.filters.length > 0}
          onClearFilters={clearFilters}
        />
      );
    }
    if (smartViewEmpty) {
      return (
        <SmartViewEmpty
          viewLabel={smartViewEmpty.label}
          viewDescription={smartViewEmpty.description}
        />
      );
    }
    return null;
  })();

  // Reconnect banner for thread list
  const reconnectBanner = reconnectConnection ? (
    <ReconnectBanner
      mailboxLabel={reconnectConnection.displayName}
      connectionId={reconnectConnection.id}
      isAdmin={true}
    />
  ) : undefined;

  // Mobile label
  const mobileLabel =
    mobilePanel === "reading-pane" && selectedDetail
      ? selectedDetail.subject
      : viewLabel;

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ background: "#F7F8FB" }}
      data-testid="mailbox-workspace"
    >
        {/* ── Desktop left rail (xl+) — single instance, always in DOM ── */}
        {/* On xl+: shown inline. On <xl: hidden (drawer has its own copy via portal). */}
        <div className="hidden xl:flex xl:shrink-0" aria-hidden="false">
          <MailboxLeftRail />
        </div>

        {/* ── Rail drawer for tablet + mobile — separate instance, aria-hidden when closed ── */}
        <div className="xl:hidden" aria-hidden={!isRailOpen}>
          <MailboxRailDrawer isOpen={isRailOpen} onClose={() => setIsRailOpen(false)}>
            <MailboxLeftRail />
          </MailboxRailDrawer>
        </div>

      {/* ── Center + right panes ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Mobile top bar */}
        <MobileTopBar
          activePanel={mobilePanel}
          label={mobileLabel}
          onOpenRail={() => setIsRailOpen(true)}
          onBack={mobilePanel === "reading-pane" ? handleMobileBack : undefined}
          onCompose={openNewCompose}
        />

        {/* Tablet top bar */}
        <TabletTopBar
          label={viewLabel}
          onOpenRail={() => setIsRailOpen(true)}
          onCompose={openNewCompose}
        />

        {/* Command bar — single instance for all viewports */}
        <MailboxCommandBar
          activeViewLabel={viewLabel}
          totalCount={totalCount}
          unreadCount={unreadCount}
          onCompose={openNewCompose}
          searchQuery={filterState.searchQuery}
          onSearchQueryChange={(query) =>
            setFilterState((prev) => ({ ...prev, searchQuery: query }))
          }
          onClearSearch={clearSearch}
          filterState={filterState}
          onAddFilter={addFilter}
          onRemoveFilter={removeFilter}
          onClearFilters={clearFilters}
        />

        {/* Filter chips bar */}
        <FilterChipsBar
          filterState={filterState}
          onAddFilter={addFilter}
          onRemoveFilter={removeFilter}
          onClearAll={clearFilters}
        />

        {/* ── Main content area ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* Thread list — full width on mobile, fixed width on md+ */}
          <div
            className={[
              "shrink-0 overflow-hidden border-r",
              // Mobile: show only when thread-list panel is active
              mobilePanel === "thread-list" ? "flex w-full flex-col md:w-80 lg:w-96 md:flex" : "hidden md:flex md:w-80 lg:w-96 md:flex-col",
            ].join(" ")}
            data-testid="mailbox-thread-list-pane"
          >
            <MailboxThreadList
              threads={visibleThreads}
              selectedThreadId={selectedThreadId}
              onSelectThread={handleSelectThread}
              reconnectBanner={reconnectBanner}
              emptyState={threadListEmptyState ?? undefined}
            />
          </div>

          {/* Reading pane — hidden on mobile when thread-list is active */}
          <div
            className={[
              "min-w-0 flex-1 overflow-hidden",
              mobilePanel === "reading-pane" ? "flex flex-col" : "hidden md:flex md:flex-col",
            ].join(" ")}
            data-testid="mailbox-reading-pane"
          >
            {selectedDetail ? (
              <MailboxReadingPane
                detail={selectedDetail}
                composerState={composer?.threadId === selectedDetail.threadId ? composer : null}
                onOpenReply={openInlineReply}
                onCloseReply={closeComposer}
                onExpandReply={expandComposer}
                onPatchComposer={patchComposer}
              />
            ) : (
              <MailboxReadingPaneEmpty />
            )}
          </div>

          {/* Context panel — desktop only (xl+) */}
          <div className="hidden xl:flex xl:flex-col" data-testid="mailbox-context-panel-container">
            {selectedContext ? (
              <MailboxContextPanel context={selectedContext} onPatch={patchContext} />
            ) : (
              <MailboxContextPanelEmpty />
            )}
          </div>
        </div>

        {/* Mobile bottom tab bar */}
        <MobileTabBar
          activePanel={mobilePanel}
          onSelectPanel={setMobilePanel}
          unreadCount={unreadCount}
        />
      </div>

      {/* Floating composer */}
      {composer?.isOpen && composer.layout === "floating" && composer.threadId === null && (
        <FloatingComposer
          state={composer}
          onClose={closeComposer}
          onExpand={expandComposer}
          onChange={patchComposer}
        />
      )}

      {/* Expanded composer overlay */}
      {composer?.isOpen && composer.layout === "expanded" && (
        <ExpandedComposer
          state={composer}
          onClose={closeComposer}
          onCollapse={collapseComposer}
          onChange={patchComposer}
        />
      )}
    </div>
  );
}
