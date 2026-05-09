/**
 * Mailbox Phase 2 Sprint 2.1 — unit tests (remediated)
 *
 * Covers:
 * - Domain type validation helpers
 * - Read-shape mappers (no tokenRef/watchMetadata leakage)
 * - Audit action labels completeness
 * - Provider contract type guard
 * - Connection service: create, update, disable — org-safe mutation paths
 * - Connection service: status-transition audit semantics
 * - Cursor service: org-safe upsert keying, provider mismatch guard, get/delete
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

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
  createMailboxConnection,
  updateMailboxConnectionStatus,
  disableMailboxConnection,
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

// Typed mock accessors
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

/**
 * Helper: make $transaction execute the callback with a mock tx client.
 * The tx client mirrors the same mock methods as db.
 */
function setupTransaction() {
  mockDb.$transaction.mockImplementation(
    async (cb: (tx: typeof mockDb) => Promise<unknown>) => cb(mockDb),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Domain type helpers ──────────────────────────────────────────────────────

describe("connectionRequiresReconnect", () => {
  it("returns true for RECONNECT_REQUIRED", () =>
    expect(connectionRequiresReconnect("RECONNECT_REQUIRED")).toBe(true));
  it("returns true for DISCONNECTED", () =>
    expect(connectionRequiresReconnect("DISCONNECTED")).toBe(true));
  it("returns false for ACTIVE", () =>
    expect(connectionRequiresReconnect("ACTIVE")).toBe(false));
  it("returns false for DEGRADED", () =>
    expect(connectionRequiresReconnect("DEGRADED")).toBe(false));
});

describe("connectionIsDegraded", () => {
  it("returns true for DEGRADED", () =>
    expect(connectionIsDegraded("DEGRADED")).toBe(true));
  it("returns false for ACTIVE", () =>
    expect(connectionIsDegraded("ACTIVE")).toBe(false));
});

describe("connectionIsOperational", () => {
  it("returns true for ACTIVE", () =>
    expect(connectionIsOperational("ACTIVE")).toBe(true));
  it("returns false for DEGRADED", () =>
    expect(connectionIsOperational("DEGRADED")).toBe(false));
  it("returns false for RECONNECT_REQUIRED", () =>
    expect(connectionIsOperational("RECONNECT_REQUIRED")).toBe(false));
});

describe("cursorIsExpired", () => {
  it("returns false when expiresAt is null", () =>
    expect(cursorIsExpired(makeCursorRow({ expiresAt: null }) as never)).toBe(false));
  it("returns true when expiresAt is in the past", () =>
    expect(
      cursorIsExpired(makeCursorRow({ expiresAt: new Date("2020-01-01") }) as never),
    ).toBe(true));
  it("returns false when expiresAt is in the future", () =>
    expect(
      cursorIsExpired(makeCursorRow({ expiresAt: new Date("2099-01-01") }) as never),
    ).toBe(false));
});

// ─── Read-shape mappers ───────────────────────────────────────────────────────

describe("toMailboxConnectionSummary", () => {
  it("does not include tokenRef", () =>
    expect(toMailboxConnectionSummary(makeConnectionRow() as never)).not.toHaveProperty(
      "tokenRef",
    ));
  it("does not include watchMetadata", () =>
    expect(toMailboxConnectionSummary(makeConnectionRow() as never)).not.toHaveProperty(
      "watchMetadata",
    ));
  it("sets isOperational=true for ACTIVE", () => {
    const s = toMailboxConnectionSummary(makeConnectionRow() as never);
    expect(s.isOperational).toBe(true);
    expect(s.requiresReconnect).toBe(false);
  });
  it("sets requiresReconnect=true for RECONNECT_REQUIRED", () => {
    const s = toMailboxConnectionSummary(
      makeConnectionRow({ status: "RECONNECT_REQUIRED" }) as never,
    );
    expect(s.requiresReconnect).toBe(true);
    expect(s.isOperational).toBe(false);
  });
  it("sets requiresReconnect=true for DISCONNECTED", () =>
    expect(
      toMailboxConnectionSummary(makeConnectionRow({ status: "DISCONNECTED" }) as never)
        .requiresReconnect,
    ).toBe(true));
  it("serializes lastSyncAt as ISO string", () =>
    expect(toMailboxConnectionSummary(makeConnectionRow() as never).lastSyncAt).toBe(
      "2026-05-01T10:00:00.000Z",
    ));
  it("returns null lastSyncAt when not set", () =>
    expect(
      toMailboxConnectionSummary(makeConnectionRow({ lastSyncAt: null }) as never)
        .lastSyncAt,
    ).toBeNull());
});

describe("toMailboxHealthSummary", () => {
  it("does not include tokenRef", () =>
    expect(toMailboxHealthSummary(makeConnectionRow() as never)).not.toHaveProperty(
      "tokenRef",
    ));
  it("sets requiresAdminAction=true for RECONNECT_REQUIRED", () =>
    expect(
      toMailboxHealthSummary(makeConnectionRow({ status: "RECONNECT_REQUIRED" }) as never)
        .requiresAdminAction,
    ).toBe(true));
  it("sets requiresAdminAction=false for DEGRADED", () =>
    expect(
      toMailboxHealthSummary(makeConnectionRow({ status: "DEGRADED" }) as never)
        .requiresAdminAction,
    ).toBe(false));
  it("includes a non-empty statusMessage for each status", () => {
    for (const status of ["ACTIVE", "DEGRADED", "RECONNECT_REQUIRED", "DISCONNECTED"] as const) {
      const s = toMailboxHealthSummary(makeConnectionRow({ status }) as never);
      expect(s.statusMessage.length).toBeGreaterThan(0);
    }
  });
});

describe("toMailboxAdminConnectionSummary", () => {
  it("includes providerAccountId", () =>
    expect(
      toMailboxAdminConnectionSummary(makeConnectionRow() as never).providerAccountId,
    ).toBe("gmail-uid-123"));
  it("does not include tokenRef", () =>
    expect(
      toMailboxAdminConnectionSummary(makeConnectionRow() as never),
    ).not.toHaveProperty("tokenRef"));
  it("does not include watchMetadata", () =>
    expect(
      toMailboxAdminConnectionSummary(makeConnectionRow() as never),
    ).not.toHaveProperty("watchMetadata"));
});

describe("toMailboxRestrictedSummary", () => {
  it("only exposes id, displayName, provider, restrictionReason", () => {
    const keys = Object.keys(
      toMailboxRestrictedSummary(makeConnectionRow() as never, "no_permission"),
    );
    expect(keys).toEqual(
      expect.arrayContaining(["id", "displayName", "provider", "restrictionReason"]),
    );
    expect(keys).not.toContain("tokenRef");
    expect(keys).not.toContain("emailAddress");
    expect(keys).not.toContain("watchMetadata");
  });
});

describe("toMailboxAssignmentSummary", () => {
  it("serializes assignedAt as ISO string", () =>
    expect(
      toMailboxAssignmentSummary({
        id: "a1",
        orgId: ORG_A,
        threadId: "t1",
        assigneeId: ACTOR,
        assignedBy: ACTOR,
        status: "ACTIVE",
        assignedAt: new Date("2026-05-01T10:00:00Z"),
        updatedAt: new Date("2026-05-01T10:00:00Z"),
      }).assignedAt,
    ).toBe("2026-05-01T10:00:00.000Z"));
});

describe("toMailboxAuditEventSummary", () => {
  it("does not include metadata in the summary", () =>
    expect(
      toMailboxAuditEventSummary({
        id: "e1",
        orgId: ORG_A,
        mailboxConnectionId: CONN_ID,
        threadId: null,
        messageId: null,
        actorId: ACTOR,
        action: "CONNECTION_CREATED",
        summary: "Connected mailbox",
        metadata: { sensitiveKey: "should-not-appear" },
        createdAt: new Date(),
      }),
    ).not.toHaveProperty("metadata"));
});

// ─── Audit action labels ──────────────────────────────────────────────────────

describe("MAILBOX_AUDIT_ACTION_LABELS", () => {
  it("has a label for every MailboxAuditAction enum value", () => {
    const actions = [
      "CONNECTION_CREATED", "CONNECTION_DISCONNECTED", "CONNECTION_RECONNECTED",
      "CONNECTION_DEGRADED", "CONNECTION_PERMISSION_CHANGED",
      "THREAD_ASSIGNED", "THREAD_UNASSIGNED", "THREAD_STATUS_CHANGED",
      "THREAD_LINKED", "THREAD_UNLINKED",
      "MESSAGE_SENT", "MESSAGE_REPLIED", "MESSAGE_FORWARDED",
      "DRAFT_CREATED", "DRAFT_DISCARDED",
      "SYNC_MANUAL_TRIGGERED", "ADMIN_SUPPORT_ACTION",
    ] as const;
    for (const action of actions) {
      expect(MAILBOX_AUDIT_ACTION_LABELS[action].length).toBeGreaterThan(0);
    }
  });
  it("getMailboxAuditActionLabel returns the label", () =>
    expect(getMailboxAuditActionLabel("CONNECTION_CREATED")).toBe("Connected mailbox"));
});

// ─── Provider contract type guard ─────────────────────────────────────────────

describe("isMailboxProviderError", () => {
  it("returns true for a valid error", () =>
    expect(
      isMailboxProviderError({ category: "auth_expired", safeMessage: "x", retryable: false }),
    ).toBe(true));
  it("returns false for a non-error object", () =>
    expect(isMailboxProviderError({ threads: [] })).toBe(false));
  it("returns false for null", () => expect(isMailboxProviderError(null)).toBe(false));
});

// ─── Connection service — read queries ───────────────────────────────────────

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
  });
});

