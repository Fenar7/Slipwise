import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ─── Mocks (hoisted so vi.mock factories can reference them) ────────────────

const {
  mockDb,
  mockSendEmail,
  mockLogAudit,
  mockCookies,
} = vi.hoisted(() => {
  const cookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };
  return {
    mockDb: {
      customer: { findFirst: vi.fn() },
      customerPortalToken: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      customerPortalSession: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      customerPortalAccessLog: { create: vi.fn() },
      portalRateLimit: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
    },
    mockSendEmail: vi.fn(),
    mockLogAudit: vi.fn().mockResolvedValue(undefined),
    mockCookies: vi.fn().mockResolvedValue(cookieStore),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/email", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/flow/workflow-engine", () => ({
  fireWorkflowTrigger: vi.fn(),
}));

import {
  requestMagicLink,
  verifyMagicLink,
  getPortalSession,
  revokePortalSession,
  getPortalAccessState,
} from "../portal-auth";

// ─── Helpers ────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function makeJwt(
  payload: Record<string, unknown>,
  secret = "test-jwt-secret"
): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

function makeCustomerResult(overrides: Record<string, unknown> = {}) {
  return {
    id: "cust-1",
    name: "Acme Corp",
    email: "billing@acme.com",
    organizationId: "org-1",
    organization: {
      id: "org-1",
      name: "Slipwise Inc",
      slug: "slipwise",
      defaults: {
        portalEnabled: true,
        portalSupportEmail: "support@slipwise.com",
      },
    },
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("portal-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PORTAL_JWT_SECRET", "test-jwt-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.slipwise.com");
    mockSendEmail.mockResolvedValue(undefined);
    mockLogAudit.mockResolvedValue(undefined);
    mockDb.customerPortalToken.updateMany.mockResolvedValue({ count: 0 });
    mockDb.customerPortalToken.create.mockResolvedValue({ id: "tok-1" });
    // Rate limit: default to no window (allows through)
    mockDb.portalRateLimit.findUnique.mockResolvedValue(null);
    mockDb.portalRateLimit.upsert.mockResolvedValue({ count: 1 });
    mockDb.portalRateLimit.update.mockResolvedValue({});
    // Session: default to success
    mockDb.customerPortalSession.create.mockResolvedValue({ id: "sess-1" });
    mockDb.customerPortalSession.findUnique.mockResolvedValue(null);
    mockDb.customerPortalSession.update.mockResolvedValue({});
    mockDb.customerPortalSession.updateMany.mockResolvedValue({ count: 0 });
  });

  // ─── requestMagicLink ──────────────────────────────────────────────────────

  describe("requestMagicLink", () => {
    it("sends email when customer exists", async () => {
      const customer = makeCustomerResult();
      mockDb.customer.findFirst.mockResolvedValue(customer);

      const result = await requestMagicLink("billing@acme.com", "slipwise");

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "billing@acme.com",
          subject: expect.stringContaining("Slipwise Inc"),
          html: expect.stringContaining("Acme Corp"),
        })
      );
      expect(mockDb.customerPortalToken.create).toHaveBeenCalled();
    });

    it("returns success even when customer doesn't exist (anti-enumeration)", async () => {
      mockDb.customer.findFirst.mockResolvedValue(null);

      const result = await requestMagicLink("unknown@example.com", "slipwise");

      expect(result.success).toBe(true);
      expect(result.message).toBeTruthy();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("doesn't send email when portal not enabled", async () => {
      const customer = makeCustomerResult({
        organization: {
          id: "org-1",
          name: "Slipwise Inc",
          slug: "slipwise",
          defaults: { portalEnabled: false, portalSupportEmail: null },
        },
      });
      mockDb.customer.findFirst.mockResolvedValue(customer);

      const result = await requestMagicLink("billing@acme.com", "slipwise");

      expect(result.success).toBe(true);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  // ─── verifyMagicLink ──────────────────────────────────────────────────────

  describe("verifyMagicLink", () => {
    it("sets cookie and returns success for valid token", async () => {
      const rawToken = "abc123def456";
      const tokenHash = sha256(rawToken);
      const cookieStore = await mockCookies();

      mockDb.customerPortalToken.findFirst.mockResolvedValue({
        id: "tok-1",
        tokenHash,
        customerId: "cust-1",
        orgId: "org-1",
        isRevoked: false,
        expiresAt: new Date(Date.now() + 86400000),
        customer: {
          id: "cust-1",
          organization: {
            slug: "slipwise",
            defaults: { portalEnabled: true, portalSessionExpiryHours: 24 },
          },
        },
      });
      mockDb.customerPortalToken.update.mockResolvedValue({});

      const result = await verifyMagicLink(rawToken, "cust-1", "slipwise");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.customerId).toBe("cust-1");
        expect(result.orgId).toBe("org-1");
      }
      expect(cookieStore.set).toHaveBeenCalledWith(
        "portal_session",
        expect.any(String),
        expect.objectContaining({ httpOnly: true })
      );
    });

    it("rejects expired token", async () => {
      // findFirst returns null when expiresAt > now filter doesn't match
      mockDb.customerPortalToken.findFirst.mockResolvedValue(null);

      const result = await verifyMagicLink("expired-token", "cust-1", "slipwise");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("invalid_or_expired_link");
      }
    });

    it("rejects revoked token", async () => {
      // findFirst returns null when isRevoked: false filter doesn't match revoked token
      mockDb.customerPortalToken.findFirst.mockResolvedValue(null);

      const result = await verifyMagicLink("revoked-token", "cust-1", "slipwise");

      expect(result.success).toBe(false);
    });

    it("rejects wrong customer", async () => {
      // Token found but the org slug doesn't match
      mockDb.customerPortalToken.findFirst.mockResolvedValue({
        id: "tok-1",
        tokenHash: "hash",
        customerId: "cust-2",
        orgId: "org-1",
        isRevoked: false,
        expiresAt: new Date(Date.now() + 86400000),
        customer: {
          id: "cust-2",
          organization: {
            slug: "other-org",
            defaults: { portalEnabled: true, portalSessionExpiryHours: 24 },
          },
        },
      });

      const result = await verifyMagicLink("some-token", "cust-2", "slipwise");

      expect(result.success).toBe(false);
    });
  });

  // ─── getPortalSession ─────────────────────────────────────────────────────

  describe("getPortalSession", () => {
    it("returns session from valid JWT cookie", async () => {
      const now = Math.floor(Date.now() / 1000);
      const jwt = makeJwt({
        customerId: "cust-1",
        orgId: "org-1",
        orgSlug: "slipwise",
        jti: "test-jti-1",
        iat: now,
        exp: now + 86400,
      });
      const cookieStore = await mockCookies();
      cookieStore.get.mockReturnValue({ value: jwt });
      // Session DB record exists and is active
      mockDb.customerPortalSession.findUnique.mockResolvedValue({
        id: "sess-1",
        jti: "test-jti-1",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
      });

      const session = await getPortalSession();

      expect(session).not.toBeNull();
      expect(session?.customerId).toBe("cust-1");
      expect(session?.orgId).toBe("org-1");
      expect(session?.orgSlug).toBe("slipwise");
    });

    it("returns null for expired JWT", async () => {
      const now = Math.floor(Date.now() / 1000);
      const jwt = makeJwt({
        customerId: "cust-1",
        orgId: "org-1",
        orgSlug: "slipwise",
        jti: "test-jti-expired",
        iat: now - 90000,
        exp: now - 3600, // expired 1 hour ago
      });
      const cookieStore = await mockCookies();
      cookieStore.get.mockReturnValue({ value: jwt });

      const session = await getPortalSession();

      expect(session).toBeNull();
    });

    it("returns null for missing cookie", async () => {
      const cookieStore = await mockCookies();
      cookieStore.get.mockReturnValue(undefined);

      const session = await getPortalSession();

      expect(session).toBeNull();
    });

    it("returns null when DB session is revoked", async () => {
      const now = Math.floor(Date.now() / 1000);
      const jwt = makeJwt({
        customerId: "cust-1",
        orgId: "org-1",
        orgSlug: "slipwise",
        jti: "test-jti-revoked",
        iat: now,
        exp: now + 86400,
      });
      const cookieStore = await mockCookies();
      cookieStore.get.mockReturnValue({ value: jwt });
      // Session is revoked
      mockDb.customerPortalSession.findUnique.mockResolvedValue({
        id: "sess-1",
        jti: "test-jti-revoked",
        revokedAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 86400000),
      });

      const session = await getPortalSession();

      expect(session).toBeNull();
    });
  });

  // ─── revokePortalSession ──────────────────────────────────────────────────

  describe("revokePortalSession", () => {
    it("revokes tokens and sessions and clears cookie", async () => {
      const cookieStore = await mockCookies();
      mockDb.customerPortalToken.updateMany.mockResolvedValue({ count: 2 });
      mockDb.customerPortalSession.updateMany.mockResolvedValue({ count: 1 });

      await revokePortalSession("cust-1", "org-1");

      expect(mockDb.customerPortalToken.updateMany).toHaveBeenCalledWith({
        where: {
          customerId: "cust-1",
          orgId: "org-1",
          isRevoked: false,
        },
        data: { isRevoked: true },
      });
      expect(mockDb.customerPortalSession.updateMany).toHaveBeenCalledWith({
        where: {
          customerId: "cust-1",
          orgId: "org-1",
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) },
      });
      expect(cookieStore.delete).toHaveBeenCalledWith("portal_session");
    });
  });

  // ─── JWT helpers ──────────────────────────────────────────────────────────

  describe("JWT sign/verify", () => {
    it("roundtrip works correctly", async () => {
      // We test this indirectly: verifyMagicLink creates a JWT cookie, 
      // getPortalSession reads it back
      const rawToken = "roundtrip-test-token";
      const cookieStore = await mockCookies();
      let savedCookieValue = "";

      mockDb.customerPortalToken.findFirst.mockResolvedValue({
        id: "tok-1",
        tokenHash: sha256(rawToken),
        customerId: "cust-1",
        orgId: "org-1",
        isRevoked: false,
        expiresAt: new Date(Date.now() + 86400000),
        customer: {
          id: "cust-1",
          organization: {
            slug: "slipwise",
            defaults: { portalEnabled: true, portalSessionExpiryHours: 24 },
          },
        },
      });
      mockDb.customerPortalToken.update.mockResolvedValue({});
      // The new session record returned after create
      mockDb.customerPortalSession.create.mockImplementation(async ({ data }: { data: { jti: string; expiresAt: Date; } }) => ({
        id: "sess-rt-1",
        jti: data.jti,
        revokedAt: null,
        expiresAt: data.expiresAt,
      }));

      cookieStore.set.mockImplementation((_name: string, value: string) => {
        savedCookieValue = value;
      });

      const verifyResult = await verifyMagicLink(rawToken, "cust-1", "slipwise");
      expect(verifyResult.success).toBe(true);
      expect(savedCookieValue).toBeTruthy();

      // Now simulate getPortalSession reading that cookie back
      cookieStore.get.mockReturnValue({ value: savedCookieValue });
      // Decode the jti from savedCookieValue so we can mock the DB session lookup
      const parts = savedCookieValue.split(".");
      const decodedPayload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as { jti: string };
      mockDb.customerPortalSession.findUnique.mockResolvedValue({
        id: "sess-rt-1",
        jti: decodedPayload.jti,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
      });

      const session = await getPortalSession();

      expect(session).not.toBeNull();
      expect(session?.customerId).toBe("cust-1");
      expect(session?.orgId).toBe("org-1");
      expect(session?.orgSlug).toBe("slipwise");
    });

    it("rejects tampered token", async () => {
      const now = Math.floor(Date.now() / 1000);
      const jwt = makeJwt({
        customerId: "cust-1",
        orgId: "org-1",
        orgSlug: "slipwise",
        iat: now,
        exp: now + 86400,
      });

      // Tamper with the payload
      const parts = jwt.split(".");
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          customerId: "cust-hacker",
          orgId: "org-1",
          orgSlug: "slipwise",
          iat: now,
          exp: now + 86400,
        })
      ).toString("base64url");
      const tamperedJwt = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const cookieStore = await mockCookies();
      cookieStore.get.mockReturnValue({ value: tamperedJwt });

      const session = await getPortalSession();

      expect(session).toBeNull();
    });
  });

  // ─── getPortalAccessState ──────────────────────────────────────────────────

  describe("getPortalAccessState", () => {
    it("returns LOCKED if portal or customer lifecycle is disabled", () => {
      const state = getPortalAccessState({
        portalEnabled: false,
        lifecycleEnabled: true,
        latestInviteSentAt: null,
        inviteSentCount: 0,
        tokens: [],
        sessions: [],
      });
      expect(state).toBe("LOCKED");

      const state2 = getPortalAccessState({
        portalEnabled: true,
        lifecycleEnabled: false,
        latestInviteSentAt: null,
        inviteSentCount: 0,
        tokens: [],
        sessions: [],
      });
      expect(state2).toBe("LOCKED");
    });

    it("returns NEVER_INVITED if customer is enabled but inviteSentCount is 0", () => {
      const state = getPortalAccessState({
        portalEnabled: true,
        lifecycleEnabled: true,
        latestInviteSentAt: null,
        inviteSentCount: 0,
        tokens: [],
        sessions: [],
      });
      expect(state).toBe("NEVER_INVITED");
    });

    it("returns ISSUED if invite is sent and newest token is active/valid", () => {
      const state = getPortalAccessState({
        portalEnabled: true,
        lifecycleEnabled: true,
        latestInviteSentAt: new Date(),
        inviteSentCount: 1,
        tokens: [
          {
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000),
            isRevoked: false,
            lastUsedAt: null,
          },
        ],
        sessions: [],
      });
      expect(state).toBe("ISSUED");
    });

    it("returns EXPIRED if the token is expired", () => {
      const state = getPortalAccessState({
        portalEnabled: true,
        lifecycleEnabled: true,
        latestInviteSentAt: new Date(Date.now() - 90000000),
        inviteSentCount: 1,
        tokens: [
          {
            createdAt: new Date(Date.now() - 90000000),
            expiresAt: new Date(Date.now() - 10000),
            isRevoked: false,
            lastUsedAt: null,
          },
        ],
        sessions: [],
      });
      expect(state).toBe("EXPIRED");
    });

    it("returns REVOKED if tokens and sessions are explicitly revoked", () => {
      const state = getPortalAccessState({
        portalEnabled: true,
        lifecycleEnabled: true,
        latestInviteSentAt: new Date(),
        inviteSentCount: 1,
        tokens: [
          {
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000),
            isRevoked: true,
            lastUsedAt: null,
          },
        ],
        sessions: [
          {
            revokedAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000),
          },
        ],
      });
      expect(state).toBe("REVOKED");
    });

    it("returns ACTIVE if there is an unrevoked and unexpired session", () => {
      const state = getPortalAccessState({
        portalEnabled: true,
        lifecycleEnabled: true,
        latestInviteSentAt: new Date(),
        inviteSentCount: 1,
        tokens: [],
        sessions: [
          {
            revokedAt: null,
            expiresAt: new Date(Date.now() + 86400000),
          },
        ],
      });
      expect(state).toBe("ACTIVE");
    });

    it("returns VERIFIED if a session is present but revoked/expired, or a token was used", () => {
      const state = getPortalAccessState({
        portalEnabled: true,
        lifecycleEnabled: true,
        latestInviteSentAt: new Date(),
        inviteSentCount: 1,
        tokens: [
          {
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 86400000),
            isRevoked: false,
            lastUsedAt: new Date(),
          },
        ],
        sessions: [],
      });
      expect(state).toBe("VERIFIED");
    });
  });
});
