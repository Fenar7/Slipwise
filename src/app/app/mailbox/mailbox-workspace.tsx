"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { MailboxLeftRail } from "./mailbox-left-rail";
import { MailboxCommandBar } from "./mailbox-command-bar";
import { MailboxThreadList, MOCK_THREADS } from "./mailbox-thread-list";
import { MailboxReadingPaneEmpty } from "./mailbox-reading-pane-empty";
import { MailboxReadingPane } from "./mailbox-reading-pane";
import { FloatingComposer } from "./mailbox-floating-composer";
import { ExpandedComposer } from "./mailbox-expanded-composer";
import { GLOBAL_SMART_VIEWS, MOCK_CONNECTIONS, MOCK_THREAD_DETAILS } from "./mock-data";
import type { MailboxComposerState, ComposeMode } from "./types";

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
  to: string[]
): MailboxComposerState {
  return {
    isOpen: true,
    layout: "floating",
    mode,
    fromConnectionId: "conn_billing",
    fromLabel: "Billing",
    fromEmail: "billing@acmecorp.com",
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

export function MailboxWorkspace() {
  const pathname = usePathname();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composer, setComposer] = useState<MailboxComposerState | null>(null);

  const viewLabel = resolveViewLabel(pathname);
  const totalCount = MOCK_THREADS.length;
  const unreadCount = MOCK_THREADS.filter((t) => t.isUnread).length;
  const selectedDetail = selectedThreadId ? MOCK_THREAD_DETAILS[selectedThreadId] ?? null : null;

  const openNewCompose = useCallback(() => {
    setComposer(makeComposerState("new", null, null, "", []));
  }, []);

  const openInlineReply = useCallback(
    (mode: ComposeMode, threadId: string, messageId: string, subject: string, to: string[]) => {
      setComposer(makeComposerState(mode, threadId, messageId, subject, to));
    },
    []
  );

  const closeComposer = useCallback(() => setComposer(null), []);

  const expandComposer = useCallback(() => {
    setComposer((prev) => prev ? { ...prev, layout: "expanded" } : prev);
  }, []);

  const collapseComposer = useCallback(() => {
    setComposer((prev) => prev ? { ...prev, layout: "floating" } : prev);
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