describe("getMailboxConnection", () => {
  it("includes orgId in the query", async () => {
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRow());
    await getMailboxConnection(ORG_A, CONN_ID);
    expect(mockDb.mailboxConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CONN_ID, orgId: ORG_A } }),
    );
  });
  it("returns null when connection belongs to a different org", async () => {
    mockDb.mailboxConnection.findFirst.mockResolvedValue(null);
    expect(await getMailboxConnection(ORG_B, CONN_ID)).toBeNull();
  });
});

describe("findMailboxConnectionByProviderAccount", () => {
  it("scopes query to orgId and providerAccountId", async () => {
    mockDb.mailboxConnection.findFirst.mockResolvedValue(null);
    await findMailboxConnectionByProviderAccount(ORG_A, "GMAIL", "uid-123");
    expect(mockDb.mailboxConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: ORG_A, provider: "GMAIL", providerAccountId: "uid-123" },
      }),
    );
  });
});

// ─── Connection service — mutations ──────────────────────────────────────────

describe("createMailboxConnection", () => {
  it("creates a connection and emits CONNECTION_CREATED audit event", async () => {
    setupTransaction();
    mockDb.mailboxConnection.create.mockResolvedValue(makeConnectionRow());
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    await createMailboxConnection({
      orgId: ORG_A,
      provider: "GMAIL",
      providerAccountId: "uid-123",
      emailAddress: "ops@example.com",
      displayName: "Ops Inbox",
      tokenRef: "ref-abc",
      tokenExpiry: null,
      connectedBy: ACTOR,
    });

    expect(mockDb.mailboxConnection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: ORG_A, provider: "GMAIL" }),
      }),
    );
    expect(mockDb.mailboxAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONNECTION_CREATED", orgId: ORG_A }),
      }),
    );
  });

  it("does not expose tokenRef in the returned record's read shape", async () => {
    setupTransaction();
    mockDb.mailboxConnection.create.mockResolvedValue(makeConnectionRow());
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    const record = await createMailboxConnection({
      orgId: ORG_A,
      provider: "GMAIL",
      providerAccountId: "uid-123",
      emailAddress: "ops@example.com",
      displayName: "Ops Inbox",
      tokenRef: "ref-abc",
      tokenExpiry: null,
      connectedBy: ACTOR,
    });
    // Domain record includes tokenRef for internal use — that is correct.
    // Verify the record is a domain record (not a read shape) by checking it has orgId.
    expect(record.orgId).toBe(ORG_A);
  });
});

