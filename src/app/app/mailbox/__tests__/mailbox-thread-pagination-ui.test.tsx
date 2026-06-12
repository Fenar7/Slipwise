import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailboxThreadList, type ThreadRowData } from "../mailbox-thread-list";
import { MailboxWorkspace } from "../mailbox-workspace";

let mockPathname = "/app/mailbox";
let mockThreadHookState = {
  threads: [] as Array<Record<string, unknown>>,
  messages: [] as Array<Record<string, unknown>>,
  totalCount: 0,
  nextCursor: null as string | null,
  searchMeta: null as Record<string, unknown> | null,
  hasMore: false,
  isLoading: false,
  isLoadingMore: false,
  error: null as string | null,
  refetch: vi.fn(),
  loadMore: vi.fn(),
};

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  callback: IntersectionObserverCallback;
  observed = new Set<Element>();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe = (element: Element) => {
    this.observed.add(element);
  };

  disconnect = () => {
    this.observed.clear();
  };

  unobserve = (element: Element) => {
    this.observed.delete(element);
  };

  triggerIntersect(target?: Element) {
    const element = target ?? [...this.observed][0];
    if (!element) return;

    this.callback(
      [{ isIntersecting: true, target: element } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }

  static reset() {
    MockIntersectionObserver.instances = [];
  }
}

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../use-mailbox-query-sync", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useMailboxQuerySync: () => {
      const [filterState, setFilterState] = React.useState({
        filters: [],
        searchQuery: "",
      });
      return { filterState, setFilterState };
    },
  };
});

