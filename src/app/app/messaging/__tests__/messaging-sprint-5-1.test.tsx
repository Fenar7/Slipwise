import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
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

import { useConversationList } from "../lib/use-conversation-list";
import { useConversationDetail } from "../lib/use-conversation-detail";
import { useRealtimeBootstrap } from "../lib/use-realtime-bootstrap";
import {
  toFrontendChannel, toFrontendDM, toFrontendGroup,
  toActiveConversation, toFrontendMessages,
} from "../lib/mappers";
import type { ApiConversationSummary, ApiConversationDetail } from "../lib/mappers";
import { MessagingWorkspace } from "../messaging-workspace";
import { MessagingReadingWorkspace } from "../messaging-reading-workspace";

function createMockSummary(overrides: Partial<ApiConversationSummary> = {}): ApiConversationSummary {
  return {
    id: "conv-1", orgId: "org-1", type: "CHANNEL", name: "general",
    description: "Team chat", visibility: "PUBLIC", archivedAt: null,
    lockedAt: null, participantCount: 5, lastMessageAt: "2026-05-18T10:00:00Z",
    unreadCount: 3, createdAt: "2026-01-01T00:00:00Z", canSend: true,
    dmPeerId: null, dmPeerName: null, isPinned: false, ...overrides,
  };
}

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
    ...overrides,
  };
}

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300, status,
    json: () => Promise.resolve(response),
  } as Response);
}

describe("useConversationList", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch({
      success: true, data: {
        conversations: [
          createMockSummary({ id: "ch-1", type: "CHANNEL", name: "finance" }),
          createMockSummary({ id: "dm-1", type: "DM", name: null, dmPeerName: "Bob", dmPeerId: "user-bob" }),
          createMockSummary({ id: "grp-1", type: "GROUP", name: "Q2 Planning" }),
        ],
        meta: { limit: 50, hasMore: false },
      },
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("categorises channels, dms, and groups", async () => {
    function Wrapper() {
      const { channels, dms, groups, loading } = useConversationList();
      return (
        <div>
          <span data-testid="loading">{loading ? "yes" : "no"}</span>
          <span data-testid="channels">{channels.length}</span>
          <span data-testid="dms">{dms.length}</span>
          <span data-testid="groups">{groups.length}</span>
        </div>
      );
    }
    render(<Wrapper />);
    expect(screen.getByTestId("loading").textContent).toBe("yes");
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("no"));
    expect(screen.getByTestId("channels").textContent).toBe("1");
    expect(screen.getByTestId("dms").textContent).toBe("1");
    expect(screen.getByTestId("groups").textContent).toBe("1");
  });

  it("surfaces empty when no conversations returned", async () => {
    vi.stubGlobal("fetch", mockFetch({
      success: true, data: { conversations: [], meta: { limit: 50, hasMore: false } },
    }));
    function Wrapper() {
      const { empty, loading } = useConversationList();
      return <span data-testid="empty">{!loading && empty ? "yes" : "no"}</span>;
    }
    render(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId("empty").textContent).toBe("yes"));
  });

  it("surfaces error when fetch fails", async () => {
    vi.stubGlobal("fetch", mockFetch({
      success: false, error: { code: "ERR", message: "Network down" },
    }, 500));
    function Wrapper() {
      const { error, loading } = useConversationList();
      return <span data-testid="error">{!loading && error ? error : "none"}</span>;
    }
    render(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("Network down"));
  });
});

describe("useConversationDetail", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch({ success: true, data: createMockDetail() }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("loads detail and messages", async () => {
    function Wrapper({ id }: { id: string | null }) {
      const { detail, loading } = useConversationDetail(id);
      return (
        <div>
          <span data-testid="loading">{loading ? "yes" : "no"}</span>
          <span data-testid="messages">{detail?.messages.length ?? 0}</span>
        </div>
      );
    }
    const { rerender } = render(<Wrapper id="conv-1" />);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("no"));
    expect(screen.getByTestId("messages").textContent).toBe("1");
    vi.stubGlobal("fetch", mockFetch({
      success: true, data: createMockDetail({ id: "conv-2", messages: [] }),
    }));
    rerender(<Wrapper id="conv-2" />);
    await waitFor(() => expect(screen.getByTestId("messages").textContent).toBe("0"));
  });

  it("returns restricted error on 404", async () => {
    vi.stubGlobal("fetch", mockFetch({
      success: false, error: { code: "NOT_FOUND", message: "Not found" },
    }, 404));
    function Wrapper() {
      const { errorType, loading } = useConversationDetail("conv-x");
      return <span data-testid="error">{!loading ? errorType : "loading"}</span>;
    }
    render(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("restricted"));
  });
});

