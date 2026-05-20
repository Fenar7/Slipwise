import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, renderHook, act } from "@testing-library/react";
import React from "react";

import { useMessageActions } from "../lib/use-message-actions";
import { useReactions } from "../lib/use-reactions";
import { useDrafts } from "../lib/use-drafts";
import { toFrontendMessages, type ApiConversationDetail } from "../lib/mappers";

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  } as Response);
}

// ─── useMessageActions ───────────────────────────────────────────────────────

describe("useMessageActions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("edits a message successfully", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true, id: "msg-1", body: "Updated" }));

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useMessageActions(onSuccess));

    let success = false;
    await act(async () => {
      success = await result.current.editMessage("conv-1", "msg-1", "Updated");
    });

    expect(success).toBe(true);
    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("surfaces edit error on failure", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "Not allowed" }, 403));

    const { result } = renderHook(() => useMessageActions());

    let success = false;
    await act(async () => {
      success = await result.current.editMessage("conv-1", "msg-1", "Updated");
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe("Not allowed");
  });

  it("deletes a message successfully", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true, id: "msg-1" }));

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useMessageActions(onSuccess));

    let success = false;
    await act(async () => {
      success = await result.current.deleteMessage("conv-1", "msg-1");
    });

    expect(success).toBe(true);
    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });
});

// ─── useReactions ────────────────────────────────────────────────────────────

describe("useReactions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adds a reaction successfully", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true, id: "rxn-1" }, 201));

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useReactions(onSuccess));

    let success = false;
    await act(async () => {
      success = await result.current.addReaction("conv-1", "msg-1", "👍");
    });

    expect(success).toBe(true);
    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("removes a reaction successfully", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true }));

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useReactions(onSuccess));

    let success = false;
    await act(async () => {
      success = await result.current.removeReaction("conv-1", "msg-1", "👍");
    });

    expect(success).toBe(true);
    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("surfaces reaction error on failure", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "Invalid emoji" }, 400));

    const { result } = renderHook(() => useReactions());

    let success = false;
    await act(async () => {
      success = await result.current.addReaction("conv-1", "msg-1", "👍");
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe("Invalid emoji");
  });
});

// ─── API contract guard ──────────────────────────────────────────────────────

describe("Sprint 5.4 API contract", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("PATCH message calls the correct endpoint with body", async () => {
    const fetchMock = mockFetch({ success: true, id: "msg-1", body: "Edited" });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMessageActions());
    await act(async () => {
      await result.current.editMessage("conv-1", "msg-1", "Edited");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/messaging/conversations/conv-1/messages/msg-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ body: "Edited" }),
      })
    );
  });

  it("DELETE message calls the correct endpoint", async () => {
    const fetchMock = mockFetch({ success: true });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useMessageActions());
    await act(async () => {
      await result.current.deleteMessage("conv-1", "msg-1");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/messaging/conversations/conv-1/messages/msg-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("POST reaction calls the correct endpoint with action and value", async () => {
    const fetchMock = mockFetch({ success: true });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useReactions());
    await act(async () => {
      await result.current.addReaction("conv-1", "msg-1", "🎉");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/messaging/conversations/conv-1/messages/msg-1/reactions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "add", value: "🎉" }),
      })
    );
  });
});

describe("useDrafts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads the current conversation draft", async () => {
    const fetchMock = mockFetch({ success: true, data: { draft: { id: "draft-1", body: "hello", contentMeta: null, updatedAt: "2026-05-20T00:00:00.000Z" } } });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDrafts());
    let draft = null;
    await act(async () => {
      draft = await result.current.fetchDraft("conv-1");
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(draft).toEqual(expect.objectContaining({ id: "draft-1", body: "hello" }));
  });

  it("saves and deletes a scoped draft", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { id: "draft-1", body: "hello", contentMeta: null, updatedAt: "2026-05-20T00:00:00.000Z" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { deleted: true } }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDrafts());
    await act(async () => {
      await result.current.saveDraft("conv-1", "hello", "thread-1");
      await result.current.deleteDraft("conv-1", "thread-1");
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/messaging/conversations/conv-1/draft",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ body: "hello", threadId: "thread-1", contentMeta: null }),
      }),
    );
    expect(fetchMock.mock.calls[1][0]).toContain("/api/messaging/conversations/conv-1/draft?threadId=thread-1");
  });
});

describe("message mapper mention state", () => {
  it("keeps mentionsCurrentUser from live API data", () => {
    const detail: ApiConversationDetail = {
      id: "conv-1",
      orgId: "org-1",
      type: "CHANNEL",
      name: "General",
      description: null,
      visibility: "PUBLIC",
      archivedAt: null,
      lockedAt: null,
      createdBy: "user-1",
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
      participantCount: 1,
      canSend: true,
      participants: [],
      messages: [{
        id: "msg-1",
        orgId: "org-1",
        conversationId: "conv-1",
        threadId: null,
        authorId: "user-2",
        body: "@Alex please check",
        status: "ACTIVE",
        editedAt: null,
        deletedAt: null,
        reactionSummary: [],
        attachmentCount: 0,
        mentionsCurrentUser: true,
        createdAt: "2026-05-20T00:00:00.000Z",
      }],
      threads: [],
      readState: null,
      currentUserId: "user-1",
    };

    expect(toFrontendMessages(detail)[0]?.mentionsCurrentUser).toBe(true);
  });
});