vi.mock("../use-mailbox-connections", () => ({
  useMailboxConnections: () => ({
    connections: [
      {
        id: "conn-1",
        orgId: "org-1",
        provider: "gmail",
        slug: "billing",
        emailAddress: "billing@example.com",
        displayName: "Billing",
        status: "connected",
        lastSyncAt: "2026-06-01T10:00:00.000Z",
        lastSyncError: null,
        lastSyncErrorCategory: null,
        unreadCount: 2,
        inboxCount: 12,
      },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../use-mailbox-threads", () => ({
  useMailboxThreads: () => mockThreadHookState,
}));

vi.mock("../use-mailbox-drafts", () => ({
  useMailboxDrafts: () => ({
    drafts: [],
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-supabase-session", () => ({
  useSupabaseSession: () => ({ user: { id: "user-1" } }),
}));

vi.mock("../use-mailbox-thread-detail", () => ({
  useMailboxThreadDetail: () => ({
    detail: null,
    isLoading: false,
    error: null,
    isNotFound: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../use-mailbox-provider-draft-detail", () => ({
  useMailboxProviderDraftDetail: () => ({
    detail: null,
    isLoading: false,
    error: null,
    isNotFound: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../use-thread-action", () => ({
  useThreadAction: () => ({
    isLoading: false,
    performAction: vi.fn(),
  }),
}));

vi.mock("../use-mailbox-draft", () => ({
  useMailboxDraft: () => ({
    isLoading: false,
    isAutosaving: false,
    error: null,
    adoptDraft: vi.fn(),
    clearCurrentDraft: vi.fn(),
    createDraft: vi.fn(),
    autosave: vi.fn(),
    sendDraft: vi.fn(),
    discardDraft: vi.fn(),
    cancelAutosave: vi.fn(),
  }),
}));

vi.mock("../use-assignable-members", () => ({
  useAssignableMembers: () => ({ members: [] }),
}));

vi.mock("../use-mailbox-sync-action", () => ({
  useMailboxSyncAction: () => ({
    triggerSync: vi.fn(),
    isPending: vi.fn(() => false),
    getError: vi.fn(() => null),
  }),
}));

vi.mock("../use-mailbox-saved-views", () => ({
  useMailboxSavedViews: () => ({
    views: [],
    createView: vi.fn(),
    deleteView: vi.fn(),
  }),
}));

const threadRows: ThreadRowData[] = [
  {
    id: "thread-1",
    mailboxConnectionId: "conn-1",
    subject: "Invoice follow-up",
    snippet: "Please confirm payment timing.",
    from: "Priya Sharma",
    fromInitial: "P",
    fromColor: "#7C3AED",
    timestamp: "10:42 AM",
    isUnread: true,
    isFlagged: false,
    hasAttachment: false,
    mailboxLabel: "Billing",
    mailboxColor: "#16294D",
    status: "open",
  },
  {
    id: "thread-2",
    mailboxConnectionId: "conn-1",
    subject: "Quote approval",
    snippet: "Can we approve this revision?",
    from: "Arjun Mehta",
    fromInitial: "A",
    fromColor: "#0891B2",
    timestamp: "9:15 AM",
    isUnread: false,
    isFlagged: true,
    hasAttachment: true,
    mailboxLabel: "Billing",
    mailboxColor: "#16294D",
    status: "pending",
  },
];

const messageRows = [
  {
    id: null,
    threadId: "thread-1",
    providerThreadId: "provider-thread-1",
    providerMessageId: "provider-message-1",
    from: { email: "priya@example.com", displayName: "Priya Sharma" },
    subject: "Invoice follow-up",
    snippet: "Please confirm payment timing.",
    sentAt: "2026-06-01T10:00:00.000Z",
    threadSubject: "Invoice follow-up",
    mailboxConnectionId: "conn-1",
    isShellResult: false,
    mailboxDisplayName: "Billing",
  },
  {
    id: null,
    threadId: null,
    providerThreadId: "provider-thread-2",
    providerMessageId: "provider-message-2",
    from: { email: "arjun@example.com", displayName: "Arjun Mehta" },
    subject: "Quote approval",
    snippet: "Can we approve this revision?",
    sentAt: "2026-06-01T11:00:00.000Z",
    threadSubject: "Quote approval",
    mailboxConnectionId: "conn-1",
    isShellResult: true,
    mailboxDisplayName: "Billing",
  },
];

describe("Mailbox thread pagination UI", () => {
  beforeEach(() => {
    mockPathname = "/app/mailbox";
    mockThreadHookState = {
      threads: [],
      messages: [],
      totalCount: 0,
      nextCursor: null,
      searchMeta: null,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      refetch: vi.fn(),
      loadMore: vi.fn(),
    };
    MockIntersectionObserver.reset();
    vi.stubGlobal(
      "IntersectionObserver",
      MockIntersectionObserver as unknown as typeof IntersectionObserver,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows truthful footer states and manual load more control", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <MailboxThreadList
        threads={threadRows}
        selectedThreadId={null}
        onSelectThread={vi.fn()}
        totalCount={5}
        loadedCount={2}
        hasMore={true}
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.getByTestId("mailbox-thread-list-footer-count")).toHaveTextContent(
      "Loaded 2 of 5",
    );
    expect(
      screen.getByTestId("mailbox-thread-list-load-more"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("mailbox-thread-list-end-of-results"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mailbox-thread-list-load-more"));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <MailboxThreadList
        threads={threadRows}
        selectedThreadId={null}
        onSelectThread={vi.fn()}
        totalCount={5}
        loadedCount={4}
        hasMore={true}
        isLoadingMore={true}
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.getByText("Loading more")).toBeInTheDocument();

    rerender(
      <MailboxThreadList
        threads={threadRows}
        selectedThreadId={null}
        onSelectThread={vi.fn()}
        totalCount={4}
        loadedCount={4}
        hasMore={false}
      />,
    );

    expect(
      screen.getByTestId("mailbox-thread-list-end-of-results"),
    ).toHaveTextContent("End of results");
  });

  it("auto-loads once per observer cycle and does not spam while loading", async () => {
    const onLoadMore = vi.fn();

    render(
      <MailboxThreadList
        threads={threadRows}
        selectedThreadId={null}
        onSelectThread={vi.fn()}
        totalCount={5}
        loadedCount={2}
        hasMore={true}
        onLoadMore={onLoadMore}
      />,
    );

    const observer = MockIntersectionObserver.instances[0];
    expect(observer).toBeDefined();

    observer.triggerIntersect(
      screen.getByTestId("mailbox-thread-list-sentinel"),
    );
    observer.triggerIntersect(
      screen.getByTestId("mailbox-thread-list-sentinel"),
    );

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });
  });

  it("supports infinite scroll and selection state in messages mode", async () => {
    const onLoadMore = vi.fn();
    const onSelectMessage = vi.fn();

    render(
      <MailboxThreadList
        threads={[]}
        messages={messageRows}
        selectedThreadId={null}
        selectedMessageProviderId="provider-message-2"
        onSelectThread={vi.fn()}
        onSelectMessage={onSelectMessage}
        totalCount={4}
        loadedCount={2}
        hasMore={true}
        onLoadMore={onLoadMore}
        searchMeta={{ mode: "gmail_exact", searchMode: "messages", totalCountIsExact: false, partial: false, partialConnectionIds: [], coverageState: "complete", connectionStates: [] }}
      />,
    );

    const observer = MockIntersectionObserver.instances[0];
    expect(observer).toBeDefined();
    observer.triggerIntersect(screen.getByTestId("mailbox-thread-list-sentinel"));

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    const selectedRow = screen.getByText("Arjun Mehta").closest("[role='option']");
    expect(selectedRow).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByText("Priya Sharma"));
    expect(onSelectMessage).toHaveBeenCalledTimes(1);
  });

  it("wires pagination state into the workspace thread pane", () => {
    const loadMore = vi.fn();
    mockThreadHookState = {
      threads: [
        {
          id: "thread-1",
          mailboxConnectionId: "conn-1",
          providerThreadId: "provider-thread-1",
          subject: "Invoice follow-up",
          participants: [{ email: "priya@example.com", displayName: "Priya Sharma" }],
          lastMessageAt: "2026-06-01T10:00:00.000Z",
          unreadCount: 1,
          status: "OPEN",
          assigneeId: null,
          assigneeName: null,
          isFlagged: false,
          previewSnippet: "Please confirm payment timing.",
          attachmentCount: 0,
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z",
        },
      ],
      messages: [],
      totalCount: 3,
      nextCursor: "cursor-2",
      searchMeta: null,
      hasMore: true,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      refetch: vi.fn(),
      loadMore,
    };

    render(<MailboxWorkspace />);

    expect(screen.getByTestId("mailbox-thread-list-footer-count")).toHaveTextContent(
      "Loaded 1 of 3",
    );

    fireEvent.click(screen.getByTestId("mailbox-thread-list-load-more"));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("keeps drafts mode off the thread pagination path", () => {
    mockPathname = "/app/mailbox/billing/drafts";
    const loadMore = vi.fn();
    mockThreadHookState = {
      threads: [],
      messages: [],
      totalCount: 99,
      nextCursor: "cursor-2",
      searchMeta: null,
      hasMore: true,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      refetch: vi.fn(),
      loadMore,
    };

    render(<MailboxWorkspace />);

    expect(
      screen.queryByTestId("mailbox-thread-list-footer"),
    ).not.toBeInTheDocument();
    expect(loadMore).not.toHaveBeenCalled();
  });
});