describe("useRealtimeBootstrap", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sets ready when bootstrap succeeds", async () => {
    vi.stubGlobal("fetch", mockFetch({
      success: true, data: {
        sessionToken: "tok-1", expiresAt: Date.now() + 3600000,
        wsUrl: "wss://example.com/ws", sessionId: "sess-1",
        serverTime: Date.now(), capabilities: ["pubsub"],
      },
    }));
    function Wrapper() {
      const { ready, degraded, loading } = useRealtimeBootstrap();
      return (
        <div>
          <span data-testid="loading">{loading ? "yes" : "no"}</span>
          <span data-testid="ready">{ready ? "yes" : "no"}</span>
          <span data-testid="degraded">{degraded ? "yes" : "no"}</span>
        </div>
      );
    }
    render(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("no"));
    expect(screen.getByTestId("ready").textContent).toBe("yes");
    expect(screen.getByTestId("degraded").textContent).toBe("no");
  });

  it("sets degraded when bootstrap fails", async () => {
    vi.stubGlobal("fetch", mockFetch({
      success: false, error: { code: "ERR", message: "Bootstrap failed" },
    }, 500));
    function Wrapper() {
      const { degraded, loading } = useRealtimeBootstrap();
      return <span data-testid="degraded">{!loading && degraded ? "yes" : "no"}</span>;
    }
    render(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId("degraded").textContent).toBe("yes"));
  });
});

describe("mappers", () => {
  it("toFrontendChannel maps summary correctly", () => {
    const s = createMockSummary({ name: "finance", participantCount: 12, unreadCount: 4, isPinned: true });
    const ch = toFrontendChannel(s);
    expect(ch.id).toBe("conv-1");
    expect(ch.name).toBe("finance");
    expect(ch.memberCount).toBe(12);
    expect(ch.unreadCount).toBe(4);
    expect(ch.isPinned).toBe(true);
  });

  it("toFrontendDM uses peer name", () => {
    const s = createMockSummary({ type: "DM", name: null, dmPeerId: "user-bob", dmPeerName: "Bob" });
    const dm = toFrontendDM(s);
    expect(dm.participant.name).toBe("Bob");
    expect(dm.participant.avatarInitials).toBe("BO");
  });

  it("toFrontendGroup maps privacy flag", () => {
    const s = createMockSummary({ type: "GROUP", name: "Secret", visibility: "PRIVATE" });
    const g = toFrontendGroup(s);
    expect(g.name).toBe("Secret");
    expect(g.isPrivate).toBe(true);
  });

  it("toActiveConversation derives isAccessible from archivedAt and lockedAt", () => {
    const ok = toActiveConversation(createMockSummary({ archivedAt: null, lockedAt: null }), "channel");
    expect(ok.isAccessible).toBe(true);
    const archived = toActiveConversation(createMockSummary({ archivedAt: "2026-01-01T00:00:00Z" }), "channel");
    expect(archived.isAccessible).toBe(false);
    const locked = toActiveConversation(createMockSummary({ lockedAt: "2026-01-01T00:00:00Z" }), "channel");
    expect(locked.isAccessible).toBe(false);
  });

  it("toFrontendMessages maps author and reactions", () => {
    const detail = createMockDetail({
      messages: [{
        id: "msg-1", orgId: "org-1", conversationId: "conv-1", threadId: null,
        authorId: "user-1", authorName: "Alice", authorInitials: "AL", body: "Hi",
        status: "ACTIVE", editedAt: null, deletedAt: null,
        reactionSummary: [{ value: "👍", count: 2, reactedByCurrentUser: true }],
        attachmentCount: 1, createdAt: "2026-05-18T10:00:00Z",
      }],
    });
    const msgs = toFrontendMessages(detail);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].authorName).toBe("Alice");
    expect(msgs[0].reactions[0].emoji).toBe("👍");
    expect(msgs[0].attachmentRef).toBe("1 attachment");
  });
});

