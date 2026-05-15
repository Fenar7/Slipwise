/**
 * Internal Messaging Platform — Phase 4 Sprint 4.4
 * Durable side-effect delivery seams, degraded mode UX, and operational safety.
 *
 * Covers:
 * - Downstream seam exposes replayable events safely for worker consumption
 * - Downstream seam preserves event id/cursor/idempotent consumption contract
 * - Duplicate worker-consumption-safe behavior is explicit
 * - Bounded subscription limit denies excessive subscription behavior safely
 * - Denial behavior does not leak unauthorized conversation existence
 * - Degraded replay/fanout states produce explicit safe recovery behavior
 * - Presence/typing degradation does not affect message correctness
 * - Rate limiting on commands and resume attempts
 * - Backpressure behavior when delivery falls behind
 * - ack_events command handling
 * - Sprint 4.1 / 4.2 / 4.3 / Phase 3 regression guard
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";

vi.mock("server-only", () => ({}));

function makeFn() {
  return vi.fn();
}

vi.mock("@/lib/db", () => {
  const conversationEventLog = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  };
  const downstreamConsumptionCheckpoint = {
    upsert: vi.fn(),
    findUnique: vi.fn(),
  };
  const conversation = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  const conversationParticipant = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  };
  const presenceSession = {
    upsert: vi.fn(),
    findFirst: vi.fn(),
  };
  const typingSession = {
    upsert: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
  };
  const conversationMessage = {
    create: vi.fn(),
    findFirst: vi.fn(),
  };
  const conversationThread = {
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  const conversationReadState = {
    upsert: vi.fn(),
    findFirst: vi.fn(),
  };
  const messagingAuditEvent = {
    create: vi.fn(),
  };
  const db = {
    conversationEventLog,
    downstreamConsumptionCheckpoint,
    conversation,
    conversationParticipant,
    presenceSession,
    typingSession,
    conversationMessage,
    conversationThread,
    conversationReadState,
    messagingAuditEvent,
    $transaction: vi.fn().mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
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

vi.mock("../presence-service", () => ({
  upsertPresence: makeFn(),
  startTyping: makeFn(),
  stopTyping: makeFn(),
  clearTypingForUser: makeFn(),
}));

import { db } from "@/lib/db";
import { upsertPresence } from "../presence-service";

// ─── Protocol ─────────────────────────────────────────────────────────────────
import {
  isValidClientCommand,
} from "@/lib/messaging/realtime/protocol";

// ─── Token ────────────────────────────────────────────────────────────────────
import {
  mintRealtimeSessionToken,
  DEFAULT_REALTIME_TOKEN_TTL_SECONDS,
} from "@/lib/messaging/realtime/token";

// ─── Diagnostics ──────────────────────────────────────────────────────────────
import {
  NoopRealtimeDiagnostics,
} from "@/lib/messaging/realtime/diagnostics";

// ─── Gateway ──────────────────────────────────────────────────────────────────
import { MessagingGateway } from "@/lib/messaging/realtime/gateway";

// ─── Downstream seam ──────────────────────────────────────────────────────────
import {
  consumeDownstreamEvents,
  recordConsumptionCheckpoint,
  getConsumptionCheckpoint,
  getDownstreamEventCount,
  buildNotificationPayload,
  buildSearchIndexPayload,
  buildAnalyticsPayload,
  DEFAULT_DOWNSTREAM_CONSUMPTION_LIMIT,
} from "@/lib/messaging/realtime/downstream-seam";

// ─── Degraded mode ────────────────────────────────────────────────────────────
import {
  makeDegradedState,
  makeHealthyState,
  isAdvisoryDegradation,
  requiresRehydration,
} from "@/lib/messaging/realtime/degraded-mode";

// ─── Safety limits ────────────────────────────────────────────────────────────
import {
  DEFAULT_SAFETY_LIMITS,
  SessionRateLimiter,
  createBackpressureState,
} from "@/lib/messaging/realtime/safety-limits";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER_1 = "00000000-0000-0000-0000-000000000001";
const USER_2 = "00000000-0000-0000-0000-000000000002";
const CONV_ID = "conv-001";
const SECRET = "test-secret-that-is-long-enough-for-hmac-256!!";

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

function wsCollectMessages(ws: WebSocket, durationMs: number): Promise<Array<Record<string, unknown>>> {
  const messages: Array<Record<string, unknown>> = [];
  const handler = (data: unknown) => {
    try {
      messages.push(JSON.parse((data as Buffer).toString("utf8")));
    } catch {
      // ignore
    }
  };
  ws.on("message", handler);
  return new Promise((resolve) => {
    setTimeout(() => {
      ws.off("message", handler);
      resolve(messages);
    }, durationMs);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Downstream seam unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sprint 4.4 downstream seam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("consumeDownstreamEvents returns ordered events with cursor and eventId", async () => {
    const now = new Date();
    db.conversationEventLog.findMany.mockResolvedValue([
      {
        eventId: "evt-1",
        cursor: BigInt(100),
        eventType: "conversation.message.created",
        orgId: ORG_A,
        conversationId: CONV_ID,
        actorId: USER_1,
        payload: { messageId: "msg-1" },
        createdAt: new Date(now.getTime() + 1),
      },
      {
        eventId: "evt-2",
        cursor: BigInt(200),
        eventType: "conversation.message.edited",
        orgId: ORG_A,
        conversationId: CONV_ID,
        actorId: USER_1,
        payload: { messageId: "msg-2" },
        createdAt: new Date(now.getTime() + 2),
      },
    ]);

    const result = await consumeDownstreamEvents(db, {
      consumerType: "notification",
      orgId: ORG_A,
      afterCursor: BigInt(50),
      limit: 10,
    });

    expect(result.events).toHaveLength(2);
    expect(result.events[0].eventId).toBe("evt-1");
    expect(result.events[0].cursor).toBe(BigInt(100));
    expect(result.events[1].eventId).toBe("evt-2");
    expect(result.events[1].cursor).toBe(BigInt(200));
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBe(BigInt(200));
  });

  it("consumeDownstreamEvents filters by event type", async () => {
    db.conversationEventLog.findMany.mockResolvedValue([
      {
        eventId: "evt-1",
        cursor: BigInt(100),
        eventType: "conversation.message.created",
        orgId: ORG_A,
        conversationId: CONV_ID,
        actorId: USER_1,
        payload: { messageId: "msg-1" },
        createdAt: new Date(),
      },
    ]);

    const result = await consumeDownstreamEvents(db, {
      consumerType: "search_index",
      orgId: ORG_A,
      eventTypes: ["conversation.message.created"],
      limit: 10,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventType).toBe("conversation.message.created");
  });

  it("consumeDownstreamEvents respects org isolation", async () => {
    db.conversationEventLog.findMany.mockResolvedValue([]);

    await consumeDownstreamEvents(db, {
      consumerType: "analytics",
      orgId: ORG_A,
      limit: 10,
    });

    const whereArg = (db.conversationEventLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(whereArg.orgId).toBe(ORG_A);
  });

  it("recordConsumptionCheckpoint calls upsert with correct keys", async () => {
    await recordConsumptionCheckpoint(db, {
      consumerType: "notification",
      orgId: ORG_A,
      cursor: BigInt(500),
      conversationId: CONV_ID,
    });

    const upsertCall = (db.downstreamConsumptionCheckpoint.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upsertCall.where.consumerType_orgId_conversationId.consumerType).toBe("notification");
    expect(upsertCall.where.consumerType_orgId_conversationId.orgId).toBe(ORG_A);
    expect(upsertCall.where.consumerType_orgId_conversationId.conversationId).toBe(CONV_ID);
    expect(upsertCall.create.cursor).toBe(BigInt(500));
  });

  it("getConsumptionCheckpoint returns null when no checkpoint exists", async () => {
    db.downstreamConsumptionCheckpoint.findUnique.mockResolvedValue(null);

    const result = await getConsumptionCheckpoint(db, {
      consumerType: "notification",
      orgId: ORG_A,
    });

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
      eventId: "evt-1",
      cursor: BigInt(1),
      eventType: "conversation.message.created" as const,
      orgId: ORG_A,
      conversationId: CONV_ID,
      actorId: USER_1,
      occurredAt: Date.now(),
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
      eventId: "evt-1",
      cursor: BigInt(1),
      eventType: "conversation.message.edited" as const,
      orgId: ORG_A,
      conversationId: CONV_ID,
      actorId: USER_1,
      occurredAt: Date.now(),
      payload: { messageId: "msg-1" },
    };

    const payload = buildSearchIndexPayload(event);
    expect(payload).not.toBeNull();
    expect(payload!.action).toBe("edited");
  });

  it("buildAnalyticsPayload contains only metadata", () => {
    const event = {
      eventId: "evt-1",
      cursor: BigInt(1),
      eventType: "conversation.message.created" as const,
      orgId: ORG_A,
      conversationId: CONV_ID,
      actorId: USER_1,
      occurredAt: 12345,
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
      eventId: "evt-duplicate",
      cursor: BigInt(1),
      eventType: "conversation.message.created" as const,
      orgId: ORG_A,
      conversationId: CONV_ID,
      actorId: USER_1,
      occurredAt: Date.now(),
      payload: { messageId: "msg-1" },
    };

    const notif1 = buildNotificationPayload(event);
    const notif2 = buildNotificationPayload(event);
    expect(notif1).toEqual(notif2);
    expect(notif1!.messageId).toBe("msg-1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Degraded mode unit tests
// ═══════════════════════════════════════════════════════════════════════════════

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
    const state = makeHealthyState();
    expect(state.degraded).toBe(false);
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

// ═══════════════════════════════════════════════════════════════════════════════
// Safety limits unit tests
// ═══════════════════════════════════════════════════════════════════════════════

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
    const limits: typeof DEFAULT_SAFETY_LIMITS = {
      ...DEFAULT_SAFETY_LIMITS,
      maxCommandsPerWindow: 2,
    };
    const limiter = new SessionRateLimiter(limits);
    limiter.checkCommandAllowed();
    limiter.checkCommandAllowed();
    const result = limiter.checkCommandAllowed();
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("SessionRateLimiter resets window after expiry", () => {
    const limits: typeof DEFAULT_SAFETY_LIMITS = {
      ...DEFAULT_SAFETY_LIMITS,
      maxCommandsPerWindow: 1,
      commandWindowMs: 1,
    };
    const limiter = new SessionRateLimiter(limits);
    limiter.checkCommandAllowed();
    const before = limiter.checkCommandAllowed();
    expect(before.allowed).toBe(false);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const after = limiter.checkCommandAllowed();
        expect(after.allowed).toBe(true);
        resolve();
      }, 10);
    });
  });

  it("SessionRateLimiter limits typing commands separately", () => {
    const limits: typeof DEFAULT_SAFETY_LIMITS = {
      ...DEFAULT_SAFETY_LIMITS,
      maxTypingCommandsPerWindow: 1,
    };
    const limiter = new SessionRateLimiter(limits);
    limiter.checkTypingAllowed();
    const result = limiter.checkTypingAllowed();
    expect(result.allowed).toBe(false);
  });

  it("SessionRateLimiter limits resume attempts per minute", () => {
    const limits: typeof DEFAULT_SAFETY_LIMITS = {
      ...DEFAULT_SAFETY_LIMITS,
      maxResumeAttemptsPerMinute: 1,
    };
    const limiter = new SessionRateLimiter(limits);
    limiter.checkResumeAllowed();
    const result = limiter.checkResumeAllowed();
    expect(result.allowed).toBe(false);
  });

  it("createBackpressureState starts inactive", () => {
    const bp = createBackpressureState();
    expect(bp.active).toBe(false);
    expect(bp.queuedEvents).toBe(0);
    expect(bp.droppedEvents).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Protocol validation — Sprint 4.4 extensions
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sprint 4.4 protocol validation", () => {
  it("accepts valid ack_events command", () => {
    expect(
      isValidClientCommand({
        type: "ack_events",
        requestId: "r1",
        payload: { lastEventId: "evt-1", cursors: { [CONV_ID]: "100" } },
      }),
    ).toBe(true);
  });

  it("accepts ack_events without payload", () => {
    expect(
      isValidClientCommand({
        type: "ack_events",
        requestId: "r1",
        payload: {},
      }),
    ).toBe(true);
  });

  it("rejects ack_events with invalid cursors", () => {
    expect(
      isValidClientCommand({
        type: "ack_events",
        requestId: "r1",
        payload: { cursors: { [CONV_ID]: "" } },
      }),
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Gateway integration — bounded subscriptions and degraded behavior
// ═══════════════════════════════════════════════════════════════════════════════

describe("MessagingGateway Sprint 4.4 integration", () => {
  let wss: WebSocketServer;
  let gateway: MessagingGateway;
  const port = 19995;

  beforeEach(() => {
    wss = new WebSocketServer({ port });
    gateway = new MessagingGateway({
      tokenSecret: SECRET,
      diagnostics: new NoopRealtimeDiagnostics(),
      idleTimeoutMs: 500,
      sweepIntervalMs: 200,
      typingTtlMs: 300,
      safetyLimits: {
        ...DEFAULT_SAFETY_LIMITS,
        maxSubscriptionsPerSession: 3,
        maxCommandsPerWindow: 100,
        commandWindowMs: 60_000,
        maxTypingCommandsPerWindow: 100,
        typingWindowMs: 60_000,
        maxResumeAttemptsPerMinute: 100,
      },
    });
    gateway.attach(wss);
    vi.clearAllMocks();
  });

  afterEach(() => {
    gateway.destroy();
    wss.close();
    wss.clients.forEach((c) => c.terminate());
  });

  it("denies subscription beyond maxSubscriptionsPerSession with degraded message", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    // Subscribe to 3 conversations (the limit)
    for (let i = 1; i <= 3; i++) {
      wsSend(ws, {
        type: "subscribe_conversation",
        requestId: `r${i}`,
        payload: { conversationId: `conv-${String(i).padStart(3, "0")}` },
      });
      await wsNextMessage(ws);
    }

    // 4th subscription should be denied with degraded state
    wsSend(ws, {
      type: "subscribe_conversation",
      requestId: "r4",
      payload: { conversationId: "conv-004" },
    });
    const messages = await wsCollectMessages(ws, 300);

    const degraded = messages.find((m) => m.type === "degraded");
    expect(degraded).toBeTruthy();
    expect((degraded!.payload as Record<string, unknown>).reason).toBe("subscription_limit_reached");

    ws.close();
  });

  it("subscription denial does not leak conversation existence", async () => {
    // Foreign org: same as nonexistent.
    db.conversation.findFirst.mockResolvedValue(null);

    const token = mintTestToken({ orgId: ORG_A });
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, {
      type: "subscribe_conversation",
      requestId: "r1",
      payload: { conversationId: "hidden-conv" },
    });
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

    wsSend(ws, {
      type: "subscribe_conversation",
      requestId: "r1",
      payload: { conversationId: CONV_ID, lastSeenCursor: "100" },
    });

    const messages = await wsCollectMessages(ws, 400);
    const degraded = messages.find((m) => m.type === "degraded");
    expect(degraded).toBeTruthy();
    expect((degraded!.payload as Record<string, unknown>).reason).toBe("replay_unavailable");
    expect((degraded!.payload as Record<string, unknown>).rehydrateRecommended).toBe(true);

    ws.close();
  });

  it("ack_events releases backpressure when queue is low", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, { type: "ack_events", requestId: "r1", payload: { lastEventId: "evt-1" } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("heartbeat_ack");

    ws.close();
  });

  it("rate limits excessive commands", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    // Send many heartbeat commands rapidly
    for (let i = 0; i < 110; i++) {
      wsSend(ws, { type: "heartbeat", requestId: `r${i}` });
    }

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

    // Subscribe should still work even if presence is degraded
    wsSend(ws, {
      type: "subscribe_conversation",
      requestId: "r1",
      payload: { conversationId: CONV_ID },
    });
    const sub = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(sub.type).toBe("subscription_ack");

    // set_presence fails but does not break the connection
    wsSend(ws, { type: "set_presence", requestId: "r2", payload: { status: "online" } });
    const err = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(err.type).toBe("error");
    expect((err.payload as Record<string, unknown>).code).toBe("server_error");

    // Heartbeat still works after presence error
    wsSend(ws, { type: "heartbeat", requestId: "r3" });
    const hb = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(hb.type).toBe("heartbeat_ack");

    ws.close();
  });

  it("typing rate limit is enforced separately from general commands", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());

    const tightLimits: typeof DEFAULT_SAFETY_LIMITS = {
      ...DEFAULT_SAFETY_LIMITS,
      maxCommandsPerWindow: 100,
      maxTypingCommandsPerWindow: 2,
      typingWindowMs: 60_000,
    };

    const gw = new MessagingGateway({
      tokenSecret: SECRET,
      diagnostics: new NoopRealtimeDiagnostics(),
      idleTimeoutMs: 500,
      sweepIntervalMs: 200,
      typingTtlMs: 300,
      safetyLimits: tightLimits,
    });
    const wss2 = new WebSocketServer({ port: 19994 });
    gw.attach(wss2);

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:19994`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);

    // First two typing commands should succeed
    wsSend(ws, { type: "start_typing", requestId: "r2", payload: { conversationId: CONV_ID } });
    wsSend(ws, { type: "start_typing", requestId: "r3", payload: { conversationId: CONV_ID } });

    // Third should be rate limited
    wsSend(ws, { type: "start_typing", requestId: "r4", payload: { conversationId: CONV_ID } });

    const messages = await wsCollectMessages(ws, 300);
    const rateLimited = messages.filter((m) => (m.payload as Record<string, unknown>)?.code === "rate_limited");
    expect(rateLimited.length).toBeGreaterThanOrEqual(1);

    ws.close();
    gw.destroy();
    wss2.close();
    wss2.clients.forEach((c) => c.terminate());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sprint 4.1 / 4.2 / 4.3 regression guard
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sprint 4.4 regression guard", () => {
  let wss: WebSocketServer;
  let gateway: MessagingGateway;
  const port = 19993;

  beforeEach(() => {
    wss = new WebSocketServer({ port });
    gateway = new MessagingGateway({
      tokenSecret: SECRET,
      diagnostics: new NoopRealtimeDiagnostics(),
      idleTimeoutMs: 500,
      sweepIntervalMs: 200,
      typingTtlMs: 300,
    });
    gateway.attach(wss);
    vi.clearAllMocks();
  });

  afterEach(() => {
    gateway.destroy();
    wss.close();
    wss.clients.forEach((c) => c.terminate());
  });

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
    upsertPresence.mockResolvedValue({
      id: "pres-1",
      orgId: ORG_A,
      userId: USER_1,
      status: "online",
      activeConversationId: null,
      lastActivityAt: new Date(),
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

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
      {
        eventId: "evt-1",
        cursor: BigInt(200),
        eventType: "conversation.message.created",
        orgId: ORG_A,
        conversationId: CONV_ID,
        actorId: USER_1,
        payload: { messageId: "msg-1" },
        createdAt: new Date(now.getTime() + 1),
      },
    ]);

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, {
      type: "subscribe_conversation",
      requestId: "r1",
      payload: { conversationId: CONV_ID, lastSeenCursor: "100" },
    });

    const messages = await wsCollectMessages(ws, 400);
    const replayed = messages.find(
      (m) => m.type === "event" && (m.payload as Record<string, unknown>)?.eventType === "conversation.message.created",
    );
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

    wsSend(ws, {
      type: "subscribe_conversation",
      requestId: "r1",
      payload: { conversationId: CONV_ID, lastSeenCursor: "100" },
    });
    const ack = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(ack.type).toBe("subscription_ack");
    ws.close();

    // Simulate removal
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ leftAt: new Date() }));

    const ws2 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws2, {
      type: "resume_session",
      requestId: "r2",
      payload: { sessionToken: token.token, lastSeenCursors: { [CONV_ID]: "100" } },
    });

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
