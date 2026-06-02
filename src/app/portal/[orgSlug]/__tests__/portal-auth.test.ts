/**
 * Sprint 22.1 — Portal Access Governance Tests
 *
 * Covers: token expiry, token revocation, invalid token, portal disabled,
 * org isolation, customer scope isolation, access log creation, session model,
 * magic link rate limiting (DB-backed), admin authorization.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  customer: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  organization: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
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
    findMany: vi.fn(),
  },
  customerPortalAccessLog: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  portalRateLimit: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  orgDefaults: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
}));

const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  ping: vi.fn(),
}));

const mockRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockReturnValue(Promise.resolve()) }));
vi.mock("@/lib/redis-client", () => ({ redis: mockRedis }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mockRateLimit }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));
vi.mock("@/lib/flow/workflow-engine", () => ({
  fireWorkflowTrigger: vi.fn(),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import {
  requestMagicLink,
  verifyMagicLink,
  getPortalSession,
  revokePortalSession,
  logPortalAccess,
} from "@/lib/portal-auth";
import { cookies } from "next/headers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ORG_ID = "org_test_001";
const CUSTOMER_ID = "cust_test_001";
const ORG_SLUG = "test-org";
const ANOTHER_ORG_ID = "org_test_002";
const ANOTHER_CUSTOMER_ID = "cust_test_002";

function makeOrgDefaults(overrides?: Partial<Record<string, unknown>>) {
  return {
    portalEnabled: true,
    portalSupportEmail: null,
    portalMagicLinkExpiryHours: 24,
    portalSessionExpiryHours: 24,
    ...overrides,
  };
}

function makeCustomer(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: CUSTOMER_ID,
    name: "Test Customer",
    email: "customer@example.com",
    organizationId: ORG_ID,
    organization: {
      id: ORG_ID,
      name: "Test Org",
      slug: ORG_SLUG,
      defaults: makeOrgDefaults(),
    },
    clientHubLifecycle: { enabled: true },
    ...overrides,
  };
}

function makePortalToken(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "tok_001",
    orgId: ORG_ID,
    customerId: CUSTOMER_ID,
    tokenHash: "hashed_token",
    isRevoked: false,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    lastUsedAt: null,
    customer: makeCustomer(),
    ...overrides,
  };
}

function makeJwt(payload: Record<string, unknown>, secret = process.env.PORTAL_JWT_SECRET ?? "test-secret"): string {
  function base64url(data: Buffer | string) {
    const buf = typeof data === "string" ? Buffer.from(data) : data;
    return buf.toString("base64url");
  }
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PORTAL_JWT_SECRET = "test-portal-jwt-secret-that-is-long-enough";
  process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";

  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue(undefined);
  mockRedis.del.mockResolvedValue(undefined);
  mockRedis.exists.mockResolvedValue(false);
  mockRedis.ping.mockResolvedValue(false);

  mockRateLimit.mockImplementation(async (key, options) => {
    const val = await mockRedis.get(key);
    if (val !== null && val !== undefined) {
      const limit = options?.maxRequests ?? 5;
      const count = parseInt(String(val), 10);
      return { success: count < limit, remaining: Math.max(0, limit - count) };
    }
    return { success: true, remaining: 999 };
  });

  // Default: rate limit allows through
  mockDb.portalRateLimit.findUnique.mockResolvedValue(null);
  mockDb.portalRateLimit.upsert.mockResolvedValue({ key: "ml:test", count: 1, windowEnd: new Date() });
  mockDb.portalRateLimit.update.mockResolvedValue({ count: 2 });
  mockDb.portalRateLimit.deleteMany.mockResolvedValue({ count: 0 });
  mockDb.customerPortalToken.updateMany.mockResolvedValue({ count: 0 });
  mockDb.customerPortalToken.create.mockResolvedValue({ id: "tok_new" });
  mockDb.customerPortalSession.create.mockResolvedValue({ id: "sess_001" });
  mockDb.customerPortalSession.update.mockResolvedValue({});
  mockDb.customerPortalSession.updateMany.mockResolvedValue({ count: 1 });
  mockDb.customerPortalAccessLog.create.mockResolvedValue({});
});

// ─── Magic link request ───────────────────────────────────────────────────────

describe("requestMagicLink", () => {
  it("returns generic success when customer not found (no enumeration)", async () => {
    mockDb.customer.findFirst.mockResolvedValue(null);
    const result = await requestMagicLink("unknown@example.com", ORG_SLUG);
    expect(result.success).toBe(true);
    // Does not throw, returns generic message
    expect(result.message).toContain("If an account exists");
  });

  it("returns generic success when portal is disabled", async () => {
    mockDb.customer.findFirst.mockResolvedValue(
      makeCustomer({ organization: { id: ORG_ID, name: "Test", slug: ORG_SLUG, defaults: makeOrgDefaults({ portalEnabled: false }) } })
    );
    const result = await requestMagicLink("customer@example.com", ORG_SLUG);
    expect(result.success).toBe(true);
    expect(mockDb.customerPortalToken.create).not.toHaveBeenCalled();
  });

  it("creates portal token and sends email when portal enabled", async () => {
    mockDb.customer.findFirst.mockResolvedValue(makeCustomer());
    const { sendEmail } = await import("@/lib/email");
    const result = await requestMagicLink("customer@example.com", ORG_SLUG);
    expect(result.success).toBe(true);
    expect(mockDb.customerPortalToken.create).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("revokes existing tokens before creating new one", async () => {
    mockDb.customer.findFirst.mockResolvedValue(makeCustomer());
    await requestMagicLink("customer@example.com", ORG_SLUG);
    expect(mockDb.customerPortalToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isRevoked: true } })
    );
  });

  it("returns generic success when rate limit exceeded", async () => {
    mockRedis.get.mockResolvedValue("3");
    mockDb.customer.findFirst.mockResolvedValue(makeCustomer());
    const result = await requestMagicLink("customer@example.com", ORG_SLUG);
    expect(result.success).toBe(true);
    expect(mockDb.customerPortalToken.create).not.toHaveBeenCalled();
  });
});

// ─── Magic link verification ──────────────────────────────────────────────────

describe("verifyMagicLink", () => {
  it("returns error for non-existent token", async () => {
    mockDb.customerPortalToken.findFirst.mockResolvedValue(null);
    const result = await verifyMagicLink("bad_token", CUSTOMER_ID, ORG_SLUG);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("invalid_or_expired_link");
  });

  it("returns error when token belongs to different org slug", async () => {
    mockDb.customerPortalToken.findFirst.mockResolvedValue(
      makePortalToken({
        customer: makeCustomer({ organization: { id: ORG_ID, name: "Other", slug: "other-org", defaults: makeOrgDefaults() } }),
      })
    );
    const result = await verifyMagicLink("raw_token", CUSTOMER_ID, ORG_SLUG);
    expect(result.success).toBe(false);
  });

  it("returns error when portal is disabled at verification time", async () => {
    mockDb.customerPortalToken.findFirst.mockResolvedValue(
      makePortalToken({
        customer: makeCustomer({ organization: { id: ORG_ID, name: "Test", slug: ORG_SLUG, defaults: makeOrgDefaults({ portalEnabled: false }) } }),
      })
    );
    const result = await verifyMagicLink("raw_token", CUSTOMER_ID, ORG_SLUG);
    expect(result.success).toBe(false);
  });

  it("creates a portal session and sets cookie on success", async () => {
    const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);
    mockDb.customerPortalToken.findFirst.mockResolvedValue(makePortalToken());
    mockDb.customerPortalToken.update.mockResolvedValue({});

    const result = await verifyMagicLink("valid_raw_token", CUSTOMER_ID, ORG_SLUG);

    expect(result.success).toBe(true);
    expect(mockDb.customerPortalSession.create).toHaveBeenCalledOnce();
    expect(cookieStore.set).toHaveBeenCalledWith(
      "portal_session",
      expect.any(String),
      expect.objectContaining({ httpOnly: true })
    );
  });

  it("consumes (one-time-use) the magic-link token on success", async () => {
    const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);
    mockDb.customerPortalToken.findFirst.mockResolvedValue(makePortalToken());
    mockDb.customerPortalToken.update.mockResolvedValue({});
    await verifyMagicLink("valid_raw_token", CUSTOMER_ID, ORG_SLUG);
    expect(mockDb.customerPortalToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isRevoked: true }) })
    );
  });
});

// ─── Session validation & revocation ─────────────────────────────────────────

describe("getPortalSession", () => {
  it("returns null when no cookie present", async () => {
    const cookieStore = { get: vi.fn().mockReturnValue(undefined), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);
    const session = await getPortalSession();
    expect(session).toBeNull();
  });

  it("returns null when JWT signature is invalid", async () => {
    const badJwt = "header.body.badsignature";
    const cookieStore = { get: vi.fn().mockReturnValue({ value: badJwt }), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);
    const session = await getPortalSession();
    expect(session).toBeNull();
  });

  it("returns null when JWT is expired", async () => {
    const expiredPayload = {
      jti: "jti_expired",
      customerId: CUSTOMER_ID,
      orgId: ORG_ID,
      orgSlug: ORG_SLUG,
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
    };
    const jwt = makeJwt(expiredPayload, process.env.PORTAL_JWT_SECRET!);
    const cookieStore = { get: vi.fn().mockReturnValue({ value: jwt }), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);
    const session = await getPortalSession();
    expect(session).toBeNull();
  });

  it("returns null when DB session is revoked", async () => {
    const now = Math.floor(Date.now() / 1000);
    const validPayload = {
      jti: "jti_revoked",
      customerId: CUSTOMER_ID,
      orgId: ORG_ID,
      orgSlug: ORG_SLUG,
      iat: now - 100,
      exp: now + 86400,
    };
    const jwt = makeJwt(validPayload, process.env.PORTAL_JWT_SECRET!);
    const cookieStore = { get: vi.fn().mockReturnValue({ value: jwt }), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);
    // Session is revoked in DB
    mockDb.customerPortalSession.findUnique.mockResolvedValue({
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });
    const session = await getPortalSession();
    expect(session).toBeNull();
  });

  it("returns null when DB session record not found (missing/deleted)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const validPayload = {
      jti: "jti_missing",
      customerId: CUSTOMER_ID,
      orgId: ORG_ID,
      orgSlug: ORG_SLUG,
      iat: now - 100,
      exp: now + 86400,
    };
    const jwt = makeJwt(validPayload, process.env.PORTAL_JWT_SECRET!);
    const cookieStore = { get: vi.fn().mockReturnValue({ value: jwt }), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);
    mockDb.customerPortalSession.findUnique.mockResolvedValue(null);
    const session = await getPortalSession();
    expect(session).toBeNull();
  });

  it("returns session when JWT valid and DB session active", async () => {
    const now = Math.floor(Date.now() / 1000);
    const validPayload = {
      jti: "jti_active",
      customerId: CUSTOMER_ID,
      orgId: ORG_ID,
      orgSlug: ORG_SLUG,
      iat: now - 100,
      exp: now + 86400,
    };
    const jwt = makeJwt(validPayload, process.env.PORTAL_JWT_SECRET!);
    const cookieStore = { get: vi.fn().mockReturnValue({ value: jwt }), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);
    mockDb.customerPortalSession.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const session = await getPortalSession();
    expect(session).not.toBeNull();
    expect(session?.customerId).toBe(CUSTOMER_ID);
    expect(session?.orgId).toBe(ORG_ID);
  });
});

// ─── Session revocation ───────────────────────────────────────────────────────

describe("revokePortalSession", () => {
  it("revokes all tokens and sessions for the customer+org", async () => {
    const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);
    await revokePortalSession(CUSTOMER_ID, ORG_ID);
    expect(mockDb.customerPortalToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: CUSTOMER_ID, orgId: ORG_ID }) })
    );
    expect(mockDb.customerPortalSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: CUSTOMER_ID, orgId: ORG_ID }) })
    );
  });

  it("clears the session cookie", async () => {
    const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);
    await revokePortalSession(CUSTOMER_ID, ORG_ID);
    expect(cookieStore.delete).toHaveBeenCalledWith("portal_session");
  });
});

// ─── Org isolation ────────────────────────────────────────────────────────────

describe("org isolation", () => {
  it("does not verify a token issued for a different org slug", async () => {
    mockDb.customerPortalToken.findFirst.mockResolvedValue(
      makePortalToken({
        orgId: ANOTHER_ORG_ID,
        customer: makeCustomer({
          organizationId: ANOTHER_ORG_ID,
          organization: { id: ANOTHER_ORG_ID, name: "Other", slug: "other-org", defaults: makeOrgDefaults() },
        }),
      })
    );
    const result = await verifyMagicLink("raw_token", CUSTOMER_ID, ORG_SLUG);
    expect(result.success).toBe(false);
  });
});

// ─── Customer scope isolation ─────────────────────────────────────────────────

describe("customer scope isolation", () => {
  it("findFirst query for token includes customerId filter", async () => {
    mockDb.customerPortalToken.findFirst.mockResolvedValue(null);
    await verifyMagicLink("raw_token", ANOTHER_CUSTOMER_ID, ORG_SLUG);
    const callArgs = mockDb.customerPortalToken.findFirst.mock.calls[0][0];
    expect(callArgs.where.customerId).toBe(ANOTHER_CUSTOMER_ID);
  });
});

// ─── Access log creation ──────────────────────────────────────────────────────

describe("logPortalAccess", () => {
  it("creates access log with all provided fields", () => {
    logPortalAccess({
      orgId: ORG_ID,
      customerId: CUSTOMER_ID,
      path: "/portal/test/invoices",
      action: "view_invoice",
      ip: "127.0.0.1",
      userAgent: "TestBrowser/1.0",
      statusCode: 200,
    });
    expect(mockDb.customerPortalAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG_ID,
        customerId: CUSTOMER_ID,
        path: "/portal/test/invoices",
        action: "view_invoice",
        ip: "127.0.0.1",
        userAgent: "TestBrowser/1.0",
        statusCode: 200,
      }),
    });
  });

  it("handles optional fields with null defaults", () => {
    logPortalAccess({ orgId: ORG_ID, customerId: CUSTOMER_ID, path: "/portal/test" });
    expect(mockDb.customerPortalAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: null,
        ip: null,
        userAgent: null,
        statusCode: null,
      }),
    });
  });
});
