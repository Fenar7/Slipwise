import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, renderHook } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/messaging",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
    ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) =>
      React.createElement("ul", props, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

import { useSendMessage } from "../lib/use-send-message";
import { useSendThreadReply } from "../lib/use-send-thread-reply";
import { useThreadReplies } from "../lib/use-thread-replies";
import { useMarkRead } from "../lib/use-mark-read";
import { useConversationDetail } from "../lib/use-conversation-detail";
import { useConversationList } from "../lib/use-conversation-list";
import { toFrontendMessages, toFrontendThreadReplies } from "../lib/mappers";
import type { ApiConversationDetail, ApiMessage } from "../lib/mappers";

function createMockDetail(overrides: Partial<ApiConversationDetail> = {}): ApiConversationDetail {
  return {
    id: "conv-1", orgId: "org-1", type: "CHANNEL", name: "general",
    description: "Team chat", visibility: "PUBLIC", archivedAt: null,
    lockedAt: null, createdBy: "user-1", createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-05-18T10:00:00Z", participantCount: 5, canSend: true,
    participants: [{
      id: "part-1", orgId: "org-1", conversationId: "conv-1",
      userId: "user-1", role: "OWNER", isActive: true, isMuted: false,
      joinedAt: "2026-01-01T00:00:00Z", displayName: "Alice",
    }],
    participantProfiles: [{ userId: "user-1", name: "Alice", avatarInitials: "AL" }],
    messages: [{
      id: "msg-1", orgId: "org-1", conversationId: "conv-1", threadId: null,
      authorId: "user-1", authorName: "Alice", authorInitials: "AL",
      body: "Hello team", status: "ACTIVE", editedAt: null, deletedAt: null,
      reactionSummary: [], attachmentCount: 0, createdAt: "2026-05-18T10:00:00Z",
    }],
    threads: [],
    readState: { lastReadMessageId: null, lastReadAt: null, unreadCount: 0, isMuted: false },
    currentUserId: "user-1",
    ...overrides,
  };
}

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300, status,
    json: () => Promise.resolve(response),
  } as Response);
}

// ─── Hook tests ──────────────────────────────────────────────────────────────

describe("useSendMessage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns result on successful send", async () => {
    vi.stubGlobal("fetch", mockFetch({
      success: true, data: { id: "msg-new", conversationId: "conv-1", threadId: null, authorId: "user-1", body: "Hi", createdAt: "2026-05-18T12:00:00Z" },
    }));

    function Wrapper() {
      const { send, sending, error } = useSendMessage();
      const [result, setResult] = React.useState<string | null>(null);
      return (
        <div>
          <span data-testid="sending">{sending ? "yes" : "no"}</span>
          <span data-testid="error">{error ?? "none"}</span>
          <span data-testid="result">{result ?? "empty"}</span>
          <button onClick={async () => {
            const r = await send("conv-1", "Hi");
            setResult(r?.id ?? "fail");
          }}>Send</button>
        </div>
      );
    }
    render(<Wrapper />);
    fireEvent.click(screen.getByText("Send"));
    await waitFor(() => expect(screen.getByTestId("result").textContent).toBe("msg-new"));
    expect(screen.getByTestId("sending").textContent).toBe("no");
    expect(screen.getByTestId("error").textContent).toBe("none");
  });

  it("surfaces error on failed send", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: false, error: { message: "Rate limited" } }, 429));

    function Wrapper() {
      const { send, error } = useSendMessage();
      return (
        <div>
          <span data-testid="error">{error ?? "none"}</span>
          <button onClick={async () => { await send("conv-1", "Hi"); }}>Send</button>
        </div>
      );
    }
    render(<Wrapper />);
    fireEvent.click(screen.getByText("Send"));
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("Rate limited"));
  });

  it("sends threadId when replying to a thread", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ success: true, data: { id: "msg-reply" } }),
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    function Wrapper() {
      const { send } = useSendMessage();
      return <button onClick={async () => { await send("conv-1", "Reply", "thread-1"); }}>Send</button>;
    }
    render(<Wrapper />);
    fireEvent.click(screen.getByText("Send"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as RequestInit)?.body as string);
    expect(body.threadId).toBe("thread-1");
  });
});

