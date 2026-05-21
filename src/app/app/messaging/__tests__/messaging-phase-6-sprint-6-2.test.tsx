import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

import { MessagingTaskPanel } from "../messaging-task-panel";

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  } as Response);
}

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
      status: "OPEN",
      priority: "high",
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

  const mockDetail = {
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

  it("loads and displays tasks for a conversation using the real hook", async () => {
    // Stub fetch to return tasks list and conversation details
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockTasks }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<MessagingTaskPanel conversationId="conv-1" />);

    // Wait for the tasks list to populate
    await waitFor(() => {
      expect(screen.getByText("Clean Code Task")).toBeInTheDocument();
    });

    expect(screen.getByText("Arjun Mehta")).toBeInTheDocument();
    expect(screen.getByText("2026-06-15")).toBeInTheDocument();
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
      if (url.includes("/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockTasks }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<MessagingTaskPanel conversationId="conv-1" />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText("Clean Code Task")).toBeInTheDocument();
    });

    // Open creation modal
    const newBtn = screen.getByTestId("task-panel-new-btn");
    fireEvent.click(newBtn);

    // Verify modal is open
    expect(screen.getByTestId("task-create-modal")).toBeInTheDocument();

    // Fill title
    const titleInput = screen.getByTestId("task-title-input");
    fireEvent.change(titleInput, { target: { value: "Refactor API logic" } });

    // Set high priority (maps to 2)
    const priorityHigh = screen.getByText("High");
    fireEvent.click(priorityHigh);

    // Pick assignee
    const select = screen.getByTestId("task-assignee-picker");
    fireEvent.change(select, { target: { value: "user-1" } });

    // Fill description
    const descInput = screen.getByTestId("task-description");
    fireEvent.change(descInput, { target: { value: "A contiguous and secure refactoring" } });

    // Submit form
    const submitBtn = screen.getByTestId("task-create-submit");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(postBody).not.toBeNull();
    });

    expect(postBody.title).toBe("Refactor API logic");
    expect(postBody.priority).toBe(2); // High maps to 2
    expect(postBody.assigneeId).toBe("user-1");
    expect(postBody.description).toBe("A contiguous and secure refactoring");

    // Modal should be closed on success
    await waitFor(() => {
      expect(screen.queryByTestId("task-create-modal")).toBeNull();
    });
  });

  it("navigates to detail view, updates status to DONE, and reloads tasks", async () => {
    let patchBody: any = null;
    const fetchSpy = vi.fn().mockImplementation((url: string, options?: any) => {
      if (options?.method === "PATCH") {
        patchBody = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: { ...mockTasks[0], status: "DONE" } }),
        });
      }
      if (url.includes("/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockTasks }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockDetail }),
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
      status: "OPEN",
      priority: "high",
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
      status: "OPEN",
      priority: "medium",
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

  const mockDetail = {
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

  it("renders originating-message link when originatingMessageId exists", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockTasksWithOrigin }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<MessagingTaskPanel conversationId="conv-1" />);

    await waitFor(() => {
      expect(screen.getByText("Clean Code Task")).toBeInTheDocument();
    });

    const taskBtn = screen.getByTestId("task-row-task-1");
    fireEvent.click(taskBtn);

    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    });

    // Should show the originating-message link chip
    expect(screen.getByTestId("task-origin-link")).toBeInTheDocument();
    expect(screen.getByText("Originating from a message in this conversation")).toBeInTheDocument();

    // Should NOT show the old conversationRef-based fake link
    expect(screen.queryByText("Linked to:")).toBeNull();
  });

  it("does not render originating-message link when originatingMessageId is null", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockTasksWithoutOrigin }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

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
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: mockTasksWithOrigin }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

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
