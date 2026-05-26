/**
 * Mailbox Phase 3 Sprint 3.2 — Gmail provider delta-sync regression tests.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/mailbox/credential-store", () => ({
  storeMailboxCredential: vi.fn(),
  readMailboxCredential: vi.fn(),
  rotateMailboxCredential: vi.fn(),
  revokeMailboxCredential: vi.fn(),
}));

import { readMailboxCredential } from "@/lib/mailbox/credential-store";
import { gmailProviderAdapter } from "@/lib/mailbox/gmail-provider";

const fetchMock = vi.fn<typeof fetch>();
global.fetch = fetchMock;

describe("gmailProviderAdapter Sprint 3.2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    process.env.GMAIL_CLIENT_ID = "client-id";
    process.env.GMAIL_CLIENT_SECRET = "client-secret";
    process.env.GMAIL_REDIRECT_URI = "http://localhost/callback";
    vi.mocked(readMailboxCredential).mockResolvedValue({
      accessToken: "token-123",
      refreshToken: "refresh-123",
      expiresAtMs: Date.now() + 60_000,
      tokenType: "Bearer",
      scope: "gmail.readonly",
    });
  });

  it("maps historyNotFound to watch_expired", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { errors: [{ reason: "historyNotFound" }] } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await gmailProviderAdapter.syncDelta({
      orgId: "org-1",
      tokenRef: "token-ref-1",
      cursor: { value: "1000", expiresAt: null },
    });

    expect("category" in result && result.category).toBe("watch_expired");
  });

  it("uses the terminal historyId after paginated history.list delta sync", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            historyId: "2000",
            nextPageToken: "page-2",
            history: [{ messagesAdded: [{ message: { id: "m1", threadId: "thread-1" } }] }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            historyId: "3000",
            history: [{ labelsAdded: [{ message: { id: "m2", threadId: "thread-2" } }] }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(makeThreadResponse("thread-1", "2500", "Subject A"))
      .mockResolvedValueOnce(makeThreadResponse("thread-2", "3000", "Subject B"));

    const result = await gmailProviderAdapter.syncDelta({
      orgId: "org-1",
      tokenRef: "token-ref-1",
      cursor: { value: "1000", expiresAt: null },
    });

    expect("nextCursor" in result && result.nextCursor?.value).toBe("3000");
  });

  it("seeds the initial sync cursor from the live Gmail profile historyId", async () => {
    vi.mocked(readMailboxCredential).mockResolvedValue({
      accessToken: "token-123",
      refreshToken: "refresh-123",
      expiresAtMs: Date.now() + 3_600_000,
      tokenType: "Bearer",
      scope: "gmail.readonly",
    });

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            threads: [{ id: "thread-1", historyId: "1500" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            threads: [{ id: "thread-2", historyId: "1700" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            threads: [{ id: "thread-3", historyId: "1900" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            threads: [{ id: "thread-4", historyId: "1900" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            threads: [{ id: "thread-5", historyId: "1900" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(makeThreadResponse("thread-1", "1500", "Subject A"))
      .mockResolvedValueOnce(makeThreadResponse("thread-2", "1700", "Subject B"))
      .mockResolvedValueOnce(makeThreadResponse("thread-3", "1900", "Subject C"))
      .mockResolvedValueOnce(makeThreadResponse("thread-4", "1900", "Subject D"))
      .mockResolvedValueOnce(makeThreadResponse("thread-5", "1900", "Subject E"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            emailAddress: "ops@example.com",
            messagesTotal: 120,
            historyId: "9000",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await gmailProviderAdapter.syncDelta({
      orgId: "org-1",
      tokenRef: "token-ref-1",
      cursor: null,
    });

    expect("nextCursor" in result && result.nextCursor?.value).toBe("9000");
    expect("nextCursor" in result && result.nextCursor?.value).not.toBe("page-2");
    const threadsListCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === "string" && (call[0] as string).includes("/threads?"),
    );
    expect(threadsListCalls).toHaveLength(5);
  });

  it("fetches all required Gmail system labels during initial sync including drafts and archive", async () => {
    // Use a far-future expiry so ensureValidAccessToken does not trigger
    // a refresh and consume our carefully-ordered mocks.
    vi.mocked(readMailboxCredential).mockResolvedValue({
      accessToken: "token-123",
      refreshToken: "refresh-123",
      expiresAtMs: Date.now() + 3_600_000,
      tokenType: "Bearer",
      scope: "gmail.readonly",
    });

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            threads: [{ id: "thread-1", historyId: "1500" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ threads: [{ id: "thread-1", historyId: "1500" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ threads: [{ id: "thread-1", historyId: "1500" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ threads: [{ id: "thread-1", historyId: "1500" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ threads: [{ id: "thread-1", historyId: "1500" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(makeThreadResponse("thread-1", "1500", "Subject A"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            emailAddress: "ops@example.com",
            messagesTotal: 120,
            historyId: "9100",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await gmailProviderAdapter.syncDelta({
      orgId: "org-1",
      tokenRef: "token-ref-1",
      cursor: null,
    });

    expect("nextCursor" in result && result.nextCursor?.value).toBe("9100");
    const threadsListCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === "string" && (call[0] as string).includes("/threads?"),
    );
    // 5 slices: INBOX, SENT, SPAM, DRAFT, ARCHIVE
    expect(threadsListCalls).toHaveLength(5);
    expect(threadsListCalls[0]?.[0]).toContain("q=in%3Ainbox");
    expect(threadsListCalls[1]?.[0]).toContain("q=in%3Asent");
    expect(threadsListCalls[2]?.[0]).toContain("q=in%3Aspam");
    expect(threadsListCalls[3]?.[0]).toContain("q=in%3Adraft");
    expect(threadsListCalls[4]?.[0]).toContain("q=-in%3Ainbox");
    const threadDetailCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === "string" && (call[0] as string).includes("/threads/thread-1"),
    );
    expect(threadDetailCalls).toHaveLength(1);
  });

  it("deduplicates overlapping bootstrap thread ids across inbox, sent, and spam slices", async () => {
    vi.mocked(readMailboxCredential).mockResolvedValue({
      accessToken: "token-123",
      refreshToken: "refresh-123",
      expiresAtMs: Date.now() + 3_600_000,
      tokenType: "Bearer",
      scope: "gmail.readonly",
    });

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ threads: [{ id: "thread-1", historyId: "1500" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ threads: [{ id: "thread-1", historyId: "1600" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ threads: [{ id: "thread-1", historyId: "1700" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ threads: [{ id: "thread-1", historyId: "1700" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ threads: [{ id: "thread-1", historyId: "1700" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(makeThreadResponse("thread-1", "1700", "Subject A"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            emailAddress: "ops@example.com",
            messagesTotal: 120,
            historyId: "9200",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await gmailProviderAdapter.syncDelta({
      orgId: "org-1",
      tokenRef: "token-ref-1",
      cursor: null,
    });

    expect("threads" in result && result.threads).toHaveLength(1);
    const threadDetailCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === "string" && (call[0] as string).includes("/threads/thread-1"),
    );
    expect(threadDetailCalls).toHaveLength(1);
  });

  it("renews Gmail watch across inbox, sent, spam, and draft labels", async () => {
    process.env.GMAIL_PUBSUB_TOPIC = "projects/example/topics/gmail";
    vi.mocked(readMailboxCredential).mockResolvedValue({
      accessToken: "token-123",
      refreshToken: "refresh-123",
      expiresAtMs: Date.now() + 3_600_000,
      tokenType: "Bearer",
      scope: "gmail.readonly",
    });

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ historyId: "9800", expiration: String(Date.now() + 60_000) }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await gmailProviderAdapter.renewWatch({
      orgId: "org-1",
      tokenRef: "token-ref-1",
    });

    expect("metadata" in result).toBe(true);
    const [, options] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(options?.body ?? "{}"));
    expect(body.labelIds).toEqual(["INBOX", "SENT", "SPAM", "DRAFT"]);
  });

  it("syncs provider drafts through drafts.list and drafts.get, then resolves thread envelopes", async () => {
    vi.mocked(readMailboxCredential).mockResolvedValue({
      accessToken: "token-123",
      refreshToken: "refresh-123",
      expiresAtMs: Date.now() + 3_600_000,
      tokenType: "Bearer",
      scope: "gmail.readonly",
    });

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            drafts: [{ id: "draft-1" }, { id: "draft-2" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "draft-1",
            message: {
              id: "msg-draft-1",
              threadId: "thread-draft-1",
              internalDate: String(Date.now()),
              payload: {
                headers: [
                  { name: "Subject", value: "Draft Subject A" },
                  { name: "From", value: "A <a@example.com>" },
                  { name: "To", value: "B <b@example.com>" },
                ],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "draft-2",
            message: {
              id: "msg-draft-2",
              threadId: "thread-draft-2",
              internalDate: String(Date.now()),
              payload: {
                headers: [
                  { name: "Subject", value: "Draft Subject B" },
                  { name: "From", value: "A <a@example.com>" },
                  { name: "To", value: "B <b@example.com>" },
                ],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await gmailProviderAdapter.syncDrafts({
      orgId: "org-1",
      tokenRef: "token-ref-1",
    });

    expect("drafts" in result && result.drafts).toHaveLength(2);
    expect("activeDraftIds" in result && result.activeDraftIds).toEqual([
      "draft-1",
      "draft-2",
    ]);
    expect("drafts" in result && result.drafts[0]?.draftId).toBe("draft-1");
  });

  it("skips disappearing drafts during syncDrafts instead of failing the whole import", async () => {
    vi.mocked(readMailboxCredential).mockResolvedValue({
      accessToken: "token-123",
      refreshToken: "refresh-123",
      expiresAtMs: Date.now() + 3_600_000,
      tokenType: "Bearer",
      scope: "gmail.readonly",
    });

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            drafts: [{ id: "draft-1" }, { id: "draft-missing" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "draft-1",
            message: {
              id: "msg-draft-1",
              threadId: "thread-draft-1",
              internalDate: String(Date.now()),
              payload: {
                headers: [
                  { name: "Subject", value: "Draft Subject A" },
                  { name: "From", value: "A <a@example.com>" },
                  { name: "To", value: "B <b@example.com>" },
                ],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { errors: [{ reason: "notFound" }] } }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await gmailProviderAdapter.syncDrafts({
      orgId: "org-1",
      tokenRef: "token-ref-1",
    });

    expect("drafts" in result && result.drafts).toHaveLength(1);
    expect("activeDraftIds" in result && result.activeDraftIds).toEqual([
      "draft-1",
    ]);
  });

  it("keeps sparse Gmail drafts that are missing message.id or threadId by synthesizing stable draft-backed ids", async () => {
    vi.mocked(readMailboxCredential).mockResolvedValue({
      accessToken: "token-123",
      refreshToken: "refresh-123",
      expiresAtMs: Date.now() + 3_600_000,
      tokenType: "Bearer",
      scope: "gmail.readonly",
    });

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            drafts: [{ id: "draft-sparse-1" }, { id: "draft-sparse-2" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "draft-sparse-1",
            message: {
              threadId: "thread-sparse-1",
              internalDate: String(Date.now()),
              payload: {
                headers: [{ name: "From", value: "A <a@example.com>" }],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "draft-sparse-2",
            message: {
              id: "msg-sparse-2",
              internalDate: String(Date.now()),
              payload: {
                headers: [{ name: "From", value: "A <a@example.com>" }],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await gmailProviderAdapter.syncDrafts({
      orgId: "org-1",
      tokenRef: "token-ref-1",
    });

    expect("drafts" in result && result.drafts).toHaveLength(2);
    expect("activeDraftIds" in result && result.activeDraftIds).toEqual([
      "draft-sparse-1",
      "draft-sparse-2",
    ]);
    if ("drafts" in result) {
      expect(result.drafts[0]?.message.providerMessageId).toBe("gmail-draft-message:draft-sparse-1");
      expect(result.drafts[1]?.thread.providerThreadId).toBe("gmail-draft-thread:draft-sparse-2");
    }
  });
});

function makeThreadResponse(id: string, historyId: string, subject: string): Response {
  return new Response(
    JSON.stringify({
      id,
      historyId,
      messages: [
        {
          id: `${id}-msg-1`,
          threadId: id,
          historyId,
          labelIds: [],
          snippet: "hello",
          internalDate: String(Date.now()),
          payload: {
            headers: [
              { name: "Subject", value: subject },
              { name: "From", value: "A <a@example.com>" },
              { name: "To", value: "B <b@example.com>" },
            ],
            body: {},
          },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function b64(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function makeThreadDetailResponse(messages: Array<{
  id: string;
  payload: Record<string, unknown>;
  labelIds?: string[];
  internalDate?: string;
}>): Response {
  return new Response(
    JSON.stringify({
      id: "thread-detail",
      historyId: "1000",
      messages,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ─── fetchThreadDetail body extraction tests ──────────────────────────────────

describe("gmailProviderAdapter.fetchThreadDetail — body extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.mocked(readMailboxCredential).mockResolvedValue({
      accessToken: "token-123",
      refreshToken: "refresh-123",
      expiresAtMs: Date.now() + 3_600_000,
      tokenType: "Bearer",
      scope: "gmail.readonly",
    });
  });

  it("extracts root-level text/plain body", async () => {
    fetchMock.mockResolvedValueOnce(
      makeThreadDetailResponse([
        {
          id: "msg-1",
          internalDate: String(Date.now()),
          payload: {
            mimeType: "text/plain",
            headers: [
              { name: "Subject", value: "Hello" },
              { name: "From", value: "a@example.com" },
            ],
            body: { data: b64("Plain text body") },
          },
        },
      ]),
    );

    const result = await gmailProviderAdapter.fetchThreadDetail({
      orgId: "org-1",
      tokenRef: "token-ref-1",
      providerThreadId: "thread-1",
    });

    expect("messages" in result).toBe(true);
    const messages = (result as { messages: Array<{ htmlBody: string; textBody: string | null }> }).messages;
    expect(messages[0].htmlBody).toBe("");
    expect(messages[0].textBody).toBe("Plain text body");
  });

  it("extracts root-level text/html body", async () => {
    fetchMock.mockResolvedValueOnce(
      makeThreadDetailResponse([
        {
          id: "msg-1",
          internalDate: String(Date.now()),
          payload: {
            mimeType: "text/html",
            headers: [
              { name: "Subject", value: "Hello" },
              { name: "From", value: "a@example.com" },
            ],
            body: { data: b64("<p>HTML body</p>") },
          },
        },
      ]),
    );

    const result = await gmailProviderAdapter.fetchThreadDetail({
      orgId: "org-1",
      tokenRef: "token-ref-1",
      providerThreadId: "thread-1",
    });

    expect("messages" in result).toBe(true);
    const messages = (result as { messages: Array<{ htmlBody: string; textBody: string | null }> }).messages;
    expect(messages[0].htmlBody).toBe("<p>HTML body</p>");
    expect(messages[0].textBody).toBeNull();
  });

  it("extracts bodies from multipart/alternative", async () => {
    fetchMock.mockResolvedValueOnce(
      makeThreadDetailResponse([
        {
          id: "msg-1",
          internalDate: String(Date.now()),
          payload: {
            mimeType: "multipart/alternative",
            headers: [
              { name: "Subject", value: "Hello" },
              { name: "From", value: "a@example.com" },
            ],
            parts: [
              {
                mimeType: "text/plain",
                body: { data: b64("Plain fallback") },
              },
              {
                mimeType: "text/html",
                body: { data: b64("<p>HTML content</p>") },
              },
            ],
          },
        },
      ]),
    );

    const result = await gmailProviderAdapter.fetchThreadDetail({
      orgId: "org-1",
      tokenRef: "token-ref-1",
      providerThreadId: "thread-1",
    });

    expect("messages" in result).toBe(true);
    const messages = (result as { messages: Array<{ htmlBody: string; textBody: string | null }> }).messages;
    expect(messages[0].htmlBody).toBe("<p>HTML content</p>");
    expect(messages[0].textBody).toBe("Plain fallback");
  });

  it("extracts bodies from nested multipart/mixed → multipart/alternative", async () => {
    fetchMock.mockResolvedValueOnce(
      makeThreadDetailResponse([
        {
          id: "msg-1",
          internalDate: String(Date.now()),
          payload: {
            mimeType: "multipart/mixed",
            headers: [
              { name: "Subject", value: "Hello" },
              { name: "From", value: "a@example.com" },
            ],
            parts: [
              {
                mimeType: "multipart/alternative",
                parts: [
                  {
                    mimeType: "text/plain",
                    body: { data: b64("Nested plain") },
                  },
                  {
                    mimeType: "text/html",
                    body: { data: b64("<p>Nested html</p>") },
                  },
                ],
              },
              {
                mimeType: "application/pdf",
                filename: "doc.pdf",
                body: { attachmentId: "att-1" },
              },
            ],
          },
        },
      ]),
    );

    const result = await gmailProviderAdapter.fetchThreadDetail({
      orgId: "org-1",
      tokenRef: "token-ref-1",
      providerThreadId: "thread-1",
    });

    expect("messages" in result).toBe(true);
    const messages = (result as { messages: Array<{ htmlBody: string; textBody: string | null }> }).messages;
    expect(messages[0].htmlBody).toBe("<p>Nested html</p>");
    expect(messages[0].textBody).toBe("Nested plain");
  });

  it("extracts html from multipart/related with inline assets", async () => {
    fetchMock.mockResolvedValueOnce(
      makeThreadDetailResponse([
        {
          id: "msg-1",
          internalDate: String(Date.now()),
          payload: {
            mimeType: "multipart/related",
            headers: [
              { name: "Subject", value: "Hello" },
              { name: "From", value: "a@example.com" },
            ],
            parts: [
              {
                mimeType: "text/html",
                body: { data: b64("<p>HTML with inline</p>") },
              },
              {
                mimeType: "image/png",
                body: { attachmentId: "inline-1" },
              },
            ],
          },
        },
      ]),
    );

    const result = await gmailProviderAdapter.fetchThreadDetail({
      orgId: "org-1",
      tokenRef: "token-ref-1",
      providerThreadId: "thread-1",
    });

    expect("messages" in result).toBe(true);
    const messages = (result as { messages: Array<{ htmlBody: string; textBody: string | null }> }).messages;
    expect(messages[0].htmlBody).toBe("<p>HTML with inline</p>");
    expect(messages[0].textBody).toBeNull();
  });

  it("skips message/rfc822 subtrees (forwarded emails)", async () => {
    fetchMock.mockResolvedValueOnce(
      makeThreadDetailResponse([
        {
          id: "msg-1",
          internalDate: String(Date.now()),
          payload: {
            mimeType: "multipart/mixed",
            headers: [
              { name: "Subject", value: "Fwd: Hello" },
              { name: "From", value: "a@example.com" },
            ],
            parts: [
              {
                mimeType: "text/plain",
                body: { data: b64("See attached") },
              },
              {
                mimeType: "message/rfc822",
                parts: [
                  {
                    mimeType: "text/plain",
                    body: { data: b64("Forwarded body should be ignored") },
                  },
                ],
              },
            ],
          },
        },
      ]),
    );

    const result = await gmailProviderAdapter.fetchThreadDetail({
      orgId: "org-1",
      tokenRef: "token-ref-1",
      providerThreadId: "thread-1",
    });

    expect("messages" in result).toBe(true);
    const messages = (result as { messages: Array<{ htmlBody: string; textBody: string | null }> }).messages;
    expect(messages[0].textBody).toBe("See attached");
    expect(messages[0].htmlBody).toBe("");
  });

  it("returns empty bodies when no text/html or text/plain parts exist", async () => {
    fetchMock.mockResolvedValueOnce(
      makeThreadDetailResponse([
        {
          id: "msg-1",
          internalDate: String(Date.now()),
          payload: {
            mimeType: "multipart/mixed",
            headers: [
              { name: "Subject", value: "Hello" },
              { name: "From", value: "a@example.com" },
            ],
            parts: [
              {
                mimeType: "application/pdf",
                filename: "doc.pdf",
                body: { attachmentId: "att-1" },
              },
            ],
          },
        },
      ]),
    );

    const result = await gmailProviderAdapter.fetchThreadDetail({
      orgId: "org-1",
      tokenRef: "token-ref-1",
      providerThreadId: "thread-1",
    });

    expect("messages" in result).toBe(true);
    const messages = (result as { messages: Array<{ htmlBody: string; textBody: string | null }> }).messages;
    expect(messages[0].htmlBody).toBe("");
    expect(messages[0].textBody).toBeNull();
  });

  describe("Gmail drafts survival and fallback regression tests", () => {
    it("handles drafts with missing threadId, message.id, To, Subject, and bodies", async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ drafts: [{ id: "draft-sparse" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "draft-sparse",
              message: {
                payload: {
                  headers: [],
                  body: {}
                }
              }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );

      const result = await gmailProviderAdapter.syncDrafts({
        orgId: "org-1",
        tokenRef: "token-ref-1",
      });

      expect("drafts" in result).toBe(true);
      const draftsResult = result as { drafts: import("../provider-contracts").MailboxDraftEnvelope[] };
      expect(draftsResult.drafts).toHaveLength(1);
      
      const envelope = draftsResult.drafts[0];
      expect(envelope.draftId).toBe("draft-sparse");
      expect(envelope.thread.providerThreadId).toBe("gmail-draft-thread:draft-sparse");
      expect(envelope.thread.subject).toBe("(No subject)");
      expect(envelope.message.providerMessageId).toBe("gmail-draft-message:draft-sparse");
      expect(envelope.message.subject).toBe("(No subject)");
      expect(envelope.message.to).toEqual([]);
    });

    it("survives completely missing message payload (truthful fallback, isUnavailable flag)", async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ drafts: [{ id: "draft-no-msg" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "draft-no-msg"
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );

      const result = await gmailProviderAdapter.syncDrafts({
        orgId: "org-1",
        tokenRef: "token-ref-1",
      });

      expect("drafts" in result).toBe(true);
      const draftsResult = result as { drafts: import("../provider-contracts").MailboxDraftEnvelope[] };
      expect(draftsResult.drafts).toHaveLength(1);

      const envelope = draftsResult.drafts[0];
      expect(envelope.draftId).toBe("draft-no-msg");
      expect(envelope.thread.providerThreadId).toBe("gmail-draft-thread:draft-no-msg");
      expect(envelope.thread.subject).toBe("(No subject)");
      expect(envelope.message.providerMetadata.isUnavailable).toBe(true);
    });

    it("handles text-only bodies correctly (renders text in pre-wrap div)", async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ drafts: [{ id: "draft-text" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "draft-text",
              message: {
                id: "msg-text",
                threadId: "thread-text",
                payload: {
                  mimeType: "text/plain",
                  headers: [
                    { name: "Subject", value: "Text Draft" },
                    { name: "From", value: "sender@example.com" }
                  ],
                  body: { data: b64("This is plain text draft content.") }
                }
              }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );

      const result = await gmailProviderAdapter.syncDrafts({
        orgId: "org-1",
        tokenRef: "token-ref-1",
      });

      expect("drafts" in result).toBe(true);
      const draftsResult = result as { drafts: import("../provider-contracts").MailboxDraftEnvelope[] };
      expect(draftsResult.drafts).toHaveLength(1);

      const envelope = draftsResult.drafts[0];
      expect(envelope.message.textBody).toBe("This is plain text draft content.");
      expect(envelope.message.htmlBody).toBe('<div style="white-space: pre-wrap;">This is plain text draft content.</div>');
    });

    it("handles multiple pages of users.drafts.list correctly", async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              drafts: [{ id: "draft-page1-1" }, { id: "draft-page1-2" }],
              nextPageToken: "token-page2"
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              drafts: [{ id: "draft-page2-1" }]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "draft-page1-1", message: { id: "m1", payload: { headers: [] } } }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "draft-page1-2", message: { id: "m2", payload: { headers: [] } } }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "draft-page2-1", message: { id: "m3", payload: { headers: [] } } }), { status: 200 }));

      const result = await gmailProviderAdapter.syncDrafts({
        orgId: "org-1",
        tokenRef: "token-ref-1",
      });

      expect("drafts" in result).toBe(true);
      const draftsResult = result as { drafts: import("../provider-contracts").MailboxDraftEnvelope[] };
      expect(draftsResult.drafts).toHaveLength(3);
      expect(draftsResult.drafts.map((d) => d.draftId)).toEqual([
        "draft-page1-1",
        "draft-page1-2",
        "draft-page2-1"
      ]);
    });

    it("handles malformed/invalid internalDate without crashing (RangeError prevention)", async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ drafts: [{ id: "draft-bad-date" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "draft-bad-date",
              message: {
                id: "msg-bad-date",
                threadId: "thread-bad-date",
                internalDate: "NaN",
                payload: {
                  headers: []
                }
              }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );

      const result = await gmailProviderAdapter.syncDrafts({
        orgId: "org-1",
        tokenRef: "token-ref-1",
      });

      expect("drafts" in result).toBe(true);
      const draftsResult = result as { drafts: import("../provider-contracts").MailboxDraftEnvelope[] };
      expect(draftsResult.drafts).toHaveLength(1);
      
      const envelope = draftsResult.drafts[0];
      expect(new Date(envelope.thread.lastMessageAt).getTime()).not.toBeNaN();
    });

    it("continues the batch when a single draft fetch hits a non-not_found error", async () => {
      vi.mocked(readMailboxCredential).mockResolvedValue({
        accessToken: "token-123",
        refreshToken: "refresh-123",
        expiresAtMs: Date.now() + 3_600_000,
        tokenType: "Bearer",
        scope: "gmail.readonly",
      });

      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ drafts: [{ id: "draft-ok" }, { id: "draft-bad" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "draft-ok",
              message: {
                id: "msg-ok",
                threadId: "thread-ok",
                internalDate: String(Date.now()),
                payload: {
                  headers: [
                    { name: "Subject", value: "OK Draft" },
                    { name: "From", value: "A <a@example.com>" },
                    { name: "To", value: "B <b@example.com>" },
                  ],
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { errors: [{ reason: "backendError" }] } }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { errors: [{ reason: "backendError" }] } }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { errors: [{ reason: "backendError" }] } }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { errors: [{ reason: "backendError" }] } }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
        );

      const result = await gmailProviderAdapter.syncDrafts({
        orgId: "org-1",
        tokenRef: "token-ref-1",
      });

      expect("drafts" in result && result.drafts).toHaveLength(1);
      expect("activeDraftIds" in result && result.activeDraftIds).toEqual(["draft-ok"]);
      expect("failedDraftIds" in result && result.failedDraftIds).toEqual(["draft-bad"]);
    });

    it("retries transient draft fetch errors with exponential backoff", async () => {
      vi.mocked(readMailboxCredential).mockResolvedValue({
        accessToken: "token-123",
        refreshToken: "refresh-123",
        expiresAtMs: Date.now() + 3_600_000,
        tokenType: "Bearer",
        scope: "gmail.readonly",
      });

      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ drafts: [{ id: "draft-retry" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "draft-retry",
              message: {
                id: "msg-retry",
                threadId: "thread-retry",
                internalDate: String(Date.now()),
                payload: {
                  headers: [
                    { name: "Subject", value: "Retry Draft" },
                    { name: "From", value: "A <a@example.com>" },
                  ],
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );

      const result = await gmailProviderAdapter.syncDrafts({
        orgId: "org-1",
        tokenRef: "token-ref-1",
      });

      expect("drafts" in result && result.drafts).toHaveLength(1);
      expect("activeDraftIds" in result && result.activeDraftIds).toEqual(["draft-retry"]);
      expect("failedDraftIds" in result && result.failedDraftIds).toEqual([]);
    });
  });
});