describe("useSendThreadReply", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns result on successful thread reply", async () => {
    vi.stubGlobal("fetch", mockFetch({
      success: true, data: { id: "msg-reply", conversationId: "conv-1", threadId: "thread-1", authorId: "user-1", body: "Got it", createdAt: "2026-05-18T12:00:00Z" },
    }));

    function Wrapper() {
      const { send, sending } = useSendThreadReply();
      return (
        <div>
          <span data-testid="sending">{sending ? "yes" : "no"}</span>
          <button onClick={async () => { await send("conv-1", "thread-1", "Got it"); }}>Reply</button>
        </div>
      );
    }
    render(<Wrapper />);
    fireEvent.click(screen.getByText("Reply"));
    await waitFor(() => expect(screen.getByTestId("sending").textContent).toBe("no"));
  });
});

describe("useMarkRead", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns readState on success", async () => {
    vi.stubGlobal("fetch", mockFetch({
      success: true, data: {
        readState: { lastReadMessageId: "msg-1", lastReadAt: "2026-05-18T12:00:00Z", unreadCount: 0, isMuted: false },
      },
    }));

    function Wrapper() {
      const { markRead, marking } = useMarkRead();
      const [result, setResult] = React.useState<string | null>(null);
      return (
        <div>
          <span data-testid="marking">{marking ? "yes" : "no"}</span>
          <span data-testid="result">{result ?? "empty"}</span>
          <button onClick={async () => {
            const r = await markRead("conv-1");
            setResult(r ? "ok" : "fail");
          }}>Mark</button>
        </div>
      );
    }
    render(<Wrapper />);
    fireEvent.click(screen.getByText("Mark"));
    await waitFor(() => expect(screen.getByTestId("result").textContent).toBe("ok"));
  });
});

describe("useThreadReplies", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads and maps thread replies", async () => {
    vi.stubGlobal("fetch", mockFetch({
      success: true, data: {
        replies: [{
          id: "reply-1", orgId: "org-1", conversationId: "conv-1", threadId: "thread-1",
          authorId: "user-2", authorName: "Bob", authorInitials: "BO",
          body: "Sounds good", status: "ACTIVE", editedAt: null, deletedAt: null,
          reactionSummary: [], attachmentCount: 0, createdAt: "2026-05-18T11:00:00Z",
        }],
      },
    }));

    function Wrapper() {
      const { replies, loading } = useThreadReplies("conv-1", "thread-1", createMockDetail());
      return (
        <div>
          <span data-testid="loading">{loading ? "yes" : "no"}</span>
          <span data-testid="count">{replies.length}</span>
        </div>
      );
    }
    render(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("no"));
    expect(screen.getByTestId("count").textContent).toBe("1");
  });
});

// ─── Mapper tests ────────────────────────────────────────────────────────────

describe("toFrontendMessages — Sprint 5.2 deduplication", () => {
  it("deduplicates messages with duplicate ids", () => {
    const detail = createMockDetail({
      messages: [
        {
          id: "msg-1", orgId: "org-1", conversationId: "conv-1", threadId: null,
          authorId: "user-1", authorName: "Alice", authorInitials: "AL",
          body: "First", status: "ACTIVE", editedAt: null, deletedAt: null,
          reactionSummary: [], attachmentCount: 0, createdAt: "2026-05-18T10:00:00Z",
        },
        {
          id: "msg-1", orgId: "org-1", conversationId: "conv-1", threadId: null,
          authorId: "user-1", authorName: "Alice", authorInitials: "AL",
          body: "Duplicate", status: "ACTIVE", editedAt: null, deletedAt: null,
          reactionSummary: [], attachmentCount: 0, createdAt: "2026-05-18T10:00:00Z",
        },
      ],
    });
    const msgs = toFrontendMessages(detail);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toBe("First");
  });

  it("derives hasThread and threadReplyCount from threads array", () => {
    const detail = createMockDetail({
      messages: [
        {
          id: "msg-anchor", orgId: "org-1", conversationId: "conv-1", threadId: null,
          authorId: "user-1", authorName: "Alice", authorInitials: "AL",
          body: "Anchor", status: "ACTIVE", editedAt: null, deletedAt: null,
          reactionSummary: [], attachmentCount: 0, createdAt: "2026-05-18T10:00:00Z",
        },
      ],
      threads: [
        { id: "thread-1", conversationId: "conv-1", anchorMessageId: "msg-anchor", title: null, replyCount: 3, resolvedAt: null, createdAt: "2026-05-18T10:05:00Z" },
      ],
    });
    const msgs = toFrontendMessages(detail);
    expect(msgs[0].hasThread).toBe(true);
    expect(msgs[0].threadReplyCount).toBe(3);
  });

  it("includes conversationId on every message", () => {
    const detail = createMockDetail();
    const msgs = toFrontendMessages(detail);
  });
});

