"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { useMailboxQuerySync } from "./use-mailbox-query-sync";
import { useMailboxSavedViews } from "./use-mailbox-saved-views";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import { MailboxLeftRail } from "./mailbox-left-rail";
import { MailboxCommandBar } from "./mailbox-command-bar";
import { MailboxDraftList } from "./mailbox-draft-list";
import { MailboxThreadList } from "./mailbox-thread-list";
import { MailboxReadingPaneEmpty } from "./mailbox-reading-pane-empty";
import { MailboxReadingPane } from "./mailbox-reading-pane";
import { FloatingComposer } from "./mailbox-floating-composer";
import { ExpandedComposer } from "./mailbox-expanded-composer";
import { MailboxContextPanel, MailboxContextPanelEmpty } from "./mailbox-context-panel";
import { FilterChipsBar } from "./mailbox-filter-chips";
import { MailboxFilterPanel } from "./mailbox-filter-panel";
import {
  EmptyDraftsState,
  EmptyInboxState,
  EmptySentState,
  EmptySpamState,
  NoDraftSelectedEmpty,
  NoMailboxesEmpty,
  NoSearchResultsEmpty,
  SmartViewEmpty,
} from "./mailbox-empty-states";
import { ReconnectBanner } from "./mailbox-restricted-states";
import { MailboxRailDrawer, MobileTopBar, TabletTopBar, MobileTabBar } from "./mailbox-mobile-nav";
import {
  GLOBAL_SMART_VIEWS,
  MOCK_LINKED_CONTEXT,
} from "./mock-data";
import { useMailboxConnections } from "./use-mailbox-connections";
import { useMailboxThreads, type UseMailboxThreadsParams } from "./use-mailbox-threads";
import {
  mapDraftToRowData,
  mapProviderDraftDetailToUI,
  mapThreadToRowData,
  deriveMailboxColor,
  mapThreadDetailToUI,
} from "./thread-data-helpers";
import { useMailboxThreadDetail } from "./use-mailbox-thread-detail";
import { useMailboxProviderDraftDetail } from "./use-mailbox-provider-draft-detail";
import { useThreadAction } from "./use-thread-action";
import type { ThreadAction } from "./use-thread-action";
import { useMailboxDraft } from "./use-mailbox-draft";
import { useMailboxDrafts } from "./use-mailbox-drafts";
import { useAssignableMembers } from "./use-assignable-members";
import { ThreadLoadErrorEmpty, ThreadNotFoundEmpty } from "./mailbox-empty-states";
import { useMailboxSyncAction } from "./use-mailbox-sync-action";
import {
  canManuallySyncMailbox,
  resolveMailboxSyncPresentation,
  shouldAutoTriggerMailboxSync,
  withPendingSyncPresentation,
} from "./mailbox-sync-ui";
import type { ThreadRowData } from "./mailbox-thread-list";
import type {
  MailboxComposerState,
  ComposeMode,
  MailboxConnection,
  ActiveFilterState,
  ActiveFilter,
  LinkedContextState,
  MailboxResponsivePanel,
  SupportedSavedViewSmartViewId,
  MailboxFolder,
} from "./types";

// Minimal connection shape for composer and filters
interface ConnectionLike {
  id: string;
  displayName: string;
  emailAddress: string;
}

function resolveFolderFromPathname(pathname: string): string {
  return pathname.split("/").pop() ?? "inbox";
}

function isDraftsFolder(pathname: string): boolean {
  return resolveFolderFromPathname(pathname) === "drafts";
}

function draftModeToComposeMode(mode: string): ComposeMode {
  switch (mode) {
    case "REPLY":
      return "reply";
    case "REPLY_ALL":
      return "reply-all";
    case "FORWARD":
      return "forward";
    default:
      return "new";
  }
}

function formatDraftAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  folder?: MailboxFolder;
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
    const folder = resolveFolderFromPathname(pathname);
    if (folder === "drafts") {
      return { connectionId: activeConnection.id };
    }
    if (folder === "starred") {
      return { connectionId: activeConnection.id, folder: "STARRED" };
    }
    if (folder === "spam") {
      return { connectionId: activeConnection.id, folder: "SPAM" };
    }
    if (folder === "sent") {
      return { connectionId: activeConnection.id, folder: "SENT" };
    }
    if (folder === "trash") {
      return { connectionId: activeConnection.id, folder: "TRASH" };
    }
    return {
      connectionId: activeConnection.id,
      folder: "INBOX",
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

  // Sprint B: pass searchMode through to the hook
  if (filterState.searchMode === "messages") {
    params.searchMode = "messages";
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
        // Preserve route-derived folder semantics. Do not let a user-applied
        // status filter override a folder-scoped route.
        if (!routeParams.status && !routeParams.folder) {
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

function resolveSmartViewId(pathname: string): SupportedSavedViewSmartViewId | undefined {
  const smartView = GLOBAL_SMART_VIEWS.find(
    (view) =>
      view.href !== "/app/mailbox" &&
      (pathname === view.href || pathname.startsWith(`${view.href}/`)),
  );
  return smartView?.id as SupportedSavedViewSmartViewId | undefined;
}

export function MailboxWorkspace() {
  const pathname = usePathname();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedMessageProviderId, setSelectedMessageProviderId] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [composer, setComposer] = useState<MailboxComposerState | null>(null);
  const { filterState, setFilterState } = useMailboxQuerySync();
  const [contextOverrides, setContextOverrides] = useState<Record<string, Partial<LinkedContextState>>>({});
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [filterDraftState, setFilterDraftState] = useState<ActiveFilterState>({ filters: [], searchQuery: "", searchMode: "threads" });
  const { views: savedViews, createView, deleteView } = useMailboxSavedViews();

  // Responsive state
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MailboxResponsivePanel>("thread-list");

  // Real data hooks
  const {
    connections,
    isLoading: connectionsLoading,
    refetch: refetchConnections,
  } = useMailboxConnections();
  const activeConnection = resolveActiveConnection(pathname, connections);
  const inDraftsMode = !!activeConnection && isDraftsFolder(pathname);

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
    messages: rawMessages = [],
    totalCount: apiTotalCount,
    searchMeta: threadSearchMeta,
    hasMore: threadsHasMore,
    isLoading: threadsLoading,
    isLoadingMore: threadsLoadingMore,
    refetch: refetchThreads,
    loadMore: loadMoreThreads,
  } = useMailboxThreads({ ...liveQueryParams, enabled: !inDraftsMode });

  const {
    drafts: rawDrafts,
    isLoading: draftsLoading,
    error: draftsFetchError,
    refetch: refetchDrafts,
  } = useMailboxDrafts(activeConnection?.id, inDraftsMode);

  const connectionMap = useMemo(() => {
    const map = new Map<string, { displayName: string; color: string }>();
    for (const conn of connections) {
      map.set(conn.id, { displayName: conn.displayName, color: deriveMailboxColor(conn.id) });
    }
    return map;
  }, [connections]);

  const { user } = useSupabaseSession();
  const currentUserId = user?.id ?? "";

  const mappedThreads = useMemo(() => {
    const ctx = { connectionMap, currentUserId };
    return rawThreads.map((t) => mapThreadToRowData(t, ctx));
  }, [rawThreads, connectionMap, currentUserId]);

  // Backend drives all supported filtering; visible threads are the mapped API result
  const visibleThreads = mappedThreads;

  const viewLabel = resolveViewLabel(pathname, connections);
  const activeSync = activeConnection
    ? resolveMailboxSyncPresentation(activeConnection)
    : null;
  const mappedDrafts = useMemo(() => {
    const ctx = { connectionMap, currentUserId };
    return rawDrafts.map((draft) => mapDraftToRowData(draft, ctx));
  }, [rawDrafts, connectionMap, currentUserId]);
  const selectedDraftEntry = useMemo(
    () => rawDrafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [rawDrafts, selectedDraftId],
  );
  // Derive effective selection: clear stale draft ID without a cascading setState effect.
  const effectiveSelectedDraftId =
    selectedDraftId && mappedDrafts.some((d) => d.id === selectedDraftId)
      ? selectedDraftId
      : null;
  const selectedProviderDraftActive =
    inDraftsMode && selectedDraftEntry?.source === "provider" && !!effectiveSelectedDraftId;

  const totalCount = inDraftsMode ? mappedDrafts.length : apiTotalCount;
  const unreadCount = inDraftsMode ? 0 : mappedThreads.filter((t) => t.isUnread).length;

  const {
    detail: rawDetail,
    isLoading: detailLoading,
    error: detailError,
    isNotFound: detailNotFound,
    refetch: refetchDetail,
  } = useMailboxThreadDetail(selectedThreadId);
  const {
    detail: rawProviderDraftDetail,
    isLoading: providerDraftDetailLoading,
    error: providerDraftDetailError,
    isNotFound: providerDraftDetailNotFound,
    refetch: refetchProviderDraftDetail,
  } = useMailboxProviderDraftDetail(
    selectedProviderDraftActive ? effectiveSelectedDraftId : null,
    selectedProviderDraftActive,
  );

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
  const {
    triggerSync,
    isPending: isSyncPending,
    getError: getSyncError,
  } = useMailboxSyncAction({
    onSuccess: async () => {
      refetchConnections();
      if (inDraftsMode) {
        refetchDrafts();
        if (selectedProviderDraftActive) {
          refetchProviderDraftDetail();
        }
      } else {
        refetchThreads();
        if (selectedThreadId) {
          refetchDetail();
        }
      }
    },
  });

  /**
   * Auto-trigger recovery syncs while folder coverage is incomplete.
   *
   * Guard: only trigger once per `lastSyncAt` value so we do not loop
   * endlessly, but we DO resume automatically after a prior sync completes
   * and coverage is still partial. Stalled or failed runs are excluded —
   * the user must manually retry those to avoid opaque endless loops.
   */
  const autoSyncLastStampRef = useRef<Record<string, string | null>>({});
  useEffect(() => {
    if (connectionsLoading || !activeConnection) return;
    if (activeConnection.status !== "connected") return;
    const sync = resolveMailboxSyncPresentation(activeConnection);
    const needsAutoSync = shouldAutoTriggerMailboxSync(sync);
    if (!needsAutoSync) return;
    if (isSyncPending(activeConnection.id)) return;

    const stamp = activeConnection.lastSyncAt;
    if (autoSyncLastStampRef.current[activeConnection.id] === stamp) return;

    autoSyncLastStampRef.current[activeConnection.id] = stamp;
    void triggerSync(activeConnection.id);
  }, [
    connectionsLoading,
    activeConnection,
    triggerSync,
    isSyncPending,
  ]);

  const lastSeenSyncStampRef = useRef<Record<string, string | null>>({});
  useEffect(() => {
    if (!activeConnection || activeConnection.status !== "connected") return;
    const syncStamp = activeConnection.lastSyncAt;
    const previousSyncStamp = lastSeenSyncStampRef.current[activeConnection.id];

    if (previousSyncStamp === undefined) {
      lastSeenSyncStampRef.current[activeConnection.id] = syncStamp;
      return;
    }
    if (previousSyncStamp === syncStamp) return;

    lastSeenSyncStampRef.current[activeConnection.id] = syncStamp;
    if (inDraftsMode) {
      refetchDrafts();
      if (selectedProviderDraftActive) {
        refetchProviderDraftDetail();
      }
      return;
    }

    refetchThreads();
    if (selectedThreadId) {
      refetchDetail();
    }
  }, [
    activeConnection,
    inDraftsMode,
    selectedProviderDraftActive,
    selectedThreadId,
    refetchDrafts,
    refetchProviderDraftDetail,
    refetchThreads,
    refetchDetail,
  ]);

  // Sprint 5.1: Draft persistence hook
  const {
    isLoading: isDraftLoading,
    isAutosaving,
    error: draftError,
    adoptDraft,
    clearCurrentDraft,
    createDraft,
    autosave,
    sendDraft,
    discardDraft,
    cancelAutosave,
  } = useMailboxDraft();

  // Sprint 6.2: fetch assignable org members for the context panel picker
  const { members: assignableMembers } = useAssignableMembers();

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
    if (selectedProviderDraftActive) {
      if (!rawProviderDraftDetail) return null;
      return mapProviderDraftDetailToUI(rawProviderDraftDetail, {
        connectionMap,
        currentUserId,
      });
    }
    if (!rawDetail) return null;
    return mapThreadDetailToUI(rawDetail, { connectionMap, currentUserId });
  }, [
    rawDetail,
    rawProviderDraftDetail,
    selectedProviderDraftActive,
    connectionMap,
    currentUserId,
  ]);

  const reconnectConnection = resolveReconnectConnection(pathname, connections);
  const smartViewEmpty = resolveSmartViewDescription(pathname);
  const connectedMailboxCount = connections.filter((conn) => conn.status !== "disconnected").length;
  const effectiveActiveSync =
    activeConnection && activeSync
      ? withPendingSyncPresentation(activeSync, isSyncPending(activeConnection.id))
      : null;
  const activeSyncError = activeConnection ? getSyncError(activeConnection.id) : null;
  const canSyncActiveMailbox =
    activeConnection ? canManuallySyncMailbox(activeConnection.status) : false;

  const selectedContext: LinkedContextState | null = selectedProviderDraftActive
    ? null
    : selectedThreadId
    ? {
        ...(MOCK_LINKED_CONTEXT[selectedThreadId] ?? {
          threadId: selectedThreadId,
          links: [],
          suggestions: [],
          assignee: null,
          assigneeId: null,
          status: "open" as const,
          statusChangedAt: null,
          internalNote: "",
        }),
        ...(contextOverrides[selectedThreadId] ?? {}),
        // Override assignee and status with authoritative thread data
        assignee: selectedDetail?.assignee ?? null,
        assigneeId: selectedDetail?.assigneeId ?? null,
        status: selectedDetail?.status ?? "open",
      } as LinkedContextState
    : null;

  const defaultComposeConnection =
    activeConnection ??
    connections.find((c) => c.status === "connected") ??
    connections[0];

  useEffect(() => {
    if (inDraftsMode) return;
    if (selectedThreadId && !visibleThreads.some((t) => t.id === selectedThreadId) && rawMessages.length === 0) {
      queueMicrotask(() => {
        setSelectedThreadId(null);
        setSelectedMessageProviderId(null);
      });
    }
  }, [inDraftsMode, selectedThreadId, visibleThreads, rawMessages.length]);

  useEffect(() => {
    if (isFilterPanelOpen) {
      queueMicrotask(() => {
        setFilterDraftState({ filters: [...filterState.filters], searchQuery: filterState.searchQuery });
      });
    }
  }, [isFilterPanelOpen, filterState]);

  // On mobile, selecting a thread navigates to reading pane
  const handleSelectThread = useCallback((id: string) => {
    setSelectedThreadId(id);
    setSelectedMessageProviderId(null);
    setSelectedDraftId(null);
    setMobilePanel("reading-pane");
  }, []);

  // Sprint B: Handle message result selection — open parent thread
  const handleSelectMessage = useCallback(async (message: import("./use-mailbox-threads").MailboxMessageResultItem) => {
    setSelectedMessageProviderId(message.providerMessageId);
    setSelectedDraftId(null);
    setMobilePanel("reading-pane");

    if (message.threadId) {
      setSelectedThreadId(message.threadId);
      return;
    }

    try {
      const res = await fetch("/api/mailbox/threads/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailboxConnectionId: message.mailboxConnectionId,
          providerThreadId: message.providerThreadId,
        }),
      });
      if (!res.ok) {
        return;
      }

      const body = (await res.json()) as { threadId?: string };
      if (body.threadId) {
        setSelectedThreadId(body.threadId);
      }
    } catch {
      // Search truth/degraded state is already surfaced; leave the shell result selected.
    }
  }, []);

  const handleMobileBack = useCallback(() => {
    if (mobilePanel === "context") {
      setMobilePanel("reading-pane");
      return;
    }

    setMobilePanel("thread-list");
    setSelectedThreadId(null);
    setSelectedMessageProviderId(null);
  }, [mobilePanel]);

  const handleSelectDraft = useCallback((draftId: string) => {
    const draft = rawDrafts.find((candidate) => candidate.id === draftId);
    if (!draft) return;

    if (draft.source === "provider") {
      setSelectedDraftId(draftId);
      setSelectedThreadId(null);
      setSelectedMessageProviderId(null);
      clearCurrentDraft();
      setComposer(null);
      setMobilePanel("reading-pane");
      return;
    }

    const connection =
      connections.find((candidate) => candidate.id === draft.mailboxConnectionId) ??
      defaultComposeConnection;
    if (!connection) return;

    adoptDraft({
      id: draft.id,
      orgId: draft.orgId,
      mailboxConnectionId: draft.mailboxConnectionId,
      threadId: draft.threadId,
      replyToMessageId: draft.replyToMessageId,
      mode: draft.mode,
      fromIdentity: draft.fromIdentity,
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      htmlBody: draft.htmlBody,
      textBody: draft.textBody,
      attachmentRefs: draft.attachmentRefs,
      status: draft.status,
      lastAutosavedAt: draft.lastAutosavedAt,
      createdBy: draft.createdBy,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    });
    setSelectedDraftId(draftId);
    setSelectedThreadId(null);
    setSelectedMessageProviderId(null);
    setComposer({
      isOpen: true,
      layout: "expanded",
      mode: draftModeToComposeMode(draft.mode),
      fromConnectionId: connection.id,
      fromLabel: connection.displayName,
      fromEmail: connection.emailAddress,
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      showCc: draft.cc.length > 0,
      showBcc: draft.bcc.length > 0,
      subject: draft.subject,
      bodyHtml: draft.htmlBody,
      attachments: draft.attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeLabel: formatDraftAttachmentSize(attachment.size),
      })),
      sendState: "idle",
      deliveryMode: "send_now",
      scheduledSendAt: null,
      scheduleLabel: null,
      schedulePanelOpen: false,
      threadId: draft.threadId,
      replyToMessageId: draft.replyToMessageId,
      draftId: draft.id,
    });
    setMobilePanel("reading-pane");
  }, [adoptDraft, clearCurrentDraft, connections, defaultComposeConnection, rawDrafts]);

  const openNewCompose = useCallback(async () => {
    if (!defaultComposeConnection) return;
    const draft = await createDraft({
      mailboxConnectionId: defaultComposeConnection.id,
      mode: "NEW",
    });
    setSelectedDraftId(draft?.id ?? null);
    setComposer(makeComposerState("new", null, null, "", [], defaultComposeConnection, "floating", draft?.id ?? null));
    if (inDraftsMode) {
      refetchDrafts();
    }
  }, [defaultComposeConnection, createDraft, inDraftsMode, refetchDrafts]);

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
    if (inDraftsMode) {
      clearCurrentDraft();
      setSelectedDraftId(null);
    }
  }, [cancelAutosave, clearCurrentDraft, inDraftsMode]);
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
    clearCurrentDraft();
    setSelectedDraftId(null);
    refetchDrafts();
  }, [clearCurrentDraft, discardDraft, refetchDrafts]);

  const handleSendComposer = useCallback(async () => {
    const result = await sendDraft();
    if (result) {
      setComposer(null);
      clearCurrentDraft();
      setSelectedDraftId(null);
      refetchDrafts();
      refetchThreads();
    }
  }, [clearCurrentDraft, refetchDrafts, refetchThreads, sendDraft]);

  const patchContext = useCallback(
    (patch: Partial<LinkedContextState>) => {
      if (!selectedThreadId) return;

      // Sprint 6.2: assignment and status changes go to the backend
      if (patch.status !== undefined) {
        void performAction(selectedThreadId, "set_status", {
          status: patch.status.toUpperCase(),
        });
        return;
      }

      if (patch.assignee !== undefined) {
        if (patch.assignee === null) {
          void performAction(selectedThreadId, "unassign");
        } else if (patch.assigneeId) {
          // Real teammate assignment (or self via "Assign to me")
          void performAction(selectedThreadId, "assign", { assigneeId: patch.assigneeId });
        }
        return;
      }

      // Linked records and internal notes remain local-only (Sprint 6.1)
      setContextOverrides((prev) => ({
        ...prev,
        [selectedThreadId]: { ...(prev[selectedThreadId] ?? {}), ...patch },
      }));
    },
    [selectedThreadId, performAction],
  );

  const addFilter = useCallback((filter: ActiveFilter) => {
    setFilterState((prev) => ({
      ...prev,
      filters: prev.filters.some((f) => f.field === filter.field && f.value === filter.value)
        ? prev.filters
        : [...prev.filters, filter],
    }));
  }, [setFilterState]);

  const removeFilter = useCallback((field: string, value: string) => {
    setFilterState((prev) => ({
      ...prev,
      filters: prev.filters.filter((f) => !(f.field === field && f.value === value)),
    }));
  }, [setFilterState]);

  const clearFilters = useCallback(() => {
    setFilterState({ filters: [], searchQuery: "", searchMode: "threads" });
  }, [setFilterState]);

  const clearSearch = useCallback(() => {
    setFilterState((prev) => ({ ...prev, searchQuery: "", searchMode: "threads" }));
  }, [setFilterState]);

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
  }, [filterDraftState.filters, setFilterState]);

  const hasActiveFilters = filterState.filters.length > 0 || !!filterState.searchQuery;

  // Resolve thread list empty state
  const threadListEmptyState = (() => {
    if (connectionsLoading) {
      return null; // Will show loading spinner inside thread list
    }
    if (connectedMailboxCount === 0) {
      return <NoMailboxesEmpty isAdmin={true} />;
    }
    if (inDraftsMode && mappedDrafts.length === 0) {
      return (
        <EmptyDraftsState
          mailboxLabel={resolveEmptyMailboxLabel(pathname, activeConnection, viewLabel)}
          syncStatus={
            effectiveActiveSync &&
            (effectiveActiveSync.state === "running" ||
              effectiveActiveSync.state === "completed_never_imported" ||
              effectiveActiveSync.state === "failed" ||
              effectiveActiveSync.draftErrorSummary != null)
              ? effectiveActiveSync
              : undefined
          }
          fetchError={draftsFetchError}
          onSyncNow={
            activeConnection && canSyncActiveMailbox
              ? () => { void triggerSync(activeConnection.id); }
              : undefined
          }
          isSyncPending={activeConnection ? isSyncPending(activeConnection.id) : false}
        />
      );
    }
    if (!inDraftsMode && rawThreads.length === 0 && rawMessages.length === 0) {
      if (hasActiveFilters) {
        return (
          <NoSearchResultsEmpty
            query={filterState.searchQuery || undefined}
            hasActiveFilters={filterState.filters.length > 0}
            onClearFilters={clearFilters}
            isPartialSearch={threadSearchMeta?.partial === true}
            searchMeta={threadSearchMeta}
            connections={connections}
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
      const activeFolder = resolveFolderFromPathname(pathname);
      if (activeFolder === "sent") {
        return (
          <EmptySentState
            mailboxLabel={resolveEmptyMailboxLabel(pathname, activeConnection, viewLabel)}
            syncStatus={
              effectiveActiveSync &&
              (effectiveActiveSync.state === "running" ||
                effectiveActiveSync.state === "completed_never_imported" ||
                effectiveActiveSync.state === "failed")
                ? effectiveActiveSync
                : undefined
            }
            onSyncNow={
              activeConnection && canSyncActiveMailbox
                ? () => { void triggerSync(activeConnection.id); }
                : undefined
            }
            isSyncPending={activeConnection ? isSyncPending(activeConnection.id) : false}
          />
        );
      }
      if (activeFolder === "spam") {
        return (
          <EmptySpamState
            mailboxLabel={resolveEmptyMailboxLabel(pathname, activeConnection, viewLabel)}
            syncStatus={
              effectiveActiveSync &&
              (effectiveActiveSync.state === "running" ||
                effectiveActiveSync.state === "completed_never_imported" ||
                effectiveActiveSync.state === "failed")
                ? effectiveActiveSync
                : undefined
            }
            onSyncNow={
              activeConnection && canSyncActiveMailbox
                ? () => { void triggerSync(activeConnection.id); }
                : undefined
            }
            isSyncPending={activeConnection ? isSyncPending(activeConnection.id) : false}
          />
        );
      }
      return (
        <EmptyInboxState
          mailboxLabel={resolveEmptyMailboxLabel(pathname, activeConnection, viewLabel)}
          syncStatus={
            effectiveActiveSync &&
            (effectiveActiveSync.state === "running" ||
              effectiveActiveSync.state === "completed_never_imported" ||
              effectiveActiveSync.state === "failed")
              ? effectiveActiveSync
              : undefined
          }
          onSyncNow={
            activeConnection && canSyncActiveMailbox
              ? () => {
                  void triggerSync(activeConnection.id);
                }
              : undefined
          }
          isSyncPending={activeConnection ? isSyncPending(activeConnection.id) : false}
          syncError={activeSyncError}
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
          <MailboxLeftRail connections={connections} onCompose={openNewCompose} savedViews={savedViews} onDeleteSavedView={deleteView} />
        </div>

        {/* ── Rail drawer for tablet + mobile — separate instance, aria-hidden when closed ── */}
        <div className="xl:hidden" aria-hidden={!isRailOpen}>
          <MailboxRailDrawer isOpen={isRailOpen} onClose={() => setIsRailOpen(false)}>
            <MailboxLeftRail connections={connections} onCompose={openNewCompose} savedViews={savedViews} onDeleteSavedView={deleteView} />
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
            loadedCount={
              inDraftsMode
                ? mappedDrafts.length
                : filterState.searchMode === "messages"
                ? rawMessages.length
                : visibleThreads.length
            }
            unreadCount={unreadCount}
            searchMeta={threadSearchMeta}
            itemLabel={inDraftsMode ? "draft" : "thread"}
            onCompose={openNewCompose}
            searchQuery={filterState.searchQuery}
            onSearchQueryChange={(query) =>
              setFilterState((prev) => ({ ...prev, searchQuery: query }))
            }
            onClearSearch={clearSearch}
            searchMode={filterState.searchMode}
            onSearchModeChange={(mode) =>
              setFilterState((prev) => ({ ...prev, searchMode: mode }))
            }
            filterState={filterState}
            isFilterPanelOpen={isFilterPanelOpen}
            onToggleFilterPanel={() => setIsFilterPanelOpen((open) => !open)}
            onSaveView={createView}
            smartViewId={resolveSmartViewId(pathname)}
            syncStatus={effectiveActiveSync}
            onSyncNow={
              activeConnection && canSyncActiveMailbox
                ? () => {
                    void triggerSync(activeConnection.id);
                  }
                : undefined
            }
            isSyncPending={activeConnection ? isSyncPending(activeConnection.id) : false}
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
            {inDraftsMode ? (
              <MailboxDraftList
                drafts={mappedDrafts}
                selectedDraftId={effectiveSelectedDraftId}
                onSelectDraft={handleSelectDraft}
                emptyState={threadListEmptyState ?? undefined}
                isLoading={draftsLoading}
              />
            ) : (
              <MailboxThreadList
                threads={visibleThreads}
                messages={rawMessages}
                selectedThreadId={selectedThreadId}
                selectedMessageProviderId={selectedMessageProviderId}
                onSelectThread={handleSelectThread}
                onSelectMessage={handleSelectMessage}
                reconnectBanner={reconnectBanner}
                emptyState={threadListEmptyState ?? undefined}
                totalCount={apiTotalCount}
                loadedCount={filterState.searchMode === "messages" ? rawMessages.length : visibleThreads.length}
                hasMore={threadsHasMore}
                searchMeta={threadSearchMeta}
                isLoading={threadsLoading}
                isLoadingMore={threadsLoadingMore}
                onLoadMore={loadMoreThreads}
                isActionLoading={isActionLoading}
                onThreadAction={handleThreadAction}
                connections={connections}
              />
            )}
          </div>

          {/* Reading pane — hidden on mobile when thread-list is active */}
          <div
            className={[
              "min-w-0 flex-1 overflow-hidden",
              mobilePanel === "reading-pane" ? "flex flex-col" : "hidden md:flex md:flex-col",
            ].join(" ")}
            data-testid="mailbox-reading-pane"
          >
            {detailLoading || providerDraftDetailLoading ? (
              <div className="flex h-full items-center justify-center bg-[#F7F8FB]" data-testid="mailbox-reading-pane-loading">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#16294D]" />
              </div>
            ) : detailError || providerDraftDetailError ? (
              <ThreadLoadErrorEmpty
                message={providerDraftDetailError ?? detailError}
                onRetry={
                  selectedProviderDraftActive
                    ? refetchProviderDraftDetail
                    : selectedThreadId
                    ? refetchDetail
                    : undefined
                }
                onDismiss={() => {
                  setSelectedThreadId(null);
                  setSelectedMessageProviderId(null);
                  setSelectedDraftId(null);
                }}
              />
            ) : detailNotFound || providerDraftDetailNotFound ? (
              <ThreadNotFoundEmpty
                onDismiss={() => {
                  setSelectedThreadId(null);
                  setSelectedMessageProviderId(null);
                  setSelectedDraftId(null);
                }}
              />
            ) : inDraftsMode && selectedProviderDraftActive && selectedDetail ? (
              <MailboxReadingPane
                detail={selectedDetail}
                selectedMessageProviderId={selectedMessageProviderId}
                composerState={null}
                onOpenReply={() => {}}
                onCloseReply={() => {}}
                onDiscardReply={() => {}}
                onExpandReply={() => {}}
                onSendReply={() => {}}
                onPatchComposer={() => {}}
                onOpenContext={() => setMobilePanel("context")}
                isActionLoading={false}
                onThreadAction={() => {}}
                allowReplies={false}
                allowThreadActions={false}
              />
            ) : inDraftsMode ? (
              <NoDraftSelectedEmpty
                mailboxLabel={resolveEmptyMailboxLabel(pathname, activeConnection, viewLabel)}
              />
            ) : selectedDetail ? (
              <MailboxReadingPane
                detail={selectedDetail}
                selectedMessageProviderId={selectedMessageProviderId}
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
              <MailboxContextPanel context={selectedContext} onPatch={patchContext} members={assignableMembers} currentUserId={currentUserId} />
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