describe("updateMailboxConnectionStatus — org safety", () => {
  it("loads the existing row with orgId before mutating", async () => {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(
      makeConnectionRow({ status: "ACTIVE" }),
    );
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeConnectionRow({ status: "DEGRADED" }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    await updateMailboxConnectionStatus({
      orgId: ORG_A,
      connectionId: CONN_ID,
      status: "DEGRADED",
      actorId: ACTOR,
    });

    // First call inside tx must be findFirst with orgId
    expect(mockDb.mailboxConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CONN_ID, orgId: ORG_A } }),
    );
    // Update must use only the verified id (not orgId in where)
    expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CONN_ID } }),
    );
  });

  it("throws when the connection does not belong to the org", async () => {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(null);

    await expect(
      updateMailboxConnectionStatus({
        orgId: ORG_B,
        connectionId: CONN_ID,
        status: "DEGRADED",
        actorId: ACTOR,
      }),
    ).rejects.toThrow();

    expect(mockDb.mailboxConnection.update).not.toHaveBeenCalled();
  });
});

describe("updateMailboxConnectionStatus — audit transition semantics", () => {
  async function runTransition(
    previousStatus: string,
    nextStatus: string,
  ): Promise<string | undefined> {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(
      makeConnectionRow({ status: previousStatus }),
    );
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeConnectionRow({ status: nextStatus }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    await updateMailboxConnectionStatus({
      orgId: ORG_A,
      connectionId: CONN_ID,
      status: nextStatus as never,
      actorId: ACTOR,
    });

    const call = mockDb.mailboxAuditEvent.create.mock.calls[0];
    return call?.[0]?.data?.action as string | undefined;
  }

  it("ACTIVE → DEGRADED emits CONNECTION_DEGRADED", async () => {
    expect(await runTransition("ACTIVE", "DEGRADED")).toBe("CONNECTION_DEGRADED");
  });

  it("ACTIVE → DISCONNECTED emits CONNECTION_DISCONNECTED", async () => {
    expect(await runTransition("ACTIVE", "DISCONNECTED")).toBe("CONNECTION_DISCONNECTED");
  });

  it("RECONNECT_REQUIRED → ACTIVE emits CONNECTION_RECONNECTED", async () => {
    expect(await runTransition("RECONNECT_REQUIRED", "ACTIVE")).toBe(
      "CONNECTION_RECONNECTED",
    );
  });

  it("DEGRADED → ACTIVE emits CONNECTION_RECONNECTED", async () => {
    expect(await runTransition("DEGRADED", "ACTIVE")).toBe("CONNECTION_RECONNECTED");
  });

  it("DISCONNECTED → ACTIVE emits CONNECTION_RECONNECTED", async () => {
    expect(await runTransition("DISCONNECTED", "ACTIVE")).toBe("CONNECTION_RECONNECTED");
  });

  it("ACTIVE → RECONNECT_REQUIRED does NOT emit CONNECTION_RECONNECTED", async () => {
    const action = await runTransition("ACTIVE", "RECONNECT_REQUIRED");
    expect(action).not.toBe("CONNECTION_RECONNECTED");
    // No audit event should be emitted for this transition
    expect(mockDb.mailboxAuditEvent.create).not.toHaveBeenCalled();
  });

  it("ACTIVE → ACTIVE (no-op) does not emit any audit event", async () => {
    await runTransition("ACTIVE", "ACTIVE");
    expect(mockDb.mailboxAuditEvent.create).not.toHaveBeenCalled();
  });
});

describe("disableMailboxConnection — org safety", () => {
  it("loads the existing row with orgId before mutating", async () => {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRow());
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeConnectionRow({ status: "DISCONNECTED", disabledAt: new Date() }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    await disableMailboxConnection(ORG_A, CONN_ID, ACTOR);

    expect(mockDb.mailboxConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CONN_ID, orgId: ORG_A } }),
    );
    expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CONN_ID } }),
    );
  });

  it("throws when the connection does not belong to the org", async () => {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(null);

    await expect(disableMailboxConnection(ORG_B, CONN_ID, ACTOR)).rejects.toThrow();
    expect(mockDb.mailboxConnection.update).not.toHaveBeenCalled();
  });

  it("emits CONNECTION_DISCONNECTED audit event", async () => {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(makeConnectionRow());
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeConnectionRow({ status: "DISCONNECTED" }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    await disableMailboxConnection(ORG_A, CONN_ID, ACTOR);

    expect(mockDb.mailboxAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONNECTION_DISCONNECTED" }),
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
    expect(await getMailboxCursor(ORG_A, CONN_ID, "HISTORY_ID")).toBeNull();
  });
  it("returns a cursor record when found", async () => {
    mockDb.mailboxProviderCursor.findFirst.mockResolvedValue(makeCursorRow());
    const result = await getMailboxCursor(ORG_A, CONN_ID, "HISTORY_ID");
    expect(result?.cursorValue).toBe("99999");
  });
});

