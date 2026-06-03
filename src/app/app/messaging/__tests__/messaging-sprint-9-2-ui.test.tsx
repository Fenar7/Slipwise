import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MessagingSearchPanel } from "../messaging-search-panel";

// Mock CSS/style utilities
vi.mock("@/lib/utils", () => ({
  cn: (...inputs: any[]) => inputs.filter(Boolean).join(" "),
}));

describe("MessagingSearchPanel Sprint 9.2 UI integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function renderPanel(query = "", onClose = vi.fn()) {
    return render(<MessagingSearchPanel query={query} onClose={onClose} />);
  }

  it("renders file results normally with size label and scan status/snippet", async () => {
    const mockSearchResults = {
      success: true,
      data: {
        results: [
          {
            id: "file-1",
            kind: "file",
            title: "report.pdf",
            subtitle: "general",
            timestamp: new Date().toISOString(),
            score: 120,
            conversationId: "conv-1",
            conversationName: "general",
            attachmentId: "att-1",
            mimeType: "application/pdf",
            mimeCategory: "document",
            sizeBytes: 1536,
            sizeLabel: "2 KB",
            scanStatus: "CLEAN",
            snippet: "this is a clean pdf content snippet",
          },
          {
            id: "file-2",
            kind: "file",
            title: "malicious.csv",
            subtitle: "general",
            timestamp: new Date().toISOString(),
            score: 110,
            conversationId: "conv-1",
            conversationName: "general",
            attachmentId: "att-2",
            mimeType: "text/csv",
            mimeCategory: "spreadsheet",
            sizeBytes: 500,
            sizeLabel: "500 B",
            scanStatus: "BLOCKED",
            snippet: "[Blocked due to security policy]",
          },
        ],
        facets: { message: 0, conversation: 0, task: 0, meeting: 0, file: 2 },
        state: "active",
        unindexedKinds: [],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    } as any);

    renderPanel("report");

    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    // Check first result
    expect(screen.getByTestId("search-result-file-1")).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText(/general \(2 KB\) - this is a clean pdf content snippet/)).toBeInTheDocument();

    // Check second result (blocked)
    expect(screen.getByTestId("search-result-file-2")).toBeInTheDocument();
    expect(screen.getByText("malicious.csv")).toBeInTheDocument();
    expect(screen.getByText(/general \(500 B\) \[BLOCKED\] - \[Blocked due to security policy\]/)).toBeInTheDocument();
  });

  it("renders pending scans and unsupported file type warning banners", async () => {
    const mockSearchResults = {
      success: true,
      data: {
        results: [],
        facets: { message: 0, conversation: 0, task: 0, meeting: 0, file: 0 },
        state: "partial",
        unindexedKinds: [],
        hasPendingScans: true,
        hasUnsupportedFiles: true,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    } as any);

    renderPanel("query");

    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("search-pending-scans-banner")).toBeInTheDocument();
    expect(screen.getByTestId("search-unsupported-files-banner")).toBeInTheDocument();
  });

  it("shows pending-scan empty state instead of generic 'No results'", async () => {
    const mockSearchResults = {
      success: true,
      data: {
        results: [],
        facets: { message: 0, conversation: 0, task: 0, meeting: 0, file: 0 },
        state: "partial",
        unindexedKinds: [],
        hasPendingScans: true,
        hasUnsupportedFiles: false,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    } as any);

    renderPanel("query");

    // Select files filter
    fireEvent.click(screen.getByTestId("search-filter-files"));

    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("search-no-results-pending")).toBeInTheDocument();
    expect(screen.getByText(/Some files are pending scan checks and cannot be searched yet/)).toBeInTheDocument();
    expect(screen.queryByTestId("search-no-results")).not.toBeInTheDocument();
  });

  it("shows unsupported file type empty state instead of generic 'No results'", async () => {
    const mockSearchResults = {
      success: true,
      data: {
        results: [],
        facets: { message: 0, conversation: 0, task: 0, meeting: 0, file: 0 },
        state: "partial",
        unindexedKinds: [],
        hasPendingScans: false,
        hasUnsupportedFiles: true,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    } as any);

    renderPanel("query");

    // Select files filter
    fireEvent.click(screen.getByTestId("search-filter-files"));

    await waitFor(() => {
      expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("search-no-results-unsupported")).toBeInTheDocument();
    expect(screen.getByText(/Only supported file types \(.txt, .csv, .pdf\) are indexed/)).toBeInTheDocument();
    expect(screen.queryByTestId("search-no-results")).not.toBeInTheDocument();
  });
});
