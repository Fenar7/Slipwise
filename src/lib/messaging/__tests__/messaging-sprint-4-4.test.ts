/**
 * Internal Messaging Platform — Phase 4 Sprint 4.4
 * Durable side-effect delivery seams, degraded mode UX, and operational safety.
 *
 * Covers:
 * - Downstream seam exposes replayable events safely for worker consumption
 * - Per-conversation cursor ordering is correct; multi-conversation reads use time-based composite tokens
 * - Checkpointing is per-conversation only; no fake global cursor
 * - Bounded subscription limit denies excessive subscription behavior safely
 * - Denial behavior does not leak unauthorized conversation existence
 * - Degraded replay/fanout states produce explicit safe recovery behavior
 * - Presence/typing degradation does not affect message correctness
 * - Rate limiting on commands and resume attempts
 * - Backpressure reflects actual outstanding unacknowledged events and recovers via ack_events
 * - Inbound payload size limits are enforced before parsing
 * - Sprint 4.1 / 4.2 / 4.3 / Phase 3 regression guard
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "./local-setup";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";

vi.mock("server-only", () => ({}));

function makeFn() { return vi.fn(); }

vi.mock("@/lib/db", () => {
  const conversationEventLog = {
    create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(),
  };
  const downstreamConsumptionCheckpoint = {
    upsert: vi.fn(), findUnique: vi.fn(),
  };
  const conversation = { findFirst: vi.fn(), findMany: vi.fn() };
  const conversationParticipant = { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() };
  const presenceSession = { upsert: vi.fn(), findFirst: vi.fn() };
  const typingSession = { upsert: vi.fn(), findFirst: vi.fn(), delete: vi.fn() };
  const conversationMessage = { create: vi.fn(), findFirst: vi.fn() };
  const conversationThread = { findFirst: vi.fn(), update: vi.fn() };
  const conversationReadState = { upsert: vi.fn(), findFirst: vi.fn() };
  const messagingAuditEvent = { create: vi.fn() };
  const db = {
    conversationEventLog, downstreamConsumptionCheckpoint, conversation,
    conversationParticipant, presenceSession, typingSession,
    conversationMessage, conversationThread, conversationReadState,
    messagingAuditEvent,
    $transaction: vi.fn().mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
  };
  return { db };
});

vi.mock("@/lib/auth", () => ({ getOrgContext: makeFn() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimitByOrg: vi.fn().mockResolvedValue({ success: true, remaining: 999 }),
  rateLimitByIp: vi.fn().mockResolvedValue({ success: true, remaining: 999 }),
  RATE_LIMITS: { messagingGovernance: { maxRequests: 30, window: "60 s" }, messagingSend: { maxRequests: 60, window: "60 s" } },
}));
vi.mock("../presence-service", () => ({
  upsertPresence: makeFn(), startTyping: makeFn(), stopTyping: makeFn(), clearTypingForUser: makeFn(),
}));

import { db } from "@/lib/db";
import { upsertPresence } from "../presence-service";
import { isValidClientCommand } from "@/lib/messaging/realtime/protocol";
import { mintRealtimeSessionToken, DEFAULT_REALTIME_TOKEN_TTL_SECONDS } from "@/lib/messaging/realtime/token";
import { NoopRealtimeDiagnostics } from "@/lib/messaging/realtime/diagnostics";
import { MessagingGateway } from "@/lib/messaging/realtime/gateway";
import {
  consumeDownstreamEvents, recordConsumptionCheckpoint, getConsumptionCheckpoint,
  getDownstreamEventCount, buildNotificationPayload, buildSearchIndexPayload,
  buildAnalyticsPayload, DEFAULT_DOWNSTREAM_CONSUMPTION_LIMIT,
} from "@/lib/messaging/realtime/downstream-seam";
import { makeDegradedState, makeHealthyState, isAdvisoryDegradation, requiresRehydration } from "@/lib/messaging/realtime/degraded-mode";
import { DEFAULT_SAFETY_LIMITS, SessionRateLimiter, createBackpressureState } from "@/lib/messaging/realtime/safety-limits";

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER_1 = "00000000-0000-0000-0000-000000000001";
const USER_2 = "00000000-0000-0000-0000-000000000002";
const CONV_ID = "conv-001";
const CONV_ID_2 = "conv-002";
const SECRET = "test-secret-that-is-long-enough-for-hmac-256!!";

function makeConversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID, orgId: ORG_A, type: "CHANNEL", name: "general",
    description: null, visibility: "PUBLIC", dmPeerId: null,
    archivedAt: null, archivedBy: null, lockedAt: null, lockedBy: null,
    lockReason: null, createdBy: USER_1, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}
function makeParticipantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "part-001", orgId: ORG_A, conversationId: CONV_ID, userId: USER_1,
    role: "MEMBER", leftAt: null, mutedUntil: null, displayName: null,
    isPinned: false, joinedAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}
function mintTestToken(overrides: Partial<Parameters<typeof mintRealtimeSessionToken>[0]> = {}) {
  return mintRealtimeSessionToken(
    { userId: USER_1, orgId: ORG_A, role: "member", representedId: null,
      proxyGrantId: null, proxyScope: [], sessionId: randomUUID(),
      ttlSeconds: DEFAULT_REALTIME_TOKEN_TTL_SECONDS, ...overrides },
    SECRET,
  );
}

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
      try { resolve(JSON.parse(data.toString("utf8"))); } catch { resolve(data.toString("utf8")); }
    });
  });
}
function wsSend(ws: WebSocket, obj: unknown) { ws.send(JSON.stringify(obj)); }
function wsCollectMessages(ws: WebSocket, durationMs: number): Promise<Array<Record<string, unknown>>> {
  const messages: Array<Record<string, unknown>> = [];
  const handler = (data: unknown) => {
    try { messages.push(JSON.parse((data as Buffer).toString("utf8"))); } catch { /* ignore */ }
  };
  ws.on("message", handler);
  return new Promise((resolve) => {
    setTimeout(() => { ws.off("message", handler); resolve(messages); }, durationMs);
  });
}

