import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockDb,
  mockSendEmail,
  mockLogAudit,
  mockCookies,
  mockRedis,
  mockRateLimit,
} = vi.hoisted(() => {
  const cookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };
  return {
    mockDb: {
      customer: { findFirst: vi.fn(), findUnique: vi.fn() },
      organization: { findFirst: vi.fn(), findUnique: vi.fn() },
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
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      clientHubCustomerLifecycle: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
    },
    mockSendEmail: vi.fn(),
    mockLogAudit: vi.fn().mockResolvedValue(undefined),
    mockCookies: vi.fn().mockResolvedValue(cookieStore),
    mockRedis: {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
      ping: vi.fn(),
    },
    mockRateLimit: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/email", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));
vi.mock("@/lib/redis-client", () => ({ redis: mockRedis }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mockRateLimit }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import {
  requestMagicLink,
  verifyMagicLink,
  getPortalSession,
  requestPortalOtp,
  verifyPortalOtp,
  checkPortalResendCooldown,
} from "../portal-auth";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function makeCustomer(overrides = {}) {
  return {
    id: "cust-1",
    name: "John Doe",
    email: "john@example.com",
    organizationId: "org-1",
    lifecycleStage: "ACTIVE",
    organization: {
      id: "org-1",
      name: "Test Org",
      slug: "test-org",
      defaults: {
        portalEnabled: true,
        portalSupportEmail: "support@test.com",
        portalSessionExpiryHours: 24,
      },
    },
    clientHubLifecycle: { enabled: true },
    ...overrides,
  };
}

describe("Sprint 5.4 Hardening Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PORTAL_JWT_SECRET = "test-portal-jwt-secret-that-is-long-enough-sprint54";
    mockSendEmail.mockResolvedValue(undefined);
    mockLogAudit.mockResolvedValue(undefined);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue(undefined);
    mockRateLimit.mockResolvedValue({ success: true, remaining: 999 });
    mockDb.portalRateLimit.findUnique.mockResolvedValue(null);
    mockDb.portalRateLimit.upsert.mockResolvedValue({ count: 1, windowEnd: new Date(Date.now() + 60000) });
    mockDb.portalRateLimit.update.mockResolvedValue({});
    mockDb.portalRateLimit.deleteMany.mockResolvedValue({ count: 0 });
    mockDb.customerPortalToken.updateMany.mockResolvedValue({ count: 0 });
    mockDb.customerPortalToken.create.mockResolvedValue({ id: "tok-1" });
    mockDb.customerPortalAccessLog.create.mockResolvedValue({});
  });

  // ─── 1. Cooldown & Resend Throttling ──────────────────────────────────────────

  describe("Resend invite & resend OTP cooldown throttling", () => {
    it("allows request when no active cooldown exists", async () => {
      // By default mockRateLimit resolves to success: true, and DB upsert resolves to count: 1
      const result = await checkPortalResendCooldown("john@example.com", "org-1", "otp");
      expect(result.allowed).toBe(true);
      expect(result.remainingSeconds).toBe(0);
    });

    it("blocks request when cooldown exists in Redis", async () => {
      process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";

      mockRateLimit.mockResolvedValue({
        success: false,
        remaining: 0,
        reset: Date.now() + 45 * 1000,
      });

      const result = await checkPortalResendCooldown("john@example.com", "org-1", "otp");
      expect(result.allowed).toBe(false);
      expect(result.remainingSeconds).toBeGreaterThan(0);
      expect(result.remainingSeconds).toBeLessThanOrEqual(45);
    });

    it("blocks request when cooldown exists in DB (fallback)", async () => {
      // Disable Upstash Redis config so it falls through to DB path
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const futureTime = new Date(Date.now() + 30 * 1000);
      mockDb.portalRateLimit.upsert.mockResolvedValue({
        key: "cooldown:otp:org-1:" + sha256("john@example.com"),
        count: 2, // count > 1 represents subsequent request in active cooldown window
        windowEnd: futureTime,
      });

      const result = await checkPortalResendCooldown("john@example.com", "org-1", "otp");
      expect(result.allowed).toBe(false);
      expect(result.remainingSeconds).toBeGreaterThan(0);
      expect(result.remainingSeconds).toBeLessThanOrEqual(30);
    });
  });

  // ─── 2. Access Logs ──────────────────────────────────────────────────────────

  describe("Access Logs truthfulness", () => {
    it("writes access logs when magic link is requested", async () => {
      const customer = makeCustomer();
      mockDb.customer.findFirst.mockResolvedValue(customer);

      await requestMagicLink("john@example.com", "test-org");

      expect(mockDb.customerPortalAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: "org-1",
            customerId: "cust-1",
            path: "/portal/test-org/auth/login",
            action: "magic_link_requested",
          }),
        })
      );
    });

    it("writes access logs when OTP is requested", async () => {
      const customer = makeCustomer();
      mockDb.customer.findFirst.mockResolvedValue(customer);

      await requestPortalOtp("john@example.com", "test-org");

      expect(mockDb.customerPortalAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: "org-1",
            customerId: "cust-1",
            path: "/portal/test-org/auth/login",
            action: "otp_requested",
          }),
        })
      );
    });

    it("writes access logs on successful OTP verify", async () => {
      const customer = makeCustomer();
      mockDb.customer.findFirst.mockResolvedValue(customer);
      mockDb.customerPortalToken.findFirst.mockResolvedValue({
        id: "tok-1",
        tokenHash: sha256("123456"),
        customerId: "cust-1",
        isRevoked: false,
        expiresAt: new Date(Date.now() + 100000),
      });
      mockDb.customerPortalSession.create.mockResolvedValue({ id: "sess-1" });

      const cookieStore = await mockCookies();

      await verifyPortalOtp("john@example.com", "123456", "test-org", { ip: "1.1.1.1", userAgent: "test-agent" });

      expect(mockDb.customerPortalAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: "org-1",
            customerId: "cust-1",
            path: "/portal/test-org/auth/login",
            action: "otp_verified",
            ip: "1.1.1.1",
            userAgent: "test-agent",
            statusCode: 200,
          }),
        })
      );
      expect(mockDb.customerPortalAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: "org-1",
            customerId: "cust-1",
            path: "/portal/test-org",
            action: "session_created",
            statusCode: 200,
          }),
        })
      );
    });
  });

  // ─── 3. Disabled & Churned Access Gating (Fail Closed) ──────────────────────────

  describe("Disabled/Revoked/Churned handling fails closed", () => {
    it("verifyPortalOtp fails closed when customer is churned", async () => {
      const customer = makeCustomer({ lifecycleStage: "CHURNED" });
      mockDb.customer.findFirst.mockResolvedValue(customer);

      const result = await verifyPortalOtp("john@example.com", "123456", "test-org");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("invalid_or_expired_code");
      }
    });

    it("verifyPortalOtp fails closed when client hub lifecycle is disabled", async () => {
      const customer = makeCustomer({ clientHubLifecycle: { enabled: false } });
      mockDb.customer.findFirst.mockResolvedValue(customer);

      const result = await verifyPortalOtp("john@example.com", "123456", "test-org");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("invalid_or_expired_code");
      }
    });

    it("verifyPortalOtp fails closed when portal is disabled globally", async () => {
      const customer = makeCustomer();
      customer.organization.defaults.portalEnabled = false;
      mockDb.customer.findFirst.mockResolvedValue(customer);

      const result = await verifyPortalOtp("john@example.com", "123456", "test-org");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("invalid_or_expired_code");
      }
    });

    it("getPortalSession fails closed when customer lifecycle is disabled", async () => {
      const now = Math.floor(Date.now() / 1000);
      const jwt = makeJwt({
        jti: "test-jti",
        customerId: "cust-1",
        orgId: "org-1",
        orgSlug: "test-org",
        iat: now,
        exp: now + 86400,
      });

      const cookieStore = await mockCookies();
      cookieStore.get.mockReturnValue({ value: jwt });

      mockDb.customerPortalSession.findUnique.mockResolvedValue({
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
        customer: {
          id: "cust-1",
          lifecycleStage: "ACTIVE",
          organization: { defaults: { portalEnabled: true } },
          clientHubLifecycle: { enabled: false }, // disabled client hub
        },
      });

      const session = await getPortalSession("test-org");
      expect(session).toBeNull();
    });

    it("getPortalSession fails closed when customer is churned", async () => {
      const now = Math.floor(Date.now() / 1000);
      const jwt = makeJwt({
        jti: "test-jti",
        customerId: "cust-1",
        orgId: "org-1",
        orgSlug: "test-org",
        iat: now,
        exp: now + 86400,
      });

      const cookieStore = await mockCookies();
      cookieStore.get.mockReturnValue({ value: jwt });

      mockDb.customerPortalSession.findUnique.mockResolvedValue({
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
        customer: {
          id: "cust-1",
          lifecycleStage: "CHURNED", // churned customer
          organization: { defaults: { portalEnabled: true } },
          clientHubLifecycle: { enabled: true },
        },
      });

      const session = await getPortalSession("test-org");
      expect(session).toBeNull();
    });

    it("getPortalSession fails closed when portal is disabled globally", async () => {
      const now = Math.floor(Date.now() / 1000);
      const jwt = makeJwt({
        jti: "test-jti",
        customerId: "cust-1",
        orgId: "org-1",
        orgSlug: "test-org",
        iat: now,
        exp: now + 86400,
      });

      const cookieStore = await mockCookies();
      cookieStore.get.mockReturnValue({ value: jwt });

      mockDb.customerPortalSession.findUnique.mockResolvedValue({
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
        customer: {
          id: "cust-1",
          lifecycleStage: "ACTIVE",
          organization: { defaults: { portalEnabled: false } }, // disabled portal
          clientHubLifecycle: { enabled: true },
        },
      });

      const session = await getPortalSession("test-org");
      expect(session).toBeNull();
    });
  });

  // ─── 4. Org Isolation & Anti-Enumeration ──────────────────────────────────────────

  describe("Org Isolation & Anti-Enumeration", () => {
    it("requestPortalOtp preserves anti-enumeration on wrong slug", async () => {
      mockDb.customer.findFirst.mockResolvedValue(null);

      const result = await requestPortalOtp("unknown@example.com", "wrong-org");
      expect(result.success).toBe(true);
      expect(result.message).toContain("If an account exists");
    });

    it("getPortalSession enforces org slug validation", async () => {
      const now = Math.floor(Date.now() / 1000);
      const jwt = makeJwt({
        jti: "test-jti",
        customerId: "cust-1",
        orgId: "org-1",
        orgSlug: "test-org",
        iat: now,
        exp: now + 86400,
      });

      const cookieStore = await mockCookies();
      cookieStore.get.mockReturnValue({ value: jwt });

      // Requesting with wrong slug
      const session = await getPortalSession("another-org");
      expect(session).toBeNull();
    });

    it("verifyPortalOtp returns rate_limit_exceeded for nonexistent customer when rate-limited", async () => {
      mockDb.customer.findFirst.mockResolvedValue(null);
      mockDb.organization.findFirst.mockResolvedValue({
        id: "org-1",
        defaults: { portalEnabled: true }
      });
      // Simulate rate limit hit
      process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";
      mockRateLimit.mockResolvedValue({ success: false });

      const result = await verifyPortalOtp("unknown@example.com", "123456", "test-org");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("rate_limit_exceeded");
      }

      // Cleanup env
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });

    it("verifyPortalOtp returns invalid_or_expired_code for nonexistent customer when NOT rate-limited", async () => {
      mockDb.customer.findFirst.mockResolvedValue(null);
      mockDb.organization.findFirst.mockResolvedValue({
        id: "org-1",
        defaults: { portalEnabled: true }
      });
      // Simulate rate limit OK
      process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";
      mockRateLimit.mockResolvedValue({ success: true });

      const result = await verifyPortalOtp("unknown@example.com", "123456", "test-org");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("invalid_or_expired_code");
      }

      // Cleanup env
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });

    it("verifyPortalOtp preserves logging/auditing access-log truthfulness on rate limits for real customer", async () => {
      const customer = makeCustomer();
      mockDb.customer.findFirst.mockResolvedValue(customer);
      // Simulate rate limit hit
      process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";
      mockRateLimit.mockResolvedValue({ success: false });

      const result = await verifyPortalOtp("john@example.com", "123456", "test-org", { ip: "2.2.2.2", userAgent: "bad-agent" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("rate_limit_exceeded");
      }

      expect(mockDb.customerPortalAccessLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: "org-1",
            customerId: "cust-1",
            path: "/portal/test-org/auth/login",
            action: "otp_verify_failed",
            ip: "2.2.2.2",
            userAgent: "bad-agent",
            statusCode: 429,
          }),
        })
      );

      // Cleanup env
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });

    it("verifyPortalOtp does NOT write access log for nonexistent customer on rate limit", async () => {
      mockDb.customer.findFirst.mockResolvedValue(null);
      mockDb.organization.findFirst.mockResolvedValue({
        id: "org-1",
        defaults: { portalEnabled: true }
      });
      // Simulate rate limit hit
      process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";
      mockRateLimit.mockResolvedValue({ success: false });

      const result = await verifyPortalOtp("unknown@example.com", "123456", "test-org");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("rate_limit_exceeded");
      }

      expect(mockDb.customerPortalAccessLog.create).not.toHaveBeenCalled();

      // Cleanup env
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });
  });
});

function makeJwt(payload: Record<string, unknown>, secret = "test-portal-jwt-secret-that-is-long-enough-sprint54"): string {
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
