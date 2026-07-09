/**
 * Phase 22 Audit Remediation — Portal Write Actions Tests
 *
 * Verifies:
 * 1. OrgDefaults field fix: queries use `organizationId` (not `orgId`)
 * 2. portalEnabled enforced in generatePortalStatement
 * 3. portalStatementEnabled enforced in generatePortalStatement
 * 4. portalEnabled enforced in acceptPortalQuote / declinePortalQuote
 * 5. Cross-customer IDOR: quote must belong to the session's customerId
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Session mock ─────────────────────────────────────────────────────────

const SESSION = {
  orgId: "org-xyz",
  customerId: "cust-abc",
  sessionId: "sess-1",
};

const { mockGetPortalSession, mockLogPortalAccess } = vi.hoisted(() => ({
  mockGetPortalSession: vi.fn().mockResolvedValue({
    orgId: "org-xyz",
    customerId: "cust-abc",
    sessionId: "sess-1",
  }),
  mockLogPortalAccess: vi.fn().mockResolvedValue(undefined),
}));

const mockDb = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn().mockResolvedValue({ id: "org-xyz" }),
  },
  orgDefaults: {
    findUnique: vi.fn(),
  },
  customerStatement: {
    create: vi.fn().mockResolvedValue({ id: "stmt-1", fromDate: new Date(), toDate: new Date(), openingBalance: 0, closingBalance: 0, totalInvoiced: 0, totalReceived: 0 }),
  },
  invoice: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  quote: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(async (fn: Function) => {
    const tx = {
      quote: {
        findFirst: mockDb.quote.findFirst,
        update: mockDb.quote.update,
      },
    };
    return fn(tx);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/portal-auth", () => ({
  getPortalSession: mockGetPortalSession,
  requestMagicLink: vi.fn(),
  logPortalAccess: mockLogPortalAccess,
}));
vi.mock("@/lib/flow/workflow-engine", () => ({
  fireWorkflowTrigger: vi.fn(),
}));
vi.mock("@/lib/document-events", () => ({
  emitQuoteEvent: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import {
  generatePortalStatement,
  acceptPortalQuote,
  declinePortalQuote,
} from "../actions";

// ─── Helpers ────────────────────────────────────────────────────────────────

const ORG_SLUG = "test-org";

function makeOrgDefaults(overrides: Partial<{
  portalEnabled: boolean;
  portalStatementEnabled: boolean;
  portalQuoteAcceptanceEnabled: boolean;
}> = {}) {
  return {
    portalEnabled: true,
    portalStatementEnabled: true,
    portalQuoteAcceptanceEnabled: true,
    ...overrides,
  };
}

// ─── generatePortalStatement ────────────────────────────────────────────────

describe("generatePortalStatement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries orgDefaults using organizationId (not orgId)", async () => {
    mockDb.orgDefaults.findUnique.mockResolvedValue(makeOrgDefaults());
    await generatePortalStatement(ORG_SLUG, "2025-01-01", "2025-01-31");

    const call = mockDb.orgDefaults.findUnique.mock.calls[0][0];
    expect(call.where).toHaveProperty("organizationId", SESSION.orgId);
    expect(call.where).not.toHaveProperty("orgId");
  });

  it("throws when portalEnabled is false", async () => {
    mockDb.orgDefaults.findUnique.mockResolvedValue(
      makeOrgDefaults({ portalEnabled: false })
    );
    await expect(
      generatePortalStatement(ORG_SLUG, "2025-01-01", "2025-01-31")
    ).rejects.toThrow("Portal is not enabled");
  });

  it("throws when portalStatementEnabled is false", async () => {
    mockDb.orgDefaults.findUnique.mockResolvedValue(
      makeOrgDefaults({ portalStatementEnabled: false })
    );
    await expect(
      generatePortalStatement(ORG_SLUG, "2025-01-01", "2025-01-31")
    ).rejects.toThrow("Statement generation is not enabled");
  });

  it("throws when orgDefaults is null (portal policy not configured)", async () => {
    mockDb.orgDefaults.findUnique.mockResolvedValue(null);
    await expect(
      generatePortalStatement(ORG_SLUG, "2025-01-01", "2025-01-31")
    ).rejects.toThrow();
  });

  it("succeeds and creates a statement when policies allow it", async () => {
    mockDb.orgDefaults.findUnique.mockResolvedValue(makeOrgDefaults());
    const result = await generatePortalStatement(ORG_SLUG, "2025-01-01", "2025-01-31");
    expect(mockDb.customerStatement.create).toHaveBeenCalledOnce();
    expect(result).toBeDefined();
  });
});

// ─── acceptPortalQuote ────────────────────────────────────────────────────────

describe("acceptPortalQuote", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns error when portalEnabled is false", async () => {
    mockDb.orgDefaults.findUnique.mockResolvedValue(
      makeOrgDefaults({ portalEnabled: false })
    );
    const result = await acceptPortalQuote(ORG_SLUG, "quote-1");
    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain("Portal is not available");
  });

  it("returns error when portalQuoteAcceptanceEnabled is false", async () => {
    mockDb.orgDefaults.findUnique.mockResolvedValue(
      makeOrgDefaults({ portalQuoteAcceptanceEnabled: false })
    );
    const result = await acceptPortalQuote(ORG_SLUG, "quote-1");
    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain("not enabled");
  });

  it("queries orgDefaults using organizationId (not orgId)", async () => {
    mockDb.orgDefaults.findUnique.mockResolvedValue(makeOrgDefaults());
    mockDb.quote.findFirst.mockResolvedValue(null);
    await acceptPortalQuote(ORG_SLUG, "quote-1");

    const call = mockDb.orgDefaults.findUnique.mock.calls[0][0];
    expect(call.where).toHaveProperty("organizationId", SESSION.orgId);
    expect(call.where).not.toHaveProperty("orgId");
  });

  it("returns error when quote does not belong to the session customer (IDOR prevention)", async () => {
    mockDb.orgDefaults.findUnique.mockResolvedValue(makeOrgDefaults());
    // findFirst returns null because customerId doesn't match
    mockDb.quote.findFirst.mockResolvedValue(null);
    const result = await acceptPortalQuote(ORG_SLUG, "quote-other-customer");
    expect(result.success).toBe(false);
  });

  it("accepts a valid quote successfully", async () => {
    mockDb.orgDefaults.findUnique.mockResolvedValue(makeOrgDefaults());
    mockDb.quote.findFirst.mockResolvedValue({ id: "quote-1", quoteNumber: "Q-001" });
    mockDb.quote.update.mockResolvedValue({ quoteNumber: "Q-001" });
    const result = await acceptPortalQuote(ORG_SLUG, "quote-1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quoteNumber).toBe("Q-001");
  });
});

// ─── declinePortalQuote ───────────────────────────────────────────────────────

describe("declinePortalQuote", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns error when portalEnabled is false", async () => {
    mockDb.orgDefaults.findUnique.mockResolvedValue(
      makeOrgDefaults({ portalEnabled: false })
    );
    const result = await declinePortalQuote(ORG_SLUG, "quote-1");
    expect(result.success).toBe(false);
  });

  it("queries orgDefaults using organizationId (not orgId)", async () => {
    mockDb.orgDefaults.findUnique.mockResolvedValue(makeOrgDefaults());
    mockDb.quote.findFirst.mockResolvedValue(null);
    await declinePortalQuote(ORG_SLUG, "quote-1");

    const call = mockDb.orgDefaults.findUnique.mock.calls[0][0];
    expect(call.where).toHaveProperty("organizationId", SESSION.orgId);
    expect(call.where).not.toHaveProperty("orgId");
  });
});
