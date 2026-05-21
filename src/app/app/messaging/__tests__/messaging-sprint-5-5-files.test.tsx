import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("../lib/use-attachment-files", () => ({
  useAttachmentFiles: vi.fn(),
}));

import { useAttachmentFiles } from "../lib/use-attachment-files";
import { MessagingFilesPanel } from "../messaging-files-panel";

describe("MessagingFilesPanel", () => {
  beforeEach(() => {
    vi.mocked(useAttachmentFiles).mockReturnValue({
      files: [],
      loading: false,
      error: null,
      fetchFiles: vi.fn(),
      fetchDownloadUrl: vi.fn(),
      clearError: vi.fn(),
    });
  });

  it("renders empty state when no conversation is selected", async () => {
    render(<MessagingFilesPanel conversationId={null} />);
    await waitFor(() => {
      expect(screen.getByTestId("file-list-empty")).toHaveTextContent("Select a conversation");
    });
  });

  it("renders empty state for conversation with no files", async () => {
    render(<MessagingFilesPanel conversationId="conv-x" />);
    await waitFor(() => {
      expect(screen.getByTestId("file-list-empty")).toHaveTextContent("No files shared");
    });
  });

  it("renders file rows when files exist", async () => {
    vi.mocked(useAttachmentFiles).mockReturnValue({
      files: [
        { id: "att-1", storageRef: "org/doc.pdf", name: "Report.pdf", mimeType: "application/pdf", mimeCategory: "document", sizeLabel: "2.4 MB", sizeBytes: 2500000, thumbnailRef: null, scanStatus: "CLEAN", uploadedAt: new Date().toISOString(), messageId: "m1" },
      ],
      loading: false,
      error: null,
      fetchFiles: vi.fn(),
      fetchDownloadUrl: vi.fn().mockResolvedValue({ signedUrl: "https://signed/doc.pdf" }),
      clearError: vi.fn(),
    });

    render(<MessagingFilesPanel conversationId="conv-x" />);
    await waitFor(() => {
      expect(screen.getByTestId("file-row-att-1")).toBeInTheDocument();
      expect(screen.getByText("Report.pdf")).toBeInTheDocument();
    });
  });

  it("shows loading state", async () => {
    vi.mocked(useAttachmentFiles).mockReturnValue({
      files: [],
      loading: true,
      error: null,
      fetchFiles: vi.fn(),
      fetchDownloadUrl: vi.fn(),
      clearError: vi.fn(),
    });

    render(<MessagingFilesPanel conversationId="conv-x" />);
    await waitFor(() => {
      expect(screen.getByTestId("file-list-loading")).toBeInTheDocument();
    });
  });

  it("shows blocked state for blocked attachments", async () => {
    vi.mocked(useAttachmentFiles).mockReturnValue({
      files: [
        { id: "att-b", storageRef: "org/bad.exe", name: "bad.exe", mimeType: "application/x-msdownload", mimeCategory: "other", sizeLabel: "1 KB", sizeBytes: 1024, thumbnailRef: null, scanStatus: "BLOCKED", uploadedAt: new Date().toISOString(), messageId: "m1" },
      ],
      loading: false,
      error: null,
      fetchFiles: vi.fn(),
      fetchDownloadUrl: vi.fn(),
      clearError: vi.fn(),
    });

    render(<MessagingFilesPanel conversationId="conv-x" />);
    await waitFor(() => {
      expect(screen.getByText("Blocked")).toBeInTheDocument();
    });
  });
});
