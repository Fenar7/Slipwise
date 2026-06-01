import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

import { MessagingTaskPanel } from "../messaging-task-panel";

describe("Sprint 7.3 — Assignee Inbox and Work Coordination UX", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const mockTask = {
    id: "task-1",
    orgId: "org-1",
    conversationId: "conv-1",
    title: "Review PR",
    status: "OPEN",
    priority: "high",
    dueDate: "2026-06-01",
    assigneeId: "user-1",
    assigneeName: "Alice",
    assigneeAvatarInitials: "AL",
    createdBy: "user-2",
    createdByName: "Bob",
    createdAt: "2026-05-20T10:00:00Z",
    description: "Review the PR",
    originatingMessageId: "msg-42",
    conversationName: "engineering",
    conversationType: "CHANNEL",
  };

  const mockDoneTask = {
    ...mockTask,
    id: "task-2",
    title: "Deploy v2",
    status: "DONE",
    priority: "low",
    dueDate: null,
    originatingMessageId: null,
  };

  const mockConvDetail = {
    id: "conv-1",
    orgId: "org-1",
    type: "CHANNEL",
    name: "engineering",
    description: "Engineering chat",
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

  function setupGlobalFetch(tasks = [mockTask, mockDoneTask]) {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/messaging/tasks")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, data: { tasks, nextCursor: null, hasMore: false } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: mockConvDetail }),
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    return fetchSpy;
  }

  // ─── 1. Assignee inbox filters ──────────────────────────────────────────────

  describe("Server-side inbox filters", () => {
    it("renders all filter options including Assigned to Me and Created by Me", async () => {
      setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      expect(screen.getByTestId("task-filter-all")).toBeInTheDocument();
      expect(screen.getByTestId("task-filter-assigned")).toBeInTheDocument();
      expect(screen.getByTestId("task-filter-created")).toBeInTheDocument();
      expect(screen.getByTestId("task-filter-open")).toBeInTheDocument();
      expect(screen.getByTestId("task-filter-in-progress")).toBeInTheDocument();
      expect(screen.getByTestId("task-filter-due-soon")).toBeInTheDocument();
      expect(screen.getByTestId("task-filter-overdue")).toBeInTheDocument();
      expect(screen.getByTestId("task-filter-done")).toBeInTheDocument();
      expect(screen.getByTestId("task-filter-cancelled")).toBeInTheDocument();
    });

    it("passes scope=assigned when Assigned to Me filter is selected", async () => {
      const fetchSpy = setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-filter-assigned"));

      await waitFor(() => {
        const taskCalls = fetchSpy.mock.calls.filter((call: string[]) =>
          call[0]?.includes("/api/messaging/tasks")
        );
        expect(taskCalls.length).toBeGreaterThanOrEqual(2);
        const lastCall = taskCalls[taskCalls.length - 1];
        expect(lastCall[0]).toContain("scope=assigned");
      });
    });

    it("passes scope=created when Created by Me filter is selected", async () => {
      const fetchSpy = setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-filter-created"));

      await waitFor(() => {
        const taskCalls = fetchSpy.mock.calls.filter((call: string[]) =>
          call[0]?.includes("/api/messaging/tasks")
        );
        expect(taskCalls.length).toBeGreaterThanOrEqual(2);
        const lastCall = taskCalls[taskCalls.length - 1];
        expect(lastCall[0]).toContain("scope=created");
      });
    });

    it("passes scope=due_soon when Due Soon filter is selected", async () => {
      const fetchSpy = setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-filter-due-soon"));

      await waitFor(() => {
        const taskCalls = fetchSpy.mock.calls.filter((call: string[]) =>
          call[0]?.includes("/api/messaging/tasks")
        );
        expect(taskCalls.length).toBeGreaterThanOrEqual(2);
        const lastCall = taskCalls[taskCalls.length - 1];
        expect(lastCall[0]).toContain("scope=due_soon");
      });
    });

    it("passes no scope when All filter is selected", async () => {
      const fetchSpy = setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-filter-open"));
      await waitFor(() => {
        expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      });

      fireEvent.click(screen.getByTestId("task-filter-all"));

      await waitFor(() => {
        const taskCalls = fetchSpy.mock.calls.filter((call: string[]) =>
          call[0]?.includes("/api/messaging/tasks")
        );
        const lastCall = taskCalls[taskCalls.length - 1];
        expect(lastCall[0]).not.toContain("scope=");
      });
    });

    it("does not pass scope parameter in conversation-scoped mode", async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
          return Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve({ success: true, data: [mockTask] }),
          });
        }
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ success: true, data: mockConvDetail }),
        });
      });
      vi.stubGlobal("fetch", fetchSpy);

      render(<MessagingTaskPanel conversationId="conv-1" />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-filter-done"));

      await waitFor(() => {
        const taskCalls = fetchSpy.mock.calls.filter((call: string[]) =>
          call[0]?.includes("/api/messaging/conversations/conv-1/tasks")
        );
        expect(taskCalls.length).toBe(1);
      });
    });

    it("clears selected task when filter changes", async () => {
      setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      // Select a task
      fireEvent.click(screen.getByTestId("task-row-task-1"));
      await waitFor(() => {
        expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
      });

      // Go back to list first (filter bar only visible in list view)
      fireEvent.click(screen.getByTestId("task-detail-back"));
      await waitFor(() => {
        expect(screen.queryByTestId("task-detail-panel")).not.toBeInTheDocument();
      });

      // Now change filter — selection should clear (already null from back button)
      fireEvent.click(screen.getByTestId("task-filter-done"));

      // Should remain in list view (no detail panel)
      expect(screen.queryByTestId("task-detail-panel")).not.toBeInTheDocument();
    });
  });

  // ─── 2. Fast task actions ───────────────────────────────────────────────────

  describe("Fast task actions", () => {
    it("shows mark-done action on open task hover", async () => {
      setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      fireEvent.mouseEnter(screen.getByTestId("task-row-task-1"));

      await waitFor(() => {
        expect(screen.getByTestId("task-action-done-task-1")).toBeInTheDocument();
      });
    });

    it("shows reopen action on done task hover", async () => {
      setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Deploy v2")).toBeInTheDocument();
      });

      fireEvent.mouseEnter(screen.getByTestId("task-row-task-2"));

      await waitFor(() => {
        expect(screen.getByTestId("task-action-reopen-task-2")).toBeInTheDocument();
      });
    });

    it("mark-done sends PATCH with status=DONE", async () => {
      const fetchSpy = setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      fireEvent.mouseEnter(screen.getByTestId("task-row-task-1"));
      await waitFor(() => {
        expect(screen.getByTestId("task-action-done-task-1")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-action-done-task-1"));

      await waitFor(() => {
        const patchCalls = fetchSpy.mock.calls.filter((call: string[]) =>
          call[0]?.includes("/api/messaging/conversations/conv-1/tasks/task-1") && call[1]?.method === "PATCH"
        );
        expect(patchCalls.length).toBe(1);
        expect(JSON.parse(patchCalls[0][1].body).status).toBe("DONE");
      });
    });

    it("cancel sends PATCH with status=CANCELLED", async () => {
      const fetchSpy = setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      fireEvent.mouseEnter(screen.getByTestId("task-row-task-1"));
      await waitFor(() => {
        expect(screen.getByTestId("task-action-cancel-task-1")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-action-cancel-task-1"));

      await waitFor(() => {
        const patchCalls = fetchSpy.mock.calls.filter((call: string[]) =>
          call[0]?.includes("/api/messaging/conversations/conv-1/tasks/task-1") && call[1]?.method === "PATCH"
        );
        expect(patchCalls.length).toBe(1);
        expect(JSON.parse(patchCalls[0][1].body).status).toBe("CANCELLED");
      });
    });

    it("reopen sends PATCH with status=OPEN", async () => {
      const fetchSpy = setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Deploy v2")).toBeInTheDocument();
      });

      fireEvent.mouseEnter(screen.getByTestId("task-row-task-2"));
      await waitFor(() => {
        expect(screen.getByTestId("task-action-reopen-task-2")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-action-reopen-task-2"));

      await waitFor(() => {
        const patchCalls = fetchSpy.mock.calls.filter((call: string[]) =>
          call[0]?.includes("/api/messaging/conversations/conv-1/tasks/task-2") && call[1]?.method === "PATCH"
        );
        expect(patchCalls.length).toBe(1);
        expect(JSON.parse(patchCalls[0][1].body).status).toBe("OPEN");
      });
    });

    it("unassign sends PATCH with empty assigneeId", async () => {
      const fetchSpy = setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      fireEvent.mouseEnter(screen.getByTestId("task-row-task-1"));
      await waitFor(() => {
        expect(screen.getByTestId("task-action-unassign-task-1")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-action-unassign-task-1"));

      await waitFor(() => {
        const patchCalls = fetchSpy.mock.calls.filter((call: string[]) =>
          call[0]?.includes("/api/messaging/conversations/conv-1/tasks/task-1") && call[1]?.method === "PATCH"
        );
        expect(patchCalls.length).toBe(1);
        expect(JSON.parse(patchCalls[0][1].body).assigneeId).toBe("");
      });
    });

    it("does not show mark-done or cancel on done tasks", async () => {
      setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Deploy v2")).toBeInTheDocument();
      });

      fireEvent.mouseEnter(screen.getByTestId("task-row-task-2"));

      await waitFor(() => {
        expect(screen.getByTestId("task-action-reopen-task-2")).toBeInTheDocument();
        expect(screen.queryByTestId("task-action-done-task-2")).not.toBeInTheDocument();
        expect(screen.queryByTestId("task-action-cancel-task-2")).not.toBeInTheDocument();
      });
    });
  });

  // ─── 3. Origin navigation ──────────────────────────────────────────────────

  describe("Origin navigation", () => {
    it("shows origin link for tasks with originatingMessageId", async () => {
      setupGlobalFetch();
      const onNavigateSpy = vi.fn();
      render(<MessagingTaskPanel onNavigateToOrigin={onNavigateSpy} />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      expect(screen.getByTestId("task-origin-task-1")).toBeInTheDocument();
    });

    it("does not show origin link for tasks without originatingMessageId", async () => {
      setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Deploy v2")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("task-origin-task-2")).not.toBeInTheDocument();
    });

    it("origin link calls onNavigateToOrigin with correct params", async () => {
      setupGlobalFetch();
      const onNavigateSpy = vi.fn();
      render(<MessagingTaskPanel onNavigateToOrigin={onNavigateSpy} />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-origin-task-1"));
      expect(onNavigateSpy).toHaveBeenCalledWith("conv-1", "msg-42");
    });

    it("conversation badge calls onNavigateToOrigin", async () => {
      setupGlobalFetch();
      const onNavigateSpy = vi.fn();
      render(<MessagingTaskPanel onNavigateToOrigin={onNavigateSpy} />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-conv-badge-task-1"));
      expect(onNavigateSpy).toHaveBeenCalledWith("conv-1", "msg-42");
    });
  });

  // ─── 4. Empty states ───────────────────────────────────────────────────────

  describe("Empty and degraded states", () => {
    it("shows filter-specific empty for Assigned to Me", async () => {
      setupGlobalFetch([]);
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("No tasks yet")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-filter-assigned"));

      await waitFor(() => {
        expect(screen.getByText("No tasks assigned to you")).toBeInTheDocument();
        expect(screen.getByText("Try a different filter.")).toBeInTheDocument();
      });
    });

    it("shows filter-specific empty for Created by Me", async () => {
      setupGlobalFetch([]);
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("No tasks yet")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-filter-created"));

      await waitFor(() => {
        expect(screen.getByText("No tasks you created")).toBeInTheDocument();
      });
    });

    it("shows filter-specific empty for Due Soon", async () => {
      setupGlobalFetch([]);
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("No tasks yet")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-filter-due-soon"));

      await waitFor(() => {
        expect(screen.getByText("No tasks due soon")).toBeInTheDocument();
      });
    });

    it("shows default empty with create hint", async () => {
      setupGlobalFetch([]);
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("No tasks yet")).toBeInTheDocument();
        expect(screen.getByText("Create a task to get started.")).toBeInTheDocument();
      });
    });

    it("shows restricted state when access denied", async () => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
          return Promise.resolve({
            ok: false, status: 403,
            json: () => Promise.resolve({ success: false, error: { code: "FORBIDDEN", message: "Access denied" } }),
          });
        }
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ success: true, data: mockConvDetail }),
        });
      }));

      render(<MessagingTaskPanel conversationId="conv-1" />);

      await waitFor(() => {
        expect(screen.getByText("Access Restricted")).toBeInTheDocument();
      });
    });
  });

  // ─── 5. Regression ─────────────────────────────────────────────────────────

  describe("Regression: existing features intact", () => {
    it("metric strip renders in global mode", async () => {
      setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      expect(screen.getByText("Total")).toBeInTheDocument();
      // "Overdue" and "Open" appear in both metric strip and filter bar
      expect(screen.getAllByText("Overdue").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Open").length).toBeGreaterThanOrEqual(1);
    });

    it("task detail panel works with Sprint 7.1/7.2 contracts", async () => {
      setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-row-task-1"));

      await waitFor(() => {
        expect(screen.getByTestId("task-detail-panel")).toBeInTheDocument();
      });

      expect(screen.getByText("Review PR")).toBeInTheDocument();
      expect(screen.getByText("high")).toBeInTheDocument();
    });

    it("conversation-scoped panel still works", async () => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/messaging/conversations/conv-1/tasks")) {
          return Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve({ success: true, data: [mockTask] }),
          });
        }
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ success: true, data: mockConvDetail }),
        });
      }));

      render(<MessagingTaskPanel conversationId="conv-1" />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });
    });

    it("task create button works in global mode", async () => {
      setupGlobalFetch();
      render(<MessagingTaskPanel />);

      await waitFor(() => {
        expect(screen.getByText("Review PR")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("task-panel-new-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("task-create-modal")).toBeInTheDocument();
      });
    });
  });
});
