/**
 * Mailbox Phase 2 Sprint 2.1 — unit tests
 *
 * Covers:
 * - Domain type validation helpers
 * - Read-shape mappers (no tokenRef/watchMetadata leakage)
 * - Audit action labels completeness
 * - Provider contract type guard
 * - Org-scoping assumptions in connection service
 * - Cursor service upsert/get/delete
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock db ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    mailboxConnection: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    mailboxProviderCursor: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    mailboxAuditEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// ─── Mock server-only ─────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}));

import { db } from "@/lib/db";

import {
  connectionRequiresReconnect,
  connectionIsDegraded,
  connectionIsOperational,
  cursorIsExpired,
} from "@/lib/mailbox/domain-types";

import {
  toMailboxConnectionSummary,
  toMailboxHealthSummary,
  toMailboxAdminConnectionSummary,
  toMailboxRestrictedSummary,
  toMailboxAssignmentSummary,
  toMailboxAuditEventSummary,
} from "@/lib/mailbox/read-shapes";

import {
  MAILBOX_AUDIT_ACTION_LABELS,
  getMailboxAuditActionLabel,
} from "@/lib/mailbox/audit";

import { isMailboxProviderError } from "@/lib/mailbox/provider-contracts";

import {
  listMailboxConnections,
  getMailboxConnection,
  findMailboxConnectionByProviderAccount,
} from "@/lib/mailbox/connection-service";

import {
  getMailboxCursor,
  upsertMailboxCursor,
  deleteMailboxCursors,
} from "@/lib/mailbox/cursor-service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const ACTOR = "00000000-0000-0000-0000-000000000001";
const CONN_ID = "conn-001";

function makeConnectionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONN_ID,
    orgId: ORG_A,
    provider: "GMAIL" as const,
    providerAccountId: "gmail-uid-123",
    emailAddress: "ops@example.com",
    displayName: "Ops Inbox",
    status: "ACTIVE" as const,
    tokenRef: "encrypted-ref-abc",
    tokenExpiry: new Date("2026-06-01T00:00:00Z"),
    watchMetadata: { historyId: "12345" },
    lastSyncAt: new Date("2026-05-01T10:00:00Z"),
    lastSyncError: null,
    disabledAt: null,
    connectedBy: ACTOR,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T10:00:00Z"),
    ...overrides,
  };
}

function makeCursorRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cursor-001",
    orgId: ORG_A,
    mailboxConnectionId: CONN_ID,
    provider: "GMAIL" as const,
    cursorType: "HISTORY_ID" as const,
    cursorValue: "99999",
    expiresAt: null,
    lastAdvancedAt: new Date("2026-05-01T10:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T10:00:00Z"),
    ...overrides,
  };
}

const mockDb = db as unknown as {
  mailboxConnection: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  mailboxProviderCursor: {
    findFirst: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  mailboxAuditEvent: {
    create: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Domain type helpers ──────────────────────────────────────────────────────

describe("connectionRequiresReconnect", () => {
  it("returns true for RECONNECT_REQUIRED", () => {
    expect(connectionRequiresReconnect("RECONNECT_REQUIRED")).toBe(true);
  });
  it("returns true for DISCONNECTED", () => {
    expect(connectionRequiresReconnect("DISCONNECTED")).toBe(true);
  });
  it("returns false for ACTIVE", () => {
    expect(connectionRequiresReconnect("ACTIVE")).toBe(false);
  });
  it("returns false for DEGRADED", () => {
    expect(connectionRequiresReconnect("DEGRADED")).toBe(false);
  });
});

describe("connectionIsDegraded", () => {
  it("returns true for DEGRADED", () => {
    expect(connectionIsDegraded("DEGRADED")).toBe(true);
  });
  it("returns false for ACTIVE", () => {
    expect(connectionIsDegraded("ACTIVE")).toBe(false);
  });
});

describe("connectionIsOperational", () => {
  it("returns true for ACTIVE", () => {
    expect(connectionIsOperational("ACTIVE")).toBe(true);
  });
  it("returns false for DEGRADED", () => {
    expect(connectionIsOperational("DEGRADED")).toBe(false);
  });
  it("returns false for RECONNECT_REQUIRED", () => {
    expect(connectionIsOperational("RECONNECT_REQUIRED")).toBe(false);
  });
});

describe("cursorIsExpired", () => {
  it("returns false when expiresAt is null", () => {
    const cursor = makeCursorRow({ expiresAt: null });
    expect(cursorIsExpired(cursor as never)).toBe(false);
  });
  it("returns true when expiresAt is in the past", () => {
    const cursor = makeCursorRow({ expiresAt: new Date("2020-01-01T00:00:00Z") });
    expect(cursorIsExpired(cursor as never)).toBe(true);
  });
  it("returns false when expiresAt is in the future", () => {
    const cursor = makeCursorRow({ expiresAt: new Date("2099-01-01T00:00:00Z") });
    expect(cursorIsExpired(cursor as never)).toBe(false);
  });
});

// ─── Read-shape mappers ───────────────────────────────────────────────────────

describe("toMailboxConnectionSummary", () => {
  it("does not include tokenRef", () => {
    const record = makeConnectionRow();
    const summary = toMailboxConnectionSummary(record as never);
    expect(summary).not.toHaveProperty("tokenRef");
  });

  it("does not include watchMetadata", () => {
    const record = makeConnectionRow();
    const summary = toMailboxConnectionSummary(record as never);
    expect(summary).not.toHaveProperty("watchMetadata");
  });

  it("sets isOperational=true for ACTIVE status", () => {
    const summary = toMailboxConnectionSummary(makeConnectionRow() as never);
    expect(summary.isOperational).toBe(true);
    expect(summary.requiresReconnect).toBe(false);
  });

  it("sets requiresReconnect=true for RECONNECT_REQUIRED", () => {
    const summary = toMailboxConnectionSummary(
      makeConnectionRow({ status: "RECONNECT_REQUIRED" }) as never,
    );
    expect(summary.requiresReconnect).toBe(true);
    expect(summary.isOperational).toBe(false);
  });

  it("sets requiresReconnect=true for DISCONNECTED", () => {
    const summary = toMailboxConnectionSummary(
      makeConnectionRow({ status: "DISCONNECTED" }) as never,
    );
    expect(summary.requiresReconnect).toBe(true);
  });

  it("serializes lastSyncAt as ISO string", () => {
    const summary = toMailboxConnectionSummary(makeConnectionRow() as never);
    expect(summary.lastSyncAt).toBe("2026-05-01T10:00:00.000Z");
  });

  it("returns null lastSyncAt when not set", () => {
    const summary = toMailboxConnectionSummary(
      makeConnectionRow({ lastSyncAt: null }) as never,
    );
    expect(summary.lastSyncAt).toBeNull();
  });
});

describe("toMailboxHealthSummary", () => {
  it("does not include tokenRef", () => {
    const summary = toMailboxHealthSummary(makeConnectionRow() as never);
    expect(summary).not.toHaveProperty("tokenRef");
  });

  it("sets requiresAdminAction=true for RECONNECT_REQUIRED", () => {
    const summary = toMailboxHealthSummary(
      makeConnectionRow({ status: "RECONNECT_REQUIRED" }) as never,
    );
    expect(summary.requiresAdminAction).toBe(true);
  });

  it("sets requiresAdminAction=false for DEGRADED", () => {
    const summary = toMailboxHealthSummary(
      makeConnectionRow({ status: "DEGRADED" }) as never,
    );
    expect(summary.requiresAdminAction).toBe(false);
  });

  it("includes a non-empty statusMessage for each status", () => {
    const statuses = ["ACTIVE", "DEGRADED", "RECONNECT_REQUIRED", "DISCONNECTED"] as const;
    for (const status of statuses) {
      const summary = toMailboxHealthSummary(
        makeConnectionRow({ status }) as never,
      );
      expect(typeof summary.statusMessage).toBe("string");
      expect(summary.statusMessage.length).toBeGreaterThan(0);
    }
  });
});

describe("toMailboxAdminConnectionSummary", () => {
  it("includes providerAccountId", () => {
    const summary = toMailboxAdminConnectionSummary(makeConnectionRow() as never);
    expect(summary.providerAccountId).toBe("gmail-uid-123");
  });

  it("does not include tokenRef", () => {
    const summary = toMailboxAdminConnectionSummary(makeConnectionRow() as never);
    expect(summary).not.toHaveProperty("tokenRef");
  });

  it("does not include watchMetadata", () => {
    const summary = toMailboxAdminConnectionSummary(makeConnectionRow() as never);
    expect(summary).not.toHaveProperty("watchMetadata");
  });
});

describe("toMailboxRestrictedSummary", () => {
  it("only exposes id, displayName, provider, restrictionReason", () => {
    const summary = toMailboxRestrictedSummary(
      makeConnectionRow() as never,
      "no_permission",
    );
    const keys = Object.keys(summary);
    expect(keys).toEqual(
      expect.arrayContaining(["id", "displayName", "provider", "restrictionReason"]),
    );
    expect(keys).not.toContain("tokenRef");
    expect(keys).not.toContain("emailAddress");
    expect(keys).not.toContain("watchMetadata");
  });
});

describe("toMailboxAssignmentSummary", () => {
  it("serializes assignedAt as ISO string", () => {
    const record = {
      id: "assign-1",
      orgId: ORG_A,
      threadId: "thread-1",
      assigneeId: ACTOR,
      assignedBy: ACTOR,
      status: "ACTIVE" as const,
      assignedAt: new Date("2026-05-01T10:00:00Z"),
      updatedAt: new Date("2026-05-01T10:00:00Z"),
    };
    const summary = toMailboxAssignmentSummary(record);
    expect(summary.assignedAt).toBe("2026-05-01T10:00:00.000Z");
  });
});

describe("toMailboxAuditEventSummary", () => {
  it("does not include metadata in the summary", () => {
    const record = {
      id: "audit-1",
      orgId: ORG_A,
      mailboxConnectionId: CONN_ID,
      threadId: null,
      messageId: null,
      actorId: ACTOR,
      action: "CONNECTION_CREATED" as const,
      summary: "Connected mailbox",
      metadata: { sensitiveKey: "should-not-appear" },
      createdAt: new Date("2026-05-01T10:00:00Z"),
    };
    const summary = toMailboxAuditEventSummary(record);
    expect(summary).not.toHaveProperty("metadata");
  });
});

// ─── Audit action labels ──────────────────────────────────────────────────────

describe("MAILBOX_AUDIT_ACTION_LABELS", () => {
  it("has a label for every MailboxAuditAction enum value", () => {
    const expectedActions = [
      "CONNECTION_CREATED",
      "CONNECTION_DISCONNECTED",
      "CONNECTION_RECONNECTED",
      "CONNECTION_DEGRADED",
      "CONNECTION_PERMISSION_CHANGED",
      "THREAD_ASSIGNED",
      "THREAD_UNASSIGNED",
      "THREAD_STATUS_CHANGED",
      "THREAD_LINKED",
      "THREAD_UNLINKED",
      "MESSAGE_SENT",
      "MESSAGE_REPLIED",
      "MESSAGE_FORWARDED",
      "DRAFT_CREATED",
      "DRAFT_DISCARDED",
      "SYNC_MANUAL_TRIGGERED",
      "ADMIN_SUPPORT_ACTION",
    ] as const;

    for (const action of expectedActions) {
      expect(MAILBOX_AUDIT_ACTION_LABELS[action]).toBeDefined();
      expect(typeof MAILBOX_AUDIT_ACTION_LABELS[action]).toBe("string");
      expect(MAILBOX_AUDIT_ACTION_LABELS[action].length).toBeGreaterThan(0);
    }
  });

  it("getMailboxAuditActionLabel returns the label", () => {
    expect(getMailboxAuditActionLabel("CONNECTION_CREATED")).toBe(
      "Connected mailbox",
    );
  });
});

// ─── Provider contract type guard ─────────────────────────────────────────────

describe("isMailboxProviderError", () => {
  it("returns true for a valid MailboxProviderError", () => {
    const err = {
      category: "auth_expired",
      safeMessage: "Token expired",
      retryable: false,
    };
    expect(isMailboxProviderError(err)).toBe(true);
  });

  it("returns false for a non-error object", () => {
    expect(isMailboxProviderError({ threads: [], nextCursor: null })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isMailboxProviderError(null)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isMailboxProviderError("error")).toBe(false);
  });
});

// ─── Connection service — org scoping ─────────────────────────────────────────

describe("listMailboxConnections", () => {
  it("queries with the provided orgId", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([makeConnectionRow()]);
    await listMailboxConnections(ORG_A);
    expect(mockDb.mailboxConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: ORG_A } }),
    );
  });

  it("does not return connections from a different org", async () => {
    mockDb.mailboxConnection.findMany.mockResolvedValue([]);
    const result = await listMailboxConnections(ORG_B);
    expect(result).toHaveLength(0);
    expect(mockDb.mailboxConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: ORG_B } }),
    );
  });
});

describe("getMailboxConnection", () => {
  it("includes orgId in the query to prevent cross-org access", async () => {
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRow());
    await getMailboxConnection(ORG_A, CONN_ID);
    expect(mockDb.mailboxConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONN_ID, orgId: ORG_A },
      }),
    );
  });

  it("returns null when connection belongs to a different org", async () => {
    mockDb.mailboxConnection.findFirst.mockResolvedValue(null);
    const result = await getMailboxConnection(ORG_B, CONN_ID);
    expect(result).toBeNull();
  });
});

describe("findMailboxConnectionByProviderAccount", () => {
  it("scopes query to orgId and providerAccountId", async () => {
    mockDb.mailboxConnection.findFirst.mockResolvedValue(null);
    await findMailboxConnectionByProviderAccount(ORG_A, "GMAIL", "gmail-uid-123");
    expect(mockDb.mailboxConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: ORG_A, provider: "GMAIL", providerAccountId: "gmail-uid-123" },
      }),
    );
  });
});

// ─── Cursor service ───────────────────────────────────────────────────────────

describe("getMailboxCursor", () => {
  it("queries with orgId, connectionId, and cursorType", async () => {
    mockDb.mailboxProviderCursor.findFirst.mockResolvedValue(null);
    await getMailboxCursor(ORG_A, CONN_ID, "HISTORY_ID");
    expect(mockDb.mailboxProviderCursor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: ORG_A, mailboxConnectionId: CONN_ID, cursorType: "HISTORY_ID" },
      }),
    );
  });

  it("returns null when no cursor exists", async () => {
    mockDb.mailboxProviderCursor.findFirst.mockResolvedValue(null);
    const result = await getMailboxCursor(ORG_A, CONN_ID, "HISTORY_ID");
    expect(result).toBeNull();
  });

  it("returns a cursor record when found", async () => {
    mockDb.mailboxProviderCursor.findFirst.mockResolvedValue(makeCursorRow());
    const result = await getMailboxCursor(ORG_A, CONN_ID, "HISTORY_ID");
    expect(result).not.toBeNull();
    expect(result?.cursorValue).toBe("99999");
  });
});

describe("upsertMailboxCursor", () => {
  it("calls upsert with the correct unique key", async () => {
    mockDb.mailboxProviderCursor.upsert.mockResolvedValue(makeCursorRow());
    await upsertMailboxCursor({
      orgId: ORG_A,
      mailboxConnectionId: CONN_ID,
      provider: "GMAIL",
      cursorType: "HISTORY_ID",
      cursorValue: "100000",
      expiresAt: null,
    });
    expect(mockDb.mailboxProviderCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          mailboxConnectionId_cursorType: {
            mailboxConnectionId: CONN_ID,
            cursorType: "HISTORY_ID",
          },
        },
      }),
    );
  });
});

describe("deleteMailboxCursors", () => {
  it("deletes all cursors for the given org and connection", async () => {
    mockDb.mailboxProviderCursor.deleteMany.mockResolvedValue({ count: 2 });
    await deleteMailboxCursors(ORG_A, CONN_ID);
    expect(mockDb.mailboxProviderCursor.deleteMany).toHaveBeenCalledWith({
      where: { orgId: ORG_A, mailboxConnectionId: CONN_ID },
    });
  });
});
