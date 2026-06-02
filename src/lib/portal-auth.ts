import "server-only";

import crypto from "crypto";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis-client";
import { cookies } from "next/headers";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { redirect } from "next/navigation";

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

  // ── Redis path ───────────────────────────────────────────────────────────
  try {
    const raw = await redis.get(key);
    if (raw !== null) {
      const count = parseInt(raw, 10);
      if (count >= MAGIC_LINK_MAX_REQUESTS) return false;
      await redis.set(key, String(count + 1), MAGIC_LINK_WINDOW_SECONDS);
      return true;
    }
    // First request in this window
    await redis.set(key, "1", MAGIC_LINK_WINDOW_SECONDS);
    return true;
  } catch {
    // Redis unavailable — fall through to DB path
  }

  // ── DB fallback ──────────────────────────────────────────────────────────
  const now = new Date();
  try {
    const existing = await db.portalRateLimit.findUnique({ where: { key } });

    if (!existing || existing.windowEnd < now) {
      await db.portalRateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowEnd: new Date(Date.now() + MAGIC_LINK_WINDOW_MS) },
        update: { count: 1, windowEnd: new Date(Date.now() + MAGIC_LINK_WINDOW_MS) },
      });
      return true;
    }

    if (existing.count >= MAGIC_LINK_MAX_REQUESTS) {
      return false;
    }

    await db.portalRateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return true;
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

export async function requestMagicLink(
  email: string,
  orgSlug: string,
): Promise<{ success: true; message: string }> {
  const successResponse = { success: true as const, message: GENERIC_SUCCESS_MESSAGE };

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

    if (!customer || !customer.organization.defaults?.portalEnabled) {
      return successResponse;
    }

    if (!customer.clientHubLifecycle || !customer.clientHubLifecycle.enabled) {
      return successResponse;
    }

    if (!(await checkPortalRateLimit(email, customer.organizationId))) {
      return successResponse;
    }

    const orgDefaults = customer.organization.defaults;
    const tokenExpiryHours = orgDefaults.portalMagicLinkExpiryHours ?? DEFAULT_TOKEN_EXPIRY_HOURS;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(rawToken);
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
    const tokenHash = sha256(rawToken);

    const portalToken = await db.customerPortalToken.findFirst({
      where: {
        tokenHash,
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

    if (!portalToken || portalToken.customer.organization.slug !== orgSlug) {
      return { success: false, error: "invalid_or_expired_link" };
    }

    // Double-check portal is still enabled and customer is enabled
    if (
      !portalToken.customer.organization.defaults?.portalEnabled ||
      !portalToken.customer.clientHubLifecycle ||
      !portalToken.customer.clientHubLifecycle.enabled
    ) {
      return { success: false, error: "invalid_or_expired_link" };
    }

    const orgId = portalToken.orgId;
    const orgDefaults = portalToken.customer.organization.defaults;
    const sessionExpirySeconds =
      (orgDefaults?.portalSessionExpiryHours ?? 24) * 60 * 60;

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

    // Check DB session revocation on every request (enforces instant revocation)
    const session = await db.customerPortalSession.findUnique({
      where: { jti: payload.jti },
      select: { revokedAt: true, expiresAt: true },
    });

    // Session record missing, revoked, or expired in DB → fail closed
    if (!session || session.revokedAt !== null || session.expiresAt < new Date()) {
      return null;
    }

    // Update lastSeenAt (fire-and-forget)
    db.customerPortalSession
      .update({ where: { jti: payload.jti }, data: { lastSeenAt: new Date() } })
      .catch(() => {});

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
  db.customerPortalAccessLog
    .create({
      data: {
        orgId: params.orgId,
        customerId: params.customerId,
        path: params.path,
        action: params.action ?? null,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        statusCode: params.statusCode ?? null,
      },
    })
    .catch((error) => {
      console.error("[portal-auth] Failed to log access:", error);
    });
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

  // Redis path
  try {
    const raw = await redis.get(key);
    if (raw !== null) {
      const count = parseInt(raw, 10);
      if (count >= PORTAL_VERIFY_MAX_REQUESTS) return false;
      await redis.set(key, String(count + 1), PORTAL_VERIFY_WINDOW_SECONDS);
      return true;
    }
    await redis.set(key, "1", PORTAL_VERIFY_WINDOW_SECONDS);
    return true;
  } catch {
    // Fall through to DB
  }

  // DB path
  const now = new Date();
  try {
    const existing = await db.portalRateLimit.findUnique({ where: { key } });
    if (!existing || existing.windowEnd < now) {
      await db.portalRateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowEnd: new Date(Date.now() + PORTAL_VERIFY_WINDOW_MS) },
        update: { count: 1, windowEnd: new Date(Date.now() + PORTAL_VERIFY_WINDOW_MS) },
      });
      return true;
    }

    if (existing.count >= PORTAL_VERIFY_MAX_REQUESTS) {
      return false;
    }

    await db.portalRateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return true;
  } catch {
    return true;
  }
}

export async function requestPortalOtp(
  email: string,
  orgSlug: string,
): Promise<{ success: true; message: string }> {
  const successResponse = { success: true as const, message: OTP_GENERIC_SUCCESS_MESSAGE };

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

    const orgDefaults = customer.organization.defaults;
    const otp = String(crypto.randomInt(100000, 1000000));
    const tokenHash = sha256(otp);
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
      return { success: false, error: "invalid_or_expired_code" };
    }

    if (!customer.clientHubLifecycle || !customer.clientHubLifecycle.enabled) {
      return { success: false, error: "invalid_or_expired_code" };
    }

    if (!(await checkPortalVerifyRateLimit(email, customer.organizationId))) {
      return { success: false, error: "rate_limit_exceeded" };
    }

    const tokenHash = sha256(otp);
    const portalToken = await db.customerPortalToken.findFirst({
      where: {
        tokenHash,
        customerId: customer.id,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!portalToken) {
      return { success: false, error: "invalid_or_expired_code" };
    }

    const orgId = customer.organizationId;
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

