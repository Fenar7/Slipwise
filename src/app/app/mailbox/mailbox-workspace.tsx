"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { MailboxLeftRail } from "./mailbox-left-rail";
import { MailboxCommandBar } from "./mailbox-command-bar";
import { MailboxThreadList } from "./mailbox-thread-list";
import { MailboxReadingPaneEmpty } from "./mailbox-reading-pane-empty";
import { MailboxReadingPane } from "./mailbox-reading-pane";
import { FloatingComposer } from "./mailbox-floating-composer";
import { ExpandedComposer } from "./mailbox-expanded-composer";
import { MailboxContextPanel, MailboxContextPanelEmpty } from "./mailbox-context-panel";
import { FilterChipsBar } from "./mailbox-filter-chips";
import { MailboxFilterPanel } from "./mailbox-filter-panel";
import { EmptyInboxState, NoMailboxesEmpty, NoSearchResultsEmpty, SmartViewEmpty } from "./mailbox-empty-states";
import { ReconnectBanner } from "./mailbox-restricted-states";
import { MailboxRailDrawer, MobileTopBar, TabletTopBar, MobileTabBar } from "./mailbox-mobile-nav";
import {
  GLOBAL_SMART_VIEWS,
  MOCK_LINKED_CONTEXT,
} from "./mock-data";
import { useMailboxConnections } from "./use-mailbox-connections";
import { useMailboxThreads, type UseMailboxThreadsParams } from "./use-mailbox-threads";
import { mapThreadToRowData, deriveMailboxColor, mapThreadDetailToUI } from "./thread-data-helpers";
import { useMailboxThreadDetail } from "./use-mailbox-thread-detail";
import { useThreadAction } from "./use-thread-action";
import type { ThreadAction } from "./use-thread-action";
import { useMailboxDraft } from "./use-mailbox-draft";
import { ThreadNotFoundEmpty } from "./mailbox-empty-states";
import type { ThreadRowData } from "./mailbox-thread-list";
import type {
  MailboxComposerState,
  ComposeMode,
  MailboxConnection,
  ActiveFilterState,
  ActiveFilter,
  LinkedContextState,
  MailboxResponsivePanel,
} from "./types";

// Minimal connection shape for composer and filters
interface ConnectionLike {
  id: string;
  displayName: string;
  emailAddress: string;
}

