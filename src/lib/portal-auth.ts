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
      },
    });

    if (!customer || !customer.organization.defaults?.portalEnabled) {
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
          include: { organization: { include: { defaults: true } } },
        },
      },
    });

    if (!portalToken || portalToken.customer.organization.slug !== orgSlug) {
      return { success: false, error: "invalid_or_expired_link" };
    }

    // Double-check portal is still enabled
    if (!portalToken.customer.organization.defaults?.portalEnabled) {
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

export async function getPortalSession(orgSlug?: string): Promise<PortalSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_COOKIE)?.value;
    if (!token) return null;

    const payload = verifyJwtSignature(token);
    if (!payload) return null;

    // Enforce orgSlug mismatch check directly
    if (orgSlug && payload.orgSlug !== orgSlug) {
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

export async function requirePortalSession(orgSlug?: string): Promise<PortalSession> {
  const session = await getPortalSession(orgSlug);
  if (!session) {
    redirect("/portal");
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
