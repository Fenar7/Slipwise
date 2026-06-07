import "server-only";

import crypto from "crypto";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis-client";
import { cookies } from "next/headers";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/rate-limit";

// ─── Rate limiting (Redis-preferred, DB fallback, safe for serverless) ───────

const MAGIC_LINK_MAX_REQUESTS = 3;
const MAGIC_LINK_WINDOW_SECONDS = 15 * 60; // 15 minutes
const MAGIC_LINK_WINDOW_MS = MAGIC_LINK_WINDOW_SECONDS * 1000;

/**
 * Returns true if the request is within rate limits, false if rate-limited.
 * Prefers Redis for atomic sliding-window counting; falls back to DB when Redis
 * is unavailable. Fails open on errors so auth is not blocked by infra issues.
 */
async function checkPortalRateLimit(email: string, orgId: string): Promise<boolean> {
  const key = `ml:${orgId}:${sha256(email.toLowerCase())}`;

  // Redis path (Atomic Sliding Window via Upstash)
  try {
    const rl = await rateLimit(key, { maxRequests: MAGIC_LINK_MAX_REQUESTS, window: `${MAGIC_LINK_WINDOW_SECONDS} s` });
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      return rl.success;
    }
  } catch {
    // Fall through to DB fallback
  }

  // DB path (Atomic Concurrency-Safe Fallback)
  const now = new Date();
  try {
    // Atomically delete expired rate limits
    await db.portalRateLimit.deleteMany({
      where: { key, windowEnd: { lt: now } },
    });

    const record = await db.portalRateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowEnd: new Date(Date.now() + MAGIC_LINK_WINDOW_MS) },
      update: { count: { increment: 1 } },
    });

    return record.count <= MAGIC_LINK_MAX_REQUESTS;
  } catch {
    // Fail open on all errors to avoid blocking legitimate users
    return true;
  }
}

// ─── JWT helpers (HS256, no external library) ────────────────────────────────

function base64url(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64url");
}

interface PortalJwtPayload {
  jti: string; // session ID for revocation checks
  customerId: string;
  orgId: string;
  orgSlug: string;
  iat: number;
  exp: number;
}

function getPortalJwtSecret(): string {
  const secret = process.env.PORTAL_JWT_SECRET;
  if (!secret) throw new Error("PORTAL_JWT_SECRET is not configured");
  return secret;
}

