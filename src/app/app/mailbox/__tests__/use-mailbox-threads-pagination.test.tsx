import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMailboxThreads } from "../use-mailbox-threads";

function makeThread(id: string) {
  return {
    id,
    mailboxConnectionId: "conn-1",
    providerThreadId: `provider-${id}`,
    subject: `Subject ${id}`,
    participants: [{ email: `${id}@example.com`, displayName: `Sender ${id}` }],
    lastMessageAt: "2026-06-01T10:00:00.000Z",
    unreadCount: 0,
    status: "OPEN" as const,
    assigneeId: null,
    assigneeName: null,
    isFlagged: false,
    previewSnippet: `Preview ${id}`,
    attachmentCount: 0,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

function makeMessage(id: string, threadId: string | null = `thread-${id}`) {
  return {
    id: null,
    threadId,
    providerThreadId: `provider-thread-${id}`,
    providerMessageId: `provider-message-${id}`,
    from: { email: `${id}@example.com`, displayName: `Sender ${id}` },
    subject: `Subject ${id}`,
    snippet: `Snippet ${id}`,
    sentAt: "2026-06-01T10:00:00.000Z",
    threadSubject: `Thread ${id}`,
    mailboxConnectionId: "conn-1",
    isShellResult: threadId == null,
    mailboxDisplayName: "Billing",
  };
}

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

const mockFetch = vi.fn<typeof fetch>();

describe("useMailboxThreads pagination", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the first page and appends the next page with loadMore()", async () => {
    mockFetch
      .mockImplementationOnce(() =>
        jsonResponse({
          threads: [makeThread("thread-1"), makeThread("thread-2")],
          nextCursor: "cursor-2",
          totalCount: 3,
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          threads: [makeThread("thread-3")],
          nextCursor: null,
          totalCount: 3,
        }),
      );

    const { result } = renderHook(() =>
      useMailboxThreads({ connectionId: "conn-1", folder: "INBOX" }),
    );

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "thread-1",
        "thread-2",
      ]);
    });

    expect(result.current.totalCount).toBe(3);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.isLoadingMore).toBe(false);

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "thread-1",
        "thread-2",
        "thread-3",
      ]);
    });

    expect(result.current.totalCount).toBe(3);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.nextCursor).toBeNull();
  });

  it("prevents duplicate pagination requests and dedupes overlapping appended threads", async () => {
    const appendResponse = createDeferred<Response>();

    mockFetch
      .mockImplementationOnce(() =>
        jsonResponse({
          threads: [makeThread("thread-1"), makeThread("thread-2")],
          nextCursor: "cursor-2",
          totalCount: 4,
        }),
      )
      .mockImplementationOnce(() => appendResponse.promise);

    const { result } = renderHook(() =>
      useMailboxThreads({ connectionId: "conn-1" }),
    );

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "thread-1",
        "thread-2",
      ]);
    });

    await act(async () => {
      result.current.loadMore();
      result.current.loadMore();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.isLoadingMore).toBe(true);

    appendResponse.resolve(
      new Response(
        JSON.stringify({
          threads: [makeThread("thread-2"), makeThread("thread-3")],
          nextCursor: "cursor-3",
          totalCount: 4,
        }),
        { status: 200 },
      ),
    );

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "thread-1",
        "thread-2",
        "thread-3",
      ]);
    });

    expect(result.current.isLoadingMore).toBe(false);
  });

  it("appends and dedupes message-mode results across loadMore()", async () => {
    mockFetch
      .mockImplementationOnce(() =>
        jsonResponse({
          threads: [],
          messages: [makeMessage("1"), makeMessage("2")],
          nextCursor: "cursor-2",
          totalCount: 3,
          searchMeta: { searchMode: "messages" },
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          threads: [],
          messages: [makeMessage("2"), makeMessage("3", null)],
          nextCursor: null,
          totalCount: 3,
          searchMeta: { searchMode: "messages" },
        }),
      );

    const { result } = renderHook(() =>
      useMailboxThreads({ connectionId: "conn-1", searchQuery: "invoice", searchMode: "messages" }),
    );

    await waitFor(() => {
      expect(result.current.messages.map((message) => message.providerMessageId)).toEqual([
        "provider-message-1",
        "provider-message-2",
      ]);
    });

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.messages.map((message) => message.providerMessageId)).toEqual([
        "provider-message-1",
        "provider-message-2",
        "provider-message-3",
      ]);
    });

    expect(result.current.messages[2]?.isShellResult).toBe(true);
    expect(result.current.hasMore).toBe(false);
  });

  it("resets pagination on search changes and ignores stale append responses", async () => {
    const staleAppendResponse = createDeferred<Response>();
    const refreshedSearchResponse = createDeferred<Response>();

    mockFetch
      .mockImplementationOnce(() =>
        jsonResponse({
          threads: [makeThread("thread-1"), makeThread("thread-2")],
          nextCursor: "cursor-2",
          totalCount: 5,
        }),
      )
      .mockImplementationOnce(() => staleAppendResponse.promise)
      .mockImplementationOnce(() => refreshedSearchResponse.promise);

    const { result, rerender } = renderHook(
      ({ searchQuery }) =>
        useMailboxThreads({
          connectionId: "conn-1",
          searchQuery,
        }),
      {
        initialProps: { searchQuery: "" },
      },
    );

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "thread-1",
        "thread-2",
      ]);
    });

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.isLoadingMore).toBe(true);
    });

    rerender({ searchQuery: "invoice" });

    await act(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, SEARCH_DEBOUNCE_MS + 25),
      );
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    expect(result.current.threads).toEqual([]);
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.totalCount).toBe(0);
    expect(result.current.isLoading).toBe(true);

    refreshedSearchResponse.resolve(
      new Response(
        JSON.stringify({
          threads: [makeThread("search-thread-1")],
          nextCursor: null,
          totalCount: 1,
        }),
        { status: 200 },
      ),
    );

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "search-thread-1",
      ]);
    });

    staleAppendResponse.resolve(
      new Response(
        JSON.stringify({
          threads: [makeThread("stale-thread")],
          nextCursor: null,
          totalCount: 6,
        }),
        { status: 200 },
      ),
    );

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "search-thread-1",
      ]);
    });
  });

  it("refetches from page one when filters or routes change", async () => {
    mockFetch
      .mockImplementationOnce(() =>
        jsonResponse({
          threads: [makeThread("thread-1")],
          nextCursor: "cursor-2",
          totalCount: 2,
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          threads: [makeThread("unread-thread")],
          nextCursor: null,
          totalCount: 1,
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          threads: [makeThread("sent-thread")],
          nextCursor: null,
          totalCount: 1,
        }),
      );

    const { result, rerender } = renderHook(
      ({ unreadOnly, folder }) =>
        useMailboxThreads({
          connectionId: "conn-1",
          unreadOnly,
          folder,
        }),
      {
        initialProps: { unreadOnly: false, folder: "INBOX" as const },
      },
    );

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "thread-1",
      ]);
    });

    rerender({ unreadOnly: true, folder: "INBOX" as const });

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "unread-thread",
      ]);
    });

    rerender({ unreadOnly: true, folder: "SENT" as const });

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "sent-thread",
      ]);
    });

    expect(mockFetch.mock.calls[1]?.[0]).toContain("unreadOnly=true");
    expect(mockFetch.mock.calls[2]?.[0]).toContain("folder=SENT");
  });
});

const SEARCH_DEBOUNCE_MS = 300;
