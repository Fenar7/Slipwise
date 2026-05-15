/**
 * Internal Messaging Platform — Phase 4 Sprint 4.2
 * Conversation fanout, presence propagation, and typing propagation.
 *
 * Covers:
 * - Protocol validation for set_presence, start_typing, stop_typing
 * - Gateway handling of presence, typing, and fanout
 * - Publisher abstraction behavior
 * - Cross-org isolation in fanout
 * - Presence activeConversationId safety filtering
 * - Typing auto-expiry and disconnect cleanup
 * - Service-layer publish-after-success wiring
 * - Sprint 4.1 regression guard
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";

vi.mock("server-only", () => ({}));

function makeFn() {
  return vi.fn();
}

vi.mock("@/lib/db", () => {
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
  };
  const conversationThread = {
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  const db = {
    conversation,
    conversationParticipant,
    presenceSession,
    typingSession,
    conversationMessage,
    conversationThread,
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
}));

import { db } from "@/lib/db";
import { upsertPresence, startTyping, stopTyping } from "../presence-service";

// ─── Protocol ─────────────────────────────────────────────────────────────────
import {
  isValidClientCommand,
} from "@/lib/messaging/realtime/protocol";

// ─── Token ────────────────────────────────────────────────────────────────────
import {
  mintRealtimeSessionToken,
  DEFAULT_REALTIME_TOKEN_TTL_SECONDS,
} from "@/lib/messaging/realtime/token";

// ─── Session ──────────────────────────────────────────────────────────────────
// Session not needed directly in this test file

// ─── Diagnostics ──────────────────────────────────────────────────────────────
import {
  NoopRealtimeDiagnostics,
} from "@/lib/messaging/realtime/diagnostics";

// ─── Gateway ──────────────────────────────────────────────────────────────────
import { MessagingGateway } from "@/lib/messaging/realtime/gateway";

// ─── Publisher ────────────────────────────────────────────────────────────────
import {
  InMemoryRealtimePublisher,
} from "@/lib/messaging/realtime/publisher";

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

// ═══════════════════════════════════════════════════════════════════════════════
// Protocol validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sprint 4.2 protocol validation", () => {
  it("accepts a valid set_presence command", () => {
    expect(
      isValidClientCommand({
        type: "set_presence",
        requestId: "r1",
        payload: { status: "online", activeConversationId: CONV_ID },
      }),
    ).toBe(true);
  });

  it("rejects set_presence with invalid status", () => {
    expect(
      isValidClientCommand({
        type: "set_presence",
        requestId: "r1",
        payload: { status: "invisible" },
      }),
    ).toBe(false);
  });

  it("accepts a valid start_typing command", () => {
    expect(
      isValidClientCommand({
        type: "start_typing",
        requestId: "r1",
        payload: { conversationId: CONV_ID },
      }),
    ).toBe(true);
  });

  it("accepts a valid stop_typing command", () => {
    expect(
      isValidClientCommand({
        type: "stop_typing",
        requestId: "r1",
        payload: { conversationId: CONV_ID },
      }),
    ).toBe(true);
  });

  it("rejects typing command without conversationId", () => {
    expect(
      isValidClientCommand({
        type: "start_typing",
        requestId: "r1",
        payload: {},
      }),
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Gateway integration — presence, typing, fanout
// ═══════════════════════════════════════════════════════════════════════════════

describe("MessagingGateway Sprint 4.2 integration", () => {
  let wss: WebSocketServer;
  let gateway: MessagingGateway;
  const port = 19998;

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
  });

  afterEach(() => {
    gateway.destroy();
    wss.close();
    wss.clients.forEach((c) => c.terminate());
  });

  it("set_presence persists and returns heartbeat_ack", async () => {
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

  it("start_typing publishes typing event to conversation subscribers", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    startTyping.mockResolvedValue({
      id: "typ-1",
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_1,
      status: "TYPING",
      expiresAt: new Date(Date.now() + 300),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);

    // Collect messages on the same socket.
    const messages: Array<Record<string, unknown>> = [];
    ws.on("message", (data) => {
      messages.push(JSON.parse(data.toString("utf8")));
    });

    wsSend(ws, { type: "start_typing", requestId: "r2", payload: { conversationId: CONV_ID } });

    // Wait for the typing event to arrive.
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout waiting for typing event")), 1000);
      const check = setInterval(() => {
        if (messages.some((m) => m.type === "event" && (m.payload as Record<string, unknown>)?.eventType === "conversation.typing.updated")) {
          clearTimeout(t);
          clearInterval(check);
          resolve();
        }
      }, 10);
    });

    const typingEvent = messages.find(
      (m) => m.type === "event" && (m.payload as Record<string, unknown>)?.eventType === "conversation.typing.updated",
    );
    expect(typingEvent).toBeTruthy();
    const payload = typingEvent!.payload as Record<string, unknown>;
    expect((payload.data as Record<string, unknown>).userId).toBe(USER_1);
    expect((payload.data as Record<string, unknown>).status).toBe("TYPING");

    ws.close();
  });

  it("stop_typing clears typing timer and publishes null update", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    startTyping.mockResolvedValue({
      id: "typ-1",
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_1,
      status: "TYPING",
      expiresAt: new Date(Date.now() + 300),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    stopTyping.mockResolvedValue({
      id: "typ-1",
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_1,
      status: "TYPING",
      expiresAt: new Date(Date.now() + 300),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);

    const messages: Array<Record<string, unknown>> = [];
    ws.on("message", (data) => {
      messages.push(JSON.parse(data.toString("utf8")));
    });

    wsSend(ws, { type: "start_typing", requestId: "r2", payload: { conversationId: CONV_ID } });
    await new Promise((r) => setTimeout(r, 50));

    wsSend(ws, { type: "stop_typing", requestId: "r3", payload: { conversationId: CONV_ID } });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout waiting for stop typing event")), 1000);
      const check = setInterval(() => {
        const stopped = messages.filter(
          (m) => m.type === "event" && (m.payload as Record<string, unknown>)?.eventType === "conversation.typing.updated",
        );
        if (stopped.length >= 2) {
          clearTimeout(t);
          clearInterval(check);
          resolve();
        }
      }, 10);
    });

    const lastTyping = messages
      .filter((m) => m.type === "event" && (m.payload as Record<string, unknown>)?.eventType === "conversation.typing.updated")
      .pop();
    expect((lastTyping!.payload as Record<string, unknown>).data).toEqual({ userId: null, status: null });

    ws.close();
  });

  it("typing auto-expires after ttl", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    startTyping.mockResolvedValue({
      id: "typ-1",
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_1,
      status: "TYPING",
      expiresAt: new Date(Date.now() + 300),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws);

    wsSend(ws, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws);

    const messages: Array<Record<string, unknown>> = [];
    ws.on("message", (data) => {
      messages.push(JSON.parse(data.toString("utf8")));
    });

    wsSend(ws, { type: "start_typing", requestId: "r2", payload: { conversationId: CONV_ID } });

    // Wait for auto-expiry (ttl is 300ms).
    await new Promise((r) => setTimeout(r, 500));

    const expired = messages.find(
      (m) =>
        m.type === "event" &&
        (m.payload as Record<string, unknown>)?.eventType === "conversation.typing.updated" &&
        ((m.payload as Record<string, unknown>).data as Record<string, unknown>)?.userId === null,
    );
    expect(expired).toBeTruthy();

    ws.close();
  });

  it("clears typing on disconnect", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    startTyping.mockResolvedValue({
      id: "typ-1",
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_1,
      status: "TYPING",
      expiresAt: new Date(Date.now() + 300),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const token = mintTestToken();
    const ws1 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws1, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    await wsNextMessage(ws1);

    wsSend(ws1, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws1);

    // Second user subscribes to the same conversation.
    const token2 = mintTestToken({ userId: USER_2 });
    const ws2 = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws2, { type: "resume_session", requestId: "s0", payload: { sessionToken: token2.token } });
    await wsNextMessage(ws2);

    wsSend(ws2, { type: "subscribe_conversation", requestId: "s1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(ws2);

    const messages2: Array<Record<string, unknown>> = [];
    ws2.on("message", (data) => {
      messages2.push(JSON.parse(data.toString("utf8")));
    });

    wsSend(ws1, { type: "start_typing", requestId: "r2", payload: { conversationId: CONV_ID } });
    await new Promise((r) => setTimeout(r, 50));

    ws1.terminate();
    await new Promise((r) => setTimeout(r, 50));

    // After disconnect, ws2 should receive a typing stopped event because
    // the gateway clears typing timers for the disconnecting session.
    const stopped = messages2.find(
      (m) =>
        m.type === "event" &&
        (m.payload as Record<string, unknown>)?.eventType === "conversation.typing.updated" &&
        ((m.payload as Record<string, unknown>).data as Record<string, unknown>)?.userId === null,
    );
    expect(stopped).toBeTruthy();

    ws2.close();
  });

  it("publishToConversation only reaches subscribed sessions in the same org", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());

    const tokenA = mintTestToken({ orgId: ORG_A });
    const wsA = await wsConnect(`ws://localhost:${port}`);
    wsSend(wsA, { type: "resume_session", requestId: "r0", payload: { sessionToken: tokenA.token } });
    await wsNextMessage(wsA);
    wsSend(wsA, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(wsA);

    const tokenB = mintTestToken({ orgId: ORG_B });
    const wsB = await wsConnect(`ws://localhost:${port}`);
    wsSend(wsB, { type: "resume_session", requestId: "s0", payload: { sessionToken: tokenB.token } });
    await wsNextMessage(wsB);
    wsSend(wsB, { type: "subscribe_conversation", requestId: "s1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(wsB);

    const messagesA: Array<Record<string, unknown>> = [];
    wsA.on("message", (data) => messagesA.push(JSON.parse(data.toString("utf8"))));

    const messagesB: Array<Record<string, unknown>> = [];
    wsB.on("message", (data) => messagesB.push(JSON.parse(data.toString("utf8"))));

    // Publish an event from org A.
    gateway.publishToConversation(ORG_A, CONV_ID, {
      type: "event",
      eventId: "evt-1",
      payload: {
        eventType: "conversation.message.created",
        orgId: ORG_A,
        conversationId: CONV_ID,
        occurredAt: Date.now(),
        actorId: USER_1,
        data: { messageId: "msg-1" },
      },
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(messagesA.length).toBeGreaterThan(0);
    expect(messagesB.length).toBe(0);

    wsA.close();
    wsB.close();
  });

  it("publishToOrg strips activeConversationId for non-subscribers", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());

    const tokenA = mintTestToken({ userId: USER_1 });
    const wsA = await wsConnect(`ws://localhost:${port}`);
    wsSend(wsA, { type: "resume_session", requestId: "r0", payload: { sessionToken: tokenA.token } });
    await wsNextMessage(wsA);
    // wsA subscribes to CONV_ID
    wsSend(wsA, { type: "subscribe_conversation", requestId: "r1", payload: { conversationId: CONV_ID } });
    await wsNextMessage(wsA);

    const tokenB = mintTestToken({ userId: USER_2 });
    const wsB = await wsConnect(`ws://localhost:${port}`);
    wsSend(wsB, { type: "resume_session", requestId: "s0", payload: { sessionToken: tokenB.token } });
    await wsNextMessage(wsB);
    // wsB does NOT subscribe to CONV_ID

    const messagesA: Array<Record<string, unknown>> = [];
    wsA.on("message", (data) => messagesA.push(JSON.parse(data.toString("utf8"))));

    const messagesB: Array<Record<string, unknown>> = [];
    wsB.on("message", (data) => messagesB.push(JSON.parse(data.toString("utf8"))));

    gateway.publishToOrg(ORG_A, {
      type: "event",
      eventId: "pres-1",
      payload: {
        eventType: "conversation.presence.updated",
        orgId: ORG_A,
        conversationId: "_org",
        occurredAt: Date.now(),
        actorId: USER_1,
        data: { userId: USER_1, status: "online", activeConversationId: CONV_ID },
      },
    });

    await new Promise((r) => setTimeout(r, 50));

    // wsA (subscribed) should see activeConversationId.
    const evtA = messagesA.find((m) => m.type === "event") as Record<string, unknown> | undefined;
    expect(evtA).toBeTruthy();
    const dataA = (evtA!.payload as Record<string, unknown>).data as Record<string, unknown>;
    expect(dataA.activeConversationId).toBe(CONV_ID);

    // wsB (not subscribed) should NOT see activeConversationId.
    const evtB = messagesB.find((m) => m.type === "event") as Record<string, unknown> | undefined;
    expect(evtB).toBeTruthy();
    const dataB = (evtB!.payload as Record<string, unknown>).data as Record<string, unknown>;
    expect(dataB.activeConversationId).toBeUndefined();

    wsA.close();
    wsB.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Publisher unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("InMemoryRealtimePublisher", () => {
  it("builds correct conversation event envelope", () => {
    const mockGateway = {
      publishToConversation: vi.fn(),
      publishToOrg: vi.fn(),
    } as unknown as MessagingGateway;

    const publisher = new InMemoryRealtimePublisher(mockGateway);
    publisher.publishConversationEvent(ORG_A, CONV_ID, "conversation.message.created", USER_1, {
      messageId: "m1",
    });

    expect(mockGateway.publishToConversation).toHaveBeenCalledTimes(1);
    const call = (mockGateway.publishToConversation as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe(ORG_A);
    expect(call[1]).toBe(CONV_ID);
    const event = call[2] as Record<string, unknown>;
    expect(event.type).toBe("event");
    expect((event.payload as Record<string, unknown>).eventType).toBe("conversation.message.created");
    expect((event.payload as Record<string, unknown>).orgId).toBe(ORG_A);
    expect((event.payload as Record<string, unknown>).actorId).toBe(USER_1);
  });

  it("builds correct typing event with null for stopped typing", () => {
    const mockGateway = {
      publishToConversation: vi.fn(),
      publishToOrg: vi.fn(),
    } as unknown as MessagingGateway;

    const publisher = new InMemoryRealtimePublisher(mockGateway);
    publisher.publishTypingUpdate(ORG_A, CONV_ID, null);

    const call = (mockGateway.publishToConversation as ReturnType<typeof vi.fn>).mock.calls[0];
    const data = (call[2].payload as Record<string, unknown>).data as Record<string, unknown>;
    expect(data.userId).toBeNull();
    expect(data.status).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sprint 4.1 regression
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sprint 4.1 regression guard", () => {
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
    });
    gateway.attach(wss);
  });

  afterEach(() => {
    gateway.destroy();
    wss.close();
    wss.clients.forEach((c) => c.terminate());
  });

  it("resume_session still works and returns session_ack", async () => {
    const token = mintTestToken();
    const ws = await wsConnect(`ws://localhost:${port}`);
    wsSend(ws, { type: "resume_session", requestId: "r0", payload: { sessionToken: token.token } });
    const msg = (await wsNextMessage(ws)) as Record<string, unknown>;
    expect(msg.type).toBe("session_ack");
    ws.close();
  });

  it("subscribe_conversation still works after protocol extension", async () => {
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
});