// ─── Downstream seam unit tests ───────────────────────────────────────────────

describe("Sprint 4.4 downstream seam", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("consumeDownstreamEvents returns cursor-ordered events for a single conversation", async () => {
    const now = new Date();
    db.conversationEventLog.findMany.mockResolvedValue([
      { id: "row-1", eventId: "evt-1", cursor: BigInt(100), eventType: "conversation.message.created",
        orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, payload: { messageId: "msg-1" }, createdAt: new Date(now.getTime() + 1) },
      { id: "row-2", eventId: "evt-2", cursor: BigInt(200), eventType: "conversation.message.edited",
        orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, payload: { messageId: "msg-2" }, createdAt: new Date(now.getTime() + 2) },
    ]);
    const result = await consumeDownstreamEvents(db, {
      consumerType: "notification", orgId: ORG_A, conversationId: CONV_ID, afterCursor: BigInt(50), limit: 10,
    });
    expect(result.events).toHaveLength(2);
    expect(result.events[0].eventId).toBe("evt-1");
    expect(result.events[0].cursor).toBe(BigInt(100));
    expect(result.events[1].eventId).toBe("evt-2");
    expect(result.events[1].cursor).toBe(BigInt(200));
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBe(BigInt(200));
    expect(result.nextCreatedAt).toBeUndefined();
    expect(result.nextId).toBeUndefined();
    const orderBy = (db.conversationEventLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].orderBy;
    expect(orderBy).toEqual({ cursor: "asc" });
  });

  it("consumeDownstreamEvents orders multi-conversation reads by createdAt then id", async () => {
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-01-01T00:00:01Z");
    db.conversationEventLog.findMany.mockResolvedValue([
      { id: "row-a", eventId: "evt-a", cursor: BigInt(5), eventType: "conversation.message.created",
        orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, payload: { messageId: "msg-a" }, createdAt: t1 },
      { id: "row-b", eventId: "evt-b", cursor: BigInt(1), eventType: "conversation.message.created",
        orgId: ORG_A, conversationId: CONV_ID_2, actorId: USER_1, payload: { messageId: "msg-b" }, createdAt: t2 },
    ]);
    const result = await consumeDownstreamEvents(db, {
      consumerType: "notification", orgId: ORG_A, conversationIds: [CONV_ID, CONV_ID_2], limit: 10,
    });
    expect(result.events).toHaveLength(2);
    expect(result.events[0].eventId).toBe("evt-a");
    expect(result.events[1].eventId).toBe("evt-b");
    expect(result.nextCursor).toBeUndefined();
    expect(result.nextCreatedAt).toEqual(t2);
    expect(result.nextId).toBe("row-b");
    const orderBy = (db.conversationEventLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].orderBy;
    expect(orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
  });

  it("multi-conversation resume from composite token does not skip or duplicate events", async () => {
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-01-01T00:00:01Z");
    const t3 = new Date("2026-01-01T00:00:02Z");
    db.conversationEventLog.findMany.mockResolvedValueOnce([
      { id: "row-1", eventId: "evt-1", cursor: BigInt(1), eventType: "conversation.message.created",
        orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, payload: { messageId: "msg-1" }, createdAt: t1 },
      { id: "row-2", eventId: "evt-2", cursor: BigInt(2), eventType: "conversation.message.created",
        orgId: ORG_A, conversationId: CONV_ID_2, actorId: USER_1, payload: { messageId: "msg-2" }, createdAt: t2 },
      { id: "row-3", eventId: "evt-3", cursor: BigInt(3), eventType: "conversation.message.created",
        orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, payload: { messageId: "msg-3" }, createdAt: new Date(t2.getTime() + 1) },
    ]);
    const page1 = await consumeDownstreamEvents(db, {
      consumerType: "notification", orgId: ORG_A, conversationIds: [CONV_ID, CONV_ID_2], limit: 2,
    });
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCreatedAt).toEqual(t2);
    expect(page1.nextId).toBe("row-2");
    db.conversationEventLog.findMany.mockResolvedValueOnce([
      { id: "row-3", eventId: "evt-3", cursor: BigInt(3), eventType: "conversation.message.created",
        orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, payload: { messageId: "msg-3" }, createdAt: t3 },
    ]);
    const page2 = await consumeDownstreamEvents(db, {
      consumerType: "notification", orgId: ORG_A, conversationIds: [CONV_ID, CONV_ID_2],
      afterCreatedAt: page1.nextCreatedAt, afterId: page1.nextId, limit: 2,
    });
    expect(page2.events).toHaveLength(1);
    expect(page2.events[0].eventId).toBe("evt-3");
    expect(page2.hasMore).toBe(false);
    const whereArg = (db.conversationEventLog.findMany as ReturnType<typeof vi.fn>).mock.calls[1][0].where;
    expect(whereArg.OR).toBeDefined();
    expect(whereArg.OR).toEqual([
      { createdAt: { gt: t2 } },
      { createdAt: t2, id: { gt: "row-2" } },
    ]);
  });

  it("rejects mixing conversationId with afterCreatedAt", async () => {
    await expect(
      consumeDownstreamEvents(db, {
        consumerType: "notification", orgId: ORG_A, conversationId: CONV_ID,
        afterCreatedAt: new Date(), limit: 10,
      }),
    ).rejects.toThrow("only valid for multi-conversation reads");
  });

  it("rejects mixing afterCursor with afterCreatedAt", async () => {
    await expect(
      consumeDownstreamEvents(db, {
        consumerType: "notification", orgId: ORG_A, conversationIds: [CONV_ID],
        afterCursor: BigInt(1), afterCreatedAt: new Date(), limit: 10,
      }),
    ).rejects.toThrow("mutually exclusive");
  });

  it("consumeDownstreamEvents filters by event type", async () => {
    db.conversationEventLog.findMany.mockResolvedValue([
      { id: "row-1", eventId: "evt-1", cursor: BigInt(100), eventType: "conversation.message.created",
        orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, payload: { messageId: "msg-1" }, createdAt: new Date() },
    ]);
    const result = await consumeDownstreamEvents(db, {
      consumerType: "search_index", orgId: ORG_A, conversationId: CONV_ID,
      eventTypes: ["conversation.message.created"], limit: 10,
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventType).toBe("conversation.message.created");
  });

  it("consumeDownstreamEvents respects org isolation", async () => {
    db.conversationEventLog.findMany.mockResolvedValue([]);
    await consumeDownstreamEvents(db, { consumerType: "analytics", orgId: ORG_A, conversationId: CONV_ID, limit: 10 });
    const whereArg = (db.conversationEventLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(whereArg.orgId).toBe(ORG_A);
  });

  it("recordConsumptionCheckpoint requires explicit conversationId (no _global fallback)", async () => {
    await recordConsumptionCheckpoint(db, { consumerType: "notification", orgId: ORG_A, conversationId: CONV_ID, cursor: BigInt(500) });
    const upsertCall = (db.downstreamConsumptionCheckpoint.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upsertCall.where.consumerType_orgId_conversationId.consumerType).toBe("notification");
    expect(upsertCall.where.consumerType_orgId_conversationId.orgId).toBe(ORG_A);
    expect(upsertCall.where.consumerType_orgId_conversationId.conversationId).toBe(CONV_ID);
    expect(upsertCall.create.conversationId).toBe(CONV_ID);
    expect(upsertCall.create.cursor).toBe(BigInt(500));
  });

  it("getConsumptionCheckpoint returns null when no checkpoint exists", async () => {
    db.downstreamConsumptionCheckpoint.findUnique.mockResolvedValue(null);
    const result = await getConsumptionCheckpoint(db, { consumerType: "notification", orgId: ORG_A, conversationId: CONV_ID });
    expect(result).toBeNull();
  });

  it("getDownstreamEventCount returns count for org", async () => {
    db.conversationEventLog.count.mockResolvedValue(42);
    const count = await getDownstreamEventCount(db, { orgId: ORG_A });
    expect(count).toBe(42);
    const whereArg = (db.conversationEventLog.count as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(whereArg.orgId).toBe(ORG_A);
  });

  it("buildNotificationPayload never includes raw message body", () => {
    const event = {
      eventId: "evt-1", cursor: BigInt(1), eventType: "conversation.message.created" as const,
      orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, occurredAt: Date.now(),
      payload: { messageId: "msg-1", body: "secret content", mentionIds: ["m1"] },
    };
    const payload = buildNotificationPayload(event);
    expect(payload).not.toBeNull();
    expect(payload!.messageId).toBe("msg-1");
    expect(payload!.mentionIds).toEqual(["m1"]);
    expect((payload as Record<string, unknown>).body).toBeUndefined();
  });

  it("buildSearchIndexPayload infers action from event type", () => {
    const event = {
      eventId: "evt-1", cursor: BigInt(1), eventType: "conversation.message.edited" as const,
      orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, occurredAt: Date.now(), payload: { messageId: "msg-1" },
    };
    const payload = buildSearchIndexPayload(event);
    expect(payload).not.toBeNull();
    expect(payload!.action).toBe("edited");
  });

  it("buildAnalyticsPayload contains only metadata", () => {
    const event = {
      eventId: "evt-1", cursor: BigInt(1), eventType: "conversation.message.created" as const,
      orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, occurredAt: 12345,
      payload: { messageId: "msg-1", body: "secret" },
    };
    const payload = buildAnalyticsPayload(event);
    expect(payload.eventType).toBe("conversation.message.created");
    expect(payload.conversationId).toBe(CONV_ID);
    expect(payload.timestamp).toBe(12345);
    expect((payload as Record<string, unknown>).body).toBeUndefined();
  });

  it("duplicate eventIds are tolerable by contract", () => {
    const event = {
      eventId: "evt-duplicate", cursor: BigInt(1), eventType: "conversation.message.created" as const,
      orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, occurredAt: Date.now(), payload: { messageId: "msg-1" },
    };
    const notif1 = buildNotificationPayload(event);
    const notif2 = buildNotificationPayload(event);
    expect(notif1).toEqual(notif2);
    expect(notif1!.messageId).toBe("msg-1");
  });

  it("regression: old _global checkpoint design would mis-align multi-conversation resume", async () => {
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-01-01T00:00:01Z");
    db.conversationEventLog.findMany.mockResolvedValue([
      { id: "row-a", eventId: "evt-a", cursor: BigInt(10), eventType: "conversation.message.created",
        orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, payload: {}, createdAt: t1 },
      { id: "row-b", eventId: "evt-b", cursor: BigInt(5), eventType: "conversation.message.created",
        orgId: ORG_A, conversationId: CONV_ID_2, actorId: USER_1, payload: {}, createdAt: t2 },
    ]);
    const result = await consumeDownstreamEvents(db, {
      consumerType: "notification", orgId: ORG_A, conversationIds: [CONV_ID, CONV_ID_2], limit: 10,
    });
    expect(result.events[0].eventId).toBe("evt-a");
    expect(result.events[1].eventId).toBe("evt-b");
    expect(result.nextCursor).toBeUndefined();
    expect(result.nextCreatedAt).toBeDefined();
    expect(result.nextId).toBeDefined();
  });
});

// ─── Degraded mode unit tests ─────────────────────────────────────────────────

describe("Sprint 4.4 degraded mode", () => {
  it("makeDegradedState returns explicit state for replay_unavailable", () => {
    const state = makeDegradedState("replay_unavailable");
    expect(state.degraded).toBe(true);
    expect(state.reason).toBe("replay_unavailable");
    expect(state.rehydrateRecommended).toBe(true);
    expect(state.code).toBe("replay_unavailable");
  });
  it("makeDegradedState returns explicit state for subscription_limit_reached", () => {
    const state = makeDegradedState("subscription_limit_reached");
    expect(state.degraded).toBe(true);
    expect(state.reason).toBe("subscription_limit_reached");
    expect(state.code).toBe("subscription_denied");
  });
  it("makeHealthyState returns non-degraded state", () => {
    expect(makeHealthyState().degraded).toBe(false);
  });
  it("isAdvisoryDegradation returns true for presence/typing only", () => {
    expect(isAdvisoryDegradation("presence_unavailable")).toBe(true);
    expect(isAdvisoryDegradation("typing_unavailable")).toBe(true);
    expect(isAdvisoryDegradation("replay_unavailable")).toBe(false);
    expect(isAdvisoryDegradation("fanout_delayed")).toBe(false);
  });
  it("requiresRehydration returns true for replay and connection loss", () => {
    expect(requiresRehydration("replay_unavailable")).toBe(true);
    expect(requiresRehydration("connection_lost")).toBe(true);
    expect(requiresRehydration("presence_unavailable")).toBe(false);
  });
});

// ─── Safety limits unit tests ─────────────────────────────────────────────────

describe("Sprint 4.4 safety limits", () => {
  it("DEFAULT_SAFETY_LIMITS has reasonable defaults", () => {
    expect(DEFAULT_SAFETY_LIMITS.maxSubscriptionsPerSession).toBeGreaterThan(0);
    expect(DEFAULT_SAFETY_LIMITS.maxCommandsPerWindow).toBeGreaterThan(0);
    expect(DEFAULT_SAFETY_LIMITS.maxEventQueueDepth).toBeGreaterThan(0);
    expect(DEFAULT_SAFETY_LIMITS.maxMessagePayloadBytes).toBeGreaterThan(0);
  });
  it("SessionRateLimiter allows commands within window", () => {
    const limiter = new SessionRateLimiter(DEFAULT_SAFETY_LIMITS);
    const result = limiter.checkCommandAllowed();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(DEFAULT_SAFETY_LIMITS.maxCommandsPerWindow);
  });
  it("SessionRateLimiter denies commands beyond window", () => {
    const limits = { ...DEFAULT_SAFETY_LIMITS, maxCommandsPerWindow: 2 };
    const limiter = new SessionRateLimiter(limits);
    limiter.checkCommandAllowed();
    limiter.checkCommandAllowed();
    const result = limiter.checkCommandAllowed();
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
  it("SessionRateLimiter resets window after expiry", () => {
    const limits = { ...DEFAULT_SAFETY_LIMITS, maxCommandsPerWindow: 1, commandWindowMs: 1 };
    const limiter = new SessionRateLimiter(limits);
    limiter.checkCommandAllowed();
    expect(limiter.checkCommandAllowed().allowed).toBe(false);
    return new Promise<void>((resolve) => {
      setTimeout(() => { expect(limiter.checkCommandAllowed().allowed).toBe(true); resolve(); }, 10);
    });
  });
  it("SessionRateLimiter limits typing commands separately", () => {
    const limits = { ...DEFAULT_SAFETY_LIMITS, maxTypingCommandsPerWindow: 1 };
    const limiter = new SessionRateLimiter(limits);
    limiter.checkTypingAllowed();
    expect(limiter.checkTypingAllowed().allowed).toBe(false);
  });
  it("SessionRateLimiter limits resume attempts per minute", () => {
    const limits = { ...DEFAULT_SAFETY_LIMITS, maxResumeAttemptsPerMinute: 1 };
    const limiter = new SessionRateLimiter(limits);
    limiter.checkResumeAllowed();
    expect(limiter.checkResumeAllowed().allowed).toBe(false);
  });
  it("createBackpressureState starts inactive with zero outstandingEvents", () => {
    const bp = createBackpressureState();
    expect(bp.active).toBe(false);
    expect(bp.outstandingEvents).toBe(0);
    expect(bp.droppedEvents).toBe(0);
  });
});

// ─── Protocol validation ──────────────────────────────────────────────────────

describe("Sprint 4.4 protocol validation", () => {
  it("accepts valid ack_events command", () => {
    expect(isValidClientCommand({ type: "ack_events", requestId: "r1", payload: { lastEventId: "evt-1", cursors: { [CONV_ID]: "100" } } })).toBe(true);
  });
  it("accepts ack_events without payload", () => {
    expect(isValidClientCommand({ type: "ack_events", requestId: "r1", payload: {} })).toBe(true);
  });
  it("rejects ack_events with invalid cursors", () => {
    expect(isValidClientCommand({ type: "ack_events", requestId: "r1", payload: { cursors: { [CONV_ID]: "" } } })).toBe(false);
  });
});

// ─── Gateway integration ──────────────────────────────────────────────────────

describe("MessagingGateway Sprint 4.4 integration", () => {
  let wss: WebSocketServer;
  let gateway: MessagingGateway;
  const port = 19995;

  beforeEach(() => {
    wss = new WebSocketServer({ port });
    gateway = new MessagingGateway({
      tokenSecret: SECRET, diagnostics: new NoopRealtimeDiagnostics(),
      idleTimeoutMs: 500, sweepIntervalMs: 200, typingTtlMs: 300,
      safetyLimits: { ...DEFAULT_SAFETY_LIMITS, maxSubscriptionsPerSession: 3, maxCommandsPerWindow: 100, commandWindowMs: 60_000, maxTypingCommandsPerWindow: 100, typingWindowMs: 60_000, maxResumeAttemptsPerMinute: 100 },
    });
    gateway.attach(wss);
    vi.clearAllMocks();
  });
  afterEach(() => { gateway.destroy(); wss.close(); wss.clients.forEach((c) => c.terminate()); });

  it("denies subscription beyond maxSubscriptionsPerSession with degraded message", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    for (let i = 1; i <= 3; i++) {
      wsSend(ws, { type: "subscribe_conversation", requestId: `r${i}`, payload: { conversationId: `conv-${String(i).padStart(3, "0")}` } });
      await wsNextMessage(ws);
    }
    wsSend(ws, { type: "subscribe_conversation", requestId: "r4", payload: { conversationId: "conv-004" } });
    const messages = await wsCollectMessages(ws, 300);
    const degraded = messages.find((m) => m.type === "degraded");
    expect(degraded).toBeTruthy();
    expect((degraded!.payload as Record<string, unknown>).reason).toBe("subscription_limit_reached");
    ws.close();
  });

  it("subscription denial does not leak conversation existence", async () => {
    db.conversation.findFirst.mockResolvedValue(null);
    const token = mintTestToken({ orgId: ORG_A });
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: "hidden-conv" } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("subscription_denied");
    expect((msg.payload as Record<string, unknown>).code).toBe("subscription_denied");
    expect((msg.payload as Record<string, unknown>).reason).not.toContain("hidden-conv");
    ws.close();
  });

  it("sends degraded mode on stale replay cursor", async () => {
    const oldDate = new Date(Date.now() - 73 * 60 * 60 * 1000);
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: oldDate });
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID, lastSeenCursor: "100" } });
    const messages = await wsCollectMessages(ws, 400);
    const degraded = messages.find((m) => m.type === "degraded");
    expect(degraded).toBeTruthy();
    expect((degraded!.payload as Record<string, unknown>).reason).toBe("replay_unavailable");
    expect((degraded!.payload as Record<string, unknown>).rehydrateRecommended).toBe(true);
    ws.close();
  });

  it("ack_events releases backpressure when outstanding backlog drops", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    const tightLimits = { ...DEFAULT_SAFETY_LIMITS, maxEventQueueDepth: 3 };
    const gw = new MessagingGateway({ tokenSecret: SECRET, diagnostics: new NoopRealtimeDiagnostics(), idleTimeoutMs: 500, sweepIntervalMs: 200, typingTtlMs: 300, safetyLimits: tightLimits });
    const wss2 = new WebSocketServer({ port: 19994 });
    gw.attach(wss2);
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:19994`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);
    for (let i = 0; i < 4; i++) {
      upsertPresence.mockResolvedValueOnce({ id: `pres-${i}`, orgId: ORG_A, userId: USER_1, status: "online", activeConversationId: null, lastActivityAt: new Date(), expiresAt: null, createdAt: new Date(), updatedAt: new Date() });
      wsSend(ws, { type: "set_presence", requestId: `p${i}`, payload: { status: "online" } });
      await wsNextMessage(ws);
    }
    wsSend(ws, { type: "ack_events", requestId: "r2", payload: { lastEventId: "pres-event-3" } });
    const ackMsg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(ackMsg.type).toBe("heartbeat_ack");
    upsertPresence.mockResolvedValueOnce({ id: "pres-after-ack", orgId: ORG_A, userId: USER_1, status: "away", activeConversationId: null, lastActivityAt: new Date(), expiresAt: null, createdAt: new Date(), updatedAt: new Date() });
    wsSend(ws, { type: "set_presence", requestId: "r3", payload: { status: "away" } });
    const afterAck = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(afterAck.type).toBe("heartbeat_ack");
    ws.close(); gw.destroy(); wss2.close(); wss2.clients.forEach((c) => c.terminate());
  });

  it("rate limits excessive commands", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    for (let i = 0; i < 110; i++) { wsSend(ws, { type: "heartbeat", requestId: `r${i}` }); }
    const messages = await wsCollectMessages(ws, 400);
    const rateLimited = messages.filter((m) => (m.payload as Record<string, unknown>)?.code === "rate_limited");
    expect(rateLimited.length).toBeGreaterThan(0);
    ws.close();
  });

  it("presence degradation does not affect subscription flow", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    upsertPresence.mockRejectedValue(new Error("presence store unavailable"));
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    const sub = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(sub.type).toBe("subscription_ack");
    wsSend(ws, { type: "set_presence", requestId: "r2", payload: { status: "online" } });
    const err = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(err.type).toBe("error");
    expect((err.payload as Record<string, unknown>).code).toBe("server_error");
    wsSend(ws, { type: "heartbeat", requestId: "r3" });
    const hb = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(hb.type).toBe("heartbeat_ack");
    ws.close();
  });

  it("typing rate limit is enforced separately from general commands", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    const tightLimits = { ...DEFAULT_SAFETY_LIMITS, maxCommandsPerWindow: 100, maxTypingCommandsPerWindow: 2, typingWindowMs: 60_000 };
    const gw = new MessagingGateway({ tokenSecret: SECRET, diagnostics: new NoopRealtimeDiagnostics(), idleTimeoutMs: 500, sweepIntervalMs: 200, typingTtlMs: 300, safetyLimits: tightLimits });
    const wss2 = new WebSocketServer({ port: 19994 });
    gw.attach(wss2);
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:19994`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "start_typing", requestId: "r2", payload: { conversationId: CONV_ID } });
    wsSend(ws, { type: "start_typing", requestId: "r3", payload: { conversationId: CONV_ID } });
    wsSend(ws, { type: "start_typing", requestId: "r4", payload: { conversationId: CONV_ID } });
    const messages = await wsCollectMessages(ws, 300);
    const rateLimited = messages.filter((m) => (m.payload as Record<string, unknown>)?.code === "rate_limited");
    expect(rateLimited.length).toBeGreaterThanOrEqual(1);
    ws.close(); gw.destroy(); wss2.close(); wss2.clients.forEach((c) => c.terminate());
  });

  it("denies oversized inbound payload and closes connection safely", async () => {
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    const hugePayload = { type: "heartbeat", requestId: "r0", payload: { data: "x".repeat(70_000) } };
    wsSend(ws, hugePayload);
    const messages = await wsCollectMessages(ws, 300);
    const errorMsg = messages.find((m) => m.type === "error");
    expect(errorMsg).toBeTruthy();
    expect((errorMsg!.payload as Record<string, unknown>).fatal).toBe(true);
    expect((errorMsg!.payload as Record<string, unknown>).message).toContain("exceeds");
    ws.close();
  });

  it("backpressure activates under load and recovers with ack_events", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    const tightLimits = { ...DEFAULT_SAFETY_LIMITS, maxEventQueueDepth: 2 };
    const gw = new MessagingGateway({ tokenSecret: SECRET, diagnostics: new NoopRealtimeDiagnostics(), idleTimeoutMs: 500, sweepIntervalMs: 200, typingTtlMs: 300, safetyLimits: tightLimits });
    const wss2 = new WebSocketServer({ port: 19991 });
    gw.attach(wss2);
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:19991`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);

    // Collect all inbound messages in a single window covering events, backpressure, ack, and recovery.
    const allMessagesPromise = wsCollectMessages(ws, 1000);
    for (let i = 0; i < 4; i++) {
      gw.publishToConversation(ORG_A, CONV_ID, {
        type: "event", eventId: `evt-${i}`,
        payload: { eventType: "conversation.message.created", orgId: ORG_A, conversationId: CONV_ID, occurredAt: Date.now(), actorId: USER_1, data: { messageId: `msg-${i}` } },
      });
    }
    // Allow events to arrive, then ack the last delivered event.
    await new Promise((r) => setTimeout(r, 100));
    wsSend(ws, { type: "ack_events", requestId: "r2", payload: { lastEventId: "evt-2" } });
    // After ack releases backpressure, publish a recovery event.
    await new Promise((r) => setTimeout(r, 50));
    gw.publishToConversation(ORG_A, CONV_ID, {
      type: "event", eventId: "evt-after",
      payload: { eventType: "conversation.message.created", orgId: ORG_A, conversationId: CONV_ID, occurredAt: Date.now(), actorId: USER_1, data: { messageId: "msg-after" } },
    });
    const allMessages = await allMessagesPromise;

    const events = allMessages.filter((m) => m.type === "event");
    const degraded = allMessages.find((m) => m.type === "degraded");
    const releaseMsg = allMessages.find((m) => m.type === "connection_state");
    const ackMsg = allMessages.find((m) => m.type === "heartbeat_ack");

    // Backpressure activated after 3rd event (outstanding=3 > maxDepth=2); 4th event dropped.
    expect(events).toHaveLength(4);
    expect(events[0].eventId).toBe("evt-0");
    expect(events[1].eventId).toBe("evt-1");
    expect(events[2].eventId).toBe("evt-2");
    expect(events[3].eventId).toBe("evt-after");
    expect(degraded).toBeTruthy();
    expect((degraded!.payload as Record<string, unknown>).reason).toBe("fanout_delayed");
    expect(releaseMsg).toBeTruthy();
    expect((releaseMsg!.payload as Record<string, unknown>).state).toBe("connected");
    expect(ackMsg).toBeTruthy();

    ws.close(); gw.destroy(); wss2.close(); wss2.clients.forEach((c) => c.terminate());
  });
});

// ─── Regression guard ─────────────────────────────────────────────────────────

describe("Sprint 4.4 regression guard", () => {
  let wss: WebSocketServer;
  let gateway: MessagingGateway;
  const port = 19993;
  beforeEach(() => {
    wss = new WebSocketServer({ port });
    gateway = new MessagingGateway({ tokenSecret: SECRET, diagnostics: new NoopRealtimeDiagnostics(), idleTimeoutMs: 500, sweepIntervalMs: 200, typingTtlMs: 300 });
    gateway.attach(wss);
    vi.clearAllMocks();
  });
  afterEach(() => { gateway.destroy(); wss.close(); wss.clients.forEach((c) => c.terminate()); });

  it("Sprint 4.1: resume_session still works", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("session_ack");
    ws.close();
  });
  it("Sprint 4.1: heartbeat still works", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "heartbeat", requestId: "r1" });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("heartbeat_ack");
    ws.close();
  });
  it("Sprint 4.2: subscribe and fanout still work", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("subscription_ack");
    ws.close();
  });
  it("Sprint 4.2: presence still publishes after set_presence", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    upsertPresence.mockResolvedValue({ id: "pres-1", orgId: ORG_A, userId: USER_1, status: "online", activeConversationId: null, lastActivityAt: new Date(), expiresAt: null, createdAt: new Date(), updatedAt: new Date() });
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "set_presence", requestId: "r1", payload: { status: "online" } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("heartbeat_ack");
    ws.close();
  });
  it("Sprint 4.3: replay with valid cursor still works", async () => {
    const now = new Date();
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: now });
    db.conversationEventLog.findMany.mockResolvedValue([
      { eventId: "evt-1", cursor: BigInt(200), eventType: "conversation.message.created", orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, payload: { messageId: "msg-1" }, createdAt: new Date(now.getTime() + 1) },
    ]);
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID, lastSeenCursor: "100" } });
    const messages = await wsCollectMessages(ws, 400);
    const replayed = messages.find((m) => m.type === "event" && (m.payload as Record<string, unknown>)?.eventType === "conversation.message.created");
    expect(replayed).toBeTruthy();
    ws.close();
  });
  it("Sprint 4.3: removed participant cannot replay after access revocation", async () => {
    const now = new Date();
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: now });
    db.conversationEventLog.findMany.mockResolvedValue([]);
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID, lastSeenCursor: "100" } });
    const ack = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(ack.type).toBe("subscription_ack");
    ws.close();
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ leftAt: new Date() }));
    const ws2 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws2, { type: "resume_session", requestId: "r2", payload: { sessionToken: token.token, lastSeenCursors: { [CONV_ID]: "100" } } });
    const messages = await wsCollectMessages(ws2, 300);
    const denied = messages.find((m) => m.type === "subscription_denied");
    expect(denied).toBeTruthy();
    ws2.close();
  });
  it("Phase 3: cross-org subscription is denied uniformly", async () => {
    db.conversation.findFirst.mockResolvedValue(null);
    const token = mintTestToken({ orgId: ORG_B });
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("subscription_denied");
    expect((msg.payload as Record<string, unknown>).code).toBe("subscription_denied");
    ws.close();
  });
});
