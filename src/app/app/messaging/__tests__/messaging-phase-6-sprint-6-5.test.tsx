import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

import { MessagingTaskPanel } from "../messaging-task-panel";
import { MessagingTaskCreate } from "../messaging-task-create";

describe("Sprint 6.5 — Closeout Hardening", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const mockTask = {
    id: "task-1",
    orgId: "org-1",
    conversationId: "conv-1",
    title: "Hardened Task",
    status: "OPEN",
    priority: "high",
    dueDate: null,
    assigneeId: null,
    assigneeName: null,
    assigneeAvatarInitials: null,
    createdBy: "user-1",
    createdByName: "Alice",
    createdAt: "2026-05-20T10:00:00Z",
    description: "A task for hardening.",
    originatingMessageId: null,
    conversationName: "general",
    conversationType: "CHANNEL",
  };

  const mockTaskWithOrigin = {
    ...mockTask,
    id: "task-2",
    title: "Task with origin",
    originatingMessageId: "msg-42",
  };

  const mockConvDetail = {
    id: "conv-1",
    orgId: "org-1",
    type: "CHANNEL",
    name: "general",
    description: "General chat",
    participants: [],
    participantProfiles: [],
    messages: [],
    threads: [],
    readState: null,
    currentUserId: "user-1",
    canSend: true,
    archivedAt: null,
    lockedAt: null,
  };

  const mockArchivedConvDetail = {
    ...mockConvDetail,
    archivedAt: "2026-05-21T00:00:00Z",
    lockedAt: null,
  };

  const mockLockedConvDetail = {
    ...mockConvDetail,
    archivedAt: null,
    lockedAt: "2026-05-21T00:00:00Z",
  };

  const mockConversationsResponse = {
    conversations: [
      { id: "conv-1", type: "CHANNEL", name: "general", archivedAt: null, lockedAt: null, canSend: true, participantCount: 2, createdAt: "2026-05-20T10:00:00Z" },
      { id: "conv-2", type: "CHANNEL", name: "archived-channel", archivedAt: "2026-05-21T00:00:00Z", lockedAt: null, canSend: true, participantCount: 2, createdAt: "2026-05-20T10:00:00Z" },
      { id: "conv-3", type: "CHANNEL", name: "locked-channel", archivedAt: null, lockedAt: "2026-05-21T00:00:00Z", canSend: true, participantCount: 2, createdAt: "2026-05-20T10:00:00Z" },
      { id: "conv-4", type: "DM", name: "read-only-dm", archivedAt: null, lockedAt: null, canSend: false, participantCount: 2, createdAt: "2026-05-20T10:00:00Z", dmPeerName: "Bob" },
    ],
  };

  // ─── Type Contract ─────────────────────────────────────────────────────────

  it("renders conversationName and conversationType truthfully without unsafe casts", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTask] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockConvDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<MessagingTaskPanel conversationId="conv-1" onNavigateToOrigin={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Hardened Task")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("task-row-task-1"));

    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    });

    expect(screen.getByText("Go to #general")).toBeInTheDocument();
  });

  // ─── Navigation Contract ─────────────────────────────────────────────────────

  it("calls onNavigateToOrigin with null messageId when originatingMessageId is absent", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTask] }),
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
    render(<MessagingTaskPanel conversationId="conv-1" onNavigateToOrigin={onNavigateSpy} />);

    await waitFor(() => {
      expect(screen.getByText("Hardened Task")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("task-row-task-1"));

    await waitFor(() => {
      expect(screen.getByTestId("task-detail-conv-link")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("task-detail-conv-link"));
    expect(onNavigateSpy).toHaveBeenCalledWith("conv-1", null);
  });

  it("calls onNavigateToOrigin with actual messageId when originatingMessageId is present", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTaskWithOrigin] }),
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
    render(<MessagingTaskPanel conversationId="conv-1" onNavigateToOrigin={onNavigateSpy} />);

    await waitFor(() => {
      expect(screen.getByText("Task with origin")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("task-row-task-2"));

    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("task-origin-link"));
    expect(onNavigateSpy).toHaveBeenCalledWith("conv-1", "msg-42");
  });

  // ─── Task Create — Invalid Target Filtering ──────────────────────────────────

  it("filters out archived, locked, and non-sendable conversations from task create picker", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/messaging/conversations") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockConversationsResponse }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: {} }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <MessagingTaskCreate
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("task-create-modal")).toBeInTheDocument();
    });

    const convSelect = screen.getByTestId("task-create-conversation-select") as HTMLSelectElement;
    const options = Array.from(convSelect.options).map((o) => o.text);

    expect(options).toContain("#general");
    expect(options).not.toContain("#archived-channel");
    expect(options).not.toContain("#locked-channel");
    expect(options).not.toContain("DM: Bob");
  });

  // ─── Restricted / Member-Removed ─────────────────────────────────────────────

  it("shows restricted state and clears any selected task when conversation is restricted", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTask] }),
        });
      }
      if (url.includes("/api/messaging/conversations/conv-1")) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ success: false, error: { message: "Not found", code: "NOT_FOUND" } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: {} }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<MessagingTaskPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText("Access Restricted")).toBeInTheDocument();
      expect(screen.getByText("You no longer have access to this conversation. Task information is unavailable.")).toBeInTheDocument();
    });
  });

  // ─── Archived / Locked Read-Only ─────────────────────────────────────────────

  it("shows archived banner and disables mutations when conversation is archived", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTask] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockArchivedConvDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<MessagingTaskPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText("Hardened Task")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("task-row-task-1"));

    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
      expect(screen.getByTestId("task-detail-readonly-banner")).toBeInTheDocument();
      expect(screen.getByText(/This conversation is archived\. Task details are read-only\./)).toBeInTheDocument();
    });

    expect(screen.queryByTestId("task-mark-done")).not.toBeInTheDocument();
    expect(screen.queryByTestId("task-detail-edit")).not.toBeInTheDocument();
  });

  it("shows locked banner and disables mutations when conversation is locked", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTask] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockLockedConvDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<MessagingTaskPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText("Hardened Task")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("task-row-task-1"));

    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
      expect(screen.getByTestId("task-detail-readonly-banner")).toBeInTheDocument();
      expect(screen.getByText(/This conversation is locked\. Task details are read-only\./)).toBeInTheDocument();
    });

    expect(screen.queryByTestId("task-mark-done")).not.toBeInTheDocument();
    expect(screen.queryByTestId("task-detail-edit")).not.toBeInTheDocument();
  });

  // ─── State Coherence — selectedTaskId reset ──────────────────────────────────

  it("resets selected task when conversationId prop changes", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTask] }),
        });
      }
      if (url.includes("/api/messaging/conversations/conv-2/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockConvDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { rerender } = render(<MessagingTaskPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText("Hardened Task")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("task-row-task-1"));

    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    });

    // Switch to a different conversation
    rerender(<MessagingTaskPanel conversationId="conv-2" />);

    await waitFor(() => {
      expect(screen.queryByTestId("task-detail-panel")).not.toBeInTheDocument();
    });
  });

  // ─── Global Mode — Archived / Locked Read-Only ───────────────────────────────

  it("shows read-only banner for global task selected from archived conversation", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTask] }),
        });
      }
      if (url.includes("/api/messaging/conversations/conv-1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockArchivedConvDetail }),
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

    await waitFor(() => {
      expect(screen.getByText("Hardened Task")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("task-row-task-1"));

    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
      expect(screen.getByTestId("task-detail-readonly-banner")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("task-mark-done")).not.toBeInTheDocument();
    expect(screen.queryByTestId("task-detail-edit")).not.toBeInTheDocument();
  });

  it("shows read-only banner for global task selected from locked conversation", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTask] }),
        });
      }
      if (url.includes("/api/messaging/conversations/conv-1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockLockedConvDetail }),
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

    await waitFor(() => {
      expect(screen.getByText("Hardened Task")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("task-row-task-1"));

    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
      expect(screen.getByTestId("task-detail-readonly-banner")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("task-mark-done")).not.toBeInTheDocument();
    expect(screen.queryByTestId("task-detail-edit")).not.toBeInTheDocument();
  });

  it("shows restricted state for global task from inaccessible conversation", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTask] }),
        });
      }
      if (url.includes("/api/messaging/conversations/conv-1")) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ success: false, error: { message: "Not found", code: "NOT_FOUND" } }),
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

    await waitFor(() => {
      expect(screen.getByText("Hardened Task")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("task-row-task-1"));

    await waitFor(() => {
      expect(screen.queryByTestId("task-detail-panel")).not.toBeInTheDocument();
      expect(screen.getByText("Access Restricted")).toBeInTheDocument();
    });
  });

  // ─── Scoped Mode — New Button Hidden ───────────────────────────────────────────

  it("hides New button when scoped conversation is archived", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTask] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockArchivedConvDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<MessagingTaskPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText("Hardened Task")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("task-panel-new-btn")).not.toBeInTheDocument();
  });

  it("hides New button when scoped conversation is locked", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTask] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockLockedConvDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<MessagingTaskPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText("Hardened Task")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("task-panel-new-btn")).not.toBeInTheDocument();
  });

  // ─── MessagingTaskCreate Scoped Validation ───────────────────────────────────

  it("blocks submit and shows error when MessagingTaskCreate receives an archived scoped conversationId", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/conversations/conv-1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockArchivedConvDetail }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: {} }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <MessagingTaskCreate
        onClose={() => {}}
        onSuccess={() => {}}
        conversationId="conv-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/This conversation is archived/)).toBeInTheDocument();
    });

    const submitBtn = screen.getByTestId("task-create-submit");
    expect(submitBtn).toBeDisabled();
  });

  it("blocks submit and shows error when MessagingTaskCreate receives a locked scoped conversationId", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/conversations/conv-1")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockLockedConvDetail }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: {} }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <MessagingTaskCreate
        onClose={() => {}}
        onSuccess={() => {}}
        conversationId="conv-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/This conversation is locked/)).toBeInTheDocument();
    });

    const submitBtn = screen.getByTestId("task-create-submit");
    expect(submitBtn).toBeDisabled();
  });

  // ─── Regression — Sprint 6.2–6.4 behavior preserved ──────────────────────────

  it("navigates with non-null messageId then null without crashing or stale state", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTaskWithOrigin, mockTask] }),
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
    render(<MessagingTaskPanel conversationId="conv-1" onNavigateToOrigin={onNavigateSpy} />);

    await waitFor(() => {
      expect(screen.getByText("Task with origin")).toBeInTheDocument();
    });

    // First: navigate with non-null messageId
    fireEvent.click(screen.getByTestId("task-row-task-2"));
    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("task-origin-link"));
    expect(onNavigateSpy).toHaveBeenLastCalledWith("conv-1", "msg-42");

    // Go back
    fireEvent.click(screen.getByTestId("task-detail-back"));
    await waitFor(() => {
      expect(screen.queryByTestId("task-detail-panel")).not.toBeInTheDocument();
    });

    // Second: navigate with null messageId (different task without origin)
    fireEvent.click(screen.getByTestId("task-row-task-1"));
    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("task-detail-conv-link"));
    expect(onNavigateSpy).toHaveBeenLastCalledWith("conv-1", null);
  });

  it("preserves mark-as-done, edit, and assign functionality in normal state", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: [mockTask] }),
        });
      }
      if (url.includes("/api/messaging/conversations/conv-1/tasks/task-1") && !url.includes("/tasks/task-1/")) {
        // PATCH handler
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: {} }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockConvDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<MessagingTaskPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText("Hardened Task")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("task-row-task-1"));

    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
      expect(screen.getByTestId("task-mark-done")).toBeInTheDocument();
      expect(screen.getByTestId("task-detail-edit")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("task-mark-done"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/messaging/conversations/conv-1/tasks/task-1",
        expect.objectContaining({ method: "PATCH" })
      );
    });
  });
});
