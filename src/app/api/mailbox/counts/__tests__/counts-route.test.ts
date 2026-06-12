import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationMemberRoute: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 99 }),
  RATE_LIMITS: { api: { maxRequests: 60, window: "60 s" } },
}));

vi.mock("@/lib/mailbox/visibility-service", () => ({
  listMailboxConnectionsForMember: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxMessage: {
      findMany: vi.fn(),
    },
    mailboxThread: {
      count: vi.fn(),
    },
    mailboxDraft: {
      groupBy: vi.fn(),
    },
  },
}));

import { GET } from "../route";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { listMailboxConnectionsForMember } from "@/lib/mailbox/visibility-service";
import { db } from "@/lib/db";

const mockRequireMember = vi.mocked(requireIntegrationMemberRoute);
const mockListConnectionsForMember = vi.mocked(listMailboxConnectionsForMember);
const mockDb = db as unknown as {
  mailboxMessage: {
    findMany: ReturnType<typeof vi.fn>;
  };
  mailboxThread: {
    count: ReturnType<typeof vi.fn>;
  };
  mailboxDraft: {
    groupBy: ReturnType<typeof vi.fn>;
  };
};

function makeMemberCtx(orgId = "org-1") {
  return { ok: true as const, ctx: { orgId, userId: "user-1", role: "member" } };
}

describe("GET /api/mailbox/counts route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero counts for an org with no mailbox connections", async () => {
    mockRequireMember.mockResolvedValue(makeMemberCtx());
    mockListConnectionsForMember.mockResolvedValue({ accessible: [], restricted: [] });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.smartViews["all-inboxes"]).toBe(0);
    expect(body.folders).toEqual({});
  });

  it("returns calculated counts for visible connections", async () => {
    mockRequireMember.mockResolvedValue(makeMemberCtx());
    mockListConnectionsForMember.mockResolvedValue({
      accessible: [
        { id: "conn-1", displayName: "Billing" } as any,
      ],
      restricted: [],
    });

    // Mock resolveSpamThreadIds and resolveTrashThreadIds rows
    mockDb.mailboxMessage.findMany.mockResolvedValue([
      { threadId: "t-spam", providerMetadata: { labelIds: ["SPAM"] } },
      { threadId: "t-trash", providerMetadata: { labelIds: ["TRASH"] } },
    ]);

    // Mock counts
    mockDb.mailboxThread.count
      .mockResolvedValueOnce(5)  // allInboxes
      .mockResolvedValueOnce(2)  // assignedToMe
      .mockResolvedValueOnce(3)  // unassigned
      .mockResolvedValueOnce(1)  // flagged
      .mockResolvedValueOnce(0)  // waiting
      .mockResolvedValueOnce(4)  // inboxCount
      .mockResolvedValueOnce(1)  // starredCount
      .mockResolvedValueOnce(0)  // spamCount
      .mockResolvedValueOnce(0); // trashCount

    // Mock drafts
    mockDb.mailboxDraft.groupBy.mockResolvedValue([
      { mailboxConnectionId: "conn-1", _count: 3 },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.smartViews["all-inboxes"]).toBe(5);
    expect(body.smartViews["assigned-to-me"]).toBe(2);
    expect(body.folders["conn-1"]).toEqual({
      inbox: 4,
      sent: 0,
      drafts: 3,
      starred: 1,
      spam: 0,
      trash: 0,
    });
  });
});
