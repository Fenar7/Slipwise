import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, renderHook, act } from "@testing-library/react";
import React from "react";

import { useMessageActions } from "../lib/use-message-actions";
import { useReactions } from "../lib/use-reactions";

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
