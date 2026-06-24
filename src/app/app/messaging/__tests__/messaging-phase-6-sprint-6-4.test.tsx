import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

import { MessagingTaskPanel } from "../messaging-task-panel";

describe("Sprint 6.4 Frontend Integration — Global Tasks Workspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const mockGlobalTasks = [
    {
      id: "task-global-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Global Task 1",
      status: "OPEN",
      priority: "high",
      dueDate: "2026-06-15T00:00:00Z",
      assigneeId: "user-1",
      assigneeName: "Arjun Mehta",
      assigneeAvatarInitials: "AM",
      createdBy: "user-2",
      createdByName: "Priya Sharma",
      createdAt: "2026-05-20T10:00:00Z",
      description: "A task that is loaded globally.",
      originatingMessageId: "msg-1",
      conversationName: "engineering",
      conversationType: "CHANNEL",
    },
  ];

  const mockConversationsResponse = {
    conversations: [
      { id: "conv-1", type: "CHANNEL", name: "engineering", participantCount: 2, createdAt: "2026-05-20T10:00:00Z", canSend: true },
      { id: "conv-2", type: "DM", name: "DM user", dmPeerName: "Peer User", dmPeerId: "peer-1", participantCount: 2, createdAt: "2026-05-20T10:00:00Z", canSend: true },
    ]
  };

  const mockConvDetail = {
    id: "conv-1",
    orgId: "org-1",
    type: "CHANNEL",
    name: "engineering",
    description: "Engineering coordination",
    participants: [
      { id: "p-1", userId: "user-1", role: "admin", isActive: true },
      { id: "p-2", userId: "user-2", role: "owner", isActive: true },
    ],
    participantProfiles: [
      { userId: "user-1", name: "Arjun Mehta", avatarInitials: "AM" },
      { userId: "user-2", name: "Priya Sharma", avatarInitials: "PS" },
    ],
    messages: [],
    threads: [],
    readState: null,
    currentUserId: "user-2",
  };

  it("fetches from global /api/messaging/tasks and renders conversation badges in global view", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockGlobalTasks }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockConvDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const onNavigateSpy = vi.fn();

    // Render in global tasks mode (conversationId = null)
    render(<MessagingTaskPanel conversationId={null} onNavigateToOrigin={onNavigateSpy} />);

    // Verify it fetches global tasks url
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/messaging/tasks", expect.any(Object));
    });

    // Verify task row and its conversation tag is visible
    await waitFor(() => {
      expect(screen.getByText("Global Task 1")).toBeInTheDocument();
      expect(screen.getByText("#engineering")).toBeInTheDocument();
    });

    // Click the conversation badge to verify navigation shortcut triggers
    const badge = screen.getByTestId("task-conv-badge-task-global-1");
    fireEvent.click(badge);
    expect(onNavigateSpy).toHaveBeenCalledWith("conv-1", "msg-1");
  });

  it("renders conversation details and dynamic participants fetch inside TaskDetailPanel in global mode", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockGlobalTasks }),
        });
      }
      if (url.includes("/api/messaging/conversations/conv-1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockConvDetail }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: {} }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<MessagingTaskPanel conversationId={null} onNavigateToOrigin={() => {}} />);

    // Click global task row to open detail view
    await waitFor(() => {
      expect(screen.getByText("Global Task 1")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("task-row-task-global-1"));

    // Verify TaskDetailPanel loads and fetches conversation details for editing participants dynamically
    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
      expect(fetchSpy).toHaveBeenCalledWith("/api/messaging/conversations/conv-1", expect.any(Object));
    });

    // Verify go-to conversation link renders in the detail view
    expect(screen.getByTestId("task-detail-conv-link")).toBeInTheDocument();
    expect(screen.getByText("Go to #engineering")).toBeInTheDocument();
  });

  it("shows conversation picker and dynamically updates assignee picker when creating a task globally", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [] }),
        });
      }
      if (url.includes("/api/messaging/conversations") && !url.includes("conv-1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockConversationsResponse }),
        });
      }
      if (url.includes("/api/messaging/conversations/conv-1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockConvDetail }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: {} }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<MessagingTaskPanel conversationId={null} />);

    // Click "New" task button
    await waitFor(() => {
      expect(screen.getByTestId("task-panel-new-btn")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("task-panel-new-btn"));

    // Verify creation modal loads
    await waitFor(() => {
      expect(screen.getByTestId("task-create-modal")).toBeInTheDocument();
    });

    // Verify conversation select dropdown renders
    const convSelect = screen.getByTestId("task-create-conversation-select") as HTMLSelectElement;
    expect(convSelect).toBeInTheDocument();

    // Select "conv-1" (#engineering)
    fireEvent.change(convSelect, { target: { value: "conv-1" } });

    // Verify it fetches selected conversation participants dynamically
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/messaging/conversations/conv-1", expect.any(Object));
    });

    // Verify assignee select dropdown updates with newly fetched members
    await waitFor(() => {
      const assigneePicker = screen.getByTestId("task-assignee-picker");
      expect(assigneePicker).toBeInTheDocument();
      expect(screen.getByText("Arjun Mehta")).toBeInTheDocument();
      expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    });
  });
});