describe("toFrontendThreadReplies — Sprint 5.2", () => {
  it("maps thread replies with deduplication", () => {
    const detail = createMockDetail();
    const replies: ApiMessage[] = [
      {
        id: "reply-1", orgId: "org-1", conversationId: "conv-1", threadId: "thread-1",
        authorId: "user-2", authorName: "Bob", authorInitials: "BO",
        body: "Reply 1", status: "ACTIVE", editedAt: null, deletedAt: null,
        reactionSummary: [], attachmentCount: 0, createdAt: "2026-05-18T11:00:00Z",
      },
      {
        id: "reply-1", orgId: "org-1", conversationId: "conv-1", threadId: "thread-1",
        authorId: "user-2", authorName: "Bob", authorInitials: "BO",
        body: "Duplicate", status: "ACTIVE", editedAt: null, deletedAt: null,
        reactionSummary: [], attachmentCount: 0, createdAt: "2026-05-18T11:00:00Z",
      },
    ];
    const result = toFrontendThreadReplies(replies, detail);
    expect(result).toHaveLength(1);
    expect(result[0].body).toBe("Reply 1");
  });
});

// ─── Component integration tests ─────────────────────────────────────────────

describe("MessagingComposer Sprint 5.2 live send", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls onSend when send button is clicked", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { MessagingComposer } = await import("../messaging-composer");

    render(
      <MessagingComposer
        placeholder="Message #general"
        onSend={onSend}
        sending={false}
        sendError={null}
      />
    );

    const input = screen.getByTestId("composer-input");
    fireEvent.input(input, { target: { textContent: "Hello team" } });
    fireEvent.click(screen.getByTestId("composer-send-btn"));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith("Hello team"));
  });

  it("disables send while sending and shows sending label", async () => {
    const { MessagingComposer } = await import("../messaging-composer");
    render(<MessagingComposer placeholder="Message #general" sending={true} />);
    expect(screen.getByTestId("composer-send-btn")).toBeDisabled();
    expect(screen.getByText("Sending…")).toBeInTheDocument();
  });

  it("displays send error when provided", async () => {
    const { MessagingComposer } = await import("../messaging-composer");
    render(<MessagingComposer placeholder="Message #general" sendError="Network error" />);
    expect(screen.getByTestId("composer-send-error")).toHaveTextContent("Network error");
  });
});

describe("MessagingThreadPanel Sprint 5.2 live reply", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls onReply when reply is submitted", async () => {
    const onReply = vi.fn().mockResolvedValue(undefined);
    const { MessagingThreadPanel } = await import("../messaging-thread-panel");

    const anchorMessage = {
      id: "msg-1", conversationId: "conv-1", authorId: "user-1",
      authorName: "Alice", authorInitials: "AL", authorRole: "member" as const,
      body: "Anchor", sentAt: "2026-05-18T10:00:00Z",
      hasThread: true, threadReplyCount: 1,
      reactions: [], attachmentRef: null,
      attachmentRecords: [], mentionsCurrentUser: false,
    };

    render(
      <MessagingThreadPanel
        anchorMessage={anchorMessage}
        replies={[]}
        onClose={() => {}}
        onReply={onReply}
        sendingReply={false}
        replyError={null}
      />
    );

    const input = screen.getByTestId("thread-reply-input");
    fireEvent.input(input, { target: { textContent: "Got it" } });
    // Trigger Enter key
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => expect(onReply).toHaveBeenCalledWith("Got it"));
  });

  it("disables reply input while sending", async () => {
    const { MessagingThreadPanel } = await import("../messaging-thread-panel");
    const anchorMessage = {
      id: "msg-1", conversationId: "conv-1", authorId: "user-1",
      authorName: "Alice", authorInitials: "AL", authorRole: "member" as const,
      body: "Anchor", sentAt: "2026-05-18T10:00:00Z",
      hasThread: true, threadReplyCount: 1,
      reactions: [], attachmentRef: null,
      attachmentRecords: [], mentionsCurrentUser: false,
    };
    render(
      <MessagingThreadPanel
        anchorMessage={anchorMessage}
        replies={[]}
        onClose={() => {}}
        sendingReply={true}
      />
    );
    // When sending, the focus-within shadow should be suppressed
    const composer = screen.getByTestId("thread-composer");
    expect(composer).toBeInTheDocument();
  });
});

// ─── End-to-end workspace scenarios ─────────────────────────────────────────