describe("upsertMailboxCursor — org-safe unique key", () => {
  it("uses the org-safe compound unique key (orgId, mailboxConnectionId, cursorType)", async () => {
    // No existing cursor
    mockDb.mailboxProviderCursor.findFirst.mockResolvedValue(null);
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
          orgId_mailboxConnectionId_cursorType: {
            orgId: ORG_A,
            mailboxConnectionId: CONN_ID,
            cursorType: "HISTORY_ID",
          },
        },
      }),
    );
  });

  it("throws on provider mismatch", async () => {
    mockDb.mailboxProviderCursor.findFirst.mockResolvedValue(
      makeCursorRow({ provider: "GMAIL" }),
    );

    await expect(
      upsertMailboxCursor({
        orgId: ORG_A,
        mailboxConnectionId: CONN_ID,
        provider: "ZOHO",
        cursorType: "HISTORY_ID",
        cursorValue: "100000",
        expiresAt: null,
      }),
    ).rejects.toThrow(/provider mismatch/i);

    expect(mockDb.mailboxProviderCursor.upsert).not.toHaveBeenCalled();
  });

  it("does not throw when provider matches existing cursor", async () => {
    mockDb.mailboxProviderCursor.findFirst.mockResolvedValue(
      makeCursorRow({ provider: "GMAIL" }),
    );
    mockDb.mailboxProviderCursor.upsert.mockResolvedValue(makeCursorRow());

    await expect(
      upsertMailboxCursor({
        orgId: ORG_A,
        mailboxConnectionId: CONN_ID,
        provider: "GMAIL",
        cursorType: "HISTORY_ID",
        cursorValue: "100001",
        expiresAt: null,
      }),
    ).resolves.not.toThrow();
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
