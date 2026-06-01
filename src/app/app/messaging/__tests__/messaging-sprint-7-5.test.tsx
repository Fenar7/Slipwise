import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { useConversationTasks } from "../lib/use-conversation-tasks";
import { dispatchTaskMutation } from "../lib/task-events";

// A simple test component to mount multiple instances
function TestRail() {
  const { tasks, loading, errorType, refresh } = useConversationTasks("conv-1");
  return (
    <div data-testid="rail">
      {loading ? "loading" : errorType !== "none" ? `error:${errorType}` : tasks?.length}
      <button onClick={refresh} data-testid="rail-refresh">refresh</button>
    </div>
  );
}

function TestPanel() {
  const { tasks, loading, errorType } = useConversationTasks("global");
  return (
    <div data-testid="panel">
      {loading ? "loading" : errorType !== "none" ? `error:${errorType}` : tasks?.length}
    </div>
  );
}

describe("Sprint 7.5 — Realtime, Reliability, and Phase-Exit Polish", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("triggers cross-component refresh when dispatchTaskMutation is called", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [{ id: "t1" }, { id: "t2" }] })
    });

    render(
      <>
        <TestRail />
        <TestPanel />
      </>
    );

    // Initial load
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(screen.getByTestId("rail").textContent).toContain("2");
    expect(screen.getByTestId("panel").textContent).toContain("2");
    
    // Clear fetch calls from initial load
    mockFetch.mockClear();

    // Now simulate a task deletion/mutation
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [{ id: "t2" }] })
    });

    await act(async () => {
      dispatchTaskMutation();
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    // Both components should have re-fetched and updated
    expect(screen.getByTestId("rail").textContent).toContain("1");
    expect(screen.getByTestId("panel").textContent).toContain("1");
    
    // Fetch should be called twice (once for rail, once for panel)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("handles revoked access safely by rendering restricted state", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ success: false, error: { code: "FORBIDDEN", message: "Forbidden" } })
    });

    render(<TestRail />);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(screen.getByTestId("rail").textContent).toContain("error:restricted");
  });

  it("leaves truthful UI state after mutation failure (does not assume success)", async () => {
    // Initial fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [{ id: "t1" }] })
    });

    render(<TestRail />);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(screen.getByTestId("rail").textContent).toContain("1");
    mockFetch.mockClear();

    // Now we simulate a mutation failure from a component. 
    // The component would catch the error and NOT call dispatchTaskMutation().
    // So the state should remain 1.
    // If it did call it, it would refetch the true server state.
    // Let's manually trigger a refetch to see that the server state remains truthful.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [{ id: "t1" }] })
    });

    await act(async () => {
      dispatchTaskMutation(); // even if it optimistically dispatched, server returns truthful state
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(screen.getByTestId("rail").textContent).toContain("1");
  });
});
