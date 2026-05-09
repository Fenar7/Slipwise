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

export function MailboxWorkspace() {
  const pathname = usePathname();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composer, setComposer] = useState<MailboxComposerState | null>(null);
  const [filterState, setFilterState] = useState<ActiveFilterState>({ filters: [], searchQuery: "" });
  const [contextOverrides, setContextOverrides] = useState<Record<string, Partial<LinkedContextState>>>({});

  const viewLabel = resolveViewLabel(pathname);
  const activeConnection = resolveActiveConnection(pathname);
  const visibleThreads = resolveVisibleThreads(pathname, filterState);
  const totalCount = visibleThreads.length;
  const unreadCount = visibleThreads.filter((t) => t.isUnread).length;
  const selectedDetail = selectedThreadId ? MOCK_THREAD_DETAILS[selectedThreadId] ?? null : null;

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

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ background: "#F7F8FB" }}
      data-testid="mailbox-workspace"
    >
      {/* Left rail */}
      <MailboxLeftRail />

      {/* Center + right panes */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Command bar */}
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

        {/* Filter chips bar — always visible so filters are reachable from zero state */}
        <FilterChipsBar
          filterState={filterState}
          onAddFilter={addFilter}
          onRemoveFilter={removeFilter}
          onClearAll={clearFilters}
        />

        {/* Thread list + reading pane + context panel */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Thread list */}
          <div
            className="w-full shrink-0 overflow-hidden md:w-80 lg:w-96"
            data-testid="mailbox-thread-list-pane"
          >
            <MailboxThreadList
              threads={visibleThreads}
              selectedThreadId={selectedThreadId}
              onSelectThread={setSelectedThreadId}
            />
          </div>

          {/* Reading pane */}
          <div
            className="hidden min-w-0 flex-1 overflow-hidden md:flex md:flex-col"
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

          {/* Context panel — desktop only */}
          <div className="hidden xl:flex xl:flex-col" data-testid="mailbox-context-panel-container">
            {selectedContext ? (
              <MailboxContextPanel context={selectedContext} onPatch={patchContext} />
            ) : (
              <MailboxContextPanelEmpty />
            )}
          </div>
        </div>
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
