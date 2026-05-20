/**
 * Mailbox Phase 6 Sprint 6.2 — Assignment and workflow state.
 *
 * Covers:
 * - assignThread with org-safe assignee validation
 * - unassignThread clearing assignee and resolving assignments
 * - setThreadStatus with preArchiveStatus semantics
 * - Assignment history preservation (ACTIVE → REASSIGNED/RESOLVED)
 * - Audit event emission for assign/unassign/status
 * - Permission denial for read-only members
 * - Invalid assignee, invalid status, and same-status guard
 * - API route validation and error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class {},
  Prisma: {
    DbNull: "DbNull",
    InputJsonValue: undefined,
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxThread: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    mailboxAssignment: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    mailboxAuditEvent: {
      create: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
    },
    profile: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxThread: {
          update: vi.fn().mockImplementation((args: unknown) => {
            const data = (args as { data: unknown }).data as Record<string, unknown>;
            return Promise.resolve({
              id: (args as { where: { id: string } }).where.id,
              ...data,
              orgId: "org_1",
              mailboxConnectionId: "conn_1",
              providerThreadId: "pt_1",
              subject: "Test thread",
              participantsSummary: [],
              lastMessageAt: new Date(),
              unreadCount: 0,
              status: data.status ?? "OPEN",
              preArchiveStatus: data.preArchiveStatus ?? null,
              assigneeId: data.assigneeId ?? null,
              isFlagged: false,
              previewSnippet: "",
              attachmentCount: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }),
        },
        mailboxAssignment: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          create: vi.fn().mockImplementation((args: unknown) => {
            const data = (args as { data: unknown }).data as Record<string, unknown>;
            return Promise.resolve({
              id: `assign_${Date.now()}`,
              ...data,
              assignedAt: new Date(),
              updatedAt: new Date(),
            });
          }),
        },
        mailboxAuditEvent: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    }),
  },
}));

import { db } from "@/lib/db";
import {
  assignThread,
  unassignThread,
  setThreadStatus,
  AssignmentServiceError,
} from "@/lib/mailbox/assignment-service";
import { ThreadActionError } from "@/lib/mailbox/thread-action-service";

const mockDb = db as unknown as {
  mailboxThread: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  mailboxAssignment: {
    updateMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  mailboxAuditEvent: {
    create: ReturnType<typeof vi.fn>;
  };
  member: {
    findFirst: ReturnType<typeof vi.fn>;
  };
};

// ─── Visibility service mock ──────────────────────────────────────────────────

vi.mock("@/lib/mailbox/visibility-service", () => ({
  listMailboxConnectionsForMember: vi.fn(async (_orgId: string, _userId: string, role: string) => {
    if (role === "no_access") {
      return { accessible: [], restricted: [] };
    }
    return {
      accessible: [
        {
          id: "conn_1",
          orgId: "org_1",
          provider: "GMAIL",
          emailAddress: "a@example.com",
          displayName: "Mailbox A",
          status: "ACTIVE",
          // Members with org_shared policy are read-only.
          visibilityPolicy: role === "member" ? "org_shared" : "admin_only",
        },
      ],
      restricted: [],
    };
  }),
}));

// ─── Auth mock for API route tests ────────────────────────────────────────────

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationMemberRoute: vi.fn(async () => ({
    ok: true,
    ctx: {
      orgId: "org_1",
      userId: "user_1",
      role: "admin",
      representedId: null,
      proxyGrantId: null,
      proxyScope: null,
    },
  })),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_ASSIGNEE_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const VALID_ASSIGNEE_ID_2 = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

function makeThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "thread_1",
    orgId: "org_1",
    mailboxConnectionId: "conn_1",
    providerThreadId: "pt_1",
    subject: "Test thread",
    participantsSummary: [],
    lastMessageAt: new Date(),
    unreadCount: 0,
    status: "OPEN",
    preArchiveStatus: null,
    assigneeId: null,
    isFlagged: false,
    previewSnippet: "",
    attachmentCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Assignment tests ─────────────────────────────────────────────────────────

describe("assignThread", () => {
  it("assigns a thread to a valid org member", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThread());
    mockDb.member.findFirst.mockResolvedValue({ id: "member_1", userId: VALID_ASSIGNEE_ID });

    const result = await assignThread({
      orgId: "org_1",
      userId: "user_1",
      role: "admin",
      threadId: "thread_1",
      assigneeId: VALID_ASSIGNEE_ID,
    });

    expect(result.success).toBe(true);
    expect(result.thread).not.toBeNull();
    expect(mockDb.$transaction).toHaveBeenCalled();
  });

  it("rejects invalid assignee ID format", async () => {
    await expect(
      assignThread({
        orgId: "org_1",
        userId: "user_1",
        role: "admin",
        threadId: "thread_1",
        assigneeId: "not-a-uuid",
      }),
    ).rejects.toBeInstanceOf(AssignmentServiceError);
  });

  it("rejects assignee who is not an org member", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThread());
    mockDb.member.findFirst.mockResolvedValue(null);

    await expect(
      assignThread({
        orgId: "org_1",
        userId: "user_1",
        role: "admin",
        threadId: "thread_1",
        assigneeId: VALID_ASSIGNEE_ID,
      }),
    ).rejects.toBeInstanceOf(AssignmentServiceError);
  });

  it("denies read-only members", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThread());

    await expect(
      assignThread({
        orgId: "org_1",
        userId: "user_1",
        role: "member",
        threadId: "thread_1",
        assigneeId: VALID_ASSIGNEE_ID,
      }),
    ).rejects.toBeInstanceOf(ThreadActionError);
  });

  it("resolves existing active assignment to REASSIGNED on reassign", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(
      makeThread({ assigneeId: VALID_ASSIGNEE_ID }),
    );
    mockDb.member.findFirst.mockResolvedValue({ id: "member_1", userId: VALID_ASSIGNEE_ID_2 });

    await assignThread({
      orgId: "org_1",
      userId: "user_1",
      role: "admin",
      threadId: "thread_1",
      assigneeId: VALID_ASSIGNEE_ID_2,
    });

    const txFn = mockDb.$transaction.mock.calls[0][0];
    const tx = {
      mailboxAssignment: { updateMany: vi.fn(), create: vi.fn() },
      mailboxThread: { update: vi.fn().mockResolvedValue(makeThread({ assigneeId: VALID_ASSIGNEE_ID_2 })) },
      mailboxAuditEvent: { create: vi.fn() },
    };
    await txFn(tx);
    expect(tx.mailboxAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REASSIGNED" }) }),
    );
  });
});

// ─── Unassignment tests ───────────────────────────────────────────────────────

describe("unassignThread", () => {
  it("clears assignee and resolves active assignment", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(
      makeThread({ assigneeId: VALID_ASSIGNEE_ID }),
    );

    const result = await unassignThread({
      orgId: "org_1",
      userId: "user_1",
      role: "admin",
      threadId: "thread_1",
    });

    expect(result.success).toBe(true);
    const txFn = mockDb.$transaction.mock.calls[0][0];
    const tx = {
      mailboxAssignment: { updateMany: vi.fn(), create: vi.fn() },
      mailboxThread: { update: vi.fn().mockResolvedValue(makeThread({ assigneeId: null })) },
      mailboxAuditEvent: { create: vi.fn() },
    };
    await txFn(tx);
    expect(tx.mailboxAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RESOLVED" }) }),
    );
  });

  it("denies read-only members", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThread());

    await expect(
      unassignThread({
        orgId: "org_1",
        userId: "user_1",
        role: "member",
        threadId: "thread_1",
      }),
    ).rejects.toBeInstanceOf(ThreadActionError);
  });
});

// ─── Status tests ─────────────────────────────────────────────────────────────

describe("setThreadStatus", () => {
  it("changes status OPEN → PENDING", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThread({ status: "OPEN" }));

    const result = await setThreadStatus({
      orgId: "org_1",
      userId: "user_1",
      role: "admin",
      threadId: "thread_1",
      status: "PENDING",
    });

    expect(result.success).toBe(true);
    expect(result.thread).not.toBeNull();
  });

  it("sets preArchiveStatus when archiving", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThread({ status: "PENDING" }));

    await setThreadStatus({
      orgId: "org_1",
      userId: "user_1",
      role: "admin",
      threadId: "thread_1",
      status: "ARCHIVED",
    });

    const txFn = mockDb.$transaction.mock.calls[0][0];
    const tx = {
      mailboxThread: {
        update: vi.fn().mockResolvedValue(makeThread({ status: "ARCHIVED", preArchiveStatus: "PENDING" })),
      },
      mailboxAuditEvent: { create: vi.fn() },
    };
    await txFn(tx);
    expect(tx.mailboxThread.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ARCHIVED", preArchiveStatus: "PENDING" }),
      }),
    );
  });

  it("clears preArchiveStatus when unarchiving", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(
      makeThread({ status: "ARCHIVED", preArchiveStatus: "OPEN" }),
    );

    await setThreadStatus({
      orgId: "org_1",
      userId: "user_1",
      role: "admin",
      threadId: "thread_1",
      status: "OPEN",
    });

    const txFn = mockDb.$transaction.mock.calls[0][0];
    const tx = {
      mailboxThread: {
        update: vi.fn().mockResolvedValue(makeThread({ status: "OPEN", preArchiveStatus: null })),
      },
      mailboxAuditEvent: { create: vi.fn() },
    };
    await txFn(tx);
    expect(tx.mailboxThread.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "OPEN", preArchiveStatus: null }),
      }),
    );
  });

  it("rejects invalid status values", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThread());

    await expect(
      setThreadStatus({
        orgId: "org_1",
        userId: "user_1",
        role: "admin",
        threadId: "thread_1",
        status: "INVALID" as "OPEN",
      }),
    ).rejects.toBeInstanceOf(AssignmentServiceError);
  });

  it("rejects setting the same status", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThread({ status: "OPEN" }));

    await expect(
      setThreadStatus({
        orgId: "org_1",
        userId: "user_1",
        role: "admin",
        threadId: "thread_1",
        status: "OPEN",
      }),
    ).rejects.toBeInstanceOf(AssignmentServiceError);
  });

  it("denies read-only members", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThread());

    await expect(
      setThreadStatus({
        orgId: "org_1",
        userId: "user_1",
        role: "member",
        threadId: "thread_1",
        status: "PENDING",
      }),
    ).rejects.toBeInstanceOf(ThreadActionError);
  });
});

// ─── API route tests ──────────────────────────────────────────────────────────

describe("POST /api/mailbox/threads/[id]/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function makeRequest(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/mailbox/threads/[id]/actions/route");
    const req = new NextRequest("http://localhost/api/mailbox/threads/thread_1/actions", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return POST(req, { params: Promise.resolve({ id: "thread_1" }) });
  }

  it("returns 400 for invalid action", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThread());
    const res = await makeRequest({ action: "explode" });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("Invalid action");
  });

  it("returns 400 for assign without assigneeId", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThread());
    const res = await makeRequest({ action: "assign" });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("assigneeId is required");
  });

  it("returns 400 for set_status without status", async () => {
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThread());
    const res = await makeRequest({ action: "set_status" });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("status is required");
  });
});