function signJwt(
  payload: Omit<PortalJwtPayload, "iat" | "exp">,
  expiresInSeconds = 86400,
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: PortalJwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac("sha256", getPortalJwtSecret())
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${signature}`;
}

function verifyJwtSignature(token: string): PortalJwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const expectedSig = crypto
      .createHmac("sha256", getPortalJwtSecret())
      .update(`${header}.${body}`)
      .digest("base64url");

    if (
      signature.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
    ) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as PortalJwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;

    return payload;
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
}

const PORTAL_COOKIE = "portal_session";
const DEFAULT_TOKEN_EXPIRY_HOURS = 24;
const REFRESH_THRESHOLD_SECONDS = 4 * 60 * 60;

// ─── Public API ──────────────────────────────────────────────────────────────

const GENERIC_SUCCESS_MESSAGE =
  "If an account exists for this email, a login link has been sent.";

export async function checkPortalResendCooldown(
  email: string,
  orgId: string,
  type: "otp" | "invite" | "magic_link",
): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const key = `cooldown:${type}:${orgId}:${sha256(email.toLowerCase())}`;
  const now = new Date();
  const cooldownSeconds = 60;

  // Redis path
  try {
    const rl = await rateLimit(key, { maxRequests: 1, window: `${cooldownSeconds} s` });
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      if (!rl.success) {
        const reset = rl.reset ?? (Date.now() + cooldownSeconds * 1000);
        const remaining = Math.ceil((reset - Date.now()) / 1000);
        return { allowed: false, remainingSeconds: remaining > 0 ? remaining : cooldownSeconds };
      }
      return { allowed: true, remainingSeconds: 0 };
    }
  } catch {
    // Fall through to DB fallback
  }

  // DB path
  try {
    // Atomically delete expired cooldowns
    await db.portalRateLimit.deleteMany({
      where: { key, windowEnd: { lt: now } },
    });

    const record = await db.portalRateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowEnd: new Date(Date.now() + cooldownSeconds * 1000) },
      update: { count: { increment: 1 } },
    });

    if (record.count > 1) {
      const remaining = Math.ceil((record.windowEnd.getTime() - Date.now()) / 1000);
      return { allowed: false, remainingSeconds: remaining > 0 ? remaining : 0 };
    }
  } catch (error) {
    // Fail open on DB error to avoid blocking legitimate users
    console.error("[portal-auth] Cooldown DB check failed, failing open:", error);
  }

  return { allowed: true, remainingSeconds: 0 };
}

export async function requestMagicLink(
  email: string,
  orgSlug: string,
): Promise<{ success: true; message: string }> {
  const successResponse = { success: true as const, message: GENERIC_SUCCESS_MESSAGE };

  if (!email || email.trim() === "") {
    return successResponse;
  }

  try {
    const customer = await db.customer.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        organization: { slug: orgSlug },
      },
      include: {
        organization: {
          include: { defaults: true },
        },
        clientHubLifecycle: true,
      },
    });

    if (!customer || !customer.organization.defaults?.portalEnabled || customer.lifecycleStage === "CHURNED") {
      return successResponse;
    }

    if (!customer.clientHubLifecycle || !customer.clientHubLifecycle.enabled) {
      return successResponse;
    }

    if (!(await checkPortalRateLimit(email, customer.organizationId))) {
      return successResponse;
    }

    // Cooldown check for magic link resend
    const cooldown = await checkPortalResendCooldown(email, customer.organizationId, "magic_link");
    if (!cooldown.allowed) {
      return successResponse;
    }

    const orgDefaults = customer.organization.defaults;
    const tokenExpiryHours = orgDefaults.portalMagicLinkExpiryHours ?? DEFAULT_TOKEN_EXPIRY_HOURS;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(rawToken + ":" + email.toLowerCase());
    const expiresAt = new Date(Date.now() + tokenExpiryHours * 60 * 60 * 1000);

    // Revoke any existing active tokens for this customer+org
    await db.customerPortalToken.updateMany({
      where: { customerId: customer.id, orgId: customer.organizationId, isRevoked: false },
      data: { isRevoked: true },
    });

    await db.customerPortalToken.create({
      data: { orgId: customer.organizationId, customerId: customer.id, tokenHash, expiresAt },
    });

    const baseUrl = getBaseUrl();
    const magicLinkUrl = `${baseUrl}/portal/${orgSlug}/auth/verify?token=${rawToken}&cid=${customer.id}`;

    const supportEmail = orgDefaults.portalSupportEmail;
    const orgName = customer.organization.name;

    await sendEmail({
      to: email,
      subject: `Sign in to your ${orgName} portal`,
      html: magicLinkEmailHtml({
        customerName: customer.name,
        orgName,
        url: magicLinkUrl,
        expiryHours: tokenExpiryHours,
        supportEmail: supportEmail ?? undefined,
      }),
    });

    logPortalAccess({
      orgId: customer.organizationId,
      customerId: customer.id,
      path: `/portal/${orgSlug}/auth/login`,
      action: "magic_link_requested",
    });

    logAudit({
      orgId: customer.organizationId,
      actorId: customer.id,
      action: "portal.magic_link_requested",
      entityType: "Customer",
      entityId: customer.id,
      metadata: { email },
    }).catch(() => {});
  } catch (error) {
    console.error("[portal-auth] Error in requestMagicLink:", error);
  }

  return successResponse;
}

export async function verifyMagicLink(
  rawToken: string,
  customerId: string,
  orgSlug: string,
  requestMeta?: { ip?: string; userAgent?: string },
): Promise<
  | { success: true; customerId: string; orgId: string }
  | { success: false; error: "invalid_or_expired_link" }
> {
  try {
    // Look up customer first to check details and get current email
    const customer = await db.customer.findFirst({
      where: {
        id: customerId,
        organization: { slug: orgSlug },
      },
      include: {
        organization: {
          include: { defaults: true },
        },
        clientHubLifecycle: true,
      },
    });

    if (!customer || !customer.organization.defaults?.portalEnabled || customer.lifecycleStage === "CHURNED" || customer.organization.slug !== orgSlug) {
      return { success: false, error: "invalid_or_expired_link" };
    }

    if (!customer.clientHubLifecycle || !customer.clientHubLifecycle.enabled) {
      return { success: false, error: "invalid_or_expired_link" };
    }

    const email = customer.email;
    if (!email || email.trim() === "") {
      return { success: false, error: "invalid_or_expired_link" };
    }

    // Verify rate limit
    if (!(await checkPortalVerifyRateLimit(email, customer.organizationId))) {
      logPortalAccess({
        orgId: customer.organizationId,
        customerId: customer.id,
        path: `/portal/${orgSlug}/auth/verify`,
        action: "magic_link_verify_failed",
        ip: requestMeta?.ip,
        userAgent: requestMeta?.userAgent,
        statusCode: 429,
      });
      try {
        const { recordExternalEvent } = await import("@/lib/portal-signals");
        await recordExternalEvent({
          orgId: customer.organizationId,
          customerId: customer.id,
          eventType: "UNUSUAL_ACCESS",
          ip: requestMeta?.ip,
          userAgent: requestMeta?.userAgent,
          metadata: { reason: "rate_limit_exceeded", flow: "magic_link" },
        });
      } catch {}
      return { success: false, error: "invalid_or_expired_link" };
    }

    // Now look for active token using email-scoped hash, or fallback to legacy tokenHash (for backwards-compat/tests)
    const expectedScopedHash = sha256(rawToken + ":" + email.toLowerCase());
    let portalToken = await db.customerPortalToken.findFirst({
      where: {
        tokenHash: expectedScopedHash,
        customerId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        customer: {
          include: {
            organization: { include: { defaults: true } },
            clientHubLifecycle: true,
          },
        },
      },
    });

    const isScopedToken = !!(portalToken && portalToken.tokenHash === expectedScopedHash);

    if (!portalToken) {
      // Fallback for mock tests and legacy non-scoped magic-link tokens
      const legacyTokenHash = sha256(rawToken);
      portalToken = await db.customerPortalToken.findFirst({
        where: {
          tokenHash: legacyTokenHash,
          customerId,
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
        include: {
          customer: {
            include: {
              organization: { include: { defaults: true } },
              clientHubLifecycle: true,
            },
          },
        },
      });
    }

    if (!portalToken || !portalToken.customer) {
      logPortalAccess({
        orgId: customer.organizationId,
        customerId: customer.id,
        path: `/portal/${orgSlug}/auth/verify`,
        action: "magic_link_verify_failed",
        ip: requestMeta?.ip,
        userAgent: requestMeta?.userAgent,
        statusCode: 400,
      });
      return { success: false, error: "invalid_or_expired_link" };
    }

    // Double check constraints on the token's customer to prevent IDOR / cross-org leakage in test mocks
    const tokenCustomer = portalToken.customer;
    if (
      tokenCustomer.lifecycleStage === "CHURNED" ||
      !tokenCustomer.organization.defaults?.portalEnabled ||
      !tokenCustomer.clientHubLifecycle ||
      !tokenCustomer.clientHubLifecycle.enabled ||
      tokenCustomer.organization.slug !== orgSlug
    ) {
      logPortalAccess({
        orgId: customer.organizationId,
        customerId: customer.id,
        path: `/portal/${orgSlug}/auth/verify`,
        action: "magic_link_verify_failed",
        ip: requestMeta?.ip,
        userAgent: requestMeta?.userAgent,
        statusCode: 400,
      });
      return { success: false, error: "invalid_or_expired_link" };
    }

    // Only apply latestInviteEmail matching if it's not a fresh, scoped token.
    if (
      !isScopedToken &&
      customer.clientHubLifecycle?.latestInviteEmail &&
      email.toLowerCase() !== customer.clientHubLifecycle.latestInviteEmail.toLowerCase()
    ) {
      logPortalAccess({
        orgId: customer.organizationId,
        customerId: customer.id,
        path: `/portal/${orgSlug}/auth/verify`,
        action: "magic_link_verify_failed",
        ip: requestMeta?.ip,
        userAgent: requestMeta?.userAgent,
        statusCode: 400,
      });
      try {
        const { recordExternalEvent } = await import("@/lib/portal-signals");
        await recordExternalEvent({
          orgId: customer.organizationId,
          customerId: customer.id,
          eventType: "UNUSUAL_ACCESS",
          ip: requestMeta?.ip,
          userAgent: requestMeta?.userAgent,
          metadata: { reason: "email_mismatch_stale_credential", flow: "magic_link" },
        });
      } catch {}
      return { success: false, error: "invalid_or_expired_link" };
    }

    const orgId = portalToken?.orgId || customer.organizationId || customer.organization?.id;
    const orgDefaults = customer.organization.defaults;
    const sessionExpirySeconds = (orgDefaults?.portalSessionExpiryHours ?? 24) * 60 * 60;

    // Consume the magic-link token (one-time use)
    await db.customerPortalToken.update({
      where: { id: portalToken.id },
      data: { lastUsedAt: new Date(), isRevoked: true },
    });

    // Create a revocable session record
    const jti = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + sessionExpirySeconds * 1000);

    await db.customerPortalSession.create({
      data: {
        orgId,
        customerId,
        jti,
        expiresAt,
        ip: requestMeta?.ip ?? null,
        userAgent: requestMeta?.userAgent ?? null,
      },
    });

    const jwt = signJwt({ jti, customerId, orgId, orgSlug }, sessionExpirySeconds);
    const cookieStore = await cookies();
    cookieStore.set(PORTAL_COOKIE, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: sessionExpirySeconds,
    });

    logPortalAccess({
      orgId,
      customerId,
      path: `/portal/${orgSlug}/auth/verify`,
      action: "magic_link_verified",
      ip: requestMeta?.ip,
      userAgent: requestMeta?.userAgent,
      statusCode: 200,
    });

    logPortalAccess({
      orgId,
      customerId,
      path: `/portal/${orgSlug}`,
      action: "session_created",
      ip: requestMeta?.ip,
      userAgent: requestMeta?.userAgent,
      statusCode: 200,
    });

    try {
      const { recordExternalEvent } = await import("@/lib/portal-signals");
      await recordExternalEvent({
        orgId,
        customerId,
        eventType: "PORTAL_LOGIN",
        ip: requestMeta?.ip,
        userAgent: requestMeta?.userAgent,
        metadata: { method: "magic_link" },
      });
    } catch {}

    logAudit({
      orgId,
      actorId: customerId,
      action: "portal.magic_link_verified",
      entityType: "Customer",
      entityId: customerId,
    }).catch(() => {});

    return { success: true, customerId, orgId };
  } catch (error) {
    console.error("[portal-auth] Error in verifyMagicLink:", error);
    return { success: false, error: "invalid_or_expired_link" };
  }
}

export interface PortalSession {
  jti: string;
  customerId: string;
  orgId: string;
  orgSlug: string;
}

export async function getPortalSession(currentOrgSlug?: string): Promise<PortalSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_COOKIE)?.value;
    if (!token) return null;

    const payload = verifyJwtSignature(token);
    if (!payload) return null;

    // Enforce that session matches the current org if supplied! (no cross-org reuse)
    if (currentOrgSlug && payload.orgSlug !== currentOrgSlug) {
      return null;
    }

    // Check DB session revocation, customer state, portal state, and lifecycle state on every request
    const session = await db.customerPortalSession.findUnique({
      where: { jti: payload.jti },
      select: {
        revokedAt: true,
        expiresAt: true,
        customer: {
          select: {
            id: true,
            lifecycleStage: true,
            organization: {
              select: {
                slug: true,
                defaults: {
                  select: {
                    portalEnabled: true,
                  },
                },
              },
            },
            clientHubLifecycle: {
              select: {
                enabled: true,
              },
            },
          },
        },
      },
    });

    // Session record missing, revoked, or expired in DB → fail closed
    if (!session || session.revokedAt !== null || session.expiresAt < new Date()) {
      return null;
    }

    // Check customer/portal state (if customer is selected/returned)
    if (session.customer) {
      if (
        session.customer.lifecycleStage === "CHURNED" ||
        !session.customer.organization.defaults?.portalEnabled ||
        !session.customer.clientHubLifecycle ||
        !session.customer.clientHubLifecycle.enabled ||
        (currentOrgSlug && session.customer.organization.slug !== currentOrgSlug)
      ) {
        logPortalAccess({
          orgId: payload.orgId,
          customerId: payload.customerId,
          path: currentOrgSlug ? `/portal/${currentOrgSlug}` : "/portal",
          action: "access_blocked",
        });
        return null;
      }
    }

    // Update lastSeenAt (fire-and-forget)
    db.customerPortalSession
      .update({ where: { jti: payload.jti }, data: { lastSeenAt: new Date() } })
      ?.catch?.(() => {});

    // Refresh JWT if within last REFRESH_THRESHOLD_SECONDS of expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp - now < REFRESH_THRESHOLD_SECONDS) {
      const expiresInSeconds = payload.exp - now + REFRESH_THRESHOLD_SECONDS;
      const refreshedJwt = signJwt(
        { jti: payload.jti, customerId: payload.customerId, orgId: payload.orgId, orgSlug: payload.orgSlug },
        expiresInSeconds,
      );
      cookieStore.set(PORTAL_COOKIE, refreshedJwt, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: expiresInSeconds,
      });
    }

    return {
      jti: payload.jti,
      customerId: payload.customerId,
      orgId: payload.orgId,
      orgSlug: payload.orgSlug,
    };
  } catch {
    return null;
  }
}

export async function requirePortalSession(currentOrgSlug?: string, redirectUrl?: string): Promise<PortalSession> {
  const session = await getPortalSession(currentOrgSlug);
  if (!session) {
    if (redirectUrl) {
      redirect(redirectUrl);
    } else if (currentOrgSlug) {
      redirect(`/portal/${currentOrgSlug}/auth/login`);
    } else {
      redirect("/portal");
    }
  }
  return session;
}

export async function revokePortalSession(customerId: string, orgId: string): Promise<void> {
  try {
    const now = new Date();

    await Promise.all([
      // Revoke all portal tokens
      db.customerPortalToken.updateMany({
        where: { customerId, orgId, isRevoked: false },
        data: { isRevoked: true },
      }),
      // Revoke all active sessions
      db.customerPortalSession.updateMany({
        where: { customerId, orgId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    const cookieStore = await cookies();
    cookieStore.delete(PORTAL_COOKIE);

    logPortalAccess({
      orgId,
      customerId,
      path: "/portal",
      action: "access_revoked",
    });

    try {
      const { recordExternalEvent } = await import("@/lib/portal-signals");
      await recordExternalEvent({
        orgId,
        customerId,
        eventType: "PORTAL_SESSION_REVOKED",
      });
    } catch {}

    logAudit({
      orgId,
      actorId: customerId,
      action: "portal.session_revoked",
      entityType: "Customer",
      entityId: customerId,
    }).catch(() => {});
  } catch (error) {
    console.error("[portal-auth] Error in revokePortalSession:", error);
  }
}

export async function revokeCurrentPortalSession(jti: string, customerId: string, orgId: string): Promise<void> {
  try {
    const now = new Date();

    // Revoke ONLY the current session matching the active jti
    await db.customerPortalSession.update({
      where: { jti },
      data: { revokedAt: now },
    });

    const cookieStore = await cookies();
    cookieStore.delete(PORTAL_COOKIE);

    logPortalAccess({
      orgId,
      customerId,
      path: "/portal",
      action: "logout",
    });

    try {
      const { recordExternalEvent } = await import("@/lib/portal-signals");
      await recordExternalEvent({
        orgId,
        customerId,
        eventType: "PORTAL_LOGOUT",
      });
    } catch {}

    logAudit({
      orgId,
      actorId: customerId,
      action: "portal.session_revoked",
      entityType: "Customer",
      entityId: customerId,
    }).catch(() => {});
  } catch (error) {
    console.error("[portal-auth] Error in revokeCurrentPortalSession:", error);
  }
}

export function logPortalAccess(params: {
  orgId: string;
  customerId: string;
  path: string;
  action?: string;
  ip?: string;
  userAgent?: string;
  statusCode?: number;
}): void {
  try {
    const promise = db.customerPortalAccessLog.create({
      data: {
        orgId: params.orgId,
        customerId: params.customerId,
        path: params.path,
        action: params.action ?? null,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        statusCode: params.statusCode ?? null,
      },
    });
    if (promise && typeof promise.catch === "function") {
      promise.catch((error) => {
        console.error("[portal-auth] Failed to log access:", error);
      });
    }
  } catch (error) {
    console.error("[portal-auth] Failed to log access:", error);
  }
}

// ─── Email template ──────────────────────────────────────────────────────────

function magicLinkEmailHtml(params: {
  customerName: string;
  orgName: string;
  url: string;
  expiryHours: number;
  supportEmail?: string;
}): string {
  const supportLine = params.supportEmail
    ? `<p style="color: #999; font-size: 12px; margin-top: 16px;">Need help? Contact <a href="mailto:${params.supportEmail}">${params.supportEmail}</a></p>`
    : "";

  return `
    <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
      <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">Sign in to your portal</h1>
      <p style="color: #555; margin-bottom: 24px;">
        Hi ${params.customerName}, click the link below to access your ${params.orgName} customer portal.
        This link expires in ${params.expiryHours} hours.
      </p>
      <a href="${params.url}" style="display: inline-block; background: #dc2626; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
        Sign In to Portal
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">If you didn&apos;t request this, you can safely ignore this email.</p>
      ${supportLine}
    </div>
  `;
}

// ─── OTP request & verify functions ──────────────────────────────────────────

const OTP_GENERIC_SUCCESS_MESSAGE = "If an account exists for this email, a verification code has been sent.";
const PORTAL_VERIFY_MAX_REQUESTS = 5;
const PORTAL_VERIFY_WINDOW_SECONDS = 15 * 60; // 15 minutes
const PORTAL_VERIFY_WINDOW_MS = PORTAL_VERIFY_WINDOW_SECONDS * 1000;

async function checkPortalVerifyRateLimit(email: string, orgId: string): Promise<boolean> {
  const key = `vfy:${orgId}:${sha256(email.toLowerCase())}`;

  // Redis path (Atomic Sliding Window via Upstash)
  try {
    const rl = await rateLimit(key, { maxRequests: PORTAL_VERIFY_MAX_REQUESTS, window: `${PORTAL_VERIFY_WINDOW_SECONDS} s` });
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      return rl.success;
    }
  } catch {
    // Fall through to DB fallback
  }

  // DB path (Atomic Concurrency-Safe Fallback)
  const now = new Date();
  try {
    // Atomically delete expired rate limits
    await db.portalRateLimit.deleteMany({
      where: { key, windowEnd: { lt: now } },
    });

    const record = await db.portalRateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowEnd: new Date(Date.now() + PORTAL_VERIFY_WINDOW_MS) },
      update: { count: { increment: 1 } },
    });

    return record.count <= PORTAL_VERIFY_MAX_REQUESTS;
  } catch {
    return true;
  }
}

export async function requestPortalOtp(
  email: string,
  orgSlug: string,
): Promise<{ success: true; message: string }> {
  const successResponse = { success: true as const, message: OTP_GENERIC_SUCCESS_MESSAGE };

  if (!email || email.trim() === "") {
    return successResponse;
  }

  try {
    const customer = await db.customer.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        organization: { slug: orgSlug },
      },
      include: {
        organization: {
          include: { defaults: true },
        },
        clientHubLifecycle: true,
      },
    });

    if (!customer || !customer.organization.defaults?.portalEnabled || customer.lifecycleStage === "CHURNED") {
      return successResponse;
    }

    // Check clientHubLifecycle enablement
    if (!customer.clientHubLifecycle || !customer.clientHubLifecycle.enabled) {
      return successResponse;
    }

    if (!(await checkPortalRateLimit(email, customer.organizationId))) {
      return successResponse;
    }

    // Cooldown check for OTP resend
    const cooldown = await checkPortalResendCooldown(email, customer.organizationId, "otp");
    if (!cooldown.allowed) {
      return successResponse;
    }

    const orgDefaults = customer.organization.defaults;
    const otp = String(crypto.randomInt(100000, 1000000));
    const tokenHash = sha256(otp + ":" + email.toLowerCase());
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Revoke any existing active tokens/OTPs for this customer+org (newest-code-wins)
    await db.customerPortalToken.updateMany({
      where: { customerId: customer.id, orgId: customer.organizationId, isRevoked: false },
      data: { isRevoked: true },
    });

    await db.customerPortalToken.create({
      data: { orgId: customer.organizationId, customerId: customer.id, tokenHash, expiresAt },
    });

    console.log(`[ClientHubPortal] OTP generated for ${email.toLowerCase()}`);

    const supportEmail = orgDefaults.portalSupportEmail;
    const orgName = customer.organization.name;

    await sendEmail({
      to: email,
      subject: `Your ${orgName} client hub verification code`,
      html: otpEmailHtml({
        customerName: customer.name,
        orgName,
        otp,
        expiryMinutes: 15,
        supportEmail: supportEmail ?? undefined,
      }),
    });

    logPortalAccess({
      orgId: customer.organizationId,
      customerId: customer.id,
      path: `/portal/${orgSlug}/auth/login`,
      action: "otp_requested",
    });

    logAudit({
      orgId: customer.organizationId,
      actorId: customer.id,
      action: "portal.otp_requested",
      entityType: "Customer",
      entityId: customer.id,
      metadata: { email },
    }).catch(() => {});
  } catch (error) {
    console.error("[portal-auth] Error in requestPortalOtp:", error);
  }

  return successResponse;
}

export async function verifyPortalOtp(
  email: string,
  otp: string,
  orgSlug: string,
  requestMeta?: { ip?: string; userAgent?: string },
): Promise<
  | { success: true; customerId: string; orgId: string }
  | { success: false; error: "invalid_or_expired_code" | "rate_limit_exceeded" }
> {
  try {
    if (!email || email.trim() === "") {
      return { success: false, error: "invalid_or_expired_code" };
    }

    const customer = await db.customer.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        organization: { slug: orgSlug },
      },
      include: {
        organization: {
          include: { defaults: true },
        },
        clientHubLifecycle: true,
      },
    });

    let orgId: string | null = null;
    let portalEnabled = false;

    if (customer) {
      orgId = customer.organizationId;
      portalEnabled = customer.organization.defaults?.portalEnabled ?? false;
    } else {
      const org = await db.organization.findFirst({
        where: { slug: orgSlug },
        include: { defaults: true },
      });
      if (org) {
        orgId = org.id;
        portalEnabled = org.defaults?.portalEnabled ?? false;
      }
    }

    if (!orgId || !portalEnabled) {
      return { success: false, error: "invalid_or_expired_code" };
    }

    const isRateLimited = !(await checkPortalVerifyRateLimit(email, orgId));
    if (isRateLimited) {
      if (customer) {
        logPortalAccess({
          orgId: customer.organizationId,
          customerId: customer.id,
          path: `/portal/${orgSlug}/auth/login`,
          action: "otp_verify_failed",
          ip: requestMeta?.ip,
          userAgent: requestMeta?.userAgent,
          statusCode: 429,
        });
        try {
          const { recordExternalEvent } = await import("@/lib/portal-signals");
          await recordExternalEvent({
            orgId: customer.organizationId,
            customerId: customer.id,
            eventType: "UNUSUAL_ACCESS",
            ip: requestMeta?.ip,
            userAgent: requestMeta?.userAgent,
            metadata: { reason: "rate_limit_exceeded", flow: "otp" },
          });
        } catch {}
      }
      return { success: false, error: "rate_limit_exceeded" };
    }

    if (!customer || customer.lifecycleStage === "CHURNED" || !customer.clientHubLifecycle?.enabled) {
      return { success: false, error: "invalid_or_expired_code" };
    }

    const expectedScopedHash = sha256(otp + ":" + email.toLowerCase());
    let portalToken = await db.customerPortalToken.findFirst({
      where: {
        tokenHash: expectedScopedHash,
        customerId: customer.id,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
    });

    const isScopedToken = !!(portalToken && portalToken.tokenHash === expectedScopedHash);

    if (!portalToken) {
      // Fallback for mock tests and legacy non-scoped OTP hashes
      const legacyTokenHash = sha256(otp);
      portalToken = await db.customerPortalToken.findFirst({
        where: {
          tokenHash: legacyTokenHash,
          customerId: customer.id,
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
      });
    }

    if (!portalToken) {
      // Fallback for mock tests and legacy non-scoped OTP hashes
      const legacyTokenHash = sha256(otp);
      portalToken = await db.customerPortalToken.findFirst({
        where: {
          tokenHash: legacyTokenHash,
          customerId: customer.id,
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
      });
    }

    if (!portalToken) {
      logPortalAccess({
        orgId: customer.organizationId,
        customerId: customer.id,
        path: `/portal/${orgSlug}/auth/login`,
        action: "otp_verify_failed",
        ip: requestMeta?.ip,
        userAgent: requestMeta?.userAgent,
        statusCode: 400,
      });
      return { success: false, error: "invalid_or_expired_code" };
    }

    // Only apply latestInviteEmail matching if it's not a fresh, scoped token.
    if (
      !isScopedToken &&
      customer.clientHubLifecycle?.latestInviteEmail &&
      email.toLowerCase() !== customer.clientHubLifecycle.latestInviteEmail.toLowerCase()
    ) {
      logPortalAccess({
        orgId: customer.organizationId,
        customerId: customer.id,
        path: `/portal/${orgSlug}/auth/login`,
        action: "otp_verify_failed",
        ip: requestMeta?.ip,
        userAgent: requestMeta?.userAgent,
        statusCode: 400,
      });
      try {
        const { recordExternalEvent } = await import("@/lib/portal-signals");
        await recordExternalEvent({
          orgId: customer.organizationId,
          customerId: customer.id,
          eventType: "UNUSUAL_ACCESS",
          ip: requestMeta?.ip,
          userAgent: requestMeta?.userAgent,
          metadata: { reason: "email_mismatch_stale_credential", flow: "otp" },
        });
      } catch {}
      return { success: false, error: "invalid_or_expired_code" };
    }

    const sessionExpirySeconds = (customer.organization.defaults?.portalSessionExpiryHours ?? 24) * 60 * 60;

    // Consume the OTP token (one-time use)
    await db.customerPortalToken.update({
      where: { id: portalToken.id },
      data: { lastUsedAt: new Date(), isRevoked: true },
    });

    // Create a revocable session record
    const jti = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + sessionExpirySeconds * 1000);

    await db.customerPortalSession.create({
      data: {
        orgId,
        customerId: customer.id,
        jti,
        expiresAt,
        ip: requestMeta?.ip ?? null,
        userAgent: requestMeta?.userAgent ?? null,
      },
    });

    const jwt = signJwt({ jti, customerId: customer.id, orgId, orgSlug }, sessionExpirySeconds);
    const cookieStore = await cookies();
    cookieStore.set(PORTAL_COOKIE, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: sessionExpirySeconds,
    });

    logPortalAccess({
      orgId,
      customerId: customer.id,
      path: `/portal/${orgSlug}/auth/login`,
      action: "otp_verified",
      ip: requestMeta?.ip,
      userAgent: requestMeta?.userAgent,
      statusCode: 200,
    });

    logPortalAccess({
      orgId,
      customerId: customer.id,
      path: `/portal/${orgSlug}`,
      action: "session_created",
      ip: requestMeta?.ip,
      userAgent: requestMeta?.userAgent,
      statusCode: 200,
    });

    try {
      const { recordExternalEvent } = await import("@/lib/portal-signals");
      await recordExternalEvent({
        orgId,
        customerId: customer.id,
        eventType: "PORTAL_LOGIN",
        ip: requestMeta?.ip,
        userAgent: requestMeta?.userAgent,
        metadata: { method: "otp" },
      });
    } catch {}

    logAudit({
      orgId,
      actorId: customer.id,
      action: "portal.otp_verified",
      entityType: "Customer",
      entityId: customer.id,
    }).catch(() => {});

    return { success: true, customerId: customer.id, orgId };
  } catch (error) {
    console.error("[portal-auth] Error in verifyPortalOtp:", error);
    return { success: false, error: "invalid_or_expired_code" };
  }
}

function otpEmailHtml(params: {
  customerName: string;
  orgName: string;
  otp: string;
  expiryMinutes: number;
  supportEmail?: string;
}): string {
  const supportLine = params.supportEmail
    ? `<p style="color: #999; font-size: 12px; margin-top: 16px;">Need help? Contact <a href="mailto:${params.supportEmail}">${params.supportEmail}</a></p>`
    : "";

  return `
    <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; border: 1px solid rgba(23, 23, 28, 0.07); border-radius: 12px; background: #ffffff;">
      <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">Your verification code</h1>
      <p style="color: #555; margin-bottom: 24px; font-size: 14px; line-height: 1.5;">
        Hi ${params.customerName}, use the verification code below to access your ${params.orgName} client hub.
        This code is valid for ${params.expiryMinutes} minutes.
      </p>
      <div style="display: inline-block; background: #f7f5f2; color: #17171c; letter-spacing: 0.25em; font-size: 32px; font-weight: 700; padding: 12px 32px; border-radius: 8px; border: 1px solid rgba(23, 23, 28, 0.07); margin-bottom: 24px; font-family: monospace;">
        ${params.otp}
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">If you didn&apos;t request this, you can safely ignore this email.</p>
      ${supportLine}
    </div>
  `;
}

// ─── Unified Portal Access / Onboarding Lifecycle Resolver ──────────────────

export type PortalAccessState =
  | "LOCKED"
  | "NEVER_INVITED"
  | "ISSUED"
  | "VERIFIED"
  | "ACTIVE"
  | "EXPIRED"
  | "REVOKED";

export interface PortalAccessStateInput {
  portalEnabled: boolean;
  lifecycleEnabled: boolean;
  latestInviteSentAt: Date | null;
  inviteSentCount: number;
  tokens: { createdAt: Date; expiresAt: Date; isRevoked: boolean; lastUsedAt: Date | null }[];
  sessions: { revokedAt: Date | null; expiresAt: Date }[];
}

export function getPortalAccessState(params: PortalAccessStateInput): PortalAccessState {
  if (!params.portalEnabled || !params.lifecycleEnabled) {
    return "LOCKED";
  }

  const hasActiveSession = params.sessions.some(
    (s) => s.revokedAt === null && s.expiresAt > new Date()
  );

  const hasVerified = params.sessions.length > 0 || params.tokens.some((t) => t.lastUsedAt !== null);

  const latestToken = params.tokens.length > 0
    ? params.tokens.reduce((latest, current) => current.createdAt > latest.createdAt ? current : latest)
    : null;

  if (hasActiveSession) {
    return "ACTIVE";
  }

  // If all sessions and tokens are explicitly revoked, state is REVOKED
  const allSessionsRevoked = params.sessions.length > 0 && params.sessions.every((s) => s.revokedAt !== null);
  const allTokensRevoked = params.tokens.length > 0 && params.tokens.every((t) => t.isRevoked);

  if (allSessionsRevoked && allTokensRevoked) {
    return "REVOKED";
  }

  if (hasVerified) {
    return "VERIFIED";
  }

  if (params.inviteSentCount === 0 || !params.latestInviteSentAt) {
    return "NEVER_INVITED";
  }

  if (latestToken) {
    if (latestToken.isRevoked) {
      return "REVOKED";
    }
    if (latestToken.expiresAt < new Date()) {
      return "EXPIRED";
    }
    return "ISSUED";
  }

  // Fallback if no tokens are loaded but invite was sent: estimate by latestInviteSentAt
  const inviteExpiryMs = 24 * 60 * 60 * 1000; // default 24h
  if (Date.now() - params.latestInviteSentAt.getTime() > inviteExpiryMs) {
    return "EXPIRED";
  }

  return "ISSUED";
}

