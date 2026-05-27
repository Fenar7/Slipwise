/**
 * Internal Messaging Platform — Phase 3 Sprint 3.4
 * Audit completeness, governance safeguards, and phase-close hardening.
 *
 * Covers:
 * - Governance audit emission completeness for all sensitive mutations
 * - Audit metadata safety and normalization
 * - Admin/platform override audit behavior
 * - Access-denied handling remains safe and non-leaky
 * - Cross-org mutation denial
 * - Unauthorized governance action denial
 * - Invalid override denial
 * - Archived/locked governance edge cases
 * - Route-level 429 behavior for rate-limited messaging routes
 * - Safe route consistency for governance and read routes
 * - Authorization helper edge cases
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import "./local-setup";

function makeFn() {
  return vi.fn();
}

vi.mock("@/lib/db", () => {
  const conversation = {
    findFirst: makeFn(),
    findMany: makeFn(),
    create: makeFn(),
    update: makeFn(),
    count: makeFn(),
  };

  const conversationParticipant = {
    findFirst: makeFn(),
    findMany: makeFn(),
    createMany: makeFn(),
    create: makeFn(),
    update: makeFn(),
    count: makeFn(),
  };

  const conversationMessage = {
    findFirst: makeFn(),
    findMany: makeFn(),
    create: makeFn(),
    update: makeFn(),
    count: makeFn(),
  };

  const conversationThread = {
    findFirst: makeFn(),
    findMany: makeFn(),
    create: makeFn(),
    update: makeFn(),
  };

  const messageReaction = {
    findFirst: makeFn(),
    findMany: makeFn(),
    create: makeFn(),
    delete: makeFn(),
  };

  const messageMention = {
    findFirst: makeFn(),
    findMany: makeFn(),
    createMany: makeFn(),
    update: makeFn(),
  };

  const conversationReadState = {
    findFirst: makeFn(),
    upsert: makeFn(),
  };

  const messagingAuditEvent = {
    create: makeFn(),
  };

  const conversationAttachment = {
    createMany: makeFn(),
    findMany: makeFn(),
  };

  const db = {
    ...{
      conversation,
      conversationParticipant,
      conversationMessage,
      conversationThread,
      messageReaction,
      messageMention,
      conversationReadState,
      messagingAuditEvent,
      conversationAttachment,
    },
    $transaction: makeFn().mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => {
      return fn(db);
    }),
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
import { rateLimitByOrg, rateLimitByIp } from "@/lib/rate-limit";

// ─── Authorization layer imports ──────────────────────────────────────────────

import {
  evaluateGovernanceAccess,
  governanceMatrix,
} from "@/lib/messaging/authorization";

import type { ConversationRecord, ConversationParticipantRecord } from "@/lib/messaging/domain-types";

// ─── Audit imports ────────────────────────────────────────────────────────────

import { normalizeAuditMetadata } from "@/lib/messaging/audit";

// ─── API utils imports ────────────────────────────────────────────────────────

import {
  handleMessagingApiError,
  MessagingAccessDeniedError,
  MessagingAccessError,
  MessagingNotFoundError,
  MessagingApiError,
} from "@/app/api/messaging/_utils";

// ─── Service imports ───────────────────────────────────────────────────────────

import {
  archiveConversation,
  unarchiveConversation,
  renameConversation,
  changeConversationVisibility,
  lockConversation,
  unlockConversation,
} from "@/lib/messaging/conversation-service";

import {
  sendMessage,
  editMessage,
  softDeleteMessage,
} from "@/lib/messaging/message-service";

import {
  addParticipant,
  removeParticipant,
  updateParticipantRole,
} from "@/lib/messaging/participant-service";

import {
  addReaction,
  removeReaction,
} from "@/lib/messaging/reaction-service";

import {
  createThread,
  replyToThread,
  resolveThread,
} from "@/lib/messaging/thread-service";

// ─── Route imports ─────────────────────────────────────────────────────────────

import { PATCH as patchArchive } from "@/app/api/messaging/conversations/[id]/archive/route";
import { PATCH as patchUnarchive } from "@/app/api/messaging/conversations/[id]/unarchive/route";
import { PATCH as patchLock } from "@/app/api/messaging/conversations/[id]/lock/route";
import { PATCH as patchUnlock } from "@/app/api/messaging/conversations/[id]/unlock/route";
import { POST as postMessage } from "@/app/api/messaging/conversations/[id]/messages/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER_1 = "00000000-0000-0000-0000-000000000001";
const USER_2 = "00000000-0000-0000-0000-000000000002";
const USER_3 = "00000000-0000-0000-0000-000000000003";
const CONV_ID = "conv-001";
const MSG_ID = "msg-001";
const THREAD_ID = "thread-001";

function makeConversationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONV_ID,
    orgId: ORG_A,
    type: "CHANNEL" as const,
    name: "general",
    description: "Company-wide announcements",
    visibility: "PUBLIC" as const,
    dmPeerId: null,
    archivedAt: null,
    archivedBy: null,
    lockedAt: null,
    lockedBy: null,
    lockReason: null,
    createdBy: USER_1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeParticipantRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "part-001",
    orgId: ORG_A,
    conversationId: CONV_ID,
    userId: USER_1,
    role: "MEMBER" as const,
    leftAt: null,
    mutedUntil: null,
    displayName: null,
    isPinned: false,
    joinedAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeMessageRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MSG_ID,
    orgId: ORG_A,
    conversationId: CONV_ID,
    threadId: null,
    authorId: USER_1,
    body: "Hello world",
    contentMeta: null,
    status: "ACTIVE" as const,
    editedAt: null,
    deletedAt: null,
    participantCountAtSend: 5,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeThreadRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: THREAD_ID,
    orgId: ORG_A,
    conversationId: CONV_ID,
    anchorMessageId: MSG_ID,
    title: "Q2 discussion",
    replyCount: 3,
    resolvedAt: null,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeConversationRecord(overrides: Partial<Record<string, unknown>> = {}): ConversationRecord {
  return makeConversationRow(overrides) as unknown as ConversationRecord;
}

function makeParticipantRecord(overrides: Partial<Record<string, unknown>> = {}): ConversationParticipantRecord {
  return makeParticipantRow(overrides) as unknown as ConversationParticipantRecord;
}

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url), init);
}

// ─── Reset mocks ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  (getOrgContext as ReturnType<typeof vi.fn>).mockResolvedValue({
    userId: USER_1,
    orgId: ORG_A,
    role: "admin",
    representedId: null,
    proxyGrantId: null,
    proxyScope: [],
  });
});

// ─── Audit metadata safety tests ──────────────────────────────────────────────

describe("Sprint 3.4 — Audit metadata normalization", () => {
  it("strips null and undefined keys", () => {
    const result = normalizeAuditMetadata({ a: 1, b: null, c: undefined, d: "safe" });
    expect(result).toEqual({ a: 1, d: "safe" });
  });

  it("blocks unsafe keys by name heuristic", () => {
    const result = normalizeAuditMetadata({
      body: "secret message",
      content: "unsafe",
      token: "abc123",
      secret: "shh",
      password: "hunter2",
      attachmentPayload: Buffer.from("data"),
      providerInternal: { key: "val" },
      safeKey: "allowed",
    });
    expect(result).toEqual({ safeKey: "allowed" });
  });

  it("allows primitive-safe values only", () => {
    const result = normalizeAuditMetadata({
      str: "hello",
      num: 42,
      bool: true,
      date: new Date("2026-01-01"),
      obj: { nested: "bad" },
      arr: [1, 2, 3],
    });
    expect(result).toEqual({
      str: "hello",
      num: 42,
      bool: true,
      date: new Date("2026-01-01"),
    });
  });

  it("returns null for empty metadata", () => {
    expect(normalizeAuditMetadata({})).toBeNull();
  });

  it("returns null for null input", () => {
    expect(normalizeAuditMetadata(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeAuditMetadata(undefined)).toBeNull();
  });
});

describe("Sprint 3.4 — Governance audit emission completeness", () => {
  beforeEach(() => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversation.update.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "OWNER" }));
    db.conversationParticipant.findMany.mockResolvedValue([makeParticipantRow()]);
    db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
    db.conversationMessage.findMany.mockResolvedValue([makeMessageRow()]);
    db.conversationMessage.update.mockResolvedValue(makeMessageRow());
    db.conversationMessage.create.mockResolvedValue(makeMessageRow());
    db.conversationThread.findFirst.mockResolvedValue(makeThreadRow());
    db.conversationThread.create.mockResolvedValue(makeThreadRow());
    db.conversationThread.update.mockResolvedValue(makeThreadRow());
    db.messageReaction.findFirst.mockResolvedValue(null);
    db.messageReaction.create.mockResolvedValue({ id: "react-1", orgId: ORG_A, messageId: MSG_ID, userId: USER_1, type: "EMOJI", value: "👍", createdAt: new Date() });
    db.conversationParticipant.count.mockResolvedValue(2);
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("archiveConversation emits CONVERSATION_ARCHIVED", async () => {
    await archiveConversation({ orgId: ORG_A, conversationId: CONV_ID, archivedBy: USER_1 });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "CONVERSATION_ARCHIVED")).toBe(true);
  });

  it("unarchiveConversation emits CONVERSATION_UNARCHIVED", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }));
    await unarchiveConversation({ orgId: ORG_A, conversationId: CONV_ID, unarchivedBy: USER_1 });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "CONVERSATION_UNARCHIVED")).toBe(true);
  });

  it("renameConversation emits CONVERSATION_RENAMED", async () => {
    db.conversation.update.mockResolvedValue(makeConversationRow({ name: "new-name" }));
    await renameConversation({ orgId: ORG_A, conversationId: CONV_ID, name: "new-name", actorId: USER_1 });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "CONVERSATION_RENAMED")).toBe(true);
  });

  it("changeConversationVisibility emits CONVERSATION_VISIBILITY_CHANGED", async () => {
    db.conversation.update.mockResolvedValue(makeConversationRow({ visibility: "PRIVATE" }));
    await changeConversationVisibility({ orgId: ORG_A, conversationId: CONV_ID, visibility: "PRIVATE", actorId: USER_1 });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "CONVERSATION_VISIBILITY_CHANGED")).toBe(true);
  });

  it("lockConversation emits CONVERSATION_LOCKED", async () => {
    db.conversation.update.mockResolvedValue(makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }));
    await lockConversation({ orgId: ORG_A, conversationId: CONV_ID, lockedBy: USER_1 });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "CONVERSATION_LOCKED")).toBe(true);
  });

  it("unlockConversation emits CONVERSATION_UNLOCKED", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }));
    await unlockConversation({ orgId: ORG_A, conversationId: CONV_ID, unlockedBy: USER_1 });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "CONVERSATION_UNLOCKED")).toBe(true);
  });

  it("sendMessage emits MESSAGE_SENT", async () => {
    await sendMessage({ orgId: ORG_A, conversationId: CONV_ID, authorId: USER_1, body: "Hello" });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "MESSAGE_SENT")).toBe(true);
  });

  it("editMessage emits MESSAGE_EDITED", async () => {
    await editMessage({ orgId: ORG_A, messageId: MSG_ID, actorId: USER_1, body: "Edited" });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "MESSAGE_EDITED")).toBe(true);
  });

  it("softDeleteMessage emits MESSAGE_DELETED", async () => {
    await softDeleteMessage({ orgId: ORG_A, messageId: MSG_ID, actorId: USER_1 });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "MESSAGE_DELETED")).toBe(true);
  });

  it("addParticipant emits PARTICIPANT_ADDED", async () => {
    db.conversationParticipant.findFirst
      .mockResolvedValueOnce(makeParticipantRow({ role: "OWNER" })) // actor check
      .mockResolvedValueOnce(null); // target user check
    db.conversationParticipant.create.mockResolvedValue(makeParticipantRow({ id: "p-new", userId: USER_3 }));
    await addParticipant({ orgId: ORG_A, conversationId: CONV_ID, userId: USER_3, role: "MEMBER", addedBy: USER_1 });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "PARTICIPANT_ADDED")).toBe(true);
  });

  it("removeParticipant emits PARTICIPANT_REMOVED", async () => {
    db.conversationParticipant.findFirst
      .mockResolvedValueOnce(makeParticipantRow({ role: "OWNER" }))
      .mockResolvedValueOnce(makeParticipantRow({ userId: USER_2, role: "MEMBER" }));
    db.conversationParticipant.update.mockResolvedValue(makeParticipantRow({ userId: USER_2, leftAt: new Date() }));
    await removeParticipant({ orgId: ORG_A, conversationId: CONV_ID, userId: USER_2, removedBy: USER_1 });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "PARTICIPANT_REMOVED")).toBe(true);
  });

  it("updateParticipantRole emits PARTICIPANT_ROLE_CHANGED", async () => {
    db.conversationParticipant.findFirst
      .mockResolvedValueOnce(makeParticipantRow({ role: "OWNER" })) // actor check
      .mockResolvedValueOnce(makeParticipantRow({ userId: USER_2, role: "MEMBER" })); // target check
    db.conversationParticipant.update.mockResolvedValue(makeParticipantRow({ userId: USER_2, role: "ADMIN" }));
    await updateParticipantRole({ orgId: ORG_A, conversationId: CONV_ID, userId: USER_2, role: "ADMIN", updatedBy: USER_1 });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "PARTICIPANT_ROLE_CHANGED")).toBe(true);
  });

  it("addReaction emits REACTION_ADDED", async () => {
    await addReaction({ orgId: ORG_A, messageId: MSG_ID, userId: USER_1, value: "👍" });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "REACTION_ADDED")).toBe(true);
  });

  it("removeReaction emits REACTION_REMOVED", async () => {
    db.messageReaction.findFirst.mockResolvedValue({ id: "react-1", orgId: ORG_A, messageId: MSG_ID, userId: USER_1, type: "EMOJI", value: "👍", createdAt: new Date() });
    await removeReaction({ orgId: ORG_A, messageId: MSG_ID, userId: USER_1, value: "👍" });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "REACTION_REMOVED")).toBe(true);
  });

  it("createThread emits THREAD_CREATED", async () => {
    await createThread({ orgId: ORG_A, conversationId: CONV_ID, anchorMessageId: MSG_ID, createdBy: USER_1 });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "THREAD_CREATED")).toBe(true);
  });

  it("replyToThread emits THREAD_REPLIED", async () => {
    await replyToThread({ orgId: ORG_A, conversationId: CONV_ID, threadId: THREAD_ID, authorId: USER_1, body: "Reply" });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "THREAD_REPLIED")).toBe(true);
  });

  it("resolveThread emits THREAD_RESOLVED", async () => {
    await resolveThread({ orgId: ORG_A, threadId: THREAD_ID, resolvedBy: USER_1 });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    expect(calls.some((c) => (c[0].data as Record<string, unknown>).action === "THREAD_RESOLVED")).toBe(true);
  });
});

// ─── Access-denied diagnostics tests ──────────────────────────────────────────

describe("Sprint 3.4 — Access-denied diagnostics without leakage", () => {
  it("MessagingAccessDeniedError carries category but client sees safe message", async () => {
    const error = new MessagingAccessDeniedError("cross_org", "org boundary violation");
    const response = handleMessagingApiError(error);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.message).toBe("Access denied.");
    expect(body.error.code).toBe("FORBIDDEN");
    // The category must NOT appear in the client-facing body
    expect(JSON.stringify(body)).not.toContain("cross_org");
  });

  it("handleMessagingApiError logs structured diagnostics for MessagingAccessDeniedError", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = new MessagingAccessDeniedError("governance_role", "requires OWNER or ADMIN");
    handleMessagingApiError(error);
    expect(warnSpy).toHaveBeenCalledWith(
      "[api/messaging] Access denied (governance_role):",
      "requires OWNER or ADMIN",
    );
    warnSpy.mockRestore();
  });

  it("plain MessagingAccessError still returns safe 403", async () => {
    const error = new MessagingAccessError("governance action requires OWNER or ADMIN role");
    const response = handleMessagingApiError(error);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.message).toBe("Access denied.");
  });

  it("not-found errors do not leak denial detail", async () => {
    const error = new MessagingNotFoundError("Conversation not found or access denied.");
    const response = handleMessagingApiError(error);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.message).toBe("Conversation not found or access denied.");
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

// ─── Rate-limit tests ─────────────────────────────────────────────────────────

describe("Sprint 3.4 — Route-level rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversation.update.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "OWNER" }));
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("PATCH /archive returns 429 when org rate limit exceeded", async () => {
    vi.mocked(rateLimitByOrg).mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60000, retryAfter: 60 });
    vi.mocked(rateLimitByIp).mockResolvedValue({ success: true, remaining: 999 });

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/archive", {
      method: "PATCH",
    });
    const response = await patchArchive(request, { params: Promise.resolve({ id: CONV_ID }) });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("PATCH /unarchive returns 429 when IP rate limit exceeded", async () => {
    vi.mocked(rateLimitByOrg).mockResolvedValue({ success: true, remaining: 999 });
    vi.mocked(rateLimitByIp).mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60000, retryAfter: 60 });

    db.conversation.findFirst.mockResolvedValue(makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }));

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/unarchive", {
      method: "PATCH",
    });
    const response = await patchUnarchive(request, { params: Promise.resolve({ id: CONV_ID }) });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("PATCH /lock returns 429 when both limits exceeded", async () => {
    vi.mocked(rateLimitByOrg).mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60000, retryAfter: 60 });
    vi.mocked(rateLimitByIp).mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60000, retryAfter: 60 });

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/lock", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const response = await patchLock(request, { params: Promise.resolve({ id: CONV_ID }) });

    expect(response.status).toBe(429);
  });

  it("PATCH /unlock succeeds when rate limit is open", async () => {
    vi.mocked(rateLimitByOrg).mockResolvedValue({ success: true, remaining: 999 });
    vi.mocked(rateLimitByIp).mockResolvedValue({ success: true, remaining: 999 });

    db.conversation.findFirst.mockResolvedValue(makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }));

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/unlock", {
      method: "PATCH",
    });
    const response = await patchUnlock(request, { params: Promise.resolve({ id: CONV_ID }) });

    expect(response.status).toBe(200);
  });

  it("POST /messages returns 429 when send rate limit exceeded", async () => {
    vi.mocked(rateLimitByOrg).mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60000, retryAfter: 60 });
    vi.mocked(rateLimitByIp).mockResolvedValue({ success: true, remaining: 999 });

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/messages", {
      method: "POST",
      body: JSON.stringify({ body: "Hello" }),
    });
    const response = await postMessage(request, { params: Promise.resolve({ id: CONV_ID }) });

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });
});

// ─── Cross-org mutation denial tests ──────────────────────────────────────────

describe("Sprint 3.4 — Cross-org mutation denial", () => {
  beforeEach(() => {
    db.conversation.findFirst.mockResolvedValue(null);
  });

  it("lockConversation rejects cross-org", async () => {
    await expect(
      lockConversation({ orgId: ORG_B, conversationId: CONV_ID, lockedBy: USER_1 }),
    ).rejects.toThrow("lockConversation: conversation not found or access denied");
  });

  it("unlockConversation rejects cross-org", async () => {
    await expect(
      unlockConversation({ orgId: ORG_B, conversationId: CONV_ID, unlockedBy: USER_1 }),
    ).rejects.toThrow("unlockConversation: conversation not found or access denied");
  });

  it("unarchiveConversation rejects cross-org", async () => {
    await expect(
      unarchiveConversation({ orgId: ORG_B, conversationId: CONV_ID, unarchivedBy: USER_1 }),
    ).rejects.toThrow("unarchiveConversation: conversation not found or access denied");
  });
});

// ─── Unauthorized governance action denial ────────────────────────────────────

describe("Sprint 3.4 — Unauthorized governance action denial", () => {
  beforeEach(() => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "MEMBER" }));
  });

  it("MEMBER cannot archive", async () => {
    await expect(
      archiveConversation({ orgId: ORG_A, conversationId: CONV_ID, archivedBy: USER_1 }),
    ).rejects.toThrow("archiveConversation: governance action requires OWNER or ADMIN role");
  });

  it("MEMBER cannot lock", async () => {
    await expect(
      lockConversation({ orgId: ORG_A, conversationId: CONV_ID, lockedBy: USER_1 }),
    ).rejects.toThrow("lockConversation: governance action requires OWNER or ADMIN role");
  });

  it("MEMBER cannot unlock", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }));
    await expect(
      unlockConversation({ orgId: ORG_A, conversationId: CONV_ID, unlockedBy: USER_1 }),
    ).rejects.toThrow("unlockConversation: governance action requires OWNER or ADMIN role");
  });
});

// ─── Invalid override denial tests ────────────────────────────────────────────

describe("Sprint 3.4 — Invalid override denial", () => {
  it("plain MEMBER with org member role cannot archive via override", async () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "member",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "ARCHIVE");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("OWNER or ADMIN");
  });

  it("org admin cannot rename via override", async () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "admin",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "RENAME");
    expect(result.allowed).toBe(false);
    expect(governanceMatrix("RENAME").adminOverridable).toBe(false);
  });

  it("org admin cannot change visibility via override", async () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "admin",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "CHANGE_VISIBILITY");
    expect(result.allowed).toBe(false);
  });

  it("org admin cannot add participant via override", async () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "admin",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "ADD_PARTICIPANT");
    expect(result.allowed).toBe(false);
  });
});

// ─── Archived/locked lifecycle edge cases ───────────────────────────────────

describe("Sprint 3.4 — Archived/locked governance edge cases", () => {
  beforeEach(() => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "OWNER" }));
    db.conversation.update.mockResolvedValue(makeConversationRow());
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("cannot archive an already-archived conversation", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }));
    await expect(
      archiveConversation({ orgId: ORG_A, conversationId: CONV_ID, archivedBy: USER_1 }),
    ).rejects.toThrow("archiveConversation: conversation is archived");
  });

  it("cannot unarchive a non-archived conversation", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    await expect(
      unarchiveConversation({ orgId: ORG_A, conversationId: CONV_ID, unarchivedBy: USER_1 }),
    ).rejects.toThrow("unarchiveConversation: conversation is not archived");
  });

  it("cannot lock an already-locked conversation", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }));
    await expect(
      lockConversation({ orgId: ORG_A, conversationId: CONV_ID, lockedBy: USER_1 }),
    ).rejects.toThrow("lockConversation: conversation is locked");
  });

  it("cannot unlock a non-locked conversation", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    await expect(
      unlockConversation({ orgId: ORG_A, conversationId: CONV_ID, unlockedBy: USER_1 }),
    ).rejects.toThrow("unlockConversation: conversation is not locked");
  });

  it("cannot lock an archived conversation", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }));
    await expect(
      lockConversation({ orgId: ORG_A, conversationId: CONV_ID, lockedBy: USER_1 }),
    ).rejects.toThrow("lockConversation: conversation is archived");
  });

  it("cannot unlock an archived conversation even if locked", async () => {
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1, lockedAt: new Date(), lockedBy: USER_1 }),
    );
    await expect(
      unlockConversation({ orgId: ORG_A, conversationId: CONV_ID, unlockedBy: USER_1 }),
    ).rejects.toThrow("unlockConversation: conversation is archived");
  });

  it("governance actions blocked on archived conversation except unarchive", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }));

    await expect(
      renameConversation({ orgId: ORG_A, conversationId: CONV_ID, name: "new", actorId: USER_1 }),
    ).rejects.toThrow("renameConversation: conversation is archived");

    await expect(
      changeConversationVisibility({ orgId: ORG_A, conversationId: CONV_ID, visibility: "PRIVATE", actorId: USER_1 }),
    ).rejects.toThrow("changeConversationVisibility: conversation is archived");
  });
});

// ─── Route contract consistency ───────────────────────────────────────────────

describe("Sprint 3.4 — Route contract consistency for safe error surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimitByOrg).mockResolvedValue({ success: true, remaining: 999 });
    vi.mocked(rateLimitByIp).mockResolvedValue({ success: true, remaining: 999 });
    (getOrgContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: USER_1,
      orgId: ORG_A,
      role: "member",
      representedId: null,
      proxyGrantId: null,
      proxyScope: [],
    });
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "MEMBER" }));
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("PATCH /archive returns 403 (not 500) for MEMBER", async () => {
    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/archive", {
      method: "PATCH",
    });
    const response = await patchArchive(request, { params: Promise.resolve({ id: CONV_ID }) });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("Access denied.");
  });

  it("PATCH /lock returns 403 (not 500) for MEMBER", async () => {
    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/lock", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const response = await patchLock(request, { params: Promise.resolve({ id: CONV_ID }) });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.message).toBe("Access denied.");
  });

  it("PATCH /unlock returns 403 (not 500) for MEMBER", async () => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }));

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/unlock", {
      method: "PATCH",
    });
    const response = await patchUnlock(request, { params: Promise.resolve({ id: CONV_ID }) });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.message).toBe("Access denied.");
  });

  it("route errors do not include stack traces or internal details", async () => {
    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/archive", {
      method: "PATCH",
    });
    const response = await patchArchive(request, { params: Promise.resolve({ id: CONV_ID }) });
    const body = await response.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain("stack");
    expect(bodyStr).not.toContain("at ");
    expect(bodyStr).not.toContain("OWNER or ADMIN");
  });
});

// ─── Authorization helper edge cases ──────────────────────────────────────────

describe("Sprint 3.4 — Authorization helper edge cases", () => {
  it("evaluateGovernanceAccess allows platform admin to archive without membership", () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: null,
      orgRole: "member",
      isPlatformAdmin: true,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "ARCHIVE");
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("admin override");
  });

  it("evaluateGovernanceAccess denies platform admin on cross-org even without membership", () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ orgId: ORG_B }),
      orgRole: "member",
      isPlatformAdmin: true,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "ARCHIVE");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("org boundary violation");
  });

  it("evaluateGovernanceAccess respects lifecycle state over admin authority", () => {
    const conversation = makeConversationRecord({ archivedAt: new Date(), archivedBy: USER_1 });
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "admin",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "ARCHIVE");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("archived");
  });
});

// ─── Audit metadata does not leak sensitive content ───────────────────────────

describe("Sprint 3.4 — Audit metadata leakage prevention", () => {
  beforeEach(() => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversation.update.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "OWNER" }));
    db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
    db.conversationMessage.update.mockResolvedValue(makeMessageRow());
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("message edit audit does not include the new body", async () => {
    await editMessage({ orgId: ORG_A, messageId: MSG_ID, actorId: USER_1, body: "Sensitive updated body" });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    const editAudit = calls.find((c) => (c[0].data as Record<string, unknown>).action === "MESSAGE_EDITED");
    expect(editAudit).toBeDefined();
    const metadata = (editAudit![0].data as Record<string, unknown>).metadata as Record<string, unknown> | null;
    if (metadata) {
      expect(metadata).not.toHaveProperty("body");
      expect(metadata).not.toHaveProperty("content");
    }
  });

  it("lock audit does not include unsafe content blobs", async () => {
    await lockConversation({ orgId: ORG_A, conversationId: CONV_ID, lockedBy: USER_1, reason: "spam" });
    const calls = vi.mocked(db.messagingAuditEvent.create).mock.calls;
    const lockAudit = calls.find((c) => (c[0].data as Record<string, unknown>).action === "CONVERSATION_LOCKED");
    expect(lockAudit).toBeDefined();
    const metadata = (lockAudit![0].data as Record<string, unknown>).metadata as Record<string, unknown> | null;
    if (metadata) {
      expect(metadata).not.toHaveProperty("token");
      expect(metadata).not.toHaveProperty("secret");
    }
  });
});
