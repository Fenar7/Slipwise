/**
 * Internal Messaging Platform — Phase 4 Sprint 4.1
 * Realtime auth, session, and protocol foundation.
 *
 * Covers:
 * - Short-lived realtime session token mint/verify
 * - Token expiry and malformed handling
 * - Protocol envelope validation
 * - Session registry lifecycle (create, heartbeat, subscribe, detach, sweep)
 * - Gateway connection auth (valid, expired, malformed tokens)
 * - Conversation subscription authorization (org boundary, membership, removed)
 * - Safe subscription denial (no existence leakage)
 * - Heartbeat and idle expiry
 * - Reconnect/resume after transport disconnect
 * - Unsubscribe semantics
 * - Safe error payloads (no secret leakage)
 * - Diagnostics safety
 * - Bootstrap endpoint auth, rate-limit, and truthful wsUrl behavior
 * - Phase 3 auth regression guard
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "./local-setup";
import { NextRequest } from "next/server";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID, createHmac } from "crypto";

vi.mock("server-only", () => ({}));

function makeFn() {
  return vi.fn();
}

vi.mock("@/lib/db", () => {
  const conversation = {
    findFirst: makeFn(),
    findMany: makeFn(),
  };
  const conversationParticipant = {
    findFirst: makeFn(),
    findMany: makeFn(),
  };
  const db = {
    conversation,
    conversationParticipant,
    $transaction: makeFn().mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
  };
  return { db };
});

vi.mock("@/lib/auth", () => ({
  getOrgContext: makeFn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 999 }),
  rateLimitByIp: vi.fn().mockResolvedValue({ success: true, remaining: 999 }),
  RATE_LIMITS: {
    messagingGovernance: { maxRequests: 30, window: "60 s" },
    messagingSend: { maxRequests: 60, window: "60 s" },
  },
}));

import { db } from "@/lib/db";
import { getOrgContext } from "@/lib/auth";
import { rateLimitByOrg } from "@/lib/rate-limit";

// ─── Protocol ─────────────────────────────────────────────────────────────────
import {
  isValidClientCommand,
  getCommandType,
  getCommandRequestId,
} from "@/lib/messaging/realtime/protocol";

// ─── Token ────────────────────────────────────────────────────────────────────
import {
  mintRealtimeSessionToken,
  verifyRealtimeSessionToken,
  tokenFingerprint,
  DEFAULT_REALTIME_TOKEN_TTL_SECONDS,
  MAX_REALTIME_TOKEN_TTL_SECONDS,
} from "@/lib/messaging/realtime/token";

// ─── Session ──────────────────────────────────────────────────────────────────
import {
  InMemorySessionRegistry,
  DEFAULT_SESSION_IDLE_TIMEOUT_MS,
} from "@/lib/messaging/realtime/session";

// ─── Subscription auth ────────────────────────────────────────────────────────
import {
  authorizeConversationSubscription,
} from "@/lib/messaging/realtime/subscription-auth";

// ─── Diagnostics ──────────────────────────────────────────────────────────────
import {
  NoopRealtimeDiagnostics,
  ConsoleRealtimeDiagnostics,
} from "@/lib/messaging/realtime/diagnostics";

// ─── Gateway ──────────────────────────────────────────────────────────────────
import { MessagingGateway } from "@/lib/messaging/realtime/gateway";

// ─── Server ───────────────────────────────────────────────────────────────────
import { createMessagingRealtimeServer } from "@/lib/messaging/realtime/server";

// ─── Bootstrap route ──────────────────────────────────────────────────────────
import { POST as bootstrapPost } from "@/app/api/messaging/realtime/bootstrap/route";

// ─── Phase 3 auth regression guard ────────────────────────────────────────────
import {
  evaluateConversationAccess,
} from "@/lib/messaging/authorization";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER_1 = "00000000-0000-0000-0000-000000000001";
const USER_2 = "00000000-0000-0000-0000-000000000002";
const CONV_ID = "conv-001";
const SECRET = "test-secret-that-is-long-enough-for-hmac-256!!";
const WS_URL = "wss://api.example.com/messaging/realtime";

function makeConversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID,
    orgId: ORG_A,
    type: "CHANNEL",
    name: "general",
    description: null,
    visibility: "PUBLIC",
    dmPeerId: null,
    archivedAt: null,
    archivedBy: null,
    lockedAt: null,
    lockedBy: null,
    lockReason: null,
    createdBy: USER_1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeParticipantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "part-001",
    orgId: ORG_A,
    conversationId: CONV_ID,
    userId: USER_1,
    role: "MEMBER",
    leftAt: null,
    mutedUntil: null,
    displayName: null,
    isPinned: false,
    joinedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"), init);
}

function mintTestToken(overrides: Partial<Parameters<typeof mintRealtimeSessionToken>[0]> = {}) {
  return mintRealtimeSessionToken(
    {
      userId: USER_1,
      orgId: ORG_A,
      role: "member",
      representedId: null,
      proxyGrantId: null,
      proxyScope: [],
      sessionId: randomUUID(),
      ttlSeconds: DEFAULT_REALTIME_TOKEN_TTL_SECONDS,
      ...overrides,
    },
    SECRET,
  );
}

// ─── Helpers for async WS roundtrips ──────────────────────────────────────────

function wsConnect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function wsNextMessage(ws: WebSocket, timeoutMs = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws timeout")), timeoutMs);
    ws.once("message", (data) => {
      clearTimeout(t);
      try {
        resolve(JSON.parse(data.toString("utf8")));
      } catch {
        resolve(data.toString("utf8"));
      }
    });
  });
}

function wsSend(ws: WebSocket, obj: unknown) {
  ws.send(JSON.stringify(obj));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Token contract
// ═══════════════════════════════════════════════════════════════════════════════

describe("Realtime session token contract", () => {
  it("mints a token with correct claims and expiry", () => {
    const result = mintTestToken();
    expect(result.token).toBeTruthy();
    expect(result.token.split(".").length).toBe(3);
    expect(result.expiresAt).toBeGreaterThan(result.issuedAt);
    expect(result.expiresAt - result.issuedAt).toBe(DEFAULT_REALTIME_TOKEN_TTL_SECONDS);
  });

  it("verifies a valid token successfully", () => {
    const result = mintTestToken();
    const verify = verifyRealtimeSessionToken(result.token, SECRET);
    expect(verify.valid).toBe(true);
    expect(verify.claims).toBeTruthy();
    expect(verify.claims!.sub).toBe(USER_1);
    expect(verify.claims!.org).toBe(ORG_A);
    expect(verify.claims!.role).toBe("member");
    expect(verify.claims!.sid).toBe(result.sessionId);
  });

  it("rejects a token with wrong secret", () => {
    const result = mintTestToken();
    const verify = verifyRealtimeSessionToken(result.token, "wrong-secret");
    expect(verify.valid).toBe(false);
    expect(verify.error).toBe("invalid_signature");
  });

  it("rejects a malformed token", () => {
    const verify = verifyRealtimeSessionToken("not-a-token", SECRET);
    expect(verify.valid).toBe(false);
    expect(verify.error).toBe("malformed");
  });

  it("rejects an expired token", () => {
    const result = mintTestToken({ ttlSeconds: -10 });
    const verify = verifyRealtimeSessionToken(result.token, SECRET, { clockSkewSeconds: 0 });
    expect(verify.valid).toBe(false);
    expect(verify.error).toBe("expired");
  });

  it("rejects a future token", () => {
    const result = mintTestToken();
    const parts = result.token.split(".");
    const header = parts[0];
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    payload.iat = Math.floor(Date.now() / 1000) + 3600;
    payload.exp = payload.iat + 300;
    const newPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signingInput = `${header}.${newPayload}`;
    const newSig = createHmac("sha256", SECRET).update(signingInput).digest("base64url");
    const tamperedToken = `${signingInput}.${newSig}`;
    const verify = verifyRealtimeSessionToken(tamperedToken, SECRET, { clockSkewSeconds: 0 });
    expect(verify.valid).toBe(false);
    expect(verify.error).toBe("future_token");
  });

  it("caps ttl at MAX_REALTIME_TOKEN_TTL_SECONDS", () => {
    const result = mintTestToken({ ttlSeconds: 9999 });
    expect(result.expiresAt - result.issuedAt).toBe(MAX_REALTIME_TOKEN_TTL_SECONDS);
  });

  it("tokenFingerprint does not expose the full token", () => {
    const result = mintTestToken();
    const fp = tokenFingerprint(result.token);
    expect(fp).not.toContain(result.token);
    expect(fp).toContain("…");
  });

  it("verifies proxy claims when present", () => {
    const result = mintTestToken({
      representedId: USER_2,
      proxyGrantId: "grant-001",
      proxyScope: ["read"],
    });
    const verify = verifyRealtimeSessionToken(result.token, SECRET);
    expect(verify.valid).toBe(true);
    expect(verify.claims!.rep).toBe(USER_2);
    expect(verify.claims!.pg).toBe("grant-001");
    expect(verify.claims!.ps).toEqual(["read"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Protocol validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Realtime protocol envelope", () => {
  it("accepts a valid subscribe_conversation command", () => {
    const cmd = { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } };
    expect(isValidClientCommand(cmd)).toBe(true);
  });

  it("accepts a valid heartbeat command", () => {
    const cmd = { type: "heartbeat", requestId: "r2" };
    expect(isValidClientCommand(cmd)).toBe(true);
  });

  it("accepts a valid resume_session command", () => {
    const cmd = { type: "resume_session", requestId: "r3", payload: { sessionToken: "tok" } };
    expect(isValidClientCommand(cmd)).toBe(true);
  });

  it("rejects a command without requestId", () => {
    const cmd = { type: "heartbeat" };
    expect(isValidClientCommand(cmd)).toBe(false);
  });

  it("rejects an unknown command type", () => {
    const cmd = { type: "evil_command", requestId: "r4" };
    expect(isValidClientCommand(cmd)).toBe(false);
  });

  it("rejects non-object payloads", () => {
    expect(isValidClientCommand(null)).toBe(false);
    expect(isValidClientCommand("string")).toBe(false);
    expect(isValidClientCommand(42)).toBe(false);
  });

  it("getCommandType extracts type safely", () => {
    expect(getCommandType({ type: "heartbeat" })).toBe("heartbeat");
    expect(getCommandType(null)).toBeNull();
  });

  it("getCommandRequestId extracts requestId safely", () => {
    expect(getCommandRequestId({ requestId: "abc" })).toBe("abc");
    expect(getCommandRequestId(null)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Session registry
// ═══════════════════════════════════════════════════════════════════════════════

describe("InMemorySessionRegistry", () => {
  let registry: InMemorySessionRegistry;

  beforeEach(() => {
    registry = new InMemorySessionRegistry();
  });

  it("creates and retrieves a session", () => {
    const claims = verifyRealtimeSessionToken(mintTestToken().token, SECRET).claims!;
    const session = registry.createSession(claims);
    expect(session.userId).toBe(USER_1);
    expect(session.orgId).toBe(ORG_A);
    expect(registry.getSession(session.sessionId)).toBe(session);
  });

  it("updates heartbeat", () => {
    const claims = verifyRealtimeSessionToken(mintTestToken().token, SECRET).claims!;
    const session = registry.createSession(claims);
    const before = session.lastHeartbeatAt;
    const ok = registry.updateHeartbeat(session.sessionId);
    expect(ok).toBe(true);
    expect(session.lastHeartbeatAt).toBeGreaterThanOrEqual(before);
  });

  it("heartbeat fails for unknown session", () => {
    expect(registry.updateHeartbeat("no-such")).toBe(false);
  });

  it("adds and removes subscriptions", () => {
    const claims = verifyRealtimeSessionToken(mintTestToken().token, SECRET).claims!;
    const session = registry.createSession(claims);
    expect(registry.addSubscription(session.sessionId, CONV_ID)).toBe(true);
    expect(session.subscriptions.has(CONV_ID)).toBe(true);
    expect(registry.getSubscriptions(session.sessionId).has(CONV_ID)).toBe(true);
    expect(registry.removeSubscription(session.sessionId, CONV_ID)).toBe(true);
    expect(session.subscriptions.has(CONV_ID)).toBe(false);
  });

  it("returns false when removing non-existent subscription", () => {
    const claims = verifyRealtimeSessionToken(mintTestToken().token, SECRET).claims!;
    const session = registry.createSession(claims);
    expect(registry.removeSubscription(session.sessionId, CONV_ID)).toBe(false);
  });

  it("detachSession preserves subscriptions and keeps session open", () => {
    const claims = verifyRealtimeSessionToken(mintTestToken().token, SECRET).claims!;
    const session = registry.createSession(claims);
    registry.addSubscription(session.sessionId, CONV_ID);
    const ok = registry.detachSession(session.sessionId);
    expect(ok).toBe(true);
    expect(session.closed).toBe(false);
    expect(session.subscriptions.has(CONV_ID)).toBe(true);
    expect(registry.getSubscriptions(session.sessionId).has(CONV_ID)).toBe(true);
  });

  it("closeSession clears subscriptions and marks closed", () => {
    const claims = verifyRealtimeSessionToken(mintTestToken().token, SECRET).claims!;
    const sess = registry.createSession(claims);
    registry.addSubscription(sess.sessionId, CONV_ID);
    registry.closeSession(sess.sessionId, "test");
    expect(sess.closed).toBe(true);
    expect(sess.subscriptions.size).toBe(0);
    expect(registry.getSubscriptions(sess.sessionId).size).toBe(0);
  });

  it("sweepExpiredSessions evicts idle sessions", () => {
    const claims = verifyRealtimeSessionToken(mintTestToken({ ttlSeconds: 300 }).token, SECRET).claims!;
    const session = registry.createSession(claims);
    session.lastHeartbeatAt = Date.now() - DEFAULT_SESSION_IDLE_TIMEOUT_MS - 1000;
    const evicted = registry.sweepExpiredSessions(DEFAULT_SESSION_IDLE_TIMEOUT_MS);
    expect(evicted.length).toBe(1);
    expect(evicted[0].sessionId).toBe(session.sessionId);
    expect(session.closed).toBe(true);
  });

  it("sweepExpiredSessions evicts expired token sessions", () => {
    const claims = verifyRealtimeSessionToken(mintTestToken({ ttlSeconds: -1 }).token, SECRET).claims!;
    const sess = registry.createSession(claims);
    const evicted = registry.sweepExpiredSessions(DEFAULT_SESSION_IDLE_TIMEOUT_MS);
    expect(evicted.length).toBe(1);
    expect(evicted[0].reason).toBe("token_expired");
    expect(sess.closed).toBe(true);
  });

  it("getSessionsForConversation returns active subscribers", () => {
    const claims1 = verifyRealtimeSessionToken(mintTestToken({ userId: USER_1 }).token, SECRET).claims!;
    const s1 = registry.createSession(claims1);
    const claims2 = verifyRealtimeSessionToken(mintTestToken({ userId: USER_2 }).token, SECRET).claims!;
    const s2 = registry.createSession(claims2);
    registry.addSubscription(s1.sessionId, CONV_ID);
    registry.addSubscription(s2.sessionId, CONV_ID);
    const subs = registry.getSessionsForConversation(CONV_ID);
    expect(subs.map((sess) => sess.userId).sort()).toEqual([USER_1, USER_2].sort());
  });

  it("getStats reflects sessions and subscriptions", () => {
    const claims = verifyRealtimeSessionToken(mintTestToken().token, SECRET).claims!;
    const session = registry.createSession(claims);
    registry.addSubscription(session.sessionId, CONV_ID);
    const stats = registry.getStats();
    expect(stats.totalSessions).toBe(1);
    expect(stats.totalSubscriptions).toBe(1);
    expect(stats.sessionsByOrg.get(ORG_A)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Subscription authorization
// ═══════════════════════════════════════════════════════════════════════════════

describe("Subscription authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows subscription for active participant", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());

    const claims = verifyRealtimeSessionToken(mintTestToken().token, SECRET).claims!;
    const detail = await authorizeConversationSubscription(
      { ...claims, orgId: claims.org, sessionId: "s1", connectedAt: 0, lastHeartbeatAt: 0, expiresAt: 0, subscriptions: new Set(), closed: false, proxyGrantId: null, proxyScope: [] } as import("@/lib/messaging/realtime/session").RealtimeSession,
      CONV_ID,
    );
    expect(detail.result.allowed).toBe(true);
  });

  it("denies subscription across org boundary with safe public denial", async () => {
    // Conversation exists in ORG_B; session is ORG_A.
    // Because the query is org-scoped, this returns null — same as nonexistent.
    db.conversation.findFirst.mockResolvedValue(null);

    const claims = verifyRealtimeSessionToken(mintTestToken({ orgId: ORG_A }).token, SECRET).claims!;
    const detail = await authorizeConversationSubscription(
      { ...claims, orgId: claims.org, sessionId: "s1", connectedAt: 0, lastHeartbeatAt: 0, expiresAt: 0, subscriptions: new Set(), closed: false, proxyGrantId: null, proxyScope: [] } as import("@/lib/messaging/realtime/session").RealtimeSession,
      CONV_ID,
    );
    expect(detail.result.allowed).toBe(false);
    expect(detail.result.code).toBe("subscription_denied");
    expect(detail.diagnostic).toBe("not_found");
  });

  it("denies subscription when user is not a participant", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const claims = verifyRealtimeSessionToken(mintTestToken().token, SECRET).claims!;
    const detail = await authorizeConversationSubscription(
      { ...claims, orgId: claims.org, sessionId: "s1", connectedAt: 0, lastHeartbeatAt: 0, expiresAt: 0, subscriptions: new Set(), closed: false, proxyGrantId: null, proxyScope: [] } as import("@/lib/messaging/realtime/session").RealtimeSession,
      CONV_ID,
    );
    expect(detail.result.allowed).toBe(false);
    expect(detail.result.code).toBe("subscription_denied");
  });

  it("denies subscription when participant has left", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ leftAt: new Date() }));

    const claims = verifyRealtimeSessionToken(mintTestToken().token, SECRET).claims!;
    const detail = await authorizeConversationSubscription(
      { ...claims, orgId: claims.org, sessionId: "s1", connectedAt: 0, lastHeartbeatAt: 0, expiresAt: 0, subscriptions: new Set(), closed: false, proxyGrantId: null, proxyScope: [] } as import("@/lib/messaging/realtime/session").RealtimeSession,
      CONV_ID,
    );
    expect(detail.result.allowed).toBe(false);
    expect(detail.result.code).toBe("subscription_denied");
  });

  it("denies subscription when conversation not found", async () => {
    db.conversation.findFirst.mockResolvedValue(null);

    const claims = verifyRealtimeSessionToken(mintTestToken().token, SECRET).claims!;
    const detail = await authorizeConversationSubscription(
      { ...claims, orgId: claims.org, sessionId: "s1", connectedAt: 0, lastHeartbeatAt: 0, expiresAt: 0, subscriptions: new Set(), closed: false, proxyGrantId: null, proxyScope: [] } as import("@/lib/messaging/realtime/session").RealtimeSession,
      CONV_ID,
    );
    expect(detail.result.allowed).toBe(false);
    expect(detail.result.code).toBe("subscription_denied");
    expect(detail.diagnostic).toBe("not_found");
  });

  it("foreign-org and nonexistent conversation produce the same public denial", async () => {
    // Case 1: foreign org (org-scoped query returns null)
    db.conversation.findFirst.mockResolvedValue(null);
    const claims = verifyRealtimeSessionToken(mintTestToken({ orgId: ORG_A }).token, SECRET).claims!;
    const detailA = await authorizeConversationSubscription(
      { ...claims, orgId: claims.org, sessionId: "s1", connectedAt: 0, lastHeartbeatAt: 0, expiresAt: 0, subscriptions: new Set(), closed: false, proxyGrantId: null, proxyScope: [] } as import("@/lib/messaging/realtime/session").RealtimeSession,
      CONV_ID,
    );

    // Case 2: truly nonexistent
    db.conversation.findFirst.mockResolvedValue(null);
    const detailB = await authorizeConversationSubscription(
      { ...claims, orgId: claims.org, sessionId: "s2", connectedAt: 0, lastHeartbeatAt: 0, expiresAt: 0, subscriptions: new Set(), closed: false, proxyGrantId: null, proxyScope: [] } as import("@/lib/messaging/realtime/session").RealtimeSession,
      "conv-does-not-exist",
    );

    expect(detailA.result.code).toBe(detailB.result.code);
    expect(detailA.result.reason).toBe(detailB.result.reason);
    expect(detailA.result.code).toBe("subscription_denied");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Gateway integration (real WS server + client)
// ═══════════════════════════════════════════════════════════════════════════════

describe("MessagingGateway integration", () => {
  let wss: WebSocketServer;
  let gateway: MessagingGateway;
  const port = 19999;

  beforeEach(() => {
    wss = new WebSocketServer({ port });
    gateway = new MessagingGateway({
      tokenSecret: SECRET,
      diagnostics: new NoopRealtimeDiagnostics(),
      idleTimeoutMs: 500,
      sweepIntervalMs: 200,
    });
    gateway.attach(wss);
  });

  afterEach(() => {
    gateway.destroy();
    wss.close();
    wss.clients.forEach((c) => c.terminate());
  });

  it("connects and receives session_ack with resume_session", async () => {
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);

    wsSend(ws, { type: "resume_session", requestId: "r1", payload: { sessionToken: token.token } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("session_ack");
    expect((msg.payload as Record<string, unknown>).sessionId).toBe(token.sessionId);

    ws.close();
  });

  it("rejects connection with expired token", async () => {
    const token = mintTestToken({ ttlSeconds: -60 });
    const ws = await wsConnect(`ws://localhost:${port}`);

    wsSend(ws, { type: "resume_session", requestId: "r1", payload: { sessionToken: token.token } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("error");
    expect((msg.payload as Record<string, unknown>).code).toBe("auth_expired");
    expect((msg.payload as Record<string, unknown>).fatal).toBe(true);

    ws.close();
  });

  it("rejects connection with invalid token", async () => {
    const ws = await wsConnect(`ws://localhost:${port}`);

    wsSend(ws, { type: "resume_session", requestId: "r1", payload: { sessionToken: "bad.token.here" } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("error");
    expect((msg.payload as Record<string, unknown>).code).toBe("auth_invalid");

    ws.close();
  });

  it("closes unauthenticated socket after idle timeout", async () => {
    const ws = await wsConnect(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => {
      ws.on("close", () => resolve());
    });
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });

  it("accepts subscription for allowed conversation", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws); // session_ack

    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("subscription_ack");
    expect((msg.payload as Record<string, unknown>).conversationId).toBe(CONV_ID);

    ws.close();
  });

  it("denies subscription across org boundary with safe code", async () => {
    // Org-scoped query returns null → same denial as nonexistent.
    db.conversation.findFirst.mockResolvedValue(null);

    const token = mintTestToken({ orgId: ORG_A });
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws); // session_ack

    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("subscription_denied");
    expect((msg.payload as Record<string, unknown>).code).toBe("subscription_denied");
    // Must NOT expose org_mismatch to the client.
    expect((msg.payload as Record<string, unknown>).code).not.toBe("org_mismatch");

    ws.close();
  });

  it("denies subscription without membership", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws); // session_ack

    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("subscription_denied");
    expect((msg.payload as Record<string, unknown>).code).toBe("subscription_denied");

    ws.close();
  });

  it("unsubscribe removes subscription cleanly", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);

    wsSend(ws, { type: "unsubscribe_conversation", requestId: "r2", payload: { conversationId: CONV_ID } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("subscription_ack");

    ws.close();
  });

  it("heartbeat extends session and receives heartbeat_ack", async () => {
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, { type: "heartbeat", requestId: "r1" });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("heartbeat_ack");
    expect(typeof (msg.payload as Record<string, unknown>).serverTime).toBe("number");

    ws.close();
  });

  it("idle session expiry is enforced after heartbeat stops", async () => {
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    await new Promise((r) => setTimeout(r, 900));

    wsSend(ws, { type: "heartbeat", requestId: "r1" });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("error");
    expect((msg.payload as Record<string, unknown>).code).toBe("session_expired");

    ws.close();
  });

  it("rejects commands before resume_session with fatal error", async () => {
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "heartbeat", requestId: "r1" });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("error");
    expect((msg.payload as Record<string, unknown>).fatal).toBe(true);
    ws.close();
  });

  it("rejects duplicate resume_session", async () => {
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, { type: "resume_session", requestId: "r1", payload: { sessionToken: token.token } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("error");
    expect((msg.payload as Record<string, unknown>).code).toBe("invalid_command");

    ws.close();
  });

  it("handles malformed JSON gracefully", async () => {
    const ws = await wsConnect(`ws://localhost:${port}`);
    ws.send("not json");
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("error");
    expect((msg.payload as Record<string, unknown>).code).toBe("malformed_payload");
    ws.close();
  });

  it("handles unknown command type gracefully", async () => {
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, { type: "unknown_thing", requestId: "r1" });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("error");
    expect((msg.payload as Record<string, unknown>).code).toBe("invalid_command");
    ws.close();
  });

  it("reconnect with same token resumes session and preserves subscriptions", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());

    const token = mintTestToken();

    // First connection: authenticate and subscribe.
    const ws1 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws1, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    const ack1 = (await wsNextMessage(ws1)) as Record<string, unknown>;
    expect(ack1.type).toBe("session_ack");

    wsSend(ws1, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    const sub1 = (await wsNextMessage(ws1)) as Record<string, unknown>;
    expect(sub1.type).toBe("subscription_ack");

    // Abruptly close the socket (simulates transient network loss).
    ws1.terminate();

    // Second connection: resume with the same still-valid token.
    const ws2 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws2, { type: "resume_session", requestId: "r2", payload: { sessionToken: token.token } });
    const ack2 = (await wsNextMessage(ws2)) as Record<string, unknown>;
    expect(ack2.type).toBe("session_ack");
    expect((ack2.payload as Record<string, unknown>).sessionId).toBe(token.sessionId);

    // Heartbeat should work on the resumed session.
    wsSend(ws2, { type: "heartbeat", requestId: "r3" });
    const hb = (await wsNextMessage(ws2)) as Record<string, unknown>;
    expect(hb.type).toBe("heartbeat_ack");

    ws2.close();
  });

  it("reconnect reauthorizes preserved subscriptions and prunes revoked ones", async () => {
    // First connection: user is a member.
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());

    const token = mintTestToken();
    const ws1 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws1, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws1);
    wsSend(ws1, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws1);
    ws1.terminate();

    // Give the gateway event loop a tick to process the detach.
    await new Promise((r) => setTimeout(r, 50));

    // Second connection: user has been removed.
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const ws2 = await wsConnect(`ws://localhost:${port}`);

    // Collect all messages on ws2.
    const messages: Array<Record<string, unknown>> = [];
    ws2.on("message", (data) => {
      messages.push(JSON.parse(data.toString("utf8")));
    });

    wsSend(ws2, { type: "resume_session", requestId: "r2", payload: { sessionToken: token.token } });

    // Wait up to 2s for the reauth loop to push subscription_denied.
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout waiting for subscription_denied")), 2000);
      const check = setInterval(() => {
        if (messages.some((m) => m.type === "subscription_denied")) {
          clearTimeout(t);
          clearInterval(check);
          resolve();
        }
      }, 10);
    });

    expect(messages[0].type).toBe("session_ack");
    const denied = messages.find((m) => m.type === "subscription_denied")!;
    expect(denied).toBeTruthy();
    expect((denied.payload as Record<string, unknown>).conversationId).toBe(CONV_ID);

    ws2.close();
  });

  it("cannot resume after session is swept for idle expiry", async () => {
    const token = mintTestToken();
    const ws1 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws1, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws1);
    ws1.terminate();

    // Wait for sweep to evict the idle session.
    await new Promise((r) => setTimeout(r, 900));

    const ws2 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws2, { type: "resume_session", requestId: "r1", payload: { sessionToken: token.token } });
    const msg = (await wsNextMessage(ws2)) as Record<string, unknown>;
    // Session was closed by sweep; idle expiry makes it unresumable.
    expect(msg.type).toBe("error");
    expect((msg.payload as Record<string, unknown>).code).toBe("session_not_found");
    expect((msg.payload as Record<string, unknown>).fatal).toBe(true);

    ws2.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Standalone server bootstrap
// ═══════════════════════════════════════════════════════════════════════════════

describe("createMessagingRealtimeServer", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, MESSAGING_REALTIME_TOKEN_SECRET: SECRET };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates a server on the given port", async () => {
    const server = createMessagingRealtimeServer({ port: 19998 });
    const ws = await wsConnect("ws://localhost:19998");
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.terminate();
    await server.close();
  });

  it("throws when token secret is missing", () => {
    delete process.env.MESSAGING_REALTIME_TOKEN_SECRET;
    expect(() => createMessagingRealtimeServer({ port: 19997 })).toThrow(
      "MESSAGING_REALTIME_TOKEN_SECRET",
    );
  });

  it("throws when token secret is too short", () => {
    process.env.MESSAGING_REALTIME_TOKEN_SECRET = "short";
    expect(() => createMessagingRealtimeServer({ port: 19997 })).toThrow(
      "too short",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Bootstrap endpoint
// ═══════════════════════════════════════════════════════════════════════════════

describe("Realtime bootstrap endpoint", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      MESSAGING_REALTIME_TOKEN_SECRET: SECRET,
      MESSAGING_REALTIME_WS_URL: WS_URL,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns a short-lived session contract for authenticated user", async () => {
    (getOrgContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: USER_1,
      orgId: ORG_A,
      role: "member",
      representedId: null,
      proxyGrantId: null,
      proxyScope: [],
    });

    const req = makeRequest("http://localhost/api/messaging/realtime/bootstrap", { method: "POST" });
    const res = await bootstrapPost(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.sessionToken).toBeTruthy();
    expect(body.data.sessionId).toBeTruthy();
    expect(body.data.expiresAt).toBeTruthy();
    expect(body.data.wsUrl).toBe(WS_URL);
    expect(body.data.serverTime).toBeTruthy();
    expect(body.data.capabilities).toContain("subscribe_conversation");
  });

  it("rejects unauthenticated users with 401", async () => {
    (getOrgContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const req = makeRequest("http://localhost/api/messaging/realtime/bootstrap", { method: "POST" });
    const res = await bootstrapPost(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 429 when rate limited", async () => {
    (getOrgContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: USER_1,
      orgId: ORG_A,
      role: "member",
      representedId: null,
      proxyGrantId: null,
      proxyScope: [],
    });
    (rateLimitByOrg as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60000 });

    const req = makeRequest("http://localhost/api/messaging/realtime/bootstrap", { method: "POST" });
    const res = await bootstrapPost(req);
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("returns 500 when token secret is missing", async () => {
    (rateLimitByOrg as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, remaining: 999 });
    delete process.env.MESSAGING_REALTIME_TOKEN_SECRET;
    (getOrgContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: USER_1,
      orgId: ORG_A,
      role: "member",
      representedId: null,
      proxyGrantId: null,
      proxyScope: [],
    });

    const req = makeRequest("http://localhost/api/messaging/realtime/bootstrap", { method: "POST" });
    const res = await bootstrapPost(req);
    expect(res.status).toBe(500);
  });

  it("returns 500 when MESSAGING_REALTIME_WS_URL is not configured", async () => {
    (rateLimitByOrg as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, remaining: 999 });
    delete process.env.MESSAGING_REALTIME_WS_URL;
    (getOrgContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: USER_1,
      orgId: ORG_A,
      role: "member",
      representedId: null,
      proxyGrantId: null,
      proxyScope: [],
    });

    const req = makeRequest("http://localhost/api/messaging/realtime/bootstrap", { method: "POST" });
    const res = await bootstrapPost(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("token returned from bootstrap verifies successfully", async () => {
    (rateLimitByOrg as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, remaining: 999 });
    (getOrgContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: USER_1,
      orgId: ORG_A,
      role: "member",
      representedId: null,
      proxyGrantId: null,
      proxyScope: [],
    });

    const req = makeRequest("http://localhost/api/messaging/realtime/bootstrap", { method: "POST" });
    const res = await bootstrapPost(req);
    const body = await res.json();

    const verify = verifyRealtimeSessionToken(body.data.sessionToken, SECRET);
    expect(verify.valid).toBe(true);
    expect(verify.claims!.sub).toBe(USER_1);
    expect(verify.claims!.org).toBe(ORG_A);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Diagnostics safety
// ═══════════════════════════════════════════════════════════════════════════════

describe("Realtime diagnostics safety", () => {
  it("tokenFingerprint does not leak full token in diagnostics", () => {
    const token = mintTestToken().token;
    const fp = tokenFingerprint(token);
    expect(token.startsWith(fp.slice(0, 4))).toBe(true);
    expect(fp.length).toBeLessThan(token.length);
  });

  it("NoopRealtimeDiagnostics does not throw", () => {
    const diag = new NoopRealtimeDiagnostics();
    expect(() =>
      diag.emit({
        kind: "bootstrap_success",
        orgId: ORG_A,
        userId: USER_1,
        sessionId: "s1",
      }),
    ).not.toThrow();
  });

  it("ConsoleRealtimeDiagnostics does not throw on any event kind", () => {
    const diag = new ConsoleRealtimeDiagnostics();
    const events: import("@/lib/messaging/realtime/diagnostics").RealtimeDiagnosticEvent[] = [
      { kind: "bootstrap_success", orgId: ORG_A, userId: USER_1, sessionId: "s1" },
      { kind: "bootstrap_denied", reason: "test", code: "auth_required" },
      { kind: "connect_success", sessionId: "s1", orgId: ORG_A, userId: USER_1 },
      { kind: "connect_denied", reason: "test", code: "auth_invalid" },
      { kind: "subscription_denied", sessionId: "s1", conversationId: CONV_ID, reason: "test" },
      { kind: "subscription_accepted", sessionId: "s1", conversationId: CONV_ID },
      { kind: "heartbeat_expired", sessionId: "s1", idleMs: 1000 },
      { kind: "disconnect", sessionId: "s1", reason: "test" },
      { kind: "session_sweep", sessionId: "s1", reason: "test" },
      { kind: "command_rejected", sessionId: "s1", commandType: "test", reason: "test" },
    ];
    for (const ev of events) {
      expect(() => diag.emit(ev)).not.toThrow();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3 auth regression guard
// ═══════════════════════════════════════════════════════════════════════════════

describe("Phase 3 auth regression guard", () => {
  it("evaluateConversationAccess still default-denies for null participant", () => {
    const conversation = makeConversationRow();
    const result = evaluateConversationAccess(conversation, null, "READ");
    expect(result.allowed).toBe(false);
  });

  it("evaluateConversationAccess still enforces org boundary", () => {
    const conversation = makeConversationRow({ orgId: ORG_B });
    const participant = makeParticipantRow({ orgId: ORG_A });
    const result = evaluateConversationAccess(conversation, participant, "READ");
    expect(result.allowed).toBe(false);
  });

  it("evaluateConversationAccess still allows read for active member", () => {
    const conversation = makeConversationRow();
    const participant = makeParticipantRow();
    const result = evaluateConversationAccess(conversation, participant, "READ");
    expect(result.allowed).toBe(true);
  });
});
