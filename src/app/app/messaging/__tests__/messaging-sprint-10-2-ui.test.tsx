import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import React from "react";

// Mock next/navigation
let mockSearchParamsGet = vi.fn().mockReturnValue(null);
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/messaging",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
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

import { MessagingWorkspace } from "../messaging-workspace";
import type { ApiConversationSummary, ApiConversationDetail } from "../lib/mappers";

function createMockSummary(overrides: Partial<ApiConversationSummary> = {}): ApiConversationSummary {
  return {
    id: "conv-portal-1",
    orgId: "org-1",
    type: "PORTAL",
    name: "Portal Customer",
    description: "Portal workspace",
    visibility: "PUBLIC",
    archivedAt: null,
    lockedAt: null,
    participantCount: 2,
    lastMessageAt: "2026-05-18T10:00:00Z",
    unreadCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    canSend: true,
    dmPeerId: null,
    dmPeerName: null,
    isPinned: false,
    portalState: "OPEN",
    linkedRecordType: "INVOICE",
    linkedRecordId: "inv_12345",
    customerId: "cust_999",
    assigneeId: "user-alice",
    ...overrides,
  };
}

function createMockDetail(overrides: Partial<ApiConversationDetail> = {}): ApiConversationDetail {
  return {
    id: "conv-portal-1",
    orgId: "org-1",
    type: "PORTAL",
    name: "Portal Customer",
    description: "Portal workspace",
    visibility: "PUBLIC",
    archivedAt: null,
    lockedAt: null,
    createdBy: "user-alice",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-05-18T10:00:00Z",
    participantCount: 2,
    canSend: true,
    portalState: "OPEN",
    linkedRecordType: "INVOICE",
    linkedRecordId: "inv_12345",
    customerId: "cust_999",
    assigneeId: "user-alice",
    participants: [
      { id: "part-1", orgId: "org-1", conversationId: "conv-portal-1", userId: "user-alice", role: "OWNER", isActive: true, isMuted: false, joinedAt: "2026-01-01T00:00:00Z", displayName: "Alice" },
      { id: "part-2", orgId: "org-1", conversationId: "conv-portal-1", userId: "client-bob", role: "MEMBER", isActive: true, isMuted: false, joinedAt: "2026-01-02T00:00:00Z", displayName: "Bob Client" },
    ],
    participantProfiles: [
      { userId: "user-alice", name: "Alice Operator", avatarInitials: "AO" },
      { userId: "client-bob", name: "Bob Client", avatarInitials: "BC" },
    ],
    messages: [
      {
        id: "msg-1",
        orgId: "org-1",
        conversationId: "conv-portal-1",
        threadId: null,
        authorId: "client-bob",
        authorName: "Bob Client",
        authorInitials: "BC",
        body: "Hello, I have a question about this invoice.",
        status: "ACTIVE",
        editedAt: null,
        deletedAt: null,
        reactionSummary: [],
        attachmentCount: 0,
        createdAt: "2026-05-18T10:00:00Z",
        audience: "EXTERNAL_VISIBLE",
      },
      {
        id: "msg-2",
        orgId: "org-1",
        conversationId: "conv-portal-1",
        threadId: null,
        authorId: "user-alice",
        authorName: "Alice Operator",
        authorInitials: "AO",
        body: "Alice's internal operator note.",
        status: "ACTIVE",
        editedAt: null,
        deletedAt: null,
        reactionSummary: [],
        attachmentCount: 0,
        createdAt: "2026-05-18T10:05:00Z",
        audience: "INTERNAL_ONLY",
      },
    ],
    threads: [],
    readState: { lastReadMessageId: null, lastReadAt: null, unreadCount: 0, isMuted: false },
    currentUserId: "user-alice",
    ...overrides,
  };
}