describe("MessagingWorkspace integration (Sprint 5.1)", () => {
  let fetchCalls: string[] = [];
  beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push(url);
      if (url === "/api/messaging/conversations") {
        return {
          ok: true, status: 200,
          json: async () => ({
            success: true, data: {
              conversations: [
                createMockSummary({ id: "ch-1", type: "CHANNEL", name: "finance", unreadCount: 2 }),
                createMockSummary({ id: "dm-1", type: "DM", name: null, dmPeerName: "Bob", dmPeerId: "user-bob", unreadCount: 1 }),
                createMockSummary({ id: "grp-1", type: "GROUP", name: "Q2", unreadCount: 0 }),
                createMockSummary({ id: "ch-arch", type: "CHANNEL", name: "old-proj", archivedAt: "2026-01-01T00:00:00Z", unreadCount: 0 }),
                createMockSummary({ id: "ch-lock", type: "CHANNEL", name: "announce", lockedAt: "2026-01-01T00:00:00Z", unreadCount: 0 }),
              ],
              meta: { limit: 50, hasMore: false },
            },
          }),
        } as Response;
      }
      if (url.startsWith("/api/messaging/conversations/")) {
        const id = url.split("/").pop();
        if (id === "ch-1") {
          return {
            ok: true, status: 200,
            json: async () => ({
              success: true, data: createMockDetail({ id: "ch-1", name: "finance", messages: [
                {
                  id: "msg-1", orgId: "org-1", conversationId: "ch-1", threadId: null,
                  authorId: "user-1", authorName: "Alice", authorInitials: "AL",
                  body: "Budget approved", status: "ACTIVE", editedAt: null, deletedAt: null,
                  reactionSummary: [], attachmentCount: 0, createdAt: "2026-05-18T10:00:00Z",
                },
              ]}),
            }),
          } as Response;
        }
        if (id === "ch-arch") {
          return {
            ok: true, status: 200,
            json: async () => ({
              success: true, data: createMockDetail({ id: "ch-arch", name: "old-proj", archivedAt: "2026-01-01T00:00:00Z", messages: [] }),
            }),
          } as Response;
        }
        if (id === "ch-lock") {
          return {
            ok: true, status: 200,
            json: async () => ({
              success: true, data: createMockDetail({ id: "ch-lock", name: "announce", lockedAt: "2026-01-01T00:00:00Z", messages: [] }),
            }),
          } as Response;
        }
        if (id === "ch-restricted") {
          return {
            ok: false, status: 404,
            json: async () => ({ success: false, error: { code: "NOT_FOUND", message: "Not found" } }),
          } as Response;
        }
        return {
          ok: true, status: 200,
          json: async () => ({ success: true, data: createMockDetail({ id: id! }) }),
        } as Response;
      }
      if (url === "/api/messaging/realtime/bootstrap") {
        return {
          ok: false, status: 500,
          json: async () => ({ success: false, error: { code: "ERR", message: "No realtime" } }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders real channel rows with unread counts", async () => {
    render(<MessagingWorkspace />);
    await waitFor(() => expect(screen.getByText("finance")).toBeInTheDocument());
    const listColumn = screen.getByTestId("conversation-list-column");
    expect(within(listColumn).getByLabelText("2 unread")).toBeInTheDocument();
  });

  it("clicking a channel triggers detail fetch and renders messages", async () => {
    render(<MessagingWorkspace />);
    await waitFor(() => expect(screen.getByText("finance")).toBeInTheDocument());
    fireEvent.click(screen.getByText("finance"));
    await waitFor(() => expect(screen.getByText("Budget approved")).toBeInTheDocument());
    expect(fetchCalls.some((u) => u.includes("/api/messaging/conversations/ch-1"))).toBe(true);
  });

  it("renders degraded banner when realtime bootstrap fails", async () => {
    render(<MessagingWorkspace />);
    await waitFor(() => expect(screen.getByTestId("workspace-degraded-banner")).toBeInTheDocument());
  });

  it("renders archived state for archived conversation", async () => {
    render(<MessagingWorkspace />);
    await waitFor(() => expect(screen.getByText("old-proj")).toBeInTheDocument());
    fireEvent.click(screen.getByText("old-proj"));
    await waitFor(() => expect(screen.getByTestId("reading-workspace-archived")).toBeInTheDocument());
  });

  it("renders locked state for locked conversation", async () => {
    render(<MessagingWorkspace />);
    await waitFor(() => expect(screen.getByText("announce")).toBeInTheDocument());
    fireEvent.click(screen.getByText("announce"));
    await waitFor(() => expect(screen.getByTestId("reading-workspace-locked")).toBeInTheDocument());
  });

  it("renders empty-org state when org has no conversations", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/messaging/conversations") {
        return {
          ok: true, status: 200,
          json: async () => ({ success: true, data: { conversations: [], meta: { limit: 50, hasMore: false } } }),
        } as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    }));
    render(<MessagingWorkspace />);
    await waitFor(() => expect(screen.getByText("No conversations yet")).toBeInTheDocument());
  });
});

describe("MessagingReadingWorkspace state rendering", () => {
  it("shows no-selection when conversation is null", () => {
    render(<MessagingReadingWorkspace conversation={null} />);
    expect(screen.getByTestId("reading-workspace-no-selection")).toBeInTheDocument();
  });

  it("shows archived state", () => {
    const conv = toActiveConversation(createMockSummary({ archivedAt: "2026-01-01T00:00:00Z" }), "channel");
    render(<MessagingReadingWorkspace conversation={conv} />);
    expect(screen.getByTestId("reading-workspace-archived")).toBeInTheDocument();
  });

  it("shows locked state", () => {
    const conv = toActiveConversation(createMockSummary({ lockedAt: "2026-01-01T00:00:00Z" }), "channel");
    render(<MessagingReadingWorkspace conversation={conv} />);
    expect(screen.getByTestId("reading-workspace-locked")).toBeInTheDocument();
  });

  it("shows restricted state when isAccessible is false", () => {
    const conv = toActiveConversation(createMockSummary({}), "channel");
    conv.isAccessible = false;
    render(<MessagingReadingWorkspace conversation={conv} />);
    expect(screen.getByTestId("reading-workspace-restricted")).toBeInTheDocument();
  });

  it("shows degraded banner when degraded prop is true", () => {
    const conv = toActiveConversation(createMockSummary({}), "channel");
    render(<MessagingReadingWorkspace conversation={conv} degraded />);
    expect(screen.getByTestId("workspace-degraded-banner")).toBeInTheDocument();
  });
});
