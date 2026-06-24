import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, renderHook, act } from "@testing-library/react";
import React from "react";

import { useConversationTasks } from "../lib/use-conversation-tasks";
import { MessagingTaskRail } from "../messaging-task-rail";

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  } as Response);
}

describe("useConversationTasks Hook", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("initializes with loading false and no tasks", () => {
    const { result } = renderHook(() => useConversationTasks(null));
    expect(result.current.tasks).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.errorType).toBe("none");
    expect(result.current.errorMessage).toBeNull();
  });

  it("successfully fetches tasks for a conversation", async () => {
    const mockTasks = [
      { id: "task-1", title: "Task One", status: "OPEN", priority: "medium" },
    ];
    vi.stubGlobal(
      "fetch",
      mockFetch({
        success: true,
        data: mockTasks,
      })
    );

    const { result } = renderHook(() => useConversationTasks("conv-1"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tasks).toEqual(mockTasks);
    expect(result.current.errorType).toBe("none");
  });

  it("sets restricted errorType on 404 response", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Conversation not found or access denied" },
        },
        404
      )
    );

    const { result } = renderHook(() => useConversationTasks("conv-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tasks).toBeNull();
    expect(result.current.errorType).toBe("restricted");
  });

  it("sets restricted errorType on 403 response", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "Access denied" },
        },
        403
      )
    );

    const { result } = renderHook(() => useConversationTasks("conv-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tasks).toBeNull();
    expect(result.current.errorType).toBe("restricted");
  });

  it("sets network errorType on fetch rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failed")));

    const { result } = renderHook(() => useConversationTasks("conv-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tasks).toBeNull();
    expect(result.current.errorType).toBe("network");
    expect(result.current.errorMessage).toBe("Network failed");
  });

  it("sets unknown errorType on non-403/404 server error responses", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
        },
        500
      )
    );

    const { result } = renderHook(() => useConversationTasks("conv-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tasks).toBeNull();
    expect(result.current.errorType).toBe("unknown");
  });
});

describe("MessagingTaskRail Component", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders select conversation message when conversationId is null", () => {
    render(<MessagingTaskRail conversationId={null} />);
    expect(screen.getByText("Select a conversation")).toBeInTheDocument();
    expect(screen.getByText("Tasks for the selected conversation will appear here.")).toBeInTheDocument();
  });

  it("renders restricted view when access is unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "Access denied" },
        },
        403
      )
    );

    render(<MessagingTaskRail conversationId="conv-restricted" />);

    // Wait for the restricted screen to show up
    await waitFor(() => {
      expect(screen.getByTestId("task-rail-restricted")).toBeInTheDocument();
    });

    expect(screen.getByText("Access restricted")).toBeInTheDocument();
    expect(screen.getByText("You don't have access to tasks in this conversation.")).toBeInTheDocument();
  });

  it("renders network failure view and allows retry", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("Network connection dropped"));
      } else {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            success: true,
            data: [{ id: "task-abc", title: "Recovered Task", status: "OPEN", priority: "high" }],
          }),
        });
      }
    }));

    render(<MessagingTaskRail conversationId="conv-network" />);

    // Verify network error view is shown
    await waitFor(() => {
      expect(screen.getByTestId("task-rail-network-error")).toBeInTheDocument();
    });

    expect(screen.getByText("Network error")).toBeInTheDocument();
    const retryBtn = screen.getByTestId("task-rail-retry-button");
    expect(retryBtn).toBeInTheDocument();

    // Click retry
    fireEvent.click(retryBtn);

    // Verify that the task is now successfully hydrated
    await waitFor(() => {
      expect(screen.getByText("Recovered Task")).toBeInTheDocument();
    });
  });

  it("renders unknown failure view and allows retry", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Database is down" },
          }),
        });
      } else {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            success: true,
            data: [{ id: "task-xyz", title: "Resolved Task", status: "DONE", priority: "critical" }],
          }),
        });
      }
    }));

    render(<MessagingTaskRail conversationId="conv-unknown" />);

    // Verify unknown error view is shown
    await waitFor(() => {
      expect(screen.getByTestId("task-rail-unknown-error")).toBeInTheDocument();
    });

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    const retryBtn = screen.getByTestId("task-rail-retry-button");
    expect(retryBtn).toBeInTheDocument();

    // Click retry
    fireEvent.click(retryBtn);

    // Verify that the task is now successfully hydrated
    await waitFor(() => {
      expect(screen.getByText("Resolved Task")).toBeInTheDocument();
    });
  });

  it("renders empty state truthfully and distinguishes it from restricted state", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        success: true,
        data: [],
      })
    );

    render(<MessagingTaskRail conversationId="conv-empty" />);

    await waitFor(() => {
      expect(screen.getByTestId("task-rail-empty")).toBeInTheDocument();
    });

    expect(screen.getByText("No tasks")).toBeInTheDocument();
    expect(screen.queryByTestId("task-rail-restricted")).toBeNull();
  });

  it("hydrates and renders task list when populated", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        success: true,
        data: [
          { id: "task-1", title: "Task 1 Title", status: "OPEN", priority: "high", dueDate: "2026-06-01T00:00:00Z" },
          { id: "task-2", title: "Task 2 Title", status: "DONE", priority: "low" },
        ],
      })
    );

    render(<MessagingTaskRail conversationId="conv-populated" />);

    await waitFor(() => {
      expect(screen.getByText("Task 1 Title")).toBeInTheDocument();
    });

    expect(screen.getByText("Task 2 Title")).toBeInTheDocument();
    expect(screen.getByTestId("task-card-task-1")).toBeInTheDocument();
    expect(screen.getByTestId("task-card-task-2")).toBeInTheDocument();
  });
});
