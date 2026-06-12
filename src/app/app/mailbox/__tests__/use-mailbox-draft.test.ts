import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMailboxDraft } from "../use-mailbox-draft";

// Increase test timeout for debounced autosave tests
vi.useFakeTimers({ shouldAdvanceTime: true });

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("useMailboxDraft autosave lifecycle", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it("does not autosave after discard cancels the pending debounce", async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/mailbox/drafts/draft-001") && init?.method === "DELETE") {
        return new Response(JSON.stringify({ success: true, draftId: "draft-001" }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const { result } = renderHook(() => useMailboxDraft());

    // Step 1: create a draft
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          draft: {
            id: "draft-001",
            orgId: "org-1",
            mailboxConnectionId: "conn-1",
            threadId: null,
            replyToMessageId: null,
            mode: "NEW",
            fromIdentity: "a@example.com",
            to: [],
            cc: [],
            bcc: [],
            subject: "",
            htmlBody: "",
            textBody: null,
            attachmentRefs: [],
            status: "ACTIVE",
            lastAutosavedAt: null,
            createdBy: "user-1",
            createdAt: "2026-05-10T10:00:00Z",
            updatedAt: "2026-05-10T10:00:00Z",
          },
          created: true,
        }),
        { status: 200 }
      )
    );

    await act(async () => {
      await result.current.createDraft({
        mailboxConnectionId: "conn-1",
        mode: "NEW",
      });
    });

    expect(result.current.draftId).toBe("draft-001");

    // Step 2: trigger an autosave (which starts a 1200ms debounce)
    await act(async () => {
      void result.current.autosave({ subject: "Updated subject" });
    });

    // Step 3: discard the draft immediately — this must cancel the pending autosave
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, draftId: "draft-001" }), { status: 200 })
    );

    await act(async () => {
      await result.current.discardDraft();
    });

    expect(result.current.draftId).toBeNull();

    // Step 4: advance time past the debounce window
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // The discard handler should have called DELETE; no PATCH should have been sent after discard.
    const patchCalls = mockFetch.mock.calls.filter(
      ([url, init]: [string, RequestInit | undefined]) =>
        typeof url === "string" && url.includes("/api/mailbox/drafts/draft-001") && init?.method === "PATCH"
    );
    expect(patchCalls).toHaveLength(0);
  });

  it("cancelAutosave clears pending debounce without discarding", async () => {
    const { result } = renderHook(() => useMailboxDraft());

    // Seed draftId by mocking create
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          draft: {
            id: "draft-002",
            orgId: "org-1",
            mailboxConnectionId: "conn-1",
            threadId: null,
            replyToMessageId: null,
            mode: "NEW",
            fromIdentity: "a@example.com",
            to: [],
            cc: [],
            bcc: [],
            subject: "",
            htmlBody: "",
            textBody: null,
            attachmentRefs: [],
            status: "ACTIVE",
            lastAutosavedAt: null,
            createdBy: "user-1",
            createdAt: "2026-05-10T10:00:00Z",
            updatedAt: "2026-05-10T10:00:00Z",
          },
          created: true,
        }),
        { status: 200 }
      )
    );

    await act(async () => {
      await result.current.createDraft({
        mailboxConnectionId: "conn-1",
        mode: "NEW",
      });
    });

    // Start an autosave debounce
    await act(async () => {
      void result.current.autosave({ subject: "Should not save" });
    });

    // Cancel it directly
    act(() => {
      result.current.cancelAutosave();
    });

    // Advance time
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // No PATCH should have been sent
    const patchCalls = mockFetch.mock.calls.filter(
      ([url, init]: [string, RequestInit | undefined]) =>
        typeof url === "string" && url.includes("draft-002") && init?.method === "PATCH"
    );
    expect(patchCalls).toHaveLength(0);
    expect(result.current.draftId).toBe("draft-002");
  });
});

describe("useMailboxDraft sendDraft edge cases", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("handles 409 conflict 'Cannot send draft with status SENT' as a success case", async () => {
    const { result } = renderHook(() => useMailboxDraft());

    // Seed draftId
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          draft: { id: "draft-409", status: "ACTIVE", updatedAt: "2026-05-10T10:00:00Z" },
          created: true,
        }),
        { status: 200 }
      )
    );

    await act(async () => {
      await result.current.createDraft({
        mailboxConnectionId: "conn-1",
        mode: "NEW",
      });
    });

    expect(result.current.draftId).toBe("draft-409");

    // Mock sendDraft returning 409 with already sent message
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "Cannot send draft with status SENT" }),
        { status: 409 }
      )
    );

    let sendResult: any = null;
    await act(async () => {
      sendResult = await result.current.sendDraft();
    });

    expect(sendResult).not.toBeNull();
    expect(sendResult.draft.status).toBe("SENT");
    expect(result.current.draftId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("flushes pending autosave changes before sending the draft", async () => {
    const { result } = renderHook(() => useMailboxDraft());

    // Seed draftId
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          draft: { id: "draft-flush", status: "ACTIVE", updatedAt: "2026-05-10T10:00:00Z" },
          created: true,
        }),
        { status: 200 }
      )
    );

    await act(async () => {
      await result.current.createDraft({
        mailboxConnectionId: "conn-1",
        mode: "NEW",
      });
    });

    expect(result.current.draftId).toBe("draft-flush");

    // Trigger an autosave to queue a pending change
    await act(async () => {
      void result.current.autosave({ subject: "Flush me before send" });
    });

    // Mock performAutosave (PATCH) and sendDraft (POST /send)
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          draft: { id: "draft-flush", status: "ACTIVE", updatedAt: "2026-05-10T10:00:01Z", lastAutosavedAt: "2026-05-10T10:00:01Z" },
          stale: false,
        }),
        { status: 200 }
      )
    );
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          draft: { id: "draft-flush", status: "SENT" },
          providerMessageId: "msg-123",
          providerThreadId: "thread-123",
        }),
        { status: 200 }
      )
    );

    // Call sendDraft
    let sendResult: any = null;
    await act(async () => {
      sendResult = await result.current.sendDraft();
    });

    expect(sendResult).not.toBeNull();
    expect(sendResult.draft.status).toBe("SENT");

    // Verify PATCH was called before POST /send
    const patchCallIndex = mockFetch.mock.calls.findIndex(
      ([url, init]: [string, RequestInit | undefined]) =>
        typeof url === "string" && url.includes("draft-flush") && init?.method === "PATCH"
    );
    const postCallIndex = mockFetch.mock.calls.findIndex(
      ([url, init]: [string, RequestInit | undefined]) =>
        typeof url === "string" && url.includes("draft-flush/send") && init?.method === "POST"
    );

    expect(patchCallIndex).toBeGreaterThan(-1);
    expect(postCallIndex).toBeGreaterThan(-1);
    expect(patchCallIndex).toBeLessThan(postCallIndex);
  });
});
