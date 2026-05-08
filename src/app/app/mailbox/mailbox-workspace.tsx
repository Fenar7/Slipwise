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
import { GLOBAL_SMART_VIEWS, MOCK_CONNECTIONS, MOCK_THREAD_DETAILS } from "./mock-data";
import type { MailboxComposerState, ComposeMode, MailboxConnection } from "./types";

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

function resolveVisibleThreads(pathname: string) {
  const activeConnection = resolveActiveConnection(pathname);
  const smartView = GLOBAL_SMART_VIEWS.find(
    (view) => view.href !== "/app/mailbox" && (pathname === view.href || pathname.startsWith(`${view.href}/`))
  );

  if (smartView?.id === "unread") {
    return MOCK_THREADS.filter((thread) => thread.isUnread);
  }

  if (smartView?.id === "assigned-to-me") {
    return MOCK_THREADS.filter((thread) => thread.assignee === "You");
  }

  if (smartView?.id === "unassigned") {
    return MOCK_THREADS.filter((thread) => !thread.assignee);
  }

  if (smartView?.id === "flagged") {
    return MOCK_THREADS.filter((thread) => thread.isFlagged);
  }

  if (smartView?.id === "waiting") {
    return MOCK_THREADS.filter((thread) => thread.status === "pending");
  }

  if (!activeConnection) {
    return MOCK_THREADS;
  }

  const folder = pathname.split("/").pop() ?? "inbox";
  const connectionThreads = MOCK_THREADS.filter(
    (thread) => thread.mailboxConnectionId === activeConnection.id
  );

  if (folder === "sent") {
    return connectionThreads.filter((thread) => {
      const detail = MOCK_THREAD_DETAILS[thread.id];
      const latestMessage = detail?.messages[detail.messages.length - 1];
      return latestMessage?.direction === "outbound";
    });
  }

  if (folder === "drafts") {
    return [];
  }

  if (folder === "archive") {
    return connectionThreads.filter((thread) => thread.status === "closed");
  }

  if (folder === "spam") {
    return [];
  }

  return connectionThreads.filter((thread) => thread.status !== "closed");
}

export function MailboxWorkspace() {
  const pathname = usePathname();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composer, setComposer] = useState<MailboxComposerState | null>(null);

  const viewLabel = resolveViewLabel(pathname);
  const activeConnection = resolveActiveConnection(pathname);
  const visibleThreads = resolveVisibleThreads(pathname);
  const totalCount = visibleThreads.length;
  const unreadCount = visibleThreads.filter((thread) => thread.isUnread).length;
  const selectedDetail = selectedThreadId ? MOCK_THREAD_DETAILS[selectedThreadId] ?? null : null;
  const defaultComposeConnection =
    activeConnection ??
    MOCK_CONNECTIONS.find((connection) => connection.status === "connected") ??
    MOCK_CONNECTIONS[0];

  useEffect(() => {
    if (selectedThreadId && !visibleThreads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(null);
    }
  }, [selectedThreadId, visibleThreads]);

  const openNewCompose = useCallback(() => {
    setComposer(makeComposerState("new", null, null, "", [], defaultComposeConnection));
  }, [defaultComposeConnection]);

  const openInlineReply = useCallback(
    (mode: ComposeMode, threadId: string, messageId: string, subject: string, to: string[]) => {
      const threadConnection =
        MOCK_CONNECTIONS.find(
          (connection) => connection.id === MOCK_THREAD_DETAILS[threadId]?.mailboxConnectionId
        ) ?? defaultComposeConnection;
      setComposer(makeComposerState(mode, threadId, messageId, subject, to, threadConnection, "inline"));
    },
    [defaultComposeConnection]
  );

  const closeComposer = useCallback(() => setComposer(null), []);

  const expandComposer = useCallback(() => {
    setComposer((prev) => prev ? { ...prev, layout: "expanded" } : prev);
  }, []);

  const collapseComposer = useCallback(() => {
    setComposer((prev) =>
      prev ? { ...prev, layout: prev.threadId ? "inline" : "floating" } : prev
    );
  }, []);

  const patchComposer = useCallback((patch: Partial<MailboxComposerState>) => {
    setComposer((prev) => prev ? { ...prev, ...patch } : prev);
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
        />

        {/* Thread list + reading pane */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
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
        </div>
      </div>

      {/* Floating composer — shown when layout=floating and not inline */}
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
