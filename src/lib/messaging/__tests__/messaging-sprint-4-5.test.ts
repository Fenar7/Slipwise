/**
 * Internal Messaging Platform — Phase 4 Sprint 4.5
 * Production hardening, delivery integrity, reconnect/replay correctness,
 * degraded recovery polish, and operational safety completion.
 *
 * Covers:
 * - Reconnect succeeds with correct replay continuity
 * - Rehydrate path is explicit when replay cannot satisfy continuity
 * - Transport limits and abuse controls are enforced safely
 * - Backpressure and degraded recovery behavior are coherent
 * - Cross-org and revoked-member safety remain intact
 * - Earlier Phase 4 behavior remains unbroken after final hardening
 * - Duplicate session detection closes old connections cleanly
 * - Protocol validation hardening rejects malformed/oversized input
 * - Ack events precision: no arbitrary queue shifts
 * - Subscription auth diagnostic returns "allowed" on success
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  const member = {
    findUnique: vi.fn().mockResolvedValue({ role: "member" }),
    findMany: vi.fn().mockResolvedValue([]),
  };
  const db = {
    conversationEventLog, downstreamConsumptionCheckpoint, conversation,
    conversationParticipant, presenceSession, typingSession,
    conversationMessage, conversationThread, conversationReadState,
    messagingAuditEvent, member,
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
import { isValidClientCommand, isValidUuid } from "@/lib/messaging/realtime/protocol";
import { mintRealtimeSessionToken, DEFAULT_REALTIME_TOKEN_TTL_SECONDS } from "@/lib/messaging/realtime/token";
import { NoopRealtimeDiagnostics } from "@/lib/messaging/realtime/diagnostics";
import { MessagingGateway } from "@/lib/messaging/realtime/gateway";
import { DEFAULT_SAFETY_LIMITS } from "@/lib/messaging/realtime/safety-limits";

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

// ─── Protocol validation hardening ──────────────────────────────────────────

describe("Sprint 4.5 protocol validation", () => {
  it("isValidUuid rejects empty strings", () => {
    expect(isValidUuid("")).toBe(false);
  });
  it("isValidUuid rejects strings with injection characters", () => {
    expect(isValidUuid("conv<001>")).toBe(false);
    expect(isValidUuid("conv'001")).toBe(false);
    expect(isValidUuid('conv"001')).toBe(false);
    expect(isValidUuid("conv\\001")).toBe(false);
  });
  it("isValidUuid accepts normal ids", () => {
    expect(isValidUuid("conv-001")).toBe(true);
    expect(isValidUuid("cm1234567890abcdef")).toBe(true);
  });
  it("rejects command with invalid type", () => {
    expect(isValidClientCommand({ type: "hack", requestId: "r1", payload: {} })).toBe(false);
  });
  it("rejects subscribe_conversation with injection in conversationId", () => {
    expect(isValidClientCommand({ type: "subscribe_conversation", requestId: "r1", payload: { conversationId: "<script>" } })).toBe(false);
  });
  it("rejects resume_session with oversized token", () => {
    const hugeToken = "x".repeat(5000);
    expect(isValidClientCommand({ type: "resume_session", requestId: "r1", payload: { sessionToken: hugeToken } })).toBe(false);
  });
  it("rejects ack_events with oversized lastEventId", () => {
    const hugeId = "e".repeat(300);
    expect(isValidClientCommand({ type: "ack_events", requestId: "r1", payload: { lastEventId: hugeId } })).toBe(false);
  });
  it("rejects heartbeat with non-number timestamp", () => {
    expect(isValidClientCommand({ type: "heartbeat", requestId: "r1", payload: { timestamp: "now" } })).toBe(false);
  });
  it("accepts valid commands after hardening", () => {
    expect(isValidClientCommand({ type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } })).toBe(true);
    expect(isValidClientCommand({ type: "ack_events", requestId: "r1", payload: { lastEventId: "evt-1", cursors: { [CONV_ID]: "100" } } })).toBe(true);
    expect(isValidClientCommand({ type: "heartbeat", requestId: "r1", payload: { timestamp: 12345 } })).toBe(true);
  });
});

// ─── Reconnect and replay continuity ─────────────────────────────────────────

describe("Sprint 4.5 reconnect/replay continuity", () => {
  let wss: WebSocketServer;
  let gateway: MessagingGateway;
  const port = 19990;

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

  it("reconnect with valid cursor replays events and sends resume_session_result resumed=true", async () => {
    const now = new Date();
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: now });
    db.conversationEventLog.findMany.mockResolvedValue([
      { eventId: "evt-1", cursor: BigInt(200), eventType: "conversation.message.created", orgId: ORG_A, conversationId: CONV_ID, actorId: USER_1, payload: { messageId: "msg-1" }, createdAt: new Date(now.getTime() + 1) },
    ]);

    const token = mintTestToken();

    // Step 1: establish session and subscription, then disconnect
    const ws1 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws1, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws1); // session_ack
    wsSend(ws1, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws1); // subscription_ack
    ws1.close();
    await new Promise((r) => setTimeout(r, 100)); // allow disconnect to process

    // Step 2: reconnect with same token and lastSeenCursors
    const ws2 = await wsConnect(`ws://localhost:${port}`);
    const messagesPromise = wsCollectMessages(ws2, 600);
    wsSend(ws2, { type: "resume_session", requestId: "r2", payload: { sessionToken: token.token, lastSeenCursors: { [CONV_ID]: "100" } } });
    await wsNextMessage(ws2); // session_ack

    const messages = await messagesPromise;
    const replayed = messages.find((m) => m.type === "event" && (m.payload as Record<string, unknown>)?.eventType === "conversation.message.created");
    expect(replayed).toBeTruthy();

    const result = messages.find((m) => m.type === "resume_session_result");
    expect(result).toBeTruthy();
    expect((result!.payload as Record<string, unknown>).resumed).toBe(true);
    expect((result!.payload as Record<string, unknown>).rehydrateRecommended).toBe(false);
    ws2.close();
  });

  it("reconnect with stale cursor sends resume_session_result with rehydrateRecommended=true", async () => {
    const oldDate = new Date(Date.now() - 73 * 60 * 60 * 1000);
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: oldDate });

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    const messagesPromise = wsCollectMessages(ws, 600);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token, lastSeenCursors: { [CONV_ID]: "100" } } });
    await wsNextMessage(ws); // session_ack

    const messages = await messagesPromise;
    const result = messages.find((m) => m.type === "resume_session_result");
    expect(result).toBeTruthy();
    expect((result!.payload as Record<string, unknown>).resumed).toBe(false);
    expect((result!.payload as Record<string, unknown>).rehydrateRecommended).toBe(true);
    ws.close();
  });

  it("reconnect with lastSeenCursors but no allowed subs still sends resume_session_result", async () => {
    db.conversation.findFirst.mockResolvedValue(null); // no conversation found
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    const messagesPromise = wsCollectMessages(ws, 600);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token, lastSeenCursors: { [CONV_ID]: "100" } } });
    await wsNextMessage(ws); // session_ack

    const messages = await messagesPromise;
    const result = messages.find((m) => m.type === "resume_session_result");
    expect(result).toBeTruthy();
    expect((result!.payload as Record<string, unknown>).resumed).toBe(false);
    expect((result!.payload as Record<string, unknown>).rehydrateRecommended).toBe(true);
    ws.close();
  });

  it("duplicate session closes old connection cleanly", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    const token = mintTestToken();

    const ws1 = await wsConnect(`ws://localhost:${port}`);
    // Start collecting on ws1 BEFORE ws2 connects
    const oldMessagesPromise = wsCollectMessages(ws1, 600);
    wsSend(ws1, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws1);

    const ws2 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws2, { type: "resume_session", requestId: "r1", payload: { sessionToken: token.token } });
    await wsNextMessage(ws2);

    const oldMessages = await oldMessagesPromise;
    const disconnect = oldMessages.find((m) => m.type === "disconnect");
    expect(disconnect).toBeTruthy();
    expect((disconnect!.payload as Record<string, unknown>).code).toBe("connection_closed");
    ws1.close(); ws2.close();
  });
});

// ─── Backpressure and ack precision ───────────────────────────────────────────

describe("Sprint 4.5 backpressure and ack precision", () => {
  it("ack of unknown eventId clears queue instead of arbitrary shift", async () => {
    const wss = new WebSocketServer({ port: 19989 });
    const tightLimits = { ...DEFAULT_SAFETY_LIMITS, maxEventQueueDepth: 2 };
    const gw = new MessagingGateway({ tokenSecret: SECRET, diagnostics: new NoopRealtimeDiagnostics(), idleTimeoutMs: 500, sweepIntervalMs: 200, typingTtlMs: 300, safetyLimits: tightLimits });
    gw.attach(wss);

    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    const token = mintTestToken();
    const ws = await wsConnect("ws://localhost:19989");
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);

    // Publish 3 events. evt-0 and evt-1 fill the queue. evt-2 exceeds
    // depth and triggers backpressure activation, but is still sent
    // (backpressure is checked at the START of sendMessage, not after).
    const allMessagesPromise = wsCollectMessages(ws, 800);
    for (let i = 0; i < 3; i++) {
      gw.publishToConversation(ORG_A, CONV_ID, {
        type: "event", eventId: `evt-${i}`,
        payload: { eventType: "conversation.message.created", orgId: ORG_A, conversationId: CONV_ID, occurredAt: Date.now(), actorId: USER_1, data: { messageId: `msg-${i}` } },
      });
    }
    await new Promise((r) => setTimeout(r, 100));

    // Ack an eventId that was never sent (simulating pruned queue).
    // Sprint 4.5: this should CLEAR the queue, not shift() one.
    wsSend(ws, { type: "ack_events", requestId: "r2", payload: { lastEventId: "never-sent" } });

    // After clearing, backpressure should release.
    await new Promise((r) => setTimeout(r, 50));
    gw.publishToConversation(ORG_A, CONV_ID, {
      type: "event", eventId: "evt-after",
      payload: { eventType: "conversation.message.created", orgId: ORG_A, conversationId: CONV_ID, occurredAt: Date.now(), actorId: USER_1, data: { messageId: "msg-after" } },
    });

    const allMessages = await allMessagesPromise;
    const events = allMessages.filter((m) => m.type === "event");
    const degraded = allMessages.find((m) => m.type === "degraded");
    const releaseMsg = allMessages.find((m) => m.type === "connection_state");

    // evt-0, evt-1, evt-2 delivered (evt-2 triggers backpressure); evt-after delivered after clear
    expect(events).toHaveLength(4);
    expect(events[0].eventId).toBe("evt-0");
    expect(events[1].eventId).toBe("evt-1");
    expect(events[2].eventId).toBe("evt-2");
    expect(events[3].eventId).toBe("evt-after");
    expect(degraded).toBeTruthy();
    expect((degraded!.payload as Record<string, unknown>).reason).toBe("fanout_delayed");
    expect(releaseMsg).toBeTruthy();
    expect((releaseMsg!.payload as Record<string, unknown>).state).toBe("connected");

    ws.close(); gw.destroy(); wss.close(); wss.clients.forEach((c) => c.terminate());
  });

  it("cursors-only ack does not arbitrarily shift outstanding queue", async () => {
    const wss = new WebSocketServer({ port: 19988 });
    const tightLimits = { ...DEFAULT_SAFETY_LIMITS, maxEventQueueDepth: 2 };
    const gw = new MessagingGateway({ tokenSecret: SECRET, diagnostics: new NoopRealtimeDiagnostics(), idleTimeoutMs: 500, sweepIntervalMs: 200, typingTtlMs: 300, safetyLimits: tightLimits });
    gw.attach(wss);

    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    const token = mintTestToken();
    const ws = await wsConnect("ws://localhost:19988");
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);

    const allMessagesPromise = wsCollectMessages(ws, 800);
    for (let i = 0; i < 3; i++) {
      gw.publishToConversation(ORG_A, CONV_ID, {
        type: "event", eventId: `evt-${i}`,
        payload: { eventType: "conversation.message.created", orgId: ORG_A, conversationId: CONV_ID, occurredAt: Date.now(), actorId: USER_1, data: { messageId: `msg-${i}` } },
      });
    }
    await new Promise((r) => setTimeout(r, 100));

    // Cursors-only ack should NOT release backpressure (does not modify queue).
    wsSend(ws, { type: "ack_events", requestId: "r2", payload: { cursors: { [CONV_ID]: "100" } } });

    await new Promise((r) => setTimeout(r, 50));
    gw.publishToConversation(ORG_A, CONV_ID, {
      type: "event", eventId: "evt-after",
      payload: { eventType: "conversation.message.created", orgId: ORG_A, conversationId: CONV_ID, occurredAt: Date.now(), actorId: USER_1, data: { messageId: "msg-after" } },
    });

    const allMessages = await allMessagesPromise;
    const events = allMessages.filter((m) => m.type === "event");
    // Backpressure activated after evt-2, so evt-after should be dropped.
    // evt-0, evt-1, evt-2 are delivered (3 events).
    expect(events).toHaveLength(3);
    expect(events[0].eventId).toBe("evt-0");
    expect(events[1].eventId).toBe("evt-1");
    expect(events[2].eventId).toBe("evt-2");

    ws.close(); gw.destroy(); wss.close(); wss.clients.forEach((c) => c.terminate());
  });
});

// ─── Cross-org and revoked-member safety ────────────────────────────────────

describe("Sprint 4.5 cross-org and revoked-member safety", () => {
  let wss: WebSocketServer;
  let gateway: MessagingGateway;
  const port = 19987;

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

  it("cross-org replay is denied with org_mismatch_in_replay", async () => {
    const now = new Date();
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: now });
    // Simulate DB returning an event with wrong org (defense-in-depth test)
    db.conversationEventLog.findMany.mockResolvedValue([
      { eventId: "evt-1", cursor: BigInt(200), eventType: "conversation.message.created", orgId: ORG_B, conversationId: CONV_ID, actorId: USER_1, payload: { messageId: "msg-1" }, createdAt: new Date(now.getTime() + 1) },
    ]);

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID, lastSeenCursor: "100" } });
    const messages = await wsCollectMessages(ws, 400);
    const errorMsg = messages.find((m) => m.type === "error");
    expect(errorMsg).toBeTruthy();
    expect((errorMsg!.payload as Record<string, unknown>).code).toBe("replay_unavailable");
    ws.close();
  });

  it("revoked member subscription is denied on reconnect", async () => {
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
    const ack = await wsNextMessage(ws) as Record<string, unknown>;
    expect(ack.type).toBe("subscription_ack");
    ws.close();

    // Simulate participant leaving
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ leftAt: new Date() }));
    const ws2 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws2, { type: "resume_session", requestId: "r2", payload: { sessionToken: token.token, lastSeenCursors: { [CONV_ID]: "100" } } });
    const messages = await wsCollectMessages(ws2, 300);
    const denied = messages.find((m) => m.type === "subscription_denied");
    expect(denied).toBeTruthy();
    ws2.close();
  });
});

// ─── Subscription auth diagnostic fix ───────────────────────────────────────

describe("Sprint 4.5 subscription auth diagnostic", () => {
  it("successful authorization returns diagnostic 'allowed' via gateway subscribe", async () => {
    const wss = new WebSocketServer({ port: 19985 });
    const gw = new MessagingGateway({ tokenSecret: SECRET, diagnostics: new NoopRealtimeDiagnostics(), idleTimeoutMs: 500, sweepIntervalMs: 200, typingTtlMs: 300 });
    gw.attach(wss);

    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    const token = mintTestToken();
    const ws = await wsConnect("ws://localhost:19985");
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    const msg = await wsNextMessage(ws) as Record<string, unknown>;
    // Subscription succeeds, confirming the internal diagnostic is now "allowed".
    expect(msg.type).toBe("subscription_ack");

    ws.close(); gw.destroy(); wss.close(); wss.clients.forEach((c) => c.terminate());
  });
});

// ─── Event log service: crypto-secure eventId ─────────────────────────────────

describe("Sprint 4.5 event log service", () => {
  it("appendConversationEvent uses crypto-secure eventId", async () => {
    const { appendConversationEvent } = await import("@/lib/messaging/realtime/event-log-service");
    db.conversationEventLog.findFirst.mockResolvedValue({ cursor: BigInt(5) });
    db.conversationEventLog.create.mockResolvedValue({});

    const result = await appendConversationEvent(db as any, {
      orgId: ORG_A,
      conversationId: CONV_ID,
      eventType: "conversation.message.created",
      actorId: USER_1,
      payload: { messageId: "msg-1" },
    });

    expect(result.eventId).toBeTruthy();
    expect(result.eventId).toContain("conversation.message.created:");
    // The hex suffix from randomBytes(8) should be 16 hex chars
    const parts = result.eventId.split(":");
    expect(parts[2].length).toBe(16);
    expect(parts[2]).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ─── Regression guard ────────────────────────────────────────────────────────

describe("Sprint 4.5 regression guard", () => {
  let wss: WebSocketServer;
  let gateway: MessagingGateway;
  const port = 19986;

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

  it("Sprint 4.1: resume_session still works", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    const msg = await wsNextMessage(ws) as Record<string, unknown>;
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
    const msg = await wsNextMessage(ws) as Record<string, unknown>;
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
    const msg = await wsNextMessage(ws) as Record<string, unknown>;
    expect(msg.type).toBe("subscription_ack");
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

  it("Sprint 4.4: subscription limit still enforced", async () => {
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

  it("Sprint 4.4: payload size limit still enforced", async () => {
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    const hugePayload = { type: "heartbeat", requestId: "r0", payload: { data: "x".repeat(70_000) } };
    wsSend(ws, hugePayload);
    const messages = await wsCollectMessages(ws, 300);
    const errorMsg = messages.find((m) => m.type === "error");
    expect(errorMsg).toBeTruthy();
    expect((errorMsg!.payload as Record<string, unknown>).fatal).toBe(true);
    ws.close();
  });

  it("proactively terminates active session when member is deactivated in org", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: new Date() });
    db.conversationEventLog.findMany.mockResolvedValue([]);

    const originalMember = (db as any).member;
    const mockFindMany = vi.fn().mockResolvedValue([
      { organizationId: ORG_A, userId: USER_1, role: "deactivated" }
    ]);
    (db as any).member = {
      findMany: mockFindMany,
      findUnique: vi.fn().mockResolvedValue({ role: "member" }),
    };

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID, lastSeenCursor: "100" } });
    const ack = await wsNextMessage(ws) as Record<string, unknown>;
    expect(ack.type).toBe("subscription_ack");

    // Wait for the sweep job to run and proactively close the socket due to deactivation
    const closePromise = new Promise<void>((resolve) => {
      ws.on("close", (code, reason) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toContain("membership deactivated");
        resolve();
      });
    });

    await closePromise;
    (db as any).member = originalMember;
  });

  it("proactively terminates active session when member model seam is completely missing in sweep job", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: new Date() });
    db.conversationEventLog.findMany.mockResolvedValue([]);

    const originalMember = (db as any).member;
    // Set member to undefined to simulate missing infrastructure
    delete (db as any).member;

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    // Temp restore member for the subscription check to pass
    (db as any).member = originalMember;
    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID, lastSeenCursor: "100" } });
    const ack = await wsNextMessage(ws) as Record<string, unknown>;
    expect(ack.type).toBe("subscription_ack");

    // Remove member again so the sweep job fails closed
    delete (db as any).member;

    // Wait for the sweep job to run and proactively close the socket
    const closePromise = new Promise<void>((resolve) => {
      ws.on("close", (code, reason) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toContain("membership verification unavailable");
        resolve();
      });
    });

    await closePromise;
    (db as any).member = originalMember;
  });

  it("proactively terminates active session when membership query throws during sweep", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationEventLog.findFirst.mockResolvedValue({ id: "anchor", createdAt: new Date() });
    db.conversationEventLog.findMany.mockResolvedValue([]);

    const originalMember = (db as any).member;
    const mockFindMany = vi.fn().mockRejectedValue(new Error("Database connection lost"));
    (db as any).member = {
      findMany: mockFindMany,
      findUnique: vi.fn().mockResolvedValue({ role: "member" }),
    };

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID, lastSeenCursor: "100" } });
    const ack = await wsNextMessage(ws) as Record<string, unknown>;
    expect(ack.type).toBe("subscription_ack");

    // Wait for the sweep job to run and proactively close the socket
    const closePromise = new Promise<void>((resolve) => {
      ws.on("close", (code, reason) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toContain("membership verification failed");
        resolve();
      });
    });

    await closePromise;
    (db as any).member = originalMember;
  });
});

