import "server-only";

import { type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import {
  requireMessagingApiContext,
  applyMessagingRateLimit,
  handleMessagingApiError,
  messagingApiResponse,
  MessagingApiError,
  MessagingApiErrorCode,
} from "../../_utils";
import {
  mintRealtimeSessionToken,
  DEFAULT_REALTIME_TOKEN_TTL_SECONDS,
} from "@/lib/messaging/realtime/token";
import { ConsoleRealtimeDiagnostics } from "@/lib/messaging/realtime/diagnostics";

/**
 * POST /api/messaging/realtime/bootstrap
 *
 * Realtime session bootstrap endpoint.
 *
 * Validates the caller's authenticated org context, applies rate limiting,
 * mints a short-lived realtime session token, and returns the connection
 * contract needed to open an authenticated WebSocket.
 */

const diagnostics = new ConsoleRealtimeDiagnostics();

function getTokenSecret(): string {
  const secret = process.env.MESSAGING_REALTIME_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new MessagingApiError(
      MessagingApiErrorCode.INTERNAL_ERROR,
      "Realtime token secret is not configured.",
      500,
    );
  }
  return secret;
}

function buildWsUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  // In development, assume ws:// on the same host/port.
  // In production, a dedicated WSS endpoint should be configured.
  const wsProtocol = appUrl.startsWith("https://") ? "wss://" : "ws://";
  const host = appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!host) {
    // Fallback for local dev without explicit APP_URL.
    return "ws://localhost:3001/api/messaging/realtime/ws";
  }
  return `${wsProtocol}${host}/api/messaging/realtime/ws`;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const context = await requireMessagingApiContext();
    await applyMessagingRateLimit(request, context.orgId, "messagingGovernance");

    const secret = getTokenSecret();
    const sessionId = randomUUID();

    const result = mintRealtimeSessionToken(
      {
        userId: context.userId,
        orgId: context.orgId,
        role: context.role,
        representedId: context.representedId,
        proxyGrantId: context.proxyGrantId,
        proxyScope: context.proxyScope,
        sessionId,
        ttlSeconds: DEFAULT_REALTIME_TOKEN_TTL_SECONDS,
      },
      secret,
    );

    diagnostics.emit({
      kind: "bootstrap_success",
      orgId: context.orgId,
      userId: context.userId,
      sessionId: result.sessionId,
    });

    return messagingApiResponse({
      sessionToken: result.token,
      expiresAt: result.expiresAt,
      wsUrl: buildWsUrl(),
      sessionId: result.sessionId,
      serverTime: Math.floor(Date.now() / 1000),
      capabilities: ["subscribe_conversation", "heartbeat", "resume_session"],
    });
  } catch (error) {
    if (error instanceof MessagingApiError && error.code === MessagingApiErrorCode.UNAUTHORIZED) {
      diagnostics.emit({
        kind: "bootstrap_denied",
        reason: error.message,
        code: "auth_required",
      });
    } else if (error instanceof Error && error.message.includes("Rate limit")) {
      diagnostics.emit({
        kind: "bootstrap_denied",
        reason: "rate limited",
        code: "rate_limited",
      });
    } else if (error instanceof Error) {
      diagnostics.emit({
        kind: "bootstrap_denied",
        reason: error.message,
        code: "server_error",
      });
    }
    return handleMessagingApiError(error);
  }
}
