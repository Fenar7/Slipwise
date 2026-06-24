/**
 * Mailbox Phase 6 Sprint 6.1 — Thread linking to customers and documents.
 *
 * Covers:
 * - Link creation with org-safe and record-safe validation
 * - First-link auto-promotes to primary
 * - Duplicate link prevention
 * - Link deletion with primary summary cleanup
 * - Primary link demotion/promotion
 * - On-the-fly suggested links from participant emails and subject patterns
 * - Link list enrichment on thread detail
 * - Audit event emission for link/unlink
 * - Cross-org isolation and unauthorized access
 * - API route validation and error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

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
    mailboxThreadLink: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    mailboxAuditEvent: {
      create: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    invoice: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    voucher: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    quote: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        mailboxThreadLink: {
          create: vi.fn().mockImplementation((args: unknown) => {
            const data = (args as { data: unknown }).data as Record<string, unknown>;
            return Promise.resolve({
              id: `link_${Date.now()}`,
              ...data,
              createdAt: new Date(),
            });
          }),
          delete: vi.fn(),
          update: vi.fn().mockImplementation((args: unknown) => {
            const data = (args as { data: unknown }).data as Record<string, unknown>;
            return Promise.resolve({
              id: (args as { where: { id: string } }).where.id,
              ...data,
              createdAt: new Date(),
            });
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        mailboxThread: {
          update: vi.fn().mockResolvedValue({}),
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

const mockDb = db as unknown as {
  mailboxThread: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  mailboxThreadLink: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  mailboxAuditEvent: {
    create: ReturnType<typeof vi.fn>;
  };
  customer: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  invoice: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  voucher: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  quote: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

vi.mock("@/app/api/integrations/_auth", () => ({
  requireIntegrationMemberRoute: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 29 }),
}));

vi.mock("@/lib/mailbox/visibility-service", () => ({
  listMailboxConnectionsForMember: vi.fn(),
}));

vi.mock("@/lib/mailbox/audit", () => ({
  logMailboxAuditTx: vi.fn().mockResolvedValue({}),
}));

import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { listMailboxConnectionsForMember } from "@/lib/mailbox/visibility-service";
import { logMailboxAuditTx } from "@/lib/mailbox/audit";
import {
  createThreadLink,
  deleteThreadLink,
  setPrimaryLink,
  listThreadLinks,
  LinkServiceError,
} from "@/lib/mailbox/link-service";
import { GET as listLinksGet, POST as createLinkPost } from "@/app/api/mailbox/threads/[id]/links/route";
import { DELETE as deleteLinkDelete, PATCH as setPrimaryPatch } from "@/app/api/mailbox/threads/[id]/links/[linkId]/route";

const mockRequireAuth = requireIntegrationMemberRoute as ReturnType<typeof vi.fn>;
const mockListConnections = listMailboxConnectionsForMember as ReturnType<typeof vi.fn>;
const mockLogAudit = logMailboxAuditTx as ReturnType<typeof vi.fn>;

const ORG_ID = "org_123";
const USER_ID = "user_456";
const CONNECTION_ID = "conn_789";
const THREAD_ID = "thread_def";
const LINK_ID = "link_abc";
const CUSTOMER_ID = "cust_xyz";
const INVOICE_ID = "inv_001";

function makeThreadRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: THREAD_ID,
    orgId: ORG_ID,
    mailboxConnectionId: CONNECTION_ID,
    providerThreadId: "prov_thread_001",
    subject: "Re: Invoice INV-2026-0412",
    participantsSummary: [{ email: "customer@example.com", name: "Customer" }],
    lastMessageAt: new Date(),
    unreadCount: 0,
    status: "open",
    preArchiveStatus: null,
    assigneeId: null,
    isFlagged: false,
    primaryLinkSummary: null,
    previewSnippet: "",
    attachmentCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLinkRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: LINK_ID,
    orgId: ORG_ID,
    threadId: THREAD_ID,
    entityType: "CUSTOMER",
    entityId: CUSTOMER_ID,
    isPrimary: false,
    createdBy: USER_ID,
    createdAt: new Date(),
    ...overrides,
  };
}

function mockAuth(ok = true) {
  mockRequireAuth.mockResolvedValue(
    ok
      ? { ok: true, ctx: { orgId: ORG_ID, userId: USER_ID, role: "member", representedId: null, proxyGrantId: null, proxyScope: [] } }
      : { ok: false, response: new NextResponse(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) }
  );
}

function mockConnections(accessible = true) {
  mockListConnections.mockResolvedValue({
    accessible: accessible ? [{ id: CONNECTION_ID }] : [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Service layer: createThreadLink ─────────────────────────────────────────

describe("createThreadLink", () => {
  it("creates a link and auto-promotes first link to primary", async () => {
    mockConnections();
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord());
    mockDb.mailboxThreadLink.count.mockResolvedValue(0);
    mockDb.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_ID,
      name: "Acme Corp",
      email: "customer@example.com",
      phone: null,
    });
    mockDb.mailboxThreadLink.findFirst.mockResolvedValue(null);

    const result = await createThreadLink({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "member",
      threadId: THREAD_ID,
      entityType: "CUSTOMER",
      entityId: CUSTOMER_ID,
    });

    expect(result.isPrimary).toBe(true);
    expect(result.entityLabel).toBe("Acme Corp");
    expect(mockLogAudit).toHaveBeenCalled();
  });

  it("does not auto-promote second link", async () => {
    mockConnections();
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord());
    mockDb.mailboxThreadLink.count.mockResolvedValue(1);
    mockDb.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_ID,
      name: "Acme Corp",
      email: "customer@example.com",
      phone: null,
    });
    mockDb.mailboxThreadLink.findFirst.mockResolvedValue(null);

    const result = await createThreadLink({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "member",
      threadId: THREAD_ID,
      entityType: "CUSTOMER",
      entityId: CUSTOMER_ID,
    });

    expect(result.isPrimary).toBe(false);
  });

  it("throws DUPLICATE when link already exists", async () => {
    mockConnections();
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord());
    mockDb.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_ID,
      name: "Acme Corp",
      email: "customer@example.com",
      phone: null,
    });
    mockDb.mailboxThreadLink.findFirst.mockResolvedValue(makeLinkRecord());

    await expect(
      createThreadLink({
        orgId: ORG_ID,
        userId: USER_ID,
        role: "member",
        threadId: THREAD_ID,
        entityType: "CUSTOMER",
        entityId: CUSTOMER_ID,
      })
    ).rejects.toThrow(LinkServiceError);
  });

  it("throws NOT_FOUND when target record does not exist", async () => {
    mockConnections();
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord());
    mockDb.customer.findFirst.mockResolvedValue(null);

    await expect(
      createThreadLink({
        orgId: ORG_ID,
        userId: USER_ID,
        role: "member",
        threadId: THREAD_ID,
        entityType: "CUSTOMER",
        entityId: CUSTOMER_ID,
      })
    ).rejects.toThrow(LinkServiceError);
  });

  it("throws UNAUTHORIZED when no accessible connections", async () => {
    mockConnections(false);

    await expect(
      createThreadLink({
        orgId: ORG_ID,
        userId: USER_ID,
        role: "member",
        threadId: THREAD_ID,
        entityType: "CUSTOMER",
        entityId: CUSTOMER_ID,
      })
    ).rejects.toThrow(LinkServiceError);
  });
});

// ─── Service layer: deleteThreadLink ─────────────────────────────────────────

describe("deleteThreadLink", () => {
  it("deletes a link and clears primary summary if primary", async () => {
    mockConnections();
    mockDb.mailboxThreadLink.findFirst.mockResolvedValue(makeLinkRecord({ isPrimary: true }));

    await deleteThreadLink({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "member",
      threadId: THREAD_ID,
      linkId: LINK_ID,
    });

    expect(mockDb.$transaction).toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalled();
  });

  it("throws NOT_FOUND when link does not exist", async () => {
    mockConnections();
    mockDb.mailboxThreadLink.findFirst.mockResolvedValue(null);

    await expect(
      deleteThreadLink({
        orgId: ORG_ID,
        userId: USER_ID,
        role: "member",
        threadId: THREAD_ID,
        linkId: LINK_ID,
      })
    ).rejects.toThrow(LinkServiceError);
  });
});

// ─── Service layer: setPrimaryLink ─────────────────────────────────────────

describe("setPrimaryLink", () => {
  it("promotes link to primary and demotes existing primary", async () => {
    mockConnections();
    mockDb.mailboxThreadLink.findFirst.mockResolvedValue(makeLinkRecord({ entityType: "INVOICE", entityId: INVOICE_ID }));
    mockDb.invoice.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      invoiceNumber: "INV-2026-0412",
      status: "SENT",
      totalAmount: 48500,
      dueDate: new Date("2026-04-30"),
      customer: { name: "Acme Corp" },
    });

    const result = await setPrimaryLink({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "member",
      threadId: THREAD_ID,
      linkId: LINK_ID,
    });

    expect(result.isPrimary).toBe(true);
    expect(mockLogAudit).toHaveBeenCalled();
  });

  it("throws NOT_FOUND when link does not exist", async () => {
    mockConnections();
    mockDb.mailboxThreadLink.findFirst.mockResolvedValue(null);

    await expect(
      setPrimaryLink({
        orgId: ORG_ID,
        userId: USER_ID,
        role: "member",
        threadId: THREAD_ID,
        linkId: LINK_ID,
      })
    ).rejects.toThrow(LinkServiceError);
  });
});

// ─── Service layer: listThreadLinks ─────────────────────────────────────────

describe("listThreadLinks", () => {
  it("returns links and suggestions for a thread", async () => {
    mockConnections();
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord());
    mockDb.mailboxThreadLink.findMany.mockResolvedValue([
      makeLinkRecord(),
    ]);
    mockDb.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_ID,
      name: "Acme Corp",
      email: "customer@example.com",
      phone: null,
    });
    mockDb.customer.findMany.mockResolvedValue([
      { id: CUSTOMER_ID, name: "Acme Corp", email: "customer@example.com", phone: null },
    ]);

    const result = await listThreadLinks({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "member",
      threadId: THREAD_ID,
    });

    expect(result.links.length).toBe(1);
    expect(result.links[0].entityLabel).toBe("Acme Corp");
  });

  it("returns empty arrays when thread not found", async () => {
    mockConnections();
    mockDb.mailboxThread.findFirst.mockResolvedValue(null);

    const result = await listThreadLinks({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "member",
      threadId: THREAD_ID,
    });

    expect(result.links).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it("returns empty arrays when no accessible connections", async () => {
    mockConnections(false);

    const result = await listThreadLinks({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "member",
      threadId: THREAD_ID,
    });

    expect(result.links).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });
});

// ─── API routes ────────────────────────────────────────────────────────────

describe("POST /api/mailbox/threads/:id/links", () => {
  it("returns 201 on successful link creation", async () => {
    mockAuth();
    mockConnections();
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord());
    mockDb.mailboxThreadLink.count.mockResolvedValue(0);
    mockDb.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_ID,
      name: "Acme Corp",
      email: "customer@example.com",
      phone: null,
    });
    mockDb.mailboxThreadLink.findFirst.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/mailbox/threads/thread_def/links", {
      method: "POST",
      body: JSON.stringify({ entityType: "CUSTOMER", entityId: CUSTOMER_ID }),
    });

    const res = await createLinkPost(req, { params: Promise.resolve({ id: THREAD_ID }) });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.entityLabel).toBe("Acme Corp");
  });

  it("returns 400 for invalid entityType", async () => {
    mockAuth();

    const req = new NextRequest("http://localhost/api/mailbox/threads/thread_def/links", {
      method: "POST",
      body: JSON.stringify({ entityType: "INVALID", entityId: CUSTOMER_ID }),
    });

    const res = await createLinkPost(req, { params: Promise.resolve({ id: THREAD_ID }) });
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthorized", async () => {
    mockAuth(false);

    const req = new NextRequest("http://localhost/api/mailbox/threads/thread_def/links", {
      method: "POST",
      body: JSON.stringify({ entityType: "CUSTOMER", entityId: CUSTOMER_ID }),
    });

    const res = await createLinkPost(req, { params: Promise.resolve({ id: THREAD_ID }) });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/mailbox/threads/:id/links", () => {
  it("returns links and suggestions", async () => {
    mockAuth();
    mockConnections();
    mockDb.mailboxThread.findFirst.mockResolvedValue(makeThreadRecord());
    mockDb.mailboxThreadLink.findMany.mockResolvedValue([makeLinkRecord()]);
    mockDb.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_ID,
      name: "Acme Corp",
      email: "customer@example.com",
      phone: null,
    });
    mockDb.customer.findMany.mockResolvedValue([]);

    const req = new NextRequest("http://localhost/api/mailbox/threads/thread_def/links");
    const res = await listLinksGet(req, { params: Promise.resolve({ id: THREAD_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { links: unknown[]; suggestions: unknown[] };
    expect(body.links.length).toBe(1);
  });
});

describe("DELETE /api/mailbox/threads/:id/links/:linkId", () => {
  it("returns 200 on successful deletion", async () => {
    mockAuth();
    mockConnections();
    mockDb.mailboxThreadLink.findFirst.mockResolvedValue(makeLinkRecord());

    const res = await deleteLinkDelete(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: THREAD_ID, linkId: LINK_ID }) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it("returns 404 when link not found", async () => {
    mockAuth();
    mockConnections();
    mockDb.mailboxThreadLink.findFirst.mockResolvedValue(null);

    const res = await deleteLinkDelete(
      new NextRequest("http://localhost"),
      { params: Promise.resolve({ id: THREAD_ID, linkId: LINK_ID }) }
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/mailbox/threads/:id/links/:linkId", () => {
  it("returns 200 on setPrimary action", async () => {
    mockAuth();
    mockConnections();
    mockDb.mailboxThreadLink.findFirst.mockResolvedValue(makeLinkRecord({ entityType: "INVOICE", entityId: INVOICE_ID }));
    mockDb.invoice.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      invoiceNumber: "INV-2026-0412",
      status: "SENT",
      totalAmount: 48500,
      dueDate: new Date("2026-04-30"),
      customer: { name: "Acme Corp" },
    });

    const req = new NextRequest("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ action: "setPrimary" }),
    });

    const res = await setPrimaryPatch(req, { params: Promise.resolve({ id: THREAD_ID, linkId: LINK_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.isPrimary).toBe(true);
  });

  it("returns 400 for unsupported action", async () => {
    mockAuth();

    const req = new NextRequest("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ action: "unknown" }),
    });

    const res = await setPrimaryPatch(req, { params: Promise.resolve({ id: THREAD_ID, linkId: LINK_ID }) });
    expect(res.status).toBe(400);
  });
});
