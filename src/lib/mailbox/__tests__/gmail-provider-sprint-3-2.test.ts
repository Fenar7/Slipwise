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

  it("does not store threads.list page tokens as the persisted history cursor", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            threads: [{ id: "thread-1", historyId: "1500" }],
            nextPageToken: "page-2",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(makeThreadResponse("thread-1", "1500", "Subject A"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            threads: [{ id: "thread-2", historyId: "1700" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(makeThreadResponse("thread-2", "1700", "Subject B"));

    const result = await gmailProviderAdapter.syncDelta({
      orgId: "org-1",
      tokenRef: "token-ref-1",
      cursor: null,
    });

    expect("threads" in result && result.threads).toHaveLength(2);
    expect("nextCursor" in result && result.nextCursor?.value).toBe("1700");
    expect("nextCursor" in result && result.nextCursor?.value).not.toBe("page-2");
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
