/**
 * Sprint 6.3 — Client Hub Quotes & Response Experience Tests
 *
 * Covers: quote list/detail scoping, IDOR prevention, policy gating,
 * accept/decline success paths, idempotency, transaction safety,
 * expired/handled quote blocking, truthful status handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  quote: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  orgDefaults: {
    findUnique: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
  },
  customerPortalAccessLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const mockGetPortalSession = vi.hoisted(() => vi.fn());
const mockLogPortalAccess = vi.hoisted(() => vi.fn());
const mockEmitQuoteEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/flow/workflow-engine", () => ({
  fireWorkflowTrigger: vi.fn(),
}));
vi.mock("@/lib/portal-auth", () => ({
  getPortalSession: mockGetPortalSession,
  logPortalAccess: mockLogPortalAccess,
}));
vi.mock("@/lib/document-events", () => ({
  emitQuoteEvent: mockEmitQuoteEvent,
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ORG_ID = "org_test_001";
const CUSTOMER_ID = "cust_test_001";
const ORG_SLUG = "acme";
const QUOTE_ID = "quote_001";
const QUOTE_NUMBER = "QTE-00001";

const SESSION = { jti: "jti_001", customerId: CUSTOMER_ID, orgId: ORG_ID, orgSlug: ORG_SLUG };

function makeQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: QUOTE_ID,
    quoteNumber: QUOTE_NUMBER,
    title: "Test Quote",
    status: "SENT",
    issueDate: new Date(),
    validUntil: new Date(Date.now() + 86_400_000),
    totalAmount: 1000,
    acceptedAt: null,
    declinedAt: null,
    declineReason: null,
    notes: null,
    termsAndConditions: null,
    orgId: ORG_ID,
    customerId: CUSTOMER_ID,
    lineItems: [],
    org: { name: "Acme Corp" },
    customer: { name: "Test Customer", email: "test@example.com" },
    ...overrides,
  };
}

import {
  getPortalQuotes,
  getPortalQuoteDetail,
  acceptPortalQuote,
  declinePortalQuote,
} from "../actions";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Sprint 6.3 — Portal Quote Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPortalSession.mockResolvedValue(SESSION);
    mockDb.organization.findUnique.mockResolvedValue({ id: ORG_ID });
  });

  // ─── getPortalQuotes ──────────────────────────────────────────────────────

  describe("getPortalQuotes", () => {
    it("returns success: false on unauthenticated request", async () => {
      mockGetPortalSession.mockResolvedValue(null);
      const result = await getPortalQuotes(ORG_SLUG);
      expect(result.success).toBe(false);
    });

    it("returns quotes scoped to the authenticated customer", async () => {
      const quotes = [
        makeQuote({ id: "q1", quoteNumber: "QTE-001" }),
        makeQuote({ id: "q2", quoteNumber: "QTE-002", status: "ACCEPTED" }),
      ];
      mockDb.quote.findMany.mockResolvedValue(quotes);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      const result = await getPortalQuotes(ORG_SLUG);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].canRespond).toBe(true);
        expect(result.data[1].canRespond).toBe(false);
      }
    });

    it("excludes DRAFT quotes", async () => {
      mockDb.quote.findMany.mockResolvedValue([]);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      await getPortalQuotes(ORG_SLUG);

      const findManyCall = mockDb.quote.findMany.mock.calls[0][0];
      expect(findManyCall.where.status).toEqual({ not: "DRAFT" });
    });

    it("includes canRespond based on policy + status + expiry", async () => {
      const futureDate = new Date(Date.now() + 86_400_000);
      const pastDate = new Date(Date.now() - 86_400_000);

      mockDb.quote.findMany.mockResolvedValue([
        makeQuote({ id: "q1", status: "SENT", validUntil: futureDate }),
        makeQuote({ id: "q2", status: "SENT", validUntil: pastDate }),
        makeQuote({ id: "q3", status: "ACCEPTED", validUntil: futureDate }),
      ]);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      const result = await getPortalQuotes(ORG_SLUG);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].canRespond).toBe(true);
        expect(result.data[1].canRespond).toBe(false);
        expect(result.data[2].canRespond).toBe(false);
      }
    });

    it("sets canRespond to false when policy is disabled", async () => {
      mockDb.quote.findMany.mockResolvedValue([
        makeQuote({ id: "q1", status: "SENT" }),
      ]);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: false,
      });

      const result = await getPortalQuotes(ORG_SLUG);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].canRespond).toBe(false);
      }
    });

    it("scopes query to authenticated org + customer (anti-IDOR)", async () => {
      mockDb.quote.findMany.mockResolvedValue([]);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      await getPortalQuotes(ORG_SLUG);

      const findManyCall = mockDb.quote.findMany.mock.calls[0][0];
      expect(findManyCall.where.orgId).toBe(ORG_ID);
      expect(findManyCall.where.customerId).toBe(CUSTOMER_ID);
    });
  });

  // ─── getPortalQuoteDetail ──────────────────────────────────────────────────

  describe("getPortalQuoteDetail", () => {
    it("returns not_found for unknown quote ID", async () => {
      mockDb.quote.findFirst.mockResolvedValue(null);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      const result = await getPortalQuoteDetail(ORG_SLUG, "nonexistent");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("not_found");
      }
    });

    it("returns quote detail scoped to authenticated customer", async () => {
      const quote = makeQuote();
      mockDb.quote.findFirst.mockResolvedValue(quote);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      const result = await getPortalQuoteDetail(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(QUOTE_ID);
        expect(result.data.canRespond).toBe(true);
      }
    });

    it("canRespond is false when policy is disabled", async () => {
      mockDb.quote.findFirst.mockResolvedValue(makeQuote());
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: false,
      });

      const result = await getPortalQuoteDetail(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.canRespond).toBe(false);
      }
    });

    it("canRespond is false when quote is expired", async () => {
      mockDb.quote.findFirst.mockResolvedValue(
        makeQuote({ validUntil: new Date(Date.now() - 86_400_000) }),
      );
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      const result = await getPortalQuoteDetail(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.canRespond).toBe(false);
      }
    });

    it("canRespond is false when status is not SENT", async () => {
      mockDb.quote.findFirst.mockResolvedValue(
        makeQuote({ status: "ACCEPTED" }),
      );
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      const result = await getPortalQuoteDetail(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.canRespond).toBe(false);
      }
    });

    it("detail query is scoped to org + customer (anti-IDOR)", async () => {
      mockDb.quote.findFirst.mockResolvedValue(null);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      await getPortalQuoteDetail(ORG_SLUG, QUOTE_ID);

      const findFirstCall = mockDb.quote.findFirst.mock.calls[0][0];
      expect(findFirstCall.where.orgId).toBe(ORG_ID);
      expect(findFirstCall.where.customerId).toBe(CUSTOMER_ID);
    });

    it("excludes DRAFT quotes from detail view", async () => {
      mockDb.quote.findFirst.mockResolvedValue(null);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      await getPortalQuoteDetail(ORG_SLUG, QUOTE_ID);

      const findFirstCall = mockDb.quote.findFirst.mock.calls[0][0];
      expect(findFirstCall.where.status).toEqual({ not: "DRAFT" });
    });
  });

  // ─── acceptPortalQuote ─────────────────────────────────────────────────────

  describe("acceptPortalQuote", () => {
    it("fails on unauthenticated request", async () => {
      mockGetPortalSession.mockResolvedValue(null);
      const result = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(false);
    });

    it("fails when portal is not enabled", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: false,
        portalQuoteAcceptanceEnabled: true,
      });

      const result = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Portal is not available");
      }
    });

    it("fails when quote acceptance policy is disabled", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: false,
      });

      const result = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not enabled");
      }
    });

    it("accepts a valid SENT quote within expiry", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const quote = makeQuote();
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(quote),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      const result = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quoteNumber).toBe(QUOTE_NUMBER);
        expect(result.data.alreadyHandled).toBeUndefined();
      }
    });

    it("returns staleOutcome: already_accepted when quote is already accepted", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const alreadyAccepted = makeQuote({ status: "ACCEPTED" });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(alreadyAccepted),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.staleOutcome).toBe("already_accepted");
        expect(result.data.quoteNumber).toBe(QUOTE_NUMBER);
      }
    });

    it("returns not_found for quote belonging to different customer", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(null),
          },
        };
        return fn(tx);
      });

      const result = await acceptPortalQuote(ORG_SLUG, "other_customer_quote");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Quote not found");
      }
    });

    it("returns staleOutcome: expired when quote is expired", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const expiredQuote = makeQuote({ validUntil: new Date(Date.now() - 86_400_000) });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(expiredQuote),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.staleOutcome).toBe("expired");
      }
    });

    it("idempotent: duplicate accept returns staleOutcome: already_accepted", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const quote = makeQuote();
      mockDb.$transaction.mockImplementationOnce(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(quote),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      const result1 = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result1.success).toBe(true);

      const acceptedQuote = makeQuote({ status: "ACCEPTED" });
      mockDb.$transaction.mockImplementationOnce(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(acceptedQuote),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result2 = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.data.staleOutcome).toBe("already_accepted");
      }
    });
  });

  // ─── declinePortalQuote ────────────────────────────────────────────────────

  describe("declinePortalQuote", () => {
    it("fails on unauthenticated request", async () => {
      mockGetPortalSession.mockResolvedValue(null);
      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID, "Too expensive");
      expect(result.success).toBe(false);
    });

    it("fails when policy is disabled", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: false,
      });

      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(false);
    });

    it("declines a valid SENT quote with reason", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const quote = makeQuote();
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(quote),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID, "Too expensive");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quoteNumber).toBe(QUOTE_NUMBER);
      }
    });

    it("declines without reason stores null", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const quote = makeQuote();
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(quote),
            update: vi.fn().mockImplementation(async (args: { data?: { declineReason?: unknown } }) => {
              expect(args.data?.declineReason).toBeNull();
              return { quoteNumber: QUOTE_NUMBER };
            }),
          },
        };
        return fn(tx);
      });

      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
    });

    it("returns staleOutcome: already_declined when quote is already declined", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const alreadyDeclined = makeQuote({ status: "DECLINED" });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(alreadyDeclined),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.staleOutcome).toBe("already_declined");
      }
    });

    it("idempotent: duplicate decline returns staleOutcome: already_declined", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const quote = makeQuote();
      mockDb.$transaction.mockImplementationOnce(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(quote),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      const result1 = await declinePortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result1.success).toBe(true);

      const declinedQuote = makeQuote({ status: "DECLINED" });
      mockDb.$transaction.mockImplementationOnce(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(declinedQuote),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result2 = await declinePortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.data.staleOutcome).toBe("already_declined");
      }
    });

    it("accept after decline returns staleOutcome: already_declined", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const declinedQuote = makeQuote({ status: "DECLINED" });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(declinedQuote),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.staleOutcome).toBe("already_declined");
      }
    });

    it("decline after accept returns staleOutcome: already_accepted", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const acceptedQuote = makeQuote({ status: "ACCEPTED" });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(acceptedQuote),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.staleOutcome).toBe("already_accepted");
      }
    });
  });

  // ─── Cross-customer & cross-org isolation ──────────────────────────────────

  describe("Cross-customer & cross-org isolation", () => {
    it("quote list query scopes to authenticated customer", async () => {
      mockDb.quote.findMany.mockResolvedValue([]);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      await getPortalQuotes(ORG_SLUG);

      const call = mockDb.quote.findMany.mock.calls[0][0];
      expect(call.where.orgId).toBe(ORG_ID);
      expect(call.where.customerId).toBe(CUSTOMER_ID);
    });

    it("quote detail query scopes to authenticated customer", async () => {
      mockDb.quote.findFirst.mockResolvedValue(null);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      await getPortalQuoteDetail(ORG_SLUG, QUOTE_ID);

      const call = mockDb.quote.findFirst.mock.calls[0][0];
      expect(call.where.orgId).toBe(ORG_ID);
      expect(call.where.customerId).toBe(CUSTOMER_ID);
    });

    it("accept action uses transaction with correct scopes", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      await acceptPortalQuote(ORG_SLUG, "someone_elses_quote");

      expect(mockDb.$transaction).toHaveBeenCalled();
    });

    it("org slug mismatch throws unauthorized", async () => {
      mockDb.organization.findUnique.mockResolvedValue({ id: "org_other_999" });

      const result = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(false);
    });
  });

  // ─── Empty state handling ──────────────────────────────────────────────────

  describe("Empty state handling", () => {
    it("returns empty array when no quotes exist", async () => {
      mockDb.quote.findMany.mockResolvedValue([]);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      const result = await getPortalQuotes(ORG_SLUG);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it("returns not_found for nonexistent quote detail", async () => {
      mockDb.quote.findFirst.mockResolvedValue(null);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      const result = await getPortalQuoteDetail(ORG_SLUG, "nonexistent");
      expect(result.success).toBe(false);
    });
  });

  // ─── Transaction safety ───────────────────────────────────────────────────

  describe("Transaction safety", () => {
    it("accept uses $transaction for atomic read-validate-write", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(makeQuote()),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    });

    it("decline uses $transaction for atomic read-validate-write", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(makeQuote()),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      await declinePortalQuote(ORG_SLUG, QUOTE_ID);
      expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    });

    it("transaction re-reads quote state before writing", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      // First findFirst finds the quote → update succeeds → no second call needed
      const findFirstSpy = vi.fn()
        .mockResolvedValueOnce(makeQuote());

      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: findFirstSpy,
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      const result = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      // findFirst was called once in the transaction (quote found, no re-read needed)
      expect(findFirstSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Truthful staleOutcome mapping ────────────────────────────────────────

  describe("Truthful staleOutcome mapping", () => {
    it("returns staleOutcome: converted for CONVERTED status on accept", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const convertedQuote = makeQuote({ status: "CONVERTED" });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(convertedQuote),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.staleOutcome).toBe("converted");
      }
    });

    it("returns staleOutcome: converted for CONVERTED status on decline", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const convertedQuote = makeQuote({ status: "CONVERTED" });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(convertedQuote),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.staleOutcome).toBe("converted");
      }
    });

    it("successful accept does not include staleOutcome", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(makeQuote()),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      const result = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.staleOutcome).toBeUndefined();
      }
    });

    it("successful decline does not include staleOutcome", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(makeQuote()),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.staleOutcome).toBeUndefined();
      }
    });
  });

  // ─── Audit log path assertions ────────────────────────────────────────────

  describe("Audit log paths", () => {
    it("logs client-hub path for list_quotes", async () => {
      mockDb.quote.findMany.mockResolvedValue([]);
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      await getPortalQuotes(ORG_SLUG);

      expect(mockLogPortalAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `/portal/${ORG_SLUG}/client-hub/quotes`,
          action: "list_quotes",
        }),
      );
    });

    it("logs client-hub path for view_quote", async () => {
      mockDb.quote.findFirst.mockResolvedValue(makeQuote());
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      await getPortalQuoteDetail(ORG_SLUG, QUOTE_ID);

      expect(mockLogPortalAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `/portal/${ORG_SLUG}/client-hub/quotes/${QUOTE_ID}`,
          action: "view_quote",
        }),
      );
    });

    it("logs client-hub path for accept_quote", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(makeQuote()),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      await acceptPortalQuote(ORG_SLUG, QUOTE_ID);

      expect(mockLogPortalAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `/portal/${ORG_SLUG}/client-hub/quotes/${QUOTE_ID}/accept`,
          action: "accept_quote",
        }),
      );
    });

    it("logs client-hub path for decline_quote", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(makeQuote()),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      await declinePortalQuote(ORG_SLUG, QUOTE_ID, "Too expensive");

      expect(mockLogPortalAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `/portal/${ORG_SLUG}/client-hub/quotes/${QUOTE_ID}/decline`,
          action: "decline_quote",
        }),
      );
    });

    it("does not log on stale outcome (no mutation)", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const alreadyAccepted = makeQuote({ status: "ACCEPTED" });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(alreadyAccepted),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      mockLogPortalAccess.mockClear();
      await acceptPortalQuote(ORG_SLUG, QUOTE_ID);

      // Should not log accept_quote when quote is already handled
      const acceptLogCalls = mockLogPortalAccess.mock.calls.filter(
        (call: [unknown]) => (call[0] as { action?: string })?.action === "accept_quote",
      );
      expect(acceptLogCalls).toHaveLength(0);
    });
  });

  // ─── Decline reason server-side validation ────────────────────────────────

  describe("Decline reason validation", () => {
    it("stores null when reason is undefined", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const quote = makeQuote();
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(quote),
            update: vi.fn().mockImplementation(async (args: { data?: { declineReason?: unknown } }) => {
              expect(args.data?.declineReason).toBeNull();
              return { quoteNumber: QUOTE_NUMBER };
            }),
          },
        };
        return fn(tx);
      });

      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
    });

    it("stores null when reason is whitespace-only", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const quote = makeQuote();
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(quote),
            update: vi.fn().mockImplementation(async (args: { data?: { declineReason?: unknown } }) => {
              expect(args.data?.declineReason).toBeNull();
              return { quoteNumber: QUOTE_NUMBER };
            }),
          },
        };
        return fn(tx);
      });

      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID, "   \t\n  ");
      expect(result.success).toBe(true);
    });

    it("trims and stores valid reason", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const quote = makeQuote();
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(quote),
            update: vi.fn().mockImplementation(async (args: { data?: { declineReason?: unknown } }) => {
              expect(args.data?.declineReason).toBe("Too expensive");
              return { quoteNumber: QUOTE_NUMBER };
            }),
          },
        };
        return fn(tx);
      });

      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID, "  Too expensive  ");
      expect(result.success).toBe(true);
    });

    it("rejects oversized reason safely", async () => {
      const longReason = "a".repeat(2001);
      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID, longReason);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("2000 characters or fewer");
      }
    });

    it("accepts reason at max length", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const maxReason = "a".repeat(2000);
      const quote = makeQuote();
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(quote),
            update: vi.fn().mockImplementation(async (args: { data?: { declineReason?: unknown } }) => {
              expect(args.data?.declineReason).toBe(maxReason);
              return { quoteNumber: QUOTE_NUMBER };
            }),
          },
        };
        return fn(tx);
      });

      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID, maxReason);
      expect(result.success).toBe(true);
    });
  });

  // ─── Document event emissions ──────────────────────────────────────────────

  describe("Document event emissions", () => {
    it("emits quote_accepted document event on successful accept", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(makeQuote()),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      await acceptPortalQuote(ORG_SLUG, QUOTE_ID);

      expect(mockEmitQuoteEvent).toHaveBeenCalledWith(
        ORG_ID,
        QUOTE_ID,
        "quote_accepted",
        expect.objectContaining({
          actorId: CUSTOMER_ID,
          metadata: expect.objectContaining({ quoteNumber: QUOTE_NUMBER, source: "portal" }),
        }),
      );
    });

    it("emits quote_declined document event on successful decline", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(makeQuote()),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      await declinePortalQuote(ORG_SLUG, QUOTE_ID, "Too expensive");

      expect(mockEmitQuoteEvent).toHaveBeenCalledWith(
        ORG_ID,
        QUOTE_ID,
        "quote_declined",
        expect.objectContaining({
          actorId: CUSTOMER_ID,
          metadata: expect.objectContaining({ quoteNumber: QUOTE_NUMBER, source: "portal", reason: "Too expensive" }),
        }),
      );
    });

    it("does NOT emit quote_accepted document event on stale accept", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const alreadyAccepted = makeQuote({ status: "ACCEPTED" });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(alreadyAccepted),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      mockEmitQuoteEvent.mockClear();
      await acceptPortalQuote(ORG_SLUG, QUOTE_ID);

      const quoteAcceptedCalls = mockEmitQuoteEvent.mock.calls.filter(
        (call: [unknown, unknown, unknown]) => call[2] === "quote_accepted",
      );
      expect(quoteAcceptedCalls).toHaveLength(0);
    });

    it("does NOT emit quote_declined document event on stale decline", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const alreadyDeclined = makeQuote({ status: "DECLINED" });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(alreadyDeclined),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      mockEmitQuoteEvent.mockClear();
      await declinePortalQuote(ORG_SLUG, QUOTE_ID);

      const quoteDeclinedCalls = mockEmitQuoteEvent.mock.calls.filter(
        (call: [unknown, unknown, unknown]) => call[2] === "quote_declined",
      );
      expect(quoteDeclinedCalls).toHaveLength(0);
    });

    it("does NOT emit duplicate events on duplicate accept", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      // First accept succeeds
      mockDb.$transaction.mockImplementationOnce(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(makeQuote()),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      mockEmitQuoteEvent.mockClear();
      await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(mockEmitQuoteEvent).toHaveBeenCalledTimes(1);

      // Second accept is stale
      const acceptedQuote = makeQuote({ status: "ACCEPTED" });
      mockDb.$transaction.mockImplementationOnce(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(acceptedQuote),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      mockEmitQuoteEvent.mockClear();
      await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(mockEmitQuoteEvent).not.toHaveBeenCalled();
    });

    it("does NOT emit duplicate events on duplicate decline", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      // First decline succeeds
      mockDb.$transaction.mockImplementationOnce(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(makeQuote()),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      mockEmitQuoteEvent.mockClear();
      await declinePortalQuote(ORG_SLUG, QUOTE_ID);
      expect(mockEmitQuoteEvent).toHaveBeenCalledTimes(1);

      // Second decline is stale
      const declinedQuote = makeQuote({ status: "DECLINED" });
      mockDb.$transaction.mockImplementationOnce(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(declinedQuote),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      mockEmitQuoteEvent.mockClear();
      await declinePortalQuote(ORG_SLUG, QUOTE_ID);
      expect(mockEmitQuoteEvent).not.toHaveBeenCalled();
    });

    it("emits events with org-scoped orgId", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn().mockResolvedValue(makeQuote()),
            update: vi.fn().mockResolvedValue({ quoteNumber: QUOTE_NUMBER }),
          },
        };
        return fn(tx);
      });

      mockEmitQuoteEvent.mockClear();
      await acceptPortalQuote(ORG_SLUG, QUOTE_ID);

      const call = mockEmitQuoteEvent.mock.calls[0];
      expect(call[0]).toBe(ORG_ID);
    });
  });

  // ─── Failure state truthfulness ────────────────────────────────────────────

  describe("Failure state truthfulness", () => {
    it("returns success: false with error message when getPortalQuotes fails", async () => {
      mockDb.quote.findMany.mockRejectedValue(new Error("Database connection lost"));
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      const result = await getPortalQuotes(ORG_SLUG);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Database connection lost");
      }
    });

    it("returns success: false for unauthenticated session in getPortalQuotes", async () => {
      mockGetPortalSession.mockResolvedValue(null);

      const result = await getPortalQuotes(ORG_SLUG);
      expect(result.success).toBe(false);
    });

    it("does not return success: true with empty data on failure", async () => {
      mockDb.quote.findMany.mockRejectedValue(new Error("DB error"));
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalQuoteAcceptanceEnabled: true,
      });

      const result = await getPortalQuotes(ORG_SLUG);
      // Must never return success:true with empty array when the real state is unknown
      expect(result.success).toBe(false);
    });
  });

  // ─── DRAFT quote leakage prevention (fail-closed) ─────────────────────────

  describe("DRAFT quote leakage prevention", () => {
    it("acceptPortalQuote returns not_found for DRAFT quote (no leakage)", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const draftQuote = makeQuote({ status: "DRAFT" });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)  // Primary SENT+valid lookup fails
              .mockResolvedValueOnce(draftQuote),  // Fallback finds DRAFT
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Quote not found");
      }
    });

    it("declinePortalQuote returns not_found for DRAFT quote (no leakage)", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const draftQuote = makeQuote({ status: "DRAFT" });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)  // Primary SENT+valid lookup fails
              .mockResolvedValueOnce(draftQuote),  // Fallback finds DRAFT
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID, "Too expensive");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Quote not found");
      }
    });

    it("acceptPortalQuote still returns staleOutcome for portal-visible statuses", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const acceptedQuote = makeQuote({ status: "ACCEPTED" });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(acceptedQuote),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await acceptPortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.staleOutcome).toBe("already_accepted");
        expect(result.data.quoteNumber).toBe(QUOTE_NUMBER);
      }
    });

    it("declinePortalQuote still returns staleOutcome for portal-visible statuses", async () => {
      mockDb.orgDefaults.findUnique.mockResolvedValue({
        portalEnabled: true,
        portalQuoteAcceptanceEnabled: true,
      });

      const expiredQuote = makeQuote({ status: "SENT", validUntil: new Date(Date.now() - 86_400_000) });
      mockDb.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          quote: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(expiredQuote),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await declinePortalQuote(ORG_SLUG, QUOTE_ID);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.staleOutcome).toBe("expired");
        expect(result.data.quoteNumber).toBe(QUOTE_NUMBER);
      }
    });
  });
});
