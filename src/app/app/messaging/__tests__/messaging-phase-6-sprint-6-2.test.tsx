import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

import { MessagingTaskPanel } from "../messaging-task-panel";
import { MessagingTaskCreate } from "../messaging-task-create";

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  } as Response);
}

const mockParticipants = [
  { id: "user-1", name: "Arjun Mehta", avatarInitials: "AM", role: "member" as const, presence: "offline" as const },
  { id: "user-2", name: "Priya Sharma", avatarInitials: "PS", role: "owner" as const, presence: "offline" as const },
];

describe("Sprint 6.2 Frontend Integration — Tasks Work Coordination", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const mockTasks = [
    {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Clean Code Task",
      status: "open",
      priority: "high" as const,
      isOverdue: false,
      dueDate: "2026-06-15T00:00:00Z",
      assigneeId: "user-1",
      assigneeName: "Arjun Mehta",
      assigneeAvatarInitials: "AM",
      createdBy: "user-2",
      createdByName: "Priya Sharma",
      createdAt: "2026-05-20T10:00:00Z",
      description: "Perform clean contiguous edits only.",
      originatingMessageId: "msg-origin-123",
    },
  ];

  it("loads and displays tasks for a conversation using the real hook", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ success: true, data: mockTasks })
    );

    render(<MessagingTaskPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText("Clean Code Task")).toBeInTheDocument();
    });

    expect(screen.getByText("Arjun Mehta")).toBeInTheDocument();
  });

  it("opens modal and creates a task with correct priority mapping and triggers reload", async () => {
    let postBody: any = null;
    const fetchSpy = vi.fn().mockImplementation((url: string, options?: any) => {
      if (options?.method === "POST") {
        postBody = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ success: true, data: { id: "new-task-id" } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockTasks }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <MessagingTaskPanel
        conversationId="conv-1"
        participants={mockParticipants}
      />
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText("Clean Code Task")).toBeInTheDocument();
    });

    // Open create modal
    fireEvent.click(screen.getByTestId("task-panel-new-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("task-create-modal")).toBeInTheDocument();
    });

    // Fill in title
    fireEvent.change(screen.getByTestId("task-title-input"), {
      target: { value: "New Test Task" },
    });

    // Set priority to high
    fireEvent.click(screen.getByText("High"));

    // Select assignee
    fireEvent.change(screen.getByTestId("task-assignee-picker"), {
      target: { value: "user-1" },
    });

    // Wait for button to become enabled, then click submit
    await waitFor(() => {
      expect(screen.getByTestId("task-create-submit")).not.toBeDisabled();
    });
    fireEvent.click(screen.getByTestId("task-create-submit"));

    await waitFor(() => {
      expect(postBody).not.toBeNull();
    });

    expect(postBody.title).toBe("New Test Task");
    expect(postBody.priority).toBe(2); // high = 2
    expect(postBody.assigneeId).toBe("user-1");
    expect(postBody.conversationId).toBeUndefined(); // should not leak in body
  });

  it("updates task status and reloads tasks on success", async () => {
    let patchBody: any = null;
    const fetchSpy = vi.fn().mockImplementation((url: string, options?: any) => {
      if (options?.method === "PATCH") {
        patchBody = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: { ...mockTasks[0], status: "done" } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockTasks }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<MessagingTaskPanel conversationId="conv-1" />);

    // Wait for list to load and select a task
    await waitFor(() => {
      expect(screen.getByText("Clean Code Task")).toBeInTheDocument();
    });

    const taskBtn = screen.getByTestId("task-row-task-1");
    fireEvent.click(taskBtn);

    // Should display detail panel
    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    });

    expect(screen.getByText("Perform clean contiguous edits only.")).toBeInTheDocument();

    // Mark as done
    const markDoneBtn = screen.getByTestId("task-mark-done");
    fireEvent.click(markDoneBtn);

    await waitFor(() => {
      expect(patchBody).not.toBeNull();
    });

    expect(patchBody.status).toBe("DONE");
  });
});

