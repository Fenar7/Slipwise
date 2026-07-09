import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

import { MessagingTaskPanel } from "../messaging-task-panel";

describe("Sprint 6.3 Frontend Integration — Task Edit Details Flow", () => {
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
      originatingMessageId: null,
    },
    {
      id: "task-2",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Second Task Title",
      status: "DONE",
      priority: "low",
      dueDate: null,
      assigneeId: null,
      assigneeName: null,
      assigneeAvatarInitials: null,
      createdBy: "user-1",
      createdByName: "Arjun Mehta",
      createdAt: "2026-05-21T10:00:00Z",
      description: "Just a second task",
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

  it("loads task panel, selects a task, clicks Edit, and populates form fields correctly", async () => {
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

    // Select Task 1
    await waitFor(() => {
      expect(screen.getByText("Clean Code Task")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("task-row-task-1"));

    // Verify detail panel renders
    await waitFor(() => {
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    });

    // Click Edit Details button
    const editBtn = screen.getByTestId("task-detail-edit");
    fireEvent.click(editBtn);

    // Verify edit panel is active
    expect(screen.getByTestId("task-edit-panel")).toBeInTheDocument();

    // Verify form elements are correctly prefilled
    const titleInput = screen.getByTestId("task-edit-title") as HTMLInputElement;
    expect(titleInput.value).toBe("Clean Code Task");

    const descInput = screen.getByTestId("task-edit-description") as HTMLTextAreaElement;
    expect(descInput.value).toBe("Perform clean contiguous edits only.");

    const prioritySelect = screen.getByTestId("task-edit-priority") as HTMLSelectElement;
    expect(prioritySelect.value).toBe("high");

    const statusSelect = screen.getByTestId("task-edit-status") as HTMLSelectElement;
    expect(statusSelect.value).toBe("open");

    const assigneeSelect = screen.getByTestId("task-edit-assignee") as HTMLSelectElement;
    expect(assigneeSelect.value).toBe("user-1");

    const dueDateInput = screen.getByTestId("task-edit-due-date") as HTMLInputElement;
    expect(dueDateInput.value).toBe("2026-06-15");
  });

  it("submits the full edit payload, refreshes tasks, and switches back to read-only view", async () => {
    let patchBody: any = null;
    const fetchSpy = vi.fn().mockImplementation((url: string, options?: any) => {
      if (options?.method === "PATCH") {
        patchBody = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: { ...mockTasks[0], title: "Refactored Clean Code Task" } }),
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

    // Select Task 1 & click Edit
    await waitFor(() => {
      expect(screen.getByText("Clean Code Task")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("task-row-task-1"));
    await waitFor(() => {
      expect(screen.getByTestId("task-detail-edit")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("task-detail-edit"));

    // Modify all inputs
    fireEvent.change(screen.getByTestId("task-edit-title"), { target: { value: "Refactored Clean Code Task" } });
    fireEvent.change(screen.getByTestId("task-edit-description"), { target: { value: "Fully contigous edits only." } });
    fireEvent.change(screen.getByTestId("task-edit-priority"), { target: { value: "critical" } });
    fireEvent.change(screen.getByTestId("task-edit-status"), { target: { value: "in-progress" } });
    fireEvent.change(screen.getByTestId("task-edit-assignee"), { target: { value: "user-2" } });
    fireEvent.change(screen.getByTestId("task-edit-due-date"), { target: { value: "2026-07-20" } });

    // Submit save
    const saveBtn = screen.getByTestId("task-edit-save");
    fireEvent.click(saveBtn);

    // Wait for the request and verification
    await waitFor(() => {
      expect(patchBody).not.toBeNull();
    });

    expect(patchBody.title).toBe("Refactored Clean Code Task");
    expect(patchBody.description).toBe("Fully contigous edits only.");
    expect(patchBody.priority).toBe(3); // critical maps to 3
    expect(patchBody.status).toBe("IN_PROGRESS");
    expect(patchBody.assigneeId).toBe("user-2");
    expect(patchBody.dueDate).toBe("2026-07-20");

    // Form should revert to read-only on success
    await waitFor(() => {
      expect(screen.queryByTestId("task-edit-panel")).toBeNull();
      expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
    });
  });

  it("displays inline error and does not close edit mode on API failure", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string, options?: any) => {
      if (options?.method === "PATCH") {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ success: false, error: { message: "Invalid assignee participant mapping" } }),
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

    // Select Task 1 & click Edit
    await waitFor(() => {
      expect(screen.getByText("Clean Code Task")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("task-row-task-1"));
    await waitFor(() => {
      expect(screen.getByTestId("task-detail-edit")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("task-detail-edit"));

    // Save immediately
    const saveBtn = screen.getByTestId("task-edit-save");
    fireEvent.click(saveBtn);

    // Verify error is shown and modal stays open
    await waitFor(() => {
      expect(screen.getByTestId("task-edit-error")).toBeInTheDocument();
    });
    expect(screen.getByText("Invalid assignee participant mapping")).toBeInTheDocument();
    expect(screen.getByTestId("task-edit-panel")).toBeInTheDocument();
  });

  it("resets editing state and prefilled values when selecting a different task", async () => {
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

    // Select Task 1 & click Edit
    await waitFor(() => {
      expect(screen.getByText("Clean Code Task")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("task-row-task-1"));
    await waitFor(() => {
      expect(screen.getByTestId("task-detail-edit")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("task-detail-edit"));

    // Verify we are editing Task 1
    let titleInput = screen.getByTestId("task-edit-title") as HTMLInputElement;
    expect(titleInput.value).toBe("Clean Code Task");

    // Click back to lists and select Task 2
    const backBtn = screen.getByTestId("task-edit-back");
    fireEvent.click(backBtn);

    // Also click detail back button to go back to the task list view
    const detailBackBtn = screen.getByTestId("task-detail-back");
    fireEvent.click(detailBackBtn);

    await waitFor(() => {
      expect(screen.getByText("Second Task Title")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("task-row-task-2"));

    // Verify detail panel shows Task 2 details
    await waitFor(() => {
      expect(screen.getByText("Just a second task")).toBeInTheDocument();
    });

    // Click Edit on Task 2
    fireEvent.click(screen.getByTestId("task-detail-edit"));

    // Form should prefill Task 2's details, not Task 1's stale ones
    titleInput = screen.getByTestId("task-edit-title") as HTMLInputElement;
    expect(titleInput.value).toBe("Second Task Title");

    const descInput = screen.getByTestId("task-edit-description") as HTMLTextAreaElement;
    expect(descInput.value).toBe("Just a second task");
  });
});
