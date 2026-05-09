import "server-only";

import { NextRequest } from "next/server";

type RateLimitResult = {
  success: boolean;
  remaining: number;
  reset?: number;
  retryAfter?: number;
};

const FAIL_OPEN: RateLimitResult = { success: true, remaining: 999 };

async function rateLimit(
  identifier: string,
  options?: { maxRequests?: number; window?: string }
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return FAIL_OPEN;

  try {
    const { Ratelimit } = await import("@upstash/ratelimit");
    const { Redis } = await import("@upstash/redis/cloudflare");

    const redis = new Redis({ url, token });
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        options?.maxRequests ?? 60,
        (options?.window as `${number} s` | `${number} m`) ?? "60 s"
      ),
      analytics: false,
    });

    const result = await limiter.limit(identifier);

    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
      retryAfter: result.success
        ? undefined
        : Math.ceil((result.reset - Date.now()) / 1000),
    };
  } catch (error) {
    console.warn("[rate-limit] Failed, allowing request (fail-open):", error);
    return FAIL_OPEN;
  }
}

export async function rateLimitByIp(
  request: NextRequest,
  options?: { maxRequests?: number; window?: string }
): Promise<RateLimitResult> {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  return rateLimit(`ip:${ip}`, options);
}

export async function rateLimitByOrg(
  orgId: string,
  options?: { maxRequests?: number; window?: string }
): Promise<RateLimitResult> {
  return rateLimit(`org:${orgId}`, options);
}

export const RATE_LIMITS = {
  api: { maxRequests: 60, window: "60 s" },
  export: { maxRequests: 10, window: "60 s" },
  auth: { maxRequests: 5, window: "60 s" },
  // Phase 23: Pixel suite
  pixelPrintSheet: { maxRequests: 10, window: "60 s" },
  ocrExtract: { maxRequests: 5, window: "60 s" },
  shareTokenValidation: { maxRequests: 20, window: "60 s" },
  // Phase 6: Sequence platform
  resequenceApply: { maxRequests: 5, window: "60 s" },
  // Phase 7/Sprint 7.1: Concurrency hardening
  invoiceIssue: { maxRequests: 30, window: "60 s" },
  voucherApprove: { maxRequests: 30, window: "60 s" },
  // Phase 7/Sprint 7.2: Diagnostics tooling
  diagnostics: { maxRequests: 10, window: "60 s" },
  // Mailbox Phase 2 Sprint 2.2: Gmail OAuth auth surfaces
  mailboxConnect: { maxRequests: 5, window: "60 s" },
  mailboxDisconnect: { maxRequests: 5, window: "60 s" },
  mailboxReconnect: { maxRequests: 5, window: "60 s" },
  mailboxTokenRefresh: { maxRequests: 10, window: "60 s" },
} as const;