describe("Sprint 10.2 UI Integration - Portal Workspace and Routing", () => {
  let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  let conversationList: ApiConversationSummary[] = [];

  beforeEach(() => {
    fetchCalls = [];
    mockSearchParamsGet.mockReturnValue(null);
    conversationList = [
      createMockSummary({ id: "conv-portal-1", type: "PORTAL", name: "Client A Portal" }),
    ];

    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      console.log("FETCH MOCK CALL:", url, init?.method || "GET");

      if (url === "/api/messaging/conversations" && (!init || init.method !== "POST")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { conversations: conversationList, meta: { limit: 50, hasMore: false } },
          }),
        } as Response;
      }

      if (url === "/api/messaging/org-members?q=") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              members: [
                { id: "user-alice", name: "Alice Operator", avatarInitials: "AO", orgRole: "OWNER" },
                { id: "user-charlie", name: "Charlie Staff", avatarInitials: "CS", orgRole: "MEMBER" },
              ],
            },
          }),
        } as Response;
      }

      const urlPath = url.split("?")[0];

      if (urlPath.includes("/api/messaging/conversations/") && (!init || !init.method || init.method === "GET")) {
        const id = urlPath.split("/").pop();
        const conv = conversationList.find((c) => c.id === id);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: createMockDetail({
              id,
              name: conv?.name ?? "Portal Customer",
              portalState: conv?.portalState ?? "OPEN",
              assigneeId: conv?.assigneeId ?? null,
            }),
          }),
        } as Response;
      }

      if (urlPath.includes("/api/messaging/conversations/") && init?.method === "PATCH") {
        const id = urlPath.split("/").pop();
        const body = JSON.parse(init.body as string);
        const idx = conversationList.findIndex((c) => c.id === id);
        if (idx !== -1) {
          if ("portalState" in body) {
            conversationList[idx].portalState = body.portalState;
          }
          if ("assigneeId" in body) {
            conversationList[idx].assigneeId = body.assigneeId;
          }
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: conversationList[idx],
          }),
        } as Response;
      }

      if (url === "/api/messaging/conversations" && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        const newPortal = createMockSummary({
          id: `new-portal-${body.customerId}`,
          type: "PORTAL",
          customerId: body.customerId,
          linkedRecordType: body.linkedRecordType ?? null,
          linkedRecordId: body.linkedRecordId ?? null,
          portalState: "OPEN",
        });
        conversationList.push(newPortal);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: newPortal,
          }),
        } as Response;
      }

      if (url.endsWith("/messages") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              id: "new-msg-123",
              body: body.body,
              audience: body.audience ?? "EXTERNAL_VISIBLE",
              createdAt: new Date().toISOString(),
            },
          }),
        } as Response;
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ success: false, error: { message: "Not found" } }),
      } as Response;
    }));
  });

  it("filters and lists portal conversations in the left rail separate section", async () => {
    render(<MessagingWorkspace />);

    // Wait for conversations list loading
    await waitFor(() => {
      expect(screen.getByTestId("messaging-section-portals")).toBeInTheDocument();
    });

    // Switch to portals section
    fireEvent.click(screen.getByTestId("messaging-section-portals"));

    // Check list renders Client A Portal row
    await waitFor(() => {
      expect(screen.getByTestId("portal-row-conv-portal-1")).toBeInTheDocument();
    });

    expect(screen.getByText("Client A Portal")).toBeInTheDocument();
  });

  it("renders portal conversation details, external messages and internal notes truthfully", async () => {
    render(<MessagingWorkspace />);

    // Switch to portals section and select row
    fireEvent.click(screen.getByTestId("messaging-section-portals"));

    await waitFor(() => {
      fireEvent.click(screen.getByTestId("portal-row-conv-portal-1"));
    });

    // Verify workspace mounts portal details
    await waitFor(() => {
      try {
        expect(screen.getByTestId("portal-workspace")).toBeInTheDocument();
        expect(screen.getByTestId("portal-context-bar")).toBeInTheDocument();
      } catch (e) {
        screen.debug(undefined, 100000);
        throw e;
      }
    });

    // Check header displays state
    expect(screen.getByTestId("header-portal-state")).toHaveTextContent("OPEN");

    // Check feed renders both messages
    expect(screen.getByText("Hello, I have a question about this invoice.")).toBeInTheDocument();
    expect(screen.getByText("Alice's internal operator note.")).toBeInTheDocument();

    // Verify internal note has "Internal Note" label badge
    expect(screen.getAllByText("Internal Note").length).toBeGreaterThanOrEqual(1);
  });

  it("supports composition path for internal notes and sends audience INTERNAL_ONLY", async () => {
    render(<MessagingWorkspace />);

    // Open portal conversation
    fireEvent.click(screen.getByTestId("messaging-section-portals"));
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("portal-row-conv-portal-1"));
    });

    // Find tab selectors
    await waitFor(() => {
      expect(screen.getByTestId("composer-tab-external")).toBeInTheDocument();
      expect(screen.getByTestId("composer-tab-internal")).toBeInTheDocument();
    });

    // Select Internal Note tab
    fireEvent.click(screen.getByTestId("composer-tab-internal"));

    // Verify amber border/styling is applied by matching class or state (composer-shell container styling)
    const composerShell = screen.getByTestId("composer-shell");
    expect(composerShell.className).toContain("border-amber-300");

    // Compose message
    const input = screen.getByTestId("composer-input");
    fireEvent.change(input, { target: { textContent: "This is a new internal staff note" } });
    // Manually trigger the value update as simulated by draft content
    fireEvent.input(input, { target: { textContent: "This is a new internal staff note" } });

    // Press send
    const sendBtn = screen.getByTestId("composer-send-btn");
    fireEvent.click(sendBtn);

    // Wait and check fetch parameters
    await waitFor(() => {
      const postMsgCall = fetchCalls.find((call) => call.url.endsWith("/messages") && call.init?.method === "POST");
      expect(postMsgCall).toBeDefined();
      const body = JSON.parse(postMsgCall!.init!.body as string);
      expect(body.audience).toBe("INTERNAL_ONLY");
    });
  });

  it("surfaces state mutation and assignment controls inside details panel", async () => {
    render(<MessagingWorkspace />);

    // Select conversation
    fireEvent.click(screen.getByTestId("messaging-section-portals"));
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("portal-row-conv-portal-1"));
    });

    // Open details panel
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("header-toggle-detail"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("portal-detail-panel")).toBeInTheDocument();
    });

    // Select new state "WAITING_ON_CLIENT"
    const stateSelect = screen.getByTestId("portal-state-select");
    fireEvent.change(stateSelect, { target: { value: "WAITING_ON_CLIENT" } });

    // Verify PATCH request to conversation with updated portalState
    await waitFor(() => {
      const patchCall = fetchCalls.find(
        (c) => c.url.includes("/api/messaging/conversations/conv-portal-1") && c.init?.method === "PATCH"
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall!.init!.body as string);
      expect(body.portalState).toBe("WAITING_ON_CLIENT");
    });

    // Select new assignee
    const assigneeSelect = screen.getByTestId("portal-assignee-select");
    fireEvent.change(assigneeSelect, { target: { value: "user-charlie" } });

    // Verify PATCH request with updated assigneeId
    await waitFor(() => {
      const patchCall = fetchCalls.filter(
        (c) => c.url.includes("/api/messaging/conversations/conv-portal-1") && c.init?.method === "PATCH"
      );
      expect(patchCall.length).toBeGreaterThan(1);
      const body = JSON.parse(patchCall[1].init!.body as string);
      expect(body.assigneeId).toBe("user-charlie");
    });
  });

  it("handles closed state by blocking composition and showing reopen control", async () => {
    // Set mock conversation as closed initially
    conversationList = [
      createMockSummary({ id: "conv-portal-1", type: "PORTAL", name: "Closed Portal", portalState: "CLOSED" }),
    ];

    render(<MessagingWorkspace />);

    // Select conversation
    fireEvent.click(screen.getByTestId("messaging-section-portals"));
    await waitFor(() => {
      fireEvent.click(screen.getByTestId("portal-row-conv-portal-1"));
    });

    // Verify closed banner is visible
    await waitFor(() => {
      expect(screen.getByTestId("portal-closed-banner")).toBeInTheDocument();
    });

    // Composer input should NOT be visible
    expect(screen.queryByTestId("composer-input")).not.toBeInTheDocument();

    // Reopen conversation
    const reopenBtn = screen.getByTestId("portal-reopen-button");
    fireEvent.click(reopenBtn);

    // Verify PATCH query sent with OPEN state
    await waitFor(() => {
      const patchCall = fetchCalls.find(
        (c) => c.url.includes("/api/messaging/conversations/conv-portal-1") && c.init?.method === "PATCH"
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall!.init!.body as string);
      expect(body.portalState).toBe("OPEN");
    });
  });

  it("triggers context-entrypoint auto-creation and routing if query parameters are set", async () => {
    // Inject search parameters customerId=cust_101&linkedRecordType=INVOICE&linkedRecordId=inv_789
    mockSearchParamsGet.mockImplementation((key) => {
      if (key === "customerId") return "cust_101";
      if (key === "linkedRecordType") return "INVOICE";
      if (key === "linkedRecordId") return "inv_789";
      return null;
    });

    render(<MessagingWorkspace />);

    // Wait for auto-creation POST call
    await waitFor(() => {
      const postCall = fetchCalls.find((c) => c.url === "/api/messaging/conversations" && c.init?.method === "POST");
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall!.init!.body as string);
      expect(body.customerId).toBe("cust_101");
      expect(body.linkedRecordType).toBe("INVOICE");
      expect(body.linkedRecordId).toBe("inv_789");
    });
  });
});
