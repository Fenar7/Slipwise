import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { PortalAttachmentItem } from "../attachment-item";
import { getPortalAttachmentDownloadUrl } from "../../actions";

// Mock the server action
vi.mock("../../actions", () => ({
  getPortalAttachmentDownloadUrl: vi.fn(),
}));

describe("PortalAttachmentItem Component Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "open").mockImplementation(() => null as any);
  });

  it("renders CLEAN attachments, offering a download button and triggering action on click", async () => {
    vi.mocked(getPortalAttachmentDownloadUrl).mockResolvedValue({
      success: true,
      data: {
        signedUrl: "https://storage.mock/clean-download",
        fileName: "clean.pdf",
        mimeType: "application/pdf",
      },
    });

    render(
      <PortalAttachmentItem
        attachmentId="att-clean"
        fileName="clean.pdf"
        sizeBytes={1024 * 150} // 150 KB
        scanStatus="CLEAN"
        orgSlug="test-org"
        isFromClient={false}
      />
    );

    // Should display the filename
    expect(screen.getByText("clean.pdf")).toBeInTheDocument();
    // Should display the formatted size
    expect(screen.getByText("(150.0 KB)")).toBeInTheDocument();

    // Trigger download
    const button = screen.getByRole("button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(getPortalAttachmentDownloadUrl).toHaveBeenCalledWith("test-org", "att-clean");
      expect(window.open).toHaveBeenCalledWith("https://storage.mock/clean-download", "_blank");
    });
  });

  it("renders PENDING attachments in scanning state, without a download action", async () => {
    render(
      <PortalAttachmentItem
        attachmentId="att-pending"
        fileName="pending.pdf"
        sizeBytes={1024 * 50} // 50 KB
        scanStatus="PENDING"
        orgSlug="test-org"
        isFromClient={false}
      />
    );

    // Should display the filename and Scanning state
    expect(screen.getByText("pending.pdf")).toBeInTheDocument();
    expect(screen.getByText("(Scanning...)")).toBeInTheDocument();

    // Should not render the download button or handle click
    // Note: The main body is rendered as a div, not a button
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders BLOCKED attachments in blocked warning state, without a download action", async () => {
    render(
      <PortalAttachmentItem
        attachmentId="att-blocked"
        fileName="malware.exe"
        sizeBytes={1024 * 10} // 10 KB
        scanStatus="BLOCKED"
        orgSlug="test-org"
        isFromClient={false}
      />
    );

    // Should display the filename and Blocked indicator
    expect(screen.getByText("malware.exe")).toBeInTheDocument();
    expect(screen.getByText("(Blocked)")).toBeInTheDocument();

    // Should not render the download button or offer download action
    expect(screen.queryByRole("button")).toBeNull();
  });
});
