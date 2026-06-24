import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  db: {
    mailboxConnection: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/mailbox/mailbox-sync-service", () => ({
  runMailboxSync: vi.fn(),
}));

import { db } from "@/lib/db";
import { runMailboxSync } from "@/lib/mailbox/mailbox-sync-service";
import { POST } from "../route";

const mockDb = db as unknown as {
  mailboxConnection: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

const mockRunMailboxSync = runMailboxSync as unknown as ReturnType<typeof vi.fn>;

function buildRequest(
  payload: object,
  options: { token?: string; authorization?: string } = {},
): NextRequest {
  const url = new URL("http://localhost/api/mailbox/webhooks/gmail");
  if (options.token) {
    url.searchParams.set("token", options.token);
  }
  return new NextRequest(url, {
    method: "POST",
    headers: options.authorization
      ? { authorization: options.authorization, "content-type": "application/json" }
      : { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function encodeNotification(body: object): string {
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MAILBOX_WEBHOOK_SECRET = "test-mailbox-secret";
});

describe("POST /api/mailbox/webhooks/gmail", () => {
  it("returns 401 when the webhook secret is invalid", async () => {
    const req = buildRequest({
      message: {
        data: encodeNotification({ emailAddress: "fenar@example.com", historyId: "123" }),
      },
    });

    const response = await POST(req);
    expect(response.status).toBe(401);
  });

  it("triggers webhook sync for matching Gmail mailboxes", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([
      { id: "conn-1", orgId: "org-1", connectedBy: "user-1" },
      { id: "conn-2", orgId: "org-2", connectedBy: "user-2" },
    ]);
    mockRunMailboxSync
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });

    const req = buildRequest(
      {
        message: {
          data: encodeNotification({ emailAddress: "fenar@example.com", historyId: "123" }),
        },
      },
      { token: "test-mailbox-secret" },
    );

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockDb.mailboxConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: "GMAIL",
          emailAddress: "fenar@example.com",
        }),
      }),
    );
    expect(mockRunMailboxSync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orgId: "org-1",
        connectionId: "conn-1",
        actorId: "user-1",
        triggerSource: "WEBHOOK",
      }),
    );
    expect(mockRunMailboxSync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orgId: "org-2",
        connectionId: "conn-2",
        actorId: "user-2",
        triggerSource: "WEBHOOK",
      }),
    );
    expect(body).toMatchObject({
      received: true,
      emailAddress: "fenar@example.com",
      matchedConnections: 2,
      triggered: 1,
      skipped: 1,
      failures: [],
    });
  });

  it("returns 400 for malformed Pub/Sub data", async () => {
    const req = buildRequest(
      {
        message: {
          data: "%%%not-base64%%%",
        },
      },
      { authorization: "Bearer test-mailbox-secret" },
    );

    const response = await POST(req);
    expect(response.status).toBe(400);
  });
});