export function resolveViewLabel(
  pathname: string,
  connections: MailboxConnection[] = [],
): string {
  const smartView = GLOBAL_SMART_VIEWS.find(
    (v) =>
      v.href === "/app/mailbox"
        ? pathname === v.href
        : pathname === v.href || pathname.startsWith(`${v.href}/`),
  );
  if (smartView) return smartView.label;

  for (const conn of connections) {
    const prefix = conn.slug || conn.id;
    if (pathname.includes(`/${prefix}/`)) {
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
  fromConnection: ConnectionLike,
  layout: MailboxComposerState["layout"] = "floating",
  draftId: string | null = null,
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
    deliveryMode: "send_now",
    scheduledSendAt: null,
    scheduleLabel: null,
    schedulePanelOpen: false,
    threadId,
    replyToMessageId,
    draftId,
  };
}

function resolveActiveConnection(
  pathname: string,
  connections: MailboxConnection[] = [],
): MailboxConnection | null {
  return (
    connections.find(
      (conn) => {
        const prefix = conn.slug || conn.id;
        return (
          pathname === `/app/mailbox/${prefix}` ||
          pathname.startsWith(`/app/mailbox/${prefix}/`)
        );
      },
    ) ?? null
  );
}

export function resolveThreadQueryParams(
  pathname: string,
  connections: MailboxConnection[] = [],
): {
  connectionId?: string;
  status?: string;
  unreadOnly?: boolean;
  isFlagged?: boolean;
  assignee?: "me" | "none";
} {
  const activeConnection = resolveActiveConnection(pathname, connections);
  const smartView = GLOBAL_SMART_VIEWS.find(
    (view) =>
      view.href !== "/app/mailbox" &&
      (pathname === view.href || pathname.startsWith(`${view.href}/`)),
  );

  if (smartView?.id === "unread") return { unreadOnly: true };
  if (smartView?.id === "assigned-to-me") return { assignee: "me" };
  if (smartView?.id === "unassigned") return { assignee: "none" };
  if (smartView?.id === "flagged") return { isFlagged: true };
  if (smartView?.id === "waiting") return { status: "PENDING" };
  // Sprint 4.4: linked/unlinked smart views removed from live nav

  if (activeConnection) {
    const folder = pathname.split("/").pop() ?? "inbox";
    if (folder === "archive") {
      return { connectionId: activeConnection.id, status: "ARCHIVED" };
    }
    if (folder === "drafts" || folder === "spam") {
      // Drafts and spam are not supported by the thread list backend yet.
      // Return a sentinel status that yields an empty result.
      return { connectionId: activeConnection.id, status: "DRAFT" };
    }
    if (folder === "sent") {
      // Sent folder not yet supported by thread list backend
      return { connectionId: activeConnection.id };
    }
    // Inbox: show OPEN and PENDING threads
    return {
      connectionId: activeConnection.id,
      status: "OPEN,PENDING",
    };
  }

  return {};
}

/**
 * Merge route-derived query params with user-applied filter state to produce
 * the authoritative live-data fetch params for useMailboxThreads.
 *
 * Rules:
 * - Route params (e.g., mailbox folder, smart view) are the base.
 * - User filters override/add to the base where they don't conflict.
 * - Mailbox filter is ignored when the route already scopes to a specific mailbox.
 * - Status values are uppercased for the API contract.
 * - Linked/unlinked filters are not supported by the backend and are ignored.
 */
export function resolveLiveQueryParams(
  routeParams: ReturnType<typeof resolveThreadQueryParams>,
  filterState: ActiveFilterState,
): UseMailboxThreadsParams {
  const params: UseMailboxThreadsParams = { ...routeParams };

  const trimmedQuery = filterState.searchQuery.trim();
  if (trimmedQuery) {
    params.searchQuery = trimmedQuery;
  }

  for (const filter of filterState.filters) {
    switch (filter.field) {
      case "mailbox":
        // Only apply mailbox filter in all-inboxes view (no route-scoped connectionId)
        if (!routeParams.connectionId) {
          params.connectionId = filter.value;
        }
        break;
      case "status":
        // Sprint 4.4 review fix: preserve route-derived folder semantics.
        // Do not let a user-applied status filter override the folder's
        // built-in status (e.g. inbox = OPEN,PENDING, archive = ARCHIVED).
        if (!routeParams.status) {
          params.status = filter.value.toUpperCase();
        }
        break;
      case "assignee":
        params.assignee = filter.value as "me" | "none";
        break;
      case "unread":
        params.unreadOnly = filter.value === "true";
        break;
      case "flagged":
        params.isFlagged = filter.value === "true";
        break;
      // "linked" is not supported by the live backend — silently ignored
    }
  }

  return params;
}

function resolveEmptyMailboxLabel(
  pathname: string,
  activeConnection: MailboxConnection | null,
  viewLabel: string,
) {
  if (!activeConnection) return viewLabel;
  const folder = pathname.split("/").pop() ?? "inbox";
  if (folder === "inbox") return activeConnection.displayName;
  return `${activeConnection.displayName} · ${folder.charAt(0).toUpperCase()}${folder.slice(1)}`;
}

/** Resolve the reconnect-required connection for the current view, if any */
function resolveReconnectConnection(
  pathname: string,
  connections: MailboxConnection[] = [],
): MailboxConnection | null {
  const activeConnection = resolveActiveConnection(pathname, connections);
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
    // Sprint 4.4: linked/unlinked smart views removed from live nav
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
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [filterDraftState, setFilterDraftState] = useState<ActiveFilterState>({ filters: [], searchQuery: "" });

  // Responsive state
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MailboxResponsivePanel>("thread-list");

  // Real data hooks
  const { connections, isLoading: connectionsLoading } = useMailboxConnections();

  const threadQueryParams = useMemo(
    () => resolveThreadQueryParams(pathname, connections),
    [pathname, connections],
  );

  const liveQueryParams = useMemo(
    () => resolveLiveQueryParams(threadQueryParams, filterState),
    [threadQueryParams, filterState],
  );

  const {
    threads: rawThreads,
    totalCount: apiTotalCount,
    isLoading: threadsLoading,
    refetch: refetchThreads,
  } = useMailboxThreads(liveQueryParams);

  const connectionMap = useMemo(() => {
    const map = new Map<string, { displayName: string; color: string }>();
    for (const conn of connections) {
      map.set(conn.id, { displayName: conn.displayName, color: deriveMailboxColor(conn.id) });
    }
    return map;
  }, [connections]);

  // TODO: Sprint 4.1 does not have current user ID from auth context in this component.
  // Using empty string means assignee will show as "Assigned" rather than "You".
  // This will be resolved when auth context is wired into the mailbox workspace.
  const currentUserId = "";

  const mappedThreads = useMemo(() => {
    const ctx = { connectionMap, currentUserId };
    return rawThreads.map((t) => mapThreadToRowData(t, ctx));
  }, [rawThreads, connectionMap, currentUserId]);

  // Backend drives all supported filtering; visible threads are the mapped API result
  const visibleThreads = mappedThreads;

  const viewLabel = resolveViewLabel(pathname, connections);
  const activeConnection = resolveActiveConnection(pathname, connections);
  const totalCount = apiTotalCount;
  const unreadCount = mappedThreads.filter((t) => t.isUnread).length;

  const {
    detail: rawDetail,
    isLoading: detailLoading,
    isNotFound: detailNotFound,
    refetch: refetchDetail,
  } = useMailboxThreadDetail(selectedThreadId);

  const handleActionSuccess = useCallback(
    (_threadId: string, _action: ThreadAction) => {
      // Refetch both list and detail to ensure consistency after mutation
      refetchThreads();
      if (selectedThreadId) {
        refetchDetail();
      }
    },
    [refetchThreads, refetchDetail, selectedThreadId],
  );

  const { isLoading: isActionLoading, performAction } = useThreadAction(handleActionSuccess);

  // Sprint 5.1: Draft persistence hook
  const {
    isLoading: isDraftLoading,
    isAutosaving,
    error: draftError,
    createDraft,
    autosave,
    sendDraft,
    discardDraft,
    cancelAutosave,
  } = useMailboxDraft();

  const handleThreadAction = useCallback(
    (threadId: string, action: ThreadAction) => {
      void performAction(threadId, action);
    },
    [performAction],
  );

  const handleReadingPaneAction = useCallback(
    (action: ThreadAction) => {
      if (selectedThreadId) {
        void performAction(selectedThreadId, action);
      }
    },
    [performAction, selectedThreadId],
  );

  const selectedDetail = useMemo(() => {
    if (!rawDetail) return null;
    return mapThreadDetailToUI(rawDetail, { connectionMap, currentUserId });
  }, [rawDetail, connectionMap, currentUserId]);

  const reconnectConnection = resolveReconnectConnection(pathname, connections);
  const smartViewEmpty = resolveSmartViewDescription(pathname);
  const connectedMailboxCount = connections.filter((conn) => conn.status !== "disconnected").length;

  const selectedContext: LinkedContextState | null = selectedThreadId
    ? { ...(MOCK_LINKED_CONTEXT[selectedThreadId] ?? null), ...(contextOverrides[selectedThreadId] ?? {}) } as LinkedContextState
    : null;

  const defaultComposeConnection =
    activeConnection ??
    connections.find((c) => c.status === "connected") ??
    connections[0];

  useEffect(() => {
    if (selectedThreadId && !visibleThreads.some((t) => t.id === selectedThreadId)) {
      setSelectedThreadId(null);
    }
  }, [selectedThreadId, visibleThreads]);

  useEffect(() => {
    if (isFilterPanelOpen) {
      setFilterDraftState({ filters: [...filterState.filters], searchQuery: filterState.searchQuery });
    }
  }, [isFilterPanelOpen, filterState]);

  // On mobile, selecting a thread navigates to reading pane
  const handleSelectThread = useCallback((id: string) => {
    setSelectedThreadId(id);
    setMobilePanel("reading-pane");
  }, []);

  const handleMobileBack = useCallback(() => {
    if (mobilePanel === "context") {
      setMobilePanel("reading-pane");
      return;
    }

    setMobilePanel("thread-list");
    setSelectedThreadId(null);
  }, [mobilePanel]);

  const openNewCompose = useCallback(async () => {
    if (!defaultComposeConnection) return;
    const draft = await createDraft({
      mailboxConnectionId: defaultComposeConnection.id,
      mode: "NEW",
    });
    setComposer(makeComposerState("new", null, null, "", [], defaultComposeConnection, "floating", draft?.id ?? null));
  }, [defaultComposeConnection, createDraft]);

  const openInlineReply = useCallback(
    async (mode: ComposeMode, threadId: string, messageId: string, subject: string, to: string[]) => {
      const threadConnection =
        connections.find((c) => c.id === selectedDetail?.mailboxConnectionId) ??
        defaultComposeConnection;
      if (!threadConnection) return;
      const draftMode: import("./use-mailbox-draft").DraftModeUppercase =
        mode === "reply-all" ? "REPLY_ALL" : mode === "reply" ? "REPLY" : "FORWARD";
      const draft = await createDraft({
        mailboxConnectionId: threadConnection.id,
        mode: draftMode,
        threadId,
        replyToMessageId: messageId,
        subject,
        to,
      });
      setComposer(makeComposerState(mode, threadId, messageId, subject, to, threadConnection, "inline", draft?.id ?? null));
    },
    [connections, defaultComposeConnection, selectedDetail, createDraft]
  );

  const closeComposer = useCallback(() => {
    cancelAutosave();
    setComposer(null);
  }, [cancelAutosave]);
  const expandComposer = useCallback(() => setComposer((p) => p ? { ...p, layout: "expanded" } : p), []);
  const collapseComposer = useCallback(
    () => setComposer((p) => p ? { ...p, layout: p.threadId ? "inline" : "floating" } : p),
    []
  );
  const patchComposer = useCallback((patch: Partial<MailboxComposerState>) => {
    setComposer((p) => {
      if (!p) return p;
      const next = { ...p, ...patch };
      // Sprint 5.1: trigger debounced autosave when content mutates
      if (p.draftId) {
        void autosave({
          to: next.to,
          cc: next.cc,
          bcc: next.bcc,
          subject: next.subject,
          htmlBody: next.bodyHtml,
          textBody: null,
          attachmentRefs: next.attachments.map((a) => a.id),
        });
      }
      return next;
    });
  }, [autosave]);

  const handleDiscardComposer = useCallback(async () => {
    await discardDraft();
    setComposer(null);
  }, [discardDraft]);

  const handleSendComposer = useCallback(async () => {
    const result = await sendDraft();
    if (result) {
      setComposer(null);
    }
  }, [sendDraft]);

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

  const toggleDraftFilter = useCallback((filter: ActiveFilter) => {
    setFilterDraftState((prev) => {
      const exists = prev.filters.some((candidate) => candidate.field === filter.field && candidate.value === filter.value);
      return {
        ...prev,
        filters: exists
          ? prev.filters.filter((candidate) => !(candidate.field === filter.field && candidate.value === filter.value))
          : [
              ...prev.filters.filter(
                (candidate) => !(candidate.field === "mailbox" && filter.field === "mailbox")
              ),
              filter,
            ],
      };
    });
  }, []);

  const clearDraftFilters = useCallback(() => {
    setFilterDraftState((prev) => ({ ...prev, filters: [] }));
  }, []);

  const applyDraftFilters = useCallback(() => {
    setFilterState((prev) => ({ ...prev, filters: [...filterDraftState.filters] }));
    setIsFilterPanelOpen(false);
  }, [filterDraftState.filters]);

  const hasActiveFilters = filterState.filters.length > 0 || !!filterState.searchQuery;

  // Resolve thread list empty state
  const threadListEmptyState = (() => {
    if (connectionsLoading) {
      return null; // Will show loading spinner inside thread list
    }
    if (connectedMailboxCount === 0) {
      return <NoMailboxesEmpty isAdmin={true} />;
    }
    if (rawThreads.length === 0) {
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
      return (
        <EmptyInboxState
          mailboxLabel={resolveEmptyMailboxLabel(pathname, activeConnection, viewLabel)}
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
    mobilePanel === "context"
      ? selectedDetail
        ? `${selectedDetail.mailboxLabel} context`
        : "Thread context"
      : mobilePanel === "reading-pane" && selectedDetail
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
          <MailboxLeftRail connections={connections} />
        </div>

        {/* ── Rail drawer for tablet + mobile — separate instance, aria-hidden when closed ── */}
        <div className="xl:hidden" aria-hidden={!isRailOpen}>
          <MailboxRailDrawer isOpen={isRailOpen} onClose={() => setIsRailOpen(false)}>
            <MailboxLeftRail connections={connections} />
          </MailboxRailDrawer>
        </div>

      {/* ── Center + right panes ── */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-visible">

        {/* Mobile top bar */}
        <MobileTopBar
          activePanel={mobilePanel}
          label={mobileLabel}
          onOpenRail={() => setIsRailOpen(true)}
          onBack={
            mobilePanel === "reading-pane" || mobilePanel === "context"
              ? handleMobileBack
              : undefined
          }
          onCompose={openNewCompose}
        />

        {/* Tablet top bar */}
        <TabletTopBar
          label={viewLabel}
          onOpenRail={() => setIsRailOpen(true)}
          onCompose={openNewCompose}
        />

        <div className="relative z-20 shrink-0 overflow-visible">
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
            isFilterPanelOpen={isFilterPanelOpen}
            onToggleFilterPanel={() => setIsFilterPanelOpen((open) => !open)}
          />

          <MailboxFilterPanel
            panelId="mailbox-filter-panel"
            open={isFilterPanelOpen}
            activeConnection={activeConnection}
            viewLabel={viewLabel}
            filterState={filterState}
            draftState={filterDraftState}
            connections={connections.filter((connection) => connection.status !== "disconnected")}
            onToggleDraftFilter={toggleDraftFilter}
            onClearDraft={clearDraftFilters}
            onApply={applyDraftFilters}
            onClose={() => setIsFilterPanelOpen(false)}
          />
        </div>

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
              isLoading={threadsLoading}
              isActionLoading={isActionLoading}
              onThreadAction={handleThreadAction}
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
            {detailLoading ? (
              <div className="flex h-full items-center justify-center bg-[#F7F8FB]" data-testid="mailbox-reading-pane-loading">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#16294D]" />
              </div>
            ) : detailNotFound ? (
              <ThreadNotFoundEmpty onDismiss={() => setSelectedThreadId(null)} />
            ) : selectedDetail ? (
              <MailboxReadingPane
                detail={selectedDetail}
                composerState={composer?.threadId === selectedDetail.threadId ? composer : null}
                onOpenReply={openInlineReply}
                onCloseReply={closeComposer}
                onDiscardReply={handleDiscardComposer}
                onExpandReply={expandComposer}
                onSendReply={handleSendComposer}
                onPatchComposer={patchComposer}
                onOpenContext={() => setMobilePanel("context")}
                isActionLoading={isActionLoading}
                onThreadAction={handleReadingPaneAction}
              />
            ) : (
              <MailboxReadingPaneEmpty />
            )}
          </div>

          {/* Context panel — desktop always visible, mobile/tablet shown as panel */}
          <div
            className={[
              "min-w-0 overflow-hidden",
              mobilePanel === "context"
                ? "flex w-full flex-col xl:w-64 xl:shrink-0"
                : "hidden xl:flex xl:w-64 xl:shrink-0 xl:flex-col",
            ].join(" ")}
            data-testid="mailbox-context-panel-container"
          >
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
          onDiscard={handleDiscardComposer}
          onExpand={expandComposer}
          onSend={handleSendComposer}
          onChange={patchComposer}
        />
      )}

      {/* Expanded composer overlay */}
      {composer?.isOpen && composer.layout === "expanded" && (
        <ExpandedComposer
          state={composer}
          onClose={closeComposer}
          onDiscard={handleDiscardComposer}
          onCollapse={collapseComposer}
          onSend={handleSendComposer}
          onChange={patchComposer}
        />
      )}
    </div>
  );
}