describe("Sprint 6.2 — Live tasks path without mock data", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a truthful no-conversation-selected state when conversationId is null", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true, data: [] }));
    render(<MessagingTaskPanel conversationId={null} />);

    await waitFor(() => {
      expect(screen.getByText("No Conversation Selected")).toBeInTheDocument();
    });

    expect(screen.getByTestId("messaging-pane-tasks")).toBeInTheDocument();
    // Verify mock task data is NOT present
    expect(screen.queryByText("Clean Code Task")).toBeNull();
    expect(screen.queryByText("Arjun Mehta")).toBeNull();
  });

  it("does not render mock tasks when conversationId is null", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true, data: [] }));
    render(<MessagingTaskPanel conversationId={null} />);

    await waitFor(() => {
      expect(screen.getByText("No Conversation Selected")).toBeInTheDocument();
    });

    // The no-conversation state renders under messaging-pane-tasks testid
    // No task rows or task panel should be present
    const container = screen.getByTestId("messaging-pane-tasks");
    expect(container.querySelector('[data-testid^="task-row-"]')).toBeNull();
    expect(screen.queryByTestId("task-panel")).toBeNull();
  });
});

describe("Sprint 6.2 — Originating message link and decorative controls removal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const mockTasksWithOrigin = [
    {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Clean Code Task",
      status: "open",
      priority: "high" as const,
      isOverdue: false,
      dueDate: "2026-06-15T00:00:00Z",
      assigneeId: "user-1",
      assigneeName: "Arjun Mehta",
      assigneeAvatarInitials: "AM",
      createdBy: "user-2",
      createdByName: "Priya Sharma",
      createdAt: "2026-05-20T10:00:00Z",
      description: "Perform clean contiguous edits only.",
      originatingMessageId: "msg-origin-123",
    },
  ];

  const mockTasksWithoutOrigin = [
    {
      id: "task-2",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Task Without Origin",
      status: "open",
      priority: "medium" as const,
      isOverdue: false,
      dueDate: null,
      assigneeId: null,
      assigneeName: null,
      assigneeAvatarInitials: null,
      createdBy: "user-1",
      createdByName: "Arjun Mehta",
      createdAt: "2026-05-21T10:00:00Z",
      description: null,
      originatingMessageId: null,
    },
  ];

  it("renders originating-message link when originatingMessageId exists", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ success: true, data: mockTasksWithOrigin })
    );

    const navigateSpy = vi.fn();

    render(
      <MessagingTaskPanel
        conversationId="conv-1"
        onNavigateToOrigin={navigateSpy}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Clean Code Task")).toBeInTheDocument();
    });

    const taskBtn = screen.getByTestId("task-row-task-1");
    fireEvent.click(taskBtn);

    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    });

    // Should show the originating-message link chip
    const originLink = screen.getByTestId("task-origin-link");
    expect(originLink).toBeInTheDocument();
    expect(originLink).toHaveTextContent("View originating message");

    // Clicking it should fire the navigation callback
    fireEvent.click(originLink);
    expect(navigateSpy).toHaveBeenCalledWith("conv-1", "msg-origin-123");

    // Should NOT show the old conversationRef-based fake link
    expect(screen.queryByText("Linked to:")).toBeNull();
  });

  it("does not render originating-message link when originatingMessageId is null", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ success: true, data: mockTasksWithoutOrigin })
    );

    render(<MessagingTaskPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText("Task Without Origin")).toBeInTheDocument();
    });

    const taskBtn = screen.getByTestId("task-row-task-2");
    fireEvent.click(taskBtn);

    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    });

    // Should NOT render the origin link chip
    expect(screen.queryByTestId("task-origin-link")).toBeNull();
  });

  it("detail panel does not render decorative Edit or Delete buttons", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ success: true, data: mockTasksWithOrigin })
    );

    render(<MessagingTaskPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText("Clean Code Task")).toBeInTheDocument();
    });

    const taskBtn = screen.getByTestId("task-row-task-1");
    fireEvent.click(taskBtn);

    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    });

    // No Edit button
    expect(screen.queryByLabelText("Edit task")).toBeNull();

    // No Delete task button
    expect(screen.queryByText("Delete task")).toBeNull();

    // Mark as done must still exist
    expect(screen.getByTestId("task-mark-done")).toBeInTheDocument();
  });
});
