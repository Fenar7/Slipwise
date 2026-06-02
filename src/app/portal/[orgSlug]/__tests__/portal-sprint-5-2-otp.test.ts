/**
 * Sprint 5.2 — Public Client Hub OTP Authentication Lifecycle Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  customer: {
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

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockReturnValue(Promise.resolve()) }));
vi.mock("@/lib/redis-client", () => ({ redis: mockRedis }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import {
  requestPortalOtp,
  verifyPortalOtp,
  getPortalSession,
  revokePortalSession,
} from "@/lib/portal-auth";
import { cookies } from "next/headers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ORG_ID = "org_test_otp_001";
const CUSTOMER_ID = "cust_test_otp_001";
const ORG_SLUG = "test-org";
const ANOTHER_ORG_SLUG = "another-org";

function makeOrgDefaults(overrides?: Partial<Record<string, unknown>>) {
  return {
    portalEnabled: true,
    portalSupportEmail: "support@test.com",
    portalSessionExpiryHours: 24,
    ...overrides,
  };
}

function makeCustomer(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: CUSTOMER_ID,
    name: "Test OTP Customer",
    email: "otp@example.com",
    organizationId: ORG_ID,
    lifecycleStage: "ACTIVE",
    organization: {
      id: ORG_ID,
      name: "Test OTP Org",
      slug: ORG_SLUG,
      defaults: makeOrgDefaults(),
    },
    clientHubLifecycle: { enabled: true },
    ...overrides,
  };
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
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
  process.env.PORTAL_JWT_SECRET = "test-portal-jwt-secret-that-is-long-enough-sprint52";
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue(undefined);
  mockDb.portalRateLimit.findUnique.mockResolvedValue(null);
  mockDb.portalRateLimit.upsert.mockResolvedValue({ key: "ml:test", count: 1, windowEnd: new Date() });
  mockDb.portalRateLimit.update.mockResolvedValue({ count: 2 });
  mockDb.customerPortalToken.updateMany.mockResolvedValue({ count: 0 });
  mockDb.customerPortalToken.create.mockResolvedValue({ id: "tok_new" });
  mockDb.customerPortalSession.create.mockResolvedValue({ id: "sess_001" });
  mockDb.customerPortalSession.update.mockResolvedValue({});
  mockDb.customerPortalSession.updateMany.mockResolvedValue({ count: 1 });
});

// ─── OTP Request Suite ───────────────────────────────────────────────────────

describe("requestPortalOtp", () => {
  it("returns generic success response even if customer is unknown (safe anti-enumeration)", async () => {
    mockDb.customer.findFirst.mockResolvedValue(null);
    const result = await requestPortalOtp("missing@unknown.com", ORG_SLUG);
    expect(result.success).toBe(true);
    expect(result.message).toContain("If an account exists");
    expect(mockDb.customerPortalToken.create).not.toHaveBeenCalled();
  });

  it("returns generic success response if customer is CHURNED (safe anti-enumeration)", async () => {
    mockDb.customer.findFirst.mockResolvedValue(makeCustomer({ lifecycleStage: "CHURNED" }));
    const result = await requestPortalOtp("otp@example.com", ORG_SLUG);
    expect(result.success).toBe(true);
    expect(mockDb.customerPortalToken.create).not.toHaveBeenCalled();
  });

  it("returns generic success response if portal is globally disabled (safe anti-enumeration)", async () => {
    const disabledCust = makeCustomer();
    disabledCust.organization.defaults.portalEnabled = false;
    mockDb.customer.findFirst.mockResolvedValue(disabledCust);

    const result = await requestPortalOtp("otp@example.com", ORG_SLUG);
    expect(result.success).toBe(true);
    expect(mockDb.customerPortalToken.create).not.toHaveBeenCalled();
  });

  it("returns generic success response if client is explicitly disabled in ClientHubCustomerLifecycle", async () => {
    const disabledCust = makeCustomer({
      clientHubLifecycle: { enabled: false }
    });
    mockDb.customer.findFirst.mockResolvedValue(disabledCust);

    const result = await requestPortalOtp("otp@example.com", ORG_SLUG);
    expect(result.success).toBe(true);
    expect(mockDb.customerPortalToken.create).not.toHaveBeenCalled();
  });

  it("generates a 6-digit numeric OTP, hashes it, and sends it via email on success", async () => {
    mockDb.customer.findFirst.mockResolvedValue(makeCustomer());
    const { sendEmail } = await import("@/lib/email");

    const result = await requestPortalOtp("otp@example.com", ORG_SLUG);

    expect(result.success).toBe(true);
    expect(mockDb.customerPortalToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: CUSTOMER_ID,
          orgId: ORG_ID,
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      })
    );
    expect(sendEmail).toHaveBeenCalledOnce();
    const emailCall = vi.mocked(sendEmail).mock.calls[0][0];
    expect(emailCall.to).toBe("otp@example.com");
    expect(emailCall.html).toContain("Your verification code");
  });

  it("revokes all prior codes for customer + org (newest-code-wins invalidation rule)", async () => {
    mockDb.customer.findFirst.mockResolvedValue(makeCustomer());
    await requestPortalOtp("otp@example.com", ORG_SLUG);

    expect(mockDb.customerPortalToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: CUSTOMER_ID, orgId: ORG_ID, isRevoked: false },
        data: { isRevoked: true },
      })
    );
  });
});

// ─── OTP Verification Suite ──────────────────────────────────────────────────

describe("verifyPortalOtp", () => {
  it("rejects unknown customer email", async () => {
    mockDb.customer.findFirst.mockResolvedValue(null);
    const result = await verifyPortalOtp("unknown@example.com", "123456", ORG_SLUG);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("invalid_or_expired_code");
  });

  it("rejects invalid code format", async () => {
    mockDb.customer.findFirst.mockResolvedValue(makeCustomer());
    const result = await verifyPortalOtp("otp@example.com", "wrong", ORG_SLUG);
    expect(result.success).toBe(false);
  });

  it("rejects churned customer", async () => {
    mockDb.customer.findFirst.mockResolvedValue(makeCustomer({ lifecycleStage: "CHURNED" }));
    const result = await verifyPortalOtp("otp@example.com", "123456", ORG_SLUG);
    expect(result.success).toBe(false);
  });

  it("rejects wrong code", async () => {
    mockDb.customer.findFirst.mockResolvedValue(makeCustomer());
    mockDb.customerPortalToken.findFirst.mockResolvedValue(null);

    const result = await verifyPortalOtp("otp@example.com", "999999", ORG_SLUG);
    expect(result.success).toBe(false);
  });

  it("verifies valid code successfully, consumes it (single-use), and establishes a session cookie", async () => {
    const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);

    const otp = "123456";
    const hashed = sha256(otp);

    mockDb.customer.findFirst.mockResolvedValue(makeCustomer());
    mockDb.customerPortalToken.findFirst.mockResolvedValue({
      id: "tok_002",
      tokenHash: hashed,
      customerId: CUSTOMER_ID,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 100000),
    });
    mockDb.customerPortalToken.update.mockResolvedValue({});

    const result = await verifyPortalOtp("otp@example.com", otp, ORG_SLUG);

    expect(result.success).toBe(true);
    // Consumes token
    expect(mockDb.customerPortalToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tok_002" },
        data: expect.objectContaining({ isRevoked: true }),
      })
    );
    // Creates session record
    expect(mockDb.customerPortalSession.create).toHaveBeenCalledOnce();
    // Sets HTTP-Only cookie
    expect(cookieStore.set).toHaveBeenCalledWith(
      "portal_session",
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: "lax" })
    );
  });

  it("fails verification if rate limits are exceeded", async () => {
    mockDb.customer.findFirst.mockResolvedValue(makeCustomer());
    // Simulate 5 prior verification attempts
    mockRedis.get.mockResolvedValue("5");

    const result = await verifyPortalOtp("otp@example.com", "123456", ORG_SLUG);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("rate_limit_exceeded");
  });
});

// ─── Session Security and Isolation Suite ─────────────────────────────────────

describe("session verification & guards", () => {
  it("enforces org isolation: rejects active session when orgSlug changes (cross-org protection)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sessionPayload = {
      jti: "jti_active_001",
      customerId: CUSTOMER_ID,
      orgId: ORG_ID,
      orgSlug: ORG_SLUG,
      iat: now - 100,
      exp: now + 86400,
    };
    const jwt = makeJwt(sessionPayload, process.env.PORTAL_JWT_SECRET!);
    const cookieStore = { get: vi.fn().mockReturnValue({ value: jwt }), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);

    mockDb.customerPortalSession.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    });

    // Check with correct orgSlug
    const activeSession = await getPortalSession(ORG_SLUG);
    expect(activeSession).not.toBeNull();
    expect(activeSession?.orgSlug).toBe(ORG_SLUG);

    // Check with WRONG orgSlug (e.g. cross-org change)
    const crossOrgSession = await getPortalSession(ANOTHER_ORG_SLUG);
    expect(crossOrgSession).toBeNull();
  });

  it("rejects session if DB session record is revoked (server-authoritative revocation check)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sessionPayload = {
      jti: "jti_revoked_001",
      customerId: CUSTOMER_ID,
      orgId: ORG_ID,
      orgSlug: ORG_SLUG,
      iat: now - 100,
      exp: now + 86400,
    };
    const jwt = makeJwt(sessionPayload, process.env.PORTAL_JWT_SECRET!);
    const cookieStore = { get: vi.fn().mockReturnValue({ value: jwt }), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);

    // Database returns revoked session
    mockDb.customerPortalSession.findUnique.mockResolvedValue({
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });

    const session = await getPortalSession(ORG_SLUG);
    expect(session).toBeNull();
  });

  it("rejects session if DB session record is expired server-side", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sessionPayload = {
      jti: "jti_expired_001",
      customerId: CUSTOMER_ID,
      orgId: ORG_ID,
      orgSlug: ORG_SLUG,
      iat: now - 100,
      exp: now + 86400,
    };
    const jwt = makeJwt(sessionPayload, process.env.PORTAL_JWT_SECRET!);
    const cookieStore = { get: vi.fn().mockReturnValue({ value: jwt }), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);

    // Database returns expired session (expired 1 minute ago)
    mockDb.customerPortalSession.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() - 60000),
    });

    const session = await getPortalSession(ORG_SLUG);
    expect(session).toBeNull();
  });
});

// ─── Logout & Revocation Suite ───────────────────────────────────────────────

describe("logout server-side revocation", () => {
  it("revokePortalSession invalidates session in DB and deletes cookie", async () => {
    const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);

    await revokePortalSession(CUSTOMER_ID, ORG_ID);

    // Must revoke customerPortalSession and customerPortalToken in DB
    expect(mockDb.customerPortalSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: CUSTOMER_ID, orgId: ORG_ID, revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      })
    );
    expect(mockDb.customerPortalToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: CUSTOMER_ID, orgId: ORG_ID, isRevoked: false },
        data: { isRevoked: true },
      })
    );
    // Deletes the browser cookie
    expect(cookieStore.delete).toHaveBeenCalledWith("portal_session");
  });
});

// ─── Secret Leakage & Logout Routing Tests ────────────────────────────────────

import { GET as logoutGetHandler } from "../auth/logout/route";
import { NextRequest, NextResponse } from "next/server";

describe("Sprint 5.2 - Blocker Remediations", () => {
  it("requestPortalOtp path does not leak the plaintext OTP in server logs", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockDb.customer.findFirst.mockResolvedValue(makeCustomer());

    await requestPortalOtp("otp@example.com", ORG_SLUG);

    let leaked = false;
    for (const call of logSpy.mock.calls) {
      const msg = call.join(" ");
      if (msg.includes("[ClientHubPortal]")) {
        // If there's any 6-digit numeric OTP in the message, fail
        if (/\b\d{6}\b/.test(msg)) {
          leaked = true;
        }
      }
    }
    expect(leaked).toBe(false);
    logSpy.mockRestore();
  });

  it("logout route deterministically redirects to client-hub login when origin is client-hub", async () => {
    const request = new NextRequest(`http://localhost/portal/${ORG_SLUG}/auth/logout?origin=client-hub`);
    const params = Promise.resolve({ orgSlug: ORG_SLUG });

    const response = await logoutGetHandler(request, { params });
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(307); // NextResponse.redirect uses 307 Temporary Redirect by default
    expect(response.headers.get("location")).toBe(`http://localhost/portal/${ORG_SLUG}/client-hub/login`);
  });

  it("logout route redirects to generic portal login when origin is omitted", async () => {
    const request = new NextRequest(`http://localhost/portal/${ORG_SLUG}/auth/logout`);
    const params = Promise.resolve({ orgSlug: ORG_SLUG });

    const response = await logoutGetHandler(request, { params });
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`http://localhost/portal/${ORG_SLUG}/auth/login`);
  });

  it("OTP generation uses a cryptographically secure randomInt path", async () => {
    const randomIntSpy = vi.spyOn(crypto, "randomInt").mockReturnValue(123456);
    mockDb.customer.findFirst.mockResolvedValue(makeCustomer());

    await requestPortalOtp("otp@example.com", ORG_SLUG);

    expect(randomIntSpy).toHaveBeenCalledWith(100000, 1000000);
    randomIntSpy.mockRestore();
  });

  it("logout revokes only the current session and does not touch other sessions", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sessionPayload = {
      jti: "current_session_jti_123",
      customerId: CUSTOMER_ID,
      orgId: ORG_ID,
      orgSlug: ORG_SLUG,
      iat: now - 100,
      exp: now + 86400,
    };
    const jwt = makeJwt(sessionPayload, process.env.PORTAL_JWT_SECRET!);
    const cookieStore = { get: vi.fn().mockReturnValue({ value: jwt }), set: vi.fn(), delete: vi.fn() };
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue(cookieStore);

    mockDb.customerPortalSession.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const request = new NextRequest(`http://localhost/portal/${ORG_SLUG}/auth/logout`);
    const params = Promise.resolve({ orgSlug: ORG_SLUG });

    await logoutGetHandler(request, { params });

    expect(mockDb.customerPortalSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jti: "current_session_jti_123" },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      })
    );

    expect(mockDb.customerPortalSession.updateMany).not.toHaveBeenCalled();
  });
});
