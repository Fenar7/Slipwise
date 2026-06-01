import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { MessagingTaskRail } from "../messaging-task-rail";
import { MessagingTaskPanel } from "../messaging-task-panel";
import { dispatchTaskMutation } from "../lib/task-events";

describe("Sprint 7.5 — Realtime, Reliability, and Phase-Exit Polish", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("proves cross-surface convergence after mutation (local event)", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("/tasks")) {
        return { ok: true, json: async () => ({ success: true, data: { tasks: [{ id: "t1", title: "Task 1", status: "OPEN", priority: "low" }], hasMore: false } }) };
      }
      return { ok: true, json: async () => ({ success: true, data: { participants: [] } }) };
    });

    render(
      <div>
        <MessagingTaskRail conversationId="conv-1" />
        <MessagingTaskPanel conversationId="global" />
      </div>
    );

    // Initial load
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    // Both should fetch initially (rail fetches tasks, panel fetches tasks and detail)
    expect(mockFetch).toHaveBeenCalled();
    mockFetch.mockClear();

    // Simulate mutation which adds a task
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("/tasks")) {
        return { ok: true, json: async () => ({ success: true, data: { tasks: [{ id: "t1", title: "Task 1", status: "OPEN", priority: "low" }, { id: "t2", title: "Task 2", status: "OPEN", priority: "low" }], hasMore: false } }) };
      }
      return { ok: true, json: async () => ({ success: true, data: { participants: [] } }) };
    });

    await act(async () => {
      dispatchTaskMutation();
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    // Both rail and panel should have fetched tasks again
    const taskFetches = mockFetch.mock.calls.filter(call => call[0].includes("/tasks"));
    expect(taskFetches.length).toBeGreaterThanOrEqual(2);
  });

  it("proves external-change convergence (focus revalidation)", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      return { ok: true, json: async () => ({ success: true, data: { tasks: [{ id: "t1" }], hasMore: false } }) };
    });

    render(<MessagingTaskRail conversationId="conv-1" />);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    mockFetch.mockClear();

    // Simulate external change when user focuses back on window
    mockFetch.mockImplementation(async (url: string) => {
      return { ok: true, json: async () => ({ success: true, data: { tasks: [{ id: "t1" }, { id: "t2" }], hasMore: false } }) };
    });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it("proves background refresh failure preserves safe state with truthful degraded signal", async () => {
    // 1. Initial successful load
    mockFetch.mockImplementation(async (url: string) => {
      return { ok: true, json: async () => ({ success: true, data: [{ id: "t1", title: "Initial Safe Task", status: "OPEN", priority: "low" }] }) };
    });

    render(<MessagingTaskRail conversationId="conv-1" />);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    // Task should be visible
    expect(screen.getByText("Initial Safe Task")).toBeInTheDocument();
    mockFetch.mockClear();

    // 2. Background refresh fails with network error
    mockFetch.mockRejectedValue(new Error("Network Error"));

    await act(async () => {
      window.dispatchEvent(new Event("focus")); // trigger background refresh
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    // Rail should still show the old data and the degraded banner
    expect(screen.getByText("Initial Safe Task")).toBeInTheDocument();
    expect(screen.getByTestId("task-rail-degraded-banner")).toBeInTheDocument();
  });

  it("proves revoked access transition clears safely and truthfully", async () => {
    // 1. Initial successful load
    mockFetch.mockImplementation(async (url: string) => {
      return { ok: true, json: async () => ({ success: true, data: [{ id: "t1", title: "Initial Safe Task", status: "OPEN", priority: "low" }] }) };
    });

    render(<MessagingTaskRail conversationId="conv-1" />);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(screen.getByText("Initial Safe Task")).toBeInTheDocument();
    mockFetch.mockClear();

    // 2. Background refresh returns 403 Forbidden (revoked access)
    mockFetch.mockImplementation(async (url: string) => {
      return { ok: false, status: 403, json: async () => ({ success: false, error: { code: "FORBIDDEN", message: "Forbidden" } }) };
    });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    // Old task should be removed, and restricted text should show
    expect(screen.queryByText("Initial Safe Task")).not.toBeInTheDocument();
    expect(screen.getByTestId("task-rail-restricted")).toBeInTheDocument();
  });
});
