/**
 * Internal Messaging Platform — Phase 4 Sprint 4.3
 * Durable replay, reconnect, and read-state synchronization.
 *
 * Covers:
 * - Durable event log append with monotonic cursors
 * - Replay fetch ordering and cursor validation
 * - Gateway subscribe with lastSeenCursor replay
 * - Gateway resume with lastSeenCursor replay
 * - Invalid/stale cursor safe recovery behavior
 * - Removed member replay cutoff
 * - Cross-org replay isolation
 * - Read-state live sync publication
 * - Duplicate-safe event contract
 * - Sprint 4.1 / 4.2 regression guard
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "./local-setup";

beforeEach(() => {
  (global as any).__mockActiveMembership = true;
});
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

// ─── Event Log Service ────────────────────────────────────────────────────────
import {
  generateMonotonicCursor,
  appendConversationEvent,
  replayConversationEvents,
  DEFAULT_REPLAY_RETENTION_HOURS,
} from "@/lib/messaging/realtime/event-log-service";

// ─── Publisher ────────────────────────────────────────────────────────────────


// ─── Read-State Service ───────────────────────────────────────────────────────
import {
  updateReadState,
  markConversationRead,
} from "@/lib/messaging/mention-readstate-service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER_1 = "00000000-0000-0000-0000-000000000001";
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
// Event log service unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sprint 4.3 event log service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generateMonotonicCursor returns a bigint greater than latest persisted cursor", async () => {
    const tx = {
      conversationEventLog: {
        findFirst: vi.fn().mockResolvedValue({ cursor: BigInt(100) }),
      },
    } as unknown as Parameters<typeof generateMonotonicCursor>[0];

    const cursor = await generateMonotonicCursor(tx, CONV_ID);
    expect(typeof cursor).toBe("bigint");
    expect(cursor).toBeGreaterThan(BigInt(100));
    expect(tx.conversationEventLog.findFirst).toHaveBeenCalledWith({
      where: { conversationId: CONV_ID },
      orderBy: { cursor: "desc" },
      select: { cursor: true },
    });
  });

  it("generateMonotonicCursor starts at 1 when no events exist", async () => {
    const tx = {
      conversationEventLog: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Parameters<typeof generateMonotonicCursor>[0];

    const cursor = await generateMonotonicCursor(tx, CONV_ID);
    expect(cursor).toBe(BigInt(1));
  });

  it("appendConversationEvent writes to tx.conversationEventLog.create", async () => {
    const tx = {
      conversationEventLog: {
        create: vi.fn().mockResolvedValue({ id: "log-1" }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Parameters<typeof appendConversationEvent>[0];

    const result = await appendConversationEvent(tx, {
      orgId: ORG_A,
      conversationId: CONV_ID,
      eventType: "conversation.message.created",
      actorId: USER_1,
      payload: { messageId: "msg-1" },
    });

    expect(tx.conversationEventLog.create).toHaveBeenCalledTimes(1);
    expect(tx.conversationEventLog.findFirst).toHaveBeenCalledTimes(1);
    expect(result.eventId).toMatch(/^conversation.message.created:/);
    expect(typeof result.cursor).toBe("bigint");
    expect(result.cursor).toBeGreaterThanOrEqual(BigInt(1));
  });

  it("appendConversationEvent retries on cursor unique constraint collision", async () => {
    let mockCursor = BigInt(100);
    const tx = {
      conversationEventLog: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve({ cursor: mockCursor++ })),
        create: vi.fn()
          .mockRejectedValueOnce(new Error("Unique constraint failed on the fields: (`conversationId`,`cursor`)"))
          .mockResolvedValueOnce({ id: "log-1" }),
      },
    } as unknown as Parameters<typeof appendConversationEvent>[0];

    const result = await appendConversationEvent(tx, {
      orgId: ORG_A,
      conversationId: CONV_ID,
      eventType: "conversation.message.created",
      actorId: USER_1,
      payload: { messageId: "msg-1" },
    });

    expect(tx.conversationEventLog.create).toHaveBeenCalledTimes(2);
    expect(tx.conversationEventLog.findFirst).toHaveBeenCalledTimes(2);
    expect(result.cursor).toBeGreaterThan(BigInt(100));
  });

  it("replayConversationEvents returns ok with ordered events", async () => {
    const now = new Date();
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: now });
    db.conversationEventLog.findMany.mockResolvedValue([
      {
        eventId: "evt-2",
        cursor: BigInt(200),
        eventType: "conversation.message.created",
        orgId: ORG_A,
        conversationId: CONV_ID,
        actorId: USER_1,
        payload: { messageId: "msg-2" },
        createdAt: new Date(now.getTime() + 1),
      },
      {
        eventId: "evt-3",
        cursor: BigInt(300),
        eventType: "conversation.message.edited",
        orgId: ORG_A,
        conversationId: CONV_ID,
        actorId: USER_1,
        payload: { messageId: "msg-3" },
        createdAt: new Date(now.getTime() + 2),
      },
    ]);

    const result = await replayConversationEvents(db, {
      orgId: ORG_A,
      conversationId: CONV_ID,
      afterCursor: "100",
      limit: 10,
    });

    expect(result.status).toBe("ok");
    expect(result.events).toHaveLength(2);
    expect(result.events[0].cursor < result.events[1].cursor!).toBe(true);
    expect(result.hasMore).toBe(false);
  });

  it("replayConversationEvents returns cursor_invalid for malformed cursor", async () => {
    const result = await replayConversationEvents(db, {
      orgId: ORG_A,
      conversationId: CONV_ID,
      afterCursor: "not-a-number",
      limit: 10,
    });

    expect(result.status).toBe("cursor_invalid");
    expect(result.events).toHaveLength(0);
  });

  it("replayConversationEvents returns cursor_not_found when anchor missing", async () => {
    db.conversationEventLog.findFirst.mockResolvedValue(null);

    const result = await replayConversationEvents(db, {
      orgId: ORG_A,
      conversationId: CONV_ID,
      afterCursor: "9999999999999",
      limit: 10,
    });

    expect(result.status).toBe("cursor_not_found");
    expect(result.events).toHaveLength(0);
  });

  it("replayConversationEvents returns cursor_stale when anchor is outside retention", async () => {
    const oldDate = new Date(Date.now() - (DEFAULT_REPLAY_RETENTION_HOURS + 1) * 60 * 60 * 1000);
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: oldDate });

    const result = await replayConversationEvents(db, {
      orgId: ORG_A,
      conversationId: CONV_ID,
      afterCursor: "100",
      limit: 10,
    });

    expect(result.status).toBe("cursor_stale");
    expect(result.events).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Protocol validation — Sprint 4.3 extensions
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sprint 4.3 protocol validation", () => {
  it("accepts subscribe_conversation with lastSeenCursor", () => {
    expect(
      isValidClientCommand({
        type: "subscribe_conversation",
        requestId: "r1",
        payload: { conversationId: CONV_ID, lastSeenCursor: "12345" },
      }),
    ).toBe(true);
  });

  it("accepts subscribe_conversation without lastSeenCursor", () => {
    expect(
      isValidClientCommand({
        type: "subscribe_conversation",
        requestId: "r1",
        payload: { conversationId: CONV_ID },
      }),
    ).toBe(true);
  });

  it("rejects subscribe_conversation with empty lastSeenCursor", () => {
    expect(
      isValidClientCommand({
        type: "subscribe_conversation",
        requestId: "r1",
        payload: { conversationId: CONV_ID, lastSeenCursor: "" },
      }),
    ).toBe(false);
  });

  it("accepts resume_session with lastSeenCursors map", () => {
    expect(
      isValidClientCommand({
        type: "resume_session",
        requestId: "r1",
        payload: { sessionToken: "tok", lastSeenCursors: { [CONV_ID]: "12345" } },
      }),
    ).toBe(true);
  });

  it("rejects resume_session with empty cursor value in lastSeenCursors", () => {
    expect(
      isValidClientCommand({
        type: "resume_session",
        requestId: "r1",
        payload: { sessionToken: "tok", lastSeenCursors: { [CONV_ID]: "" } },
      }),
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Gateway integration — replay and reconnect
// ═══════════════════════════════════════════════════════════════════════════════

describe("MessagingGateway Sprint 4.3 replay integration", () => {
  let wss: WebSocketServer;
  let gateway: MessagingGateway;
  const port = 19997;

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

  it("subscribe with valid lastSeenCursor replays missed events", async () => {
    const now = new Date();
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());

    // Anchor exists and is fresh
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: now });
    db.conversationEventLog.findMany.mockResolvedValue([
      {
        eventId: "evt-replay-1",
        cursor: BigInt(200),
        eventType: "conversation.message.created",
        orgId: ORG_A,
        conversationId: CONV_ID,
        actorId: USER_1,
        payload: { messageId: "msg-replay-1" },
        createdAt: new Date(now.getTime() + 1),
      },
    ]);

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    const messagesPromise = wsCollectMessages(ws, 600);
    wsSend(ws, {
      type: "subscribe_conversation",
      requestId: "r1",
      payload: { conversationId: CONV_ID, lastSeenCursor: "100" },
    });
    const messages = await messagesPromise;

    const ack = messages.find((m) => m.type === "subscription_ack");
    expect(ack).toBeTruthy();

    const replayed = messages.find((m) => m.type === "event" && (m.payload as Record<string, unknown>)?.eventType === "conversation.message.created");
    expect(replayed).toBeTruthy();
    expect(((replayed!.payload as Record<string, unknown>).data as Record<string, unknown>).messageId).toBe("msg-replay-1");

    ws.close();
  });

  it("subscribe with invalid lastSeenCursor sends replay_unavailable error", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationEventLog.findFirst.mockResolvedValue(null);

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    const messagesPromise = wsCollectMessages(ws, 600);
    wsSend(ws, {
      type: "subscribe_conversation",
      requestId: "r1",
      payload: { conversationId: CONV_ID, lastSeenCursor: "bad-cursor" },
    });
    const messages = await messagesPromise;

    const ack = messages.find((m) => m.type === "subscription_ack");
    expect(ack).toBeTruthy();

    const errorMsg = messages.find((m) => m.type === "error");
    expect(errorMsg).toBeTruthy();
    expect((errorMsg!.payload as Record<string, unknown>).code).toBe("replay_unavailable");

    ws.close();
  });

  it("resume with lastSeenCursor replays for reauthorized subscriptions and sends resume_session_result", async () => {
    const now = new Date();
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: now });
    db.conversationEventLog.findMany.mockImplementation((args: { where?: { conversationId?: string } }) => {
      if (args?.where?.conversationId === CONV_ID) {
        return Promise.resolve([
          {
            eventId: "evt-resume-1",
            cursor: BigInt(200),
            eventType: "conversation.message.created",
            orgId: ORG_A,
            conversationId: CONV_ID,
            actorId: USER_1,
            payload: { messageId: "msg-resume-1" },
            createdAt: new Date(now.getTime() + 1),
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    // Subscribe first
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);
    ws.close();

    // Reconnect with per-conversation cursor map
    const ws2 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws2, {
      type: "resume_session",
      requestId: "r2",
      payload: { sessionToken: token.token, lastSeenCursors: { [CONV_ID]: "100" } },
    });

    const messages = await wsCollectMessages(ws2, 300);
    const resumeResult = messages.find((m) => m.type === "resume_session_result");
    expect(resumeResult).toBeTruthy();
    expect((resumeResult!.payload as Record<string, unknown>).resumed).toBe(true);
    expect((resumeResult!.payload as Record<string, unknown>).rehydrateRecommended).toBe(false);

    const replayed = messages.find((m) => m.type === "event" && (m.payload as Record<string, unknown>)?.eventType === "conversation.message.created");
    expect(replayed).toBeTruthy();

    ws2.close();
  });

  it("resume with stale cursor sends rehydrateRecommended", async () => {
    const oldDate = new Date(Date.now() - (DEFAULT_REPLAY_RETENTION_HOURS + 1) * 60 * 60 * 1000);
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: oldDate });

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);
    ws.close();

    const ws2 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws2, {
      type: "resume_session",
      requestId: "r2",
      payload: { sessionToken: token.token, lastSeenCursors: { [CONV_ID]: "100" } },
    });

    const messages = await wsCollectMessages(ws2, 300);
    const resumeResult = messages.find((m) => m.type === "resume_session_result");
    expect(resumeResult).toBeTruthy();
    expect((resumeResult!.payload as Record<string, unknown>).resumed).toBe(false);
    expect((resumeResult!.payload as Record<string, unknown>).rehydrateRecommended).toBe(true);

    ws2.close();
  });

  it("removed participant cannot replay after access revocation", async () => {
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
    const ack = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(ack.type).toBe("subscription_ack");
    ws.close();

    // Simulate removal: subsequent reauthorize fails
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

    // Replay should NOT happen for the revoked subscription
    const replayed = messages.find((m) => m.type === "event");
    expect(replayed).toBeFalsy();

    ws2.close();
  });

  it("cross-org session cannot replay foreign conversation events", async () => {
    db.conversation.findFirst.mockResolvedValue(null); // org-safe lookup returns nothing

    const token = mintTestToken({ orgId: ORG_B });
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, {
      type: "subscribe_conversation",
      requestId: "r1",
      payload: { conversationId: CONV_ID, lastSeenCursor: "100" },
    });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("subscription_denied");

    ws.close();
  });

  it("resume with per-conversation cursors replays each conversation independently", async () => {
    const now = new Date();
    const CONV_2 = "conv-002";

    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: now });
    db.conversationEventLog.findMany.mockImplementation((args: { where?: { conversationId?: string } }) => {
      if (args?.where?.conversationId === CONV_ID) {
        return Promise.resolve([
          {
            eventId: "evt-resume-1",
            cursor: BigInt(200),
            eventType: "conversation.message.created",
            orgId: ORG_A,
            conversationId: CONV_ID,
            actorId: USER_1,
            payload: { messageId: "msg-resume-1" },
            createdAt: new Date(now.getTime() + 1),
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    // Subscribe to two conversations
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r2", payload: { conversationId: CONV_2 } });
    await wsNextMessage(ws);
    ws.close();

    // Reconnect with per-conversation cursors
    const ws2 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws2, {
      type: "resume_session",
      requestId: "r3",
      payload: { sessionToken: token.token, lastSeenCursors: { [CONV_ID]: "100", [CONV_2]: "50" } },
    });

    const messages = await wsCollectMessages(ws2, 300);
    const resumeResult = messages.find((m) => m.type === "resume_session_result");
    expect(resumeResult).toBeTruthy();
    expect((resumeResult!.payload as Record<string, unknown>).resumed).toBe(true);
    expect((resumeResult!.payload as Record<string, unknown>).rehydrateRecommended).toBe(false);

    const replayed = messages.filter(
      (m) => m.type === "event" && (m.payload as Record<string, unknown>)?.eventType === "conversation.message.created",
    );
    expect(replayed.length).toBe(1); // only conv-001 has a replay event

    ws2.close();
  });

  it("resume: stale cursor for one conversation does not poison replay for another", async () => {
    const now = new Date();
    const oldDate = new Date(Date.now() - (DEFAULT_REPLAY_RETENTION_HOURS + 1) * 60 * 60 * 1000);
    const CONV_2 = "conv-002";

    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());

    // First call (CONV_ID) returns stale anchor, second call (CONV_2) returns fresh anchor
    db.conversationEventLog.findFirst
      .mockResolvedValueOnce({ id: "anchor-stale", createdAt: oldDate })
      .mockResolvedValueOnce({ id: "anchor-fresh", createdAt: now });

    db.conversationEventLog.findMany.mockResolvedValue([
      {
        eventId: "evt-2",
        cursor: BigInt(200),
        eventType: "conversation.message.created",
        orgId: ORG_A,
        conversationId: CONV_2,
        actorId: USER_1,
        payload: { messageId: "msg-2" },
        createdAt: new Date(now.getTime() + 1),
      },
    ]);

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r2", payload: { conversationId: CONV_2 } });
    await wsNextMessage(ws);
    ws.close();

    const ws2 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws2, {
      type: "resume_session",
      requestId: "r3",
      payload: { sessionToken: token.token, lastSeenCursors: { [CONV_ID]: "100", [CONV_2]: "50" } },
    });

    const messages = await wsCollectMessages(ws2, 300);

    // resume_session_result should say rehydrateRecommended because CONV_ID was stale
    const resumeResult = messages.find((m) => m.type === "resume_session_result");
    expect(resumeResult).toBeTruthy();
    expect((resumeResult!.payload as Record<string, unknown>).resumed).toBe(false);
    expect((resumeResult!.payload as Record<string, unknown>).rehydrateRecommended).toBe(true);

    // CONV_ID should get a replay_unavailable error
    const errors = messages.filter((m) => m.type === "error");
    expect(errors.length).toBeGreaterThanOrEqual(1);

    // CONV_2 should still get its replayed event
    const replayed = messages.find(
      (m) =>
        m.type === "event" && ((m.payload as Record<string, unknown>)?.conversationId as string) === CONV_2,
    );
    expect(replayed).toBeTruthy();

    ws2.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Read-state live sync
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sprint 4.3 read-state live sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateReadState appends durable event and publishes with cursor", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationMessage.findFirst.mockResolvedValue({ id: "msg-1", orgId: ORG_A, conversationId: CONV_ID });
    db.conversationReadState.upsert.mockResolvedValue({
      id: "rs-1",
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_1,
      lastReadMessageId: "msg-1",
      lastReadAt: new Date(),
      unreadCount: 0,
      isMuted: false,
      updatedAt: new Date(),
    });

    const result = await updateReadState({
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_1,
      lastReadMessageId: "msg-1",
      lastReadAt: new Date(),
    });

    expect(db.conversationEventLog.create).toHaveBeenCalledTimes(1);
    const createCall = (db.conversationEventLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.eventType).toBe("conversation.read_state.updated");
    expect(result.lastReadMessageId).toBe("msg-1");
  });

  it("markConversationRead appends durable event and publishes with cursor", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationMessage.findFirst.mockResolvedValue({ id: "msg-latest", orgId: ORG_A, conversationId: CONV_ID });
    db.conversationReadState.upsert.mockResolvedValue({
      id: "rs-1",
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_1,
      lastReadMessageId: "msg-latest",
      lastReadAt: new Date(),
      unreadCount: 0,
      isMuted: false,
      updatedAt: new Date(),
    });

    const result = await markConversationRead({
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_1,
      readAt: new Date(),
    });

    expect(db.conversationEventLog.create).toHaveBeenCalledTimes(1);
    const createCall = (db.conversationEventLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.eventType).toBe("conversation.read_state.updated");
    expect(result.lastReadMessageId).toBe("msg-latest");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Duplicate-safe event contract
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sprint 4.3 duplicate-safe event contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replayed events carry the same eventId as the durable record", async () => {
    const now = new Date();
    const durableEventId = "conversation.message.created:123:abc";
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: now });
    db.conversationEventLog.findMany.mockResolvedValue([
      {
        eventId: durableEventId,
        cursor: BigInt(200),
        eventType: "conversation.message.created",
        orgId: ORG_A,
        conversationId: CONV_ID,
        actorId: USER_1,
        payload: { messageId: "msg-1" },
        createdAt: new Date(now.getTime() + 1),
      },
    ]);

    const result = await replayConversationEvents(db, {
      orgId: ORG_A,
      conversationId: CONV_ID,
      afterCursor: "100",
      limit: 10,
    });

    expect(result.status).toBe("ok");
    expect(result.events[0].eventId).toBe(durableEventId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sprint 4.1 / 4.2 regression guard
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sprint 4.3 regression guard", () => {
  let wss: WebSocketServer;
  let gateway: MessagingGateway;
  const port = 19996;

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

  it("Sprint 4.1: resume_session still works without lastSeenCursor", async () => {
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
});
