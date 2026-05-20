import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, renderHook, act } from "@testing-library/react";
import React from "react";

import { useAttachmentUpload } from "../lib/use-attachment-upload";
import { useAttachmentFiles } from "../lib/use-attachment-files";
import { useSendMessage } from "../lib/use-send-message";
import { useSendThreadReply } from "../lib/use-send-thread-reply";

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  } as Response);
}

// ─── useAttachmentUpload ──────────────────────────────────────────────────

describe("useAttachmentUpload", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("initialises with empty state", () => {
    const { result } = renderHook(() => useAttachmentUpload());
    expect(result.current.stagedFiles).toEqual([]);
    expect(result.current.failures).toEqual([]);
    expect(result.current.uploading).toBe(false);
  });

  it("uploads a file and adds to staged files", async () => {
    vi.stubGlobal("fetch", mockFetch({
      success: true,
      data: { storageRef: "org/messaging/test.png", fileName: "test.png", mimeType: "image/png", mimeCategory: "image", sizeBytes: 512 },
    }, 201));

    const { result } = renderHook(() => useAttachmentUpload());
    const file = new File(["content"], "test.png", { type: "image/png" });

    let uploaded: { storageRef: string } | null = null;
    await act(async () => {
      uploaded = await result.current.upload(file);
    });

    expect(uploaded).not.toBeNull();
    expect(uploaded!.storageRef).toBe("org/messaging/test.png");
    expect(result.current.stagedFiles).toHaveLength(1);
    expect(result.current.stagedFiles[0].fileName).toBe("test.png");
  });

  it("handles upload failure gracefully", async () => {
    vi.stubGlobal("fetch", mockFetch({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "File type not supported" },
    }, 422));

    const { result } = renderHook(() => useAttachmentUpload());
    const file = new File(["content"], "bad.exe", { type: "application/x-msdownload" });

    let uploaded = null;
    await act(async () => {
      uploaded = await result.current.upload(file);
    });

    expect(uploaded).toBeNull();
    expect(result.current.failures.length).toBeGreaterThan(0);
    expect(result.current.failures[0].fileName).toBe("bad.exe");
  });

  it("allows removing a staged file", async () => {
    vi.stubGlobal("fetch", mockFetch({
      success: true,
      data: { storageRef: "org/messaging/a.png", fileName: "a.png", mimeType: "image/png", mimeCategory: "image", sizeBytes: 100 },
    }, 201));

    const { result } = renderHook(() => useAttachmentUpload());
    const file = new File(["a"], "a.png", { type: "image/png" });

    await act(async () => { await result.current.upload(file); });
    expect(result.current.stagedFiles).toHaveLength(1);

    act(() => { result.current.removeStaged("org/messaging/a.png"); });
    expect(result.current.stagedFiles).toHaveLength(0);
  });

  it("clearAll resets state", async () => {
    vi.stubGlobal("fetch", mockFetch({
      success: true,
      data: { storageRef: "org/messaging/b.png", fileName: "b.png", mimeType: "image/png", mimeCategory: "image", sizeBytes: 100 },
    }, 201));

    const { result } = renderHook(() => useAttachmentUpload());
    const file = new File(["b"], "b.png", { type: "image/png" });
    await act(async () => { await result.current.upload(file); });

    act(() => { result.current.clearAll(); });
    expect(result.current.stagedFiles).toHaveLength(0);
    expect(result.current.failures).toHaveLength(0);
  });
});

// ─── useSendMessage — attachments ─────────────────────────────────────────

describe("useSendMessage with attachments", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("passes attachments in the fetch body", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true, data: { id: "msg-1" } }, 201));

    const { result } = renderHook(() => useSendMessage());
    let sent: { id: string } | null = null;

    await act(async () => {
      sent = await result.current.send("conv-1", "test message", null, {
        attachments: [
          { storageRef: "org/test.pdf", fileName: "test.pdf", mimeType: "application/pdf", sizeBytes: 1024 },
        ],
      });
    });

    expect(sent).not.toBeNull();
    expect(sent!.id).toBe("msg-1");
  });

  it("sends message without attachments correctly", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true, data: { id: "msg-2" } }, 201));

    const { result } = renderHook(() => useSendMessage());
    let sent: { id: string } | null = null;

    await act(async () => {
      sent = await result.current.send("conv-1", "plain message");
    });

    expect(sent!.id).toBe("msg-2");
  });
});

// ─── useSendThreadReply — attachments ─────────────────────────────────────

describe("useSendThreadReply with attachments", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("passes attachments in thread reply fetch body", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true, data: { id: "reply-1" } }, 201));

    const { result } = renderHook(() => useSendThreadReply());
    let sent: { id: string } | null = null;

    await act(async () => {
      sent = await result.current.send("conv-1", "thread-1", "reply with file", {
        attachments: [
          { storageRef: "org/file.pdf", fileName: "file.pdf", mimeType: "application/pdf", sizeBytes: 2048 },
        ],
      });
    });

    expect(sent).not.toBeNull();
    expect(sent!.id).toBe("reply-1");
  });
});

// ─── useAttachmentFiles ───────────────────────────────────────────────────

describe("useAttachmentFiles", () => {
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch!;
  });

  it("returns expected shape on mount", () => {
    const { result } = renderHook(() => useAttachmentFiles());
    expect(result.current.files).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(typeof result.current.fetchFiles).toBe("function");
    expect(typeof result.current.fetchDownloadUrl).toBe("function");
  });

  it("fetches files for a conversation", async () => {
    globalThis.fetch = mockFetch({
      success: true,
      data: {
        files: [
          { id: "att-1", storageRef: "org/doc.pdf", name: "doc.pdf", mimeType: "application/pdf", mimeCategory: "document", sizeLabel: "10 KB", sizeBytes: 10240, thumbnailRef: null, scanStatus: "CLEAN", uploadedAt: new Date().toISOString(), messageId: "m1" },
        ],
        meta: { limit: 20, hasMore: false },
      },
    }) as typeof globalThis.fetch;

    const { result } = renderHook(() => useAttachmentFiles());

    await act(async () => {
      await result.current.fetchFiles("conv-1");
    });

    await waitFor(() => {
      expect(result.current.files).toHaveLength(1);
      expect(result.current.files[0].name).toBe("doc.pdf");
    });
  });

  it("download URL fetch returns signed URL", async () => {
    globalThis.fetch = mockFetch({
      success: true,
      data: { signedUrl: "https://signed.example.com/doc.pdf", fileName: "doc.pdf", mimeType: "application/pdf" },
    }) as typeof globalThis.fetch;

    const { result } = renderHook(() => useAttachmentFiles());
    let data: { signedUrl: string } | null = null;

    await act(async () => {
      data = await result.current.fetchDownloadUrl("att-1");
    });

    expect(data).not.toBeNull();
    expect(data!.signedUrl).toBe("https://signed.example.com/doc.pdf");
  });

  it("download URL fails for unauthorized user", async () => {
    globalThis.fetch = mockFetch({ success: false, error: { code: "FORBIDDEN", message: "Access denied" } }, 403) as typeof globalThis.fetch;

    const { result } = renderHook(() => useAttachmentFiles());
    let data = null;

    await act(async () => {
      data = await result.current.fetchDownloadUrl("att-blocked");
    });

    expect(data).toBeNull();
  });
});
