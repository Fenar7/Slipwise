"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MailboxLeftRail } from "./mailbox-left-rail";
import { MailboxCommandBar } from "./mailbox-command-bar";
import { MailboxThreadList, MOCK_THREADS } from "./mailbox-thread-list";
import { MailboxReadingPaneEmpty } from "./mailbox-reading-pane-empty";
import { MailboxReadingPane } from "./mailbox-reading-pane";
import { GLOBAL_SMART_VIEWS, MOCK_CONNECTIONS, MOCK_THREAD_DETAILS } from "./mock-data";

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

export function MailboxWorkspace() {
  const pathname = usePathname();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const viewLabel = resolveViewLabel(pathname);
  const totalCount = MOCK_THREADS.length;
  const unreadCount = MOCK_THREADS.filter((t) => t.isUnread).length;

  const selectedDetail = selectedThreadId ? MOCK_THREAD_DETAILS[selectedThreadId] ?? null : null;

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
        />

        {/* Thread list + reading pane */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Thread list — fixed width on desktop */}
          <div
            className="w-full shrink-0 overflow-hidden md:w-80 lg:w-96"
            data-testid="mailbox-thread-list-pane"
          >
            <MailboxThreadList
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
              <MailboxReadingPane detail={selectedDetail} />
            ) : (
              <MailboxReadingPaneEmpty />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