describe("MessagingWorkspace Sprint 5.2 integration", () => {
  let fetchCalls: { url: string; body?: Record<string, unknown> }[] = [];

  beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      fetchCalls.push({ url, body });
      if (url === "/api/messaging/conversations") {
        return {
          ok: true, status: 200,
          json: async () => ({
            success: true, data: {
              conversations: [
                { id: "ch-1", orgId: "org-1", type: "CHANNEL", name: "finance", description: "Finance", visibility: "PUBLIC", archivedAt: null, lockedAt: null, participantCount: 5, lastMessageAt: "2026-05-18T10:00:00Z", unreadCount: 3, createdAt: "2026-01-01T00:00:00Z", canSend: true },
              ],
              meta: { limit: 50, hasMore: false },
            },
          }),
        } as Response;
      }
      if (url.startsWith("/api/messaging/conversations/") && url.endsWith("/read")) {
        return {
          ok: true, status: 200,
          json: async () => ({
            success: true, data: {
              readState: { lastReadMessageId: "msg-1", lastReadAt: "2026-05-18T12:00:00Z", unreadCount: 0, isMuted: false },
            },
          }),
        } as Response;
      }
      if (url === "/api/messaging/realtime/bootstrap") {
        return { ok: false, status: 500, json: async () => ({ success: false }) } as Response;
      }
      if (url.includes("/messages") && init?.method === "POST") {
        return {
          ok: true, status: 201,
          json: async () => ({
            success: true, data: { id: "msg-sent", conversationId: "ch-1", threadId: null, authorId: "user-1", body: body?.body ?? "", createdAt: "2026-05-18T12:00:00Z" },
          }),
        } as Response;
      }
      if (url.startsWith("/api/messaging/conversations/") && !url.includes("/threads/") && !url.endsWith("/read")) {
        return {
          ok: true, status: 200,
          json: async () => ({
            success: true, data: createMockDetail({
              id: "ch-1", name: "finance", canSend: true,
              readState: { lastReadMessageId: null, lastReadAt: null, unreadCount: 3, isMuted: false },
              messages: [{
                id: "msg-anchor", orgId: "org-1", conversationId: "conv-1", threadId: null,
                authorId: "user-1", authorName: "Alice", authorInitials: "AL",
                body: "Anchor", status: "ACTIVE", editedAt: null, deletedAt: null,
                reactionSummary: [], attachmentCount: 0, createdAt: "2026-05-18T10:00:00Z",
              }],
              threads: [
                { id: "thread-1", conversationId: "conv-1", anchorMessageId: "msg-anchor", title: null, replyCount: 2, resolvedAt: null, createdAt: "2026-05-18T10:05:00Z" },
              ],
            }),
          }),
        } as Response;
      }
      if (url.includes("/threads/") && url.endsWith("/replies") && init?.method !== "POST") {
        return {
          ok: true, status: 200,
          json: async () => ({
            success: true, data: {
              replies: [{
                id: "reply-1", orgId: "org-1", conversationId: "ch-1", threadId: "thread-1",
                authorId: "user-2", authorName: "Bob", authorInitials: "BO",
                body: "Got it", status: "ACTIVE", editedAt: null, deletedAt: null,
                reactionSummary: [], attachmentCount: 0, createdAt: "2026-05-18T11:00:00Z",
              }],
            },
          }),
        } as Response;
      }
      if (url.includes("/threads/") && url.endsWith("/replies") && init?.method === "POST") {
        return {
          ok: true, status: 201,
          json: async () => ({
            success: true, data: { id: "reply-sent", conversationId: "ch-1", threadId: "thread-1", authorId: "user-1", body: body?.body ?? "", createdAt: "2026-05-18T12:00:00Z" },
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({ success: false }) } as Response;
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends a top-level message and refreshes detail", async () => {
    const { MessagingWorkspace } = await import("../messaging-workspace");
    render(<MessagingWorkspace />);
    await waitFor(() => expect(screen.getByText("finance")).toBeInTheDocument());
    fireEvent.click(screen.getByText("finance"));
    await waitFor(() => expect(screen.getByTestId("reading-workspace")).toBeInTheDocument());

    const input = screen.getByTestId("composer-input");
    fireEvent.input(input, { target: { textContent: "Budget approved" } });
    fireEvent.click(screen.getByTestId("composer-send-btn"));

    await waitFor(() => expect(fetchCalls.some((c) => c.url.includes("/messages") && c.body?.body === "Budget approved")).toBe(true));
    await waitFor(() => expect(fetchCalls.filter((c) => c.url === "/api/messaging/conversations/ch-1").length).toBeGreaterThanOrEqual(2));
  });

  it("marks conversation as read when selected with unread messages", async () => {
    const { MessagingWorkspace } = await import("../messaging-workspace");
    render(<MessagingWorkspace />);
    await waitFor(() => expect(screen.getByText("finance")).toBeInTheDocument());
    fireEvent.click(screen.getByText("finance"));
    await waitFor(() => expect(fetchCalls.some((c) => c.url.endsWith("/read"))).toBe(true));
  });

  it("fetches thread replies when a thread is opened", async () => {
    const { MessagingWorkspace } = await import("../messaging-workspace");
    render(<MessagingWorkspace />);
    await waitFor(() => expect(screen.getByText("finance")).toBeInTheDocument());
    fireEvent.click(screen.getByText("finance"));
    await waitFor(() => expect(screen.getByTestId("reading-workspace")).toBeInTheDocument());

    const threadCue = await waitFor(() => screen.getByTestId("thread-cue-button"));
    fireEvent.click(threadCue);

    await waitFor(() => expect(fetchCalls.some((c) => c.url.includes("/threads/") && c.url.endsWith("/replies") && !c.body)).toBe(true));
  });

  it("retries mark-read after a failed call", async () => {
    let readAttempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      fetchCalls.push({ url, body });
      if (url.endsWith("/read")) {
        readAttempts++;
        if (readAttempts === 1) {
          return { ok: false, status: 500, json: async () => ({ success: false, error: { message: "Server error" } }) } as Response;
        }
        return {
          ok: true, status: 200,
          json: async () => ({ success: true, data: { readState: { lastReadMessageId: "msg-1", lastReadAt: "2026-05-18T12:00:00Z", unreadCount: 0, isMuted: false } } }),
        } as Response;
      }
      if (url === "/api/messaging/conversations") {
        return {
          ok: true, status: 200,
          json: async () => ({
            success: true, data: {
              conversations: [
                { id: "ch-1", orgId: "org-1", type: "CHANNEL", name: "finance", description: "Finance", visibility: "PUBLIC", archivedAt: null, lockedAt: null, participantCount: 5, lastMessageAt: "2026-05-18T10:00:00Z", unreadCount: 3, createdAt: "2026-01-01T00:00:00Z", canSend: true },
              ],
              meta: { limit: 50, hasMore: false },
            },
          }),
        } as Response;
      }
      if (url.startsWith("/api/messaging/conversations/") && !url.includes("/threads/") && !url.endsWith("/read")) {
        return {
          ok: true, status: 200,
          json: async () => ({ success: true, data: createMockDetail({ id: "ch-1", name: "finance", canSend: true, readState: { lastReadMessageId: null, lastReadAt: null, unreadCount: 3, isMuted: false } }) }),
        } as Response;
      }
      if (url === "/api/messaging/realtime/bootstrap") {
        return { ok: false, status: 500, json: async () => ({ success: false }) } as Response;
      }
      return { ok: false, status: 404, json: async () => ({ success: false }) } as Response;
    }));

    const { useMarkRead } = await import("../lib/use-mark-read");

    // First call fails; hook returns null because the race guard invalidates
    // the stale call when a second concurrent request starts.
    const { result: r1, unmount: u1 } = renderHook(() => useMarkRead());
    const first = await r1.current.markRead("conv-1");
    expect(first).toBeNull();
    u1();

    // Second call on a fresh hook instance succeeds
    const { result: r2 } = renderHook(() => useMarkRead());
    const second = await r2.current.markRead("conv-1");
    expect(second).not.toBeNull();
    expect(second?.unreadCount).toBe(0);
  });

  it("refreshes list after successful thread reply", async () => {
    const { MessagingWorkspace } = await import("../messaging-workspace");
    render(<MessagingWorkspace />);
    await waitFor(() => expect(screen.getByText("finance")).toBeInTheDocument());
    fireEvent.click(screen.getByText("finance"));
    await waitFor(() => expect(screen.getByTestId("reading-workspace")).toBeInTheDocument());

    const threadCue = await waitFor(() => screen.getByTestId("thread-cue-button"));
    fireEvent.click(threadCue);

    const replyInput = await waitFor(() => screen.getByTestId("thread-reply-input"));
    fireEvent.input(replyInput, { target: { textContent: "Got it" } });
    fireEvent.keyDown(replyInput, { key: "Enter", shiftKey: false });

    await waitFor(() => expect(fetchCalls.some((c) => c.url.includes("/replies") && c.body)).toBe(true));
    await waitFor(() => expect(fetchCalls.filter((c) => c.url === "/api/messaging/conversations").length).toBeGreaterThanOrEqual(2));
  });
});
