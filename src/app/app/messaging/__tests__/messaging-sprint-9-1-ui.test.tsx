import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MessagingSearchPanel } from "../messaging-search-panel";

// Mock CSS/style utilities
vi.mock("@/lib/utils", () => ({
  cn: (...inputs: any[]) => inputs.filter(Boolean).join(" "),
}));

describe("MessagingSearchPanel UI Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function renderPanel(query = "", onClose = vi.fn()) {
    return render(<MessagingSearchPanel query={query} onClose={onClose} />);
  }

  it("renders empty state initially if query is blank", async () => {
    renderPanel("");
    expect(screen.getByTestId("search-recent")).toBeInTheDocument();
  });

  it("displays loading spinner and then renders matching search results", async () => {
    const mockSearchResults = {
      success: true,
      data: {
        results: [
          {
            id: "msg-1",
            kind: "message",
            title: "Priya Sharma",
            subtitle: "#finance-ops",
            timestamp: new Date().toISOString(),
            score: 100,
            snippet: "This is matching search snippet",
          },
        ],
        facets: { message: 1, conversation: 0, task: 0, meeting: 0, file: 0 },
        state: "active",
        unindexedKinds: [],
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    } as any);
    global.fetch = mockFetch;

    renderPanel("matching");

    // Loading indicator is visible
    expect(screen.getByTestId("search-loading")).toBeInTheDocument();

    // Wait for the results to load
    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/messaging/search?q=matching&kinds=message,conversation,task,meeting,file"),
      expect.any(Object)
    );

    // Verify search result row is rendered
    expect(screen.getByTestId("search-result-msg-1")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("This is matching search snippet")).toBeInTheDocument();
  });

  it("displays a warning banner when search state is degraded", async () => {
    const mockSearchResults = {
      success: true,
      data: {
        results: [],
        facets: { message: 0, conversation: 0, task: 0, meeting: 0, file: 0 },
        state: "degraded",
        unindexedKinds: [],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    } as any);

    renderPanel("degraded");

    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("search-degraded-banner")).toBeInTheDocument();
  });

  it("displays unindexed kind message for unindexed files category search", async () => {
    const mockSearchResults = {
      success: true,
      data: {
        results: [],
        facets: { message: 0, conversation: 0, task: 0, meeting: 0, file: 0 },
        state: "unindexed",
        unindexedKinds: ["file"],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    } as any);

    renderPanel("unindexed-file");

    // Click filter files radio button
    fireEvent.click(screen.getByTestId("search-filter-files"));

    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("search-unindexed")).toBeInTheDocument();
    expect(screen.getByText("File search is not yet available in this sprint.")).toBeInTheDocument();
  });

  it("displays warning banner for mixed search containing unindexed files with live results", async () => {
    const mockSearchResults = {
      success: true,
      data: {
        results: [
          {
            id: "msg-1",
            kind: "message",
            title: "Priya Sharma",
            subtitle: "#finance-ops",
            timestamp: new Date().toISOString(),
            score: 100,
            snippet: "payroll updates",
          },
        ],
        facets: { message: 1, conversation: 0, task: 0, meeting: 0, file: 0 },
        state: "active",
        unindexedKinds: ["file"],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    } as any);

    renderPanel("payroll");

    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("search-unindexed-warning")).toBeInTheDocument();
    expect(screen.getByText(/Some requested search types \(file\) are not yet available/i)).toBeInTheDocument();
    expect(screen.getByTestId("search-result-msg-1")).toBeInTheDocument();
  });

  it("displays truthful empty state for mixed search with zero live results but unindexed kinds", async () => {
    const mockSearchResults = {
      success: true,
      data: {
        results: [],
        facets: { message: 0, conversation: 0, task: 0, meeting: 0, file: 0 },
        state: "active",
        unindexedKinds: ["file"],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    } as any);

    renderPanel("unmatched-payroll");

    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("search-no-results-unindexed")).toBeInTheDocument();
    expect(screen.getByText(/some requested types like file are not yet available/i)).toBeInTheDocument();
  });
});
