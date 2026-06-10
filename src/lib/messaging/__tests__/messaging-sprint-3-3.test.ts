/**
 * Internal Messaging Platform — Phase 3 Sprint 3.3
 * Read/API enforcement, safe visibility, and restricted-state behavior.
 *
 * Covers:
 * - Hardened read-model layer with policy-aware reads
 * - Route-level denied versus not-found behavior (404 for reads)
 * - Restricted-state response behavior for removed members, non-participants,
 *   private conversations, and cross-org actors
 * - Pagination and filtering safety (no indirect leakage)
 * - Consistent response body shapes across read surfaces
 * - Cross-org boundary hardening on all read paths
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import "./local-setup";

beforeEach(() => {
  (global as any).__mockActiveMembership = true;
});

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

import { db } from "@/lib/db";
import { getOrgContext } from "@/lib/auth";

// ─── Read-model imports ───────────────────────────────────────────────────────

import {
  listConversationSummariesForUser,
  getConversationDetail,
  getMessageDetail,
} from "@/lib/messaging/read-models";

// ─── API route imports ────────────────────────────────────────────────────────

import { GET as getConversationsList } from "@/app/api/messaging/conversations/route";
import { GET as getConversationDetailRoute } from "@/app/api/messaging/conversations/[id]/route";
import { GET as getMessages } from "@/app/api/messaging/conversations/[id]/messages/route";
import { GET as getParticipants } from "@/app/api/messaging/conversations/[id]/participants/route";
import { GET as getThreads } from "@/app/api/messaging/conversations/[id]/threads/route";

// ─── Service imports for cross-org tests ──────────────────────────────────────

import { listConversationMessages } from "@/lib/messaging/message-service";
import { listParticipantsForConversation } from "@/lib/messaging/participant-service";
import { listThreadsForConversation, listThreadReplies } from "@/lib/messaging/thread-service";

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

// ─── Conversation list safety ─────────────────────────────────────────────────

describe("Sprint 3.3 — Conversation list safety", () => {
  beforeEach(() => {
    db.conversation.findMany.mockResolvedValue([makeConversationRow()]);
    db.conversationParticipant.count.mockResolvedValue(3);
    db.conversationMessage.findFirst.mockResolvedValue({ createdAt: new Date() });
    db.conversationReadState.findFirst.mockResolvedValue({ unreadCount: 0 });
  });

  it("active participant sees conversations they belong to", async () => {
    db.conversation.findMany.mockResolvedValue([
      makeConversationRow({ id: "conv-001", name: "general" }),
      makeConversationRow({ id: "conv-002", name: "random" }),
    ]);

    const result = await listConversationSummariesForUser(ORG_A, USER_1);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("conv-001");
  });

  it("removed member does not see removed conversation in list", async () => {
    db.conversation.findMany.mockResolvedValue([]);

    const result = await listConversationSummariesForUser(ORG_A, USER_2);
    expect(result).toHaveLength(0);
  });

  it("cross-org actor sees nothing across org boundary", async () => {
    db.conversation.findMany.mockResolvedValue([]);

    const result = await listConversationSummariesForUser(ORG_B, USER_1);
    expect(result).toHaveLength(0);
  });

  it("pagination limit is bounded and safe", async () => {
    const request = makeRequest(
      "http://localhost/api/messaging/conversations?limit=200",
    );
    const response = await getConversationsList(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    // limit should be clamped to 100 by parsePagination
    expect(body.data.meta.limit).toBeLessThanOrEqual(100);
  });

  it("pagination hasMore does not leak hidden conversations", async () => {
    db.conversation.findMany.mockResolvedValue([
      makeConversationRow(),
    ]);

    const request = makeRequest(
      "http://localhost/api/messaging/conversations?limit=50",
    );
    const response = await getConversationsList(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.conversations).toHaveLength(1);
    // hasMore is false when fewer results than limit
    expect(body.data.meta.hasMore).toBe(false);
  });
});

// ─── Conversation detail safety ───────────────────────────────────────────────

describe("Sprint 3.3 — Conversation detail safety", () => {
  beforeEach(() => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findMany.mockResolvedValue([makeParticipantRow()]);
    db.conversationMessage.findMany.mockResolvedValue([makeMessageRow()]);
    db.conversationThread.findMany.mockResolvedValue([makeThreadRow()]);
    db.conversationReadState.findFirst.mockResolvedValue(null);
    db.messageReaction.findMany.mockResolvedValue([]);
    db.conversationAttachment.findMany.mockResolvedValue([]);
  });

  it("active participant can fetch detail", async () => {
    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const response = await getConversationDetailRoute(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(CONV_ID);
  });

  it("removed member gets 404 (hidden existence)", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const response = await getConversationDetailRoute(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Conversation not found or access denied.");
  });

  it("non-participant org member gets 404", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const response = await getConversationDetailRoute(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("cross-org actor gets 404", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);
    db.conversation.findFirst.mockResolvedValue(null);

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const response = await getConversationDetailRoute(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("archived conversation is still readable for participant", async () => {
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }),
    );

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const response = await getConversationDetailRoute(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.archivedAt).not.toBeNull();
  });

  it("locked conversation is still readable for participant", async () => {
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }),
    );

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const response = await getConversationDetailRoute(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.lockedAt).not.toBeNull();
  });

  it("detail response does not include unsafe internal fields", async () => {
    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const response = await getConversationDetailRoute(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    const body = await response.json();
    expect(body.data).not.toHaveProperty("dmPeerId");
    expect(body.data).not.toHaveProperty("archivedBy");
    expect(body.data).not.toHaveProperty("lockedBy");
  });
});

// ─── Messages read safety ─────────────────────────────────────────────────────

describe("Sprint 3.3 — Messages read safety", () => {
  beforeEach(() => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationMessage.findMany.mockResolvedValue([makeMessageRow()]);
  });

  it("active participant can list messages", async () => {
    const request = makeRequest(
      "http://localhost/api/messaging/conversations/conv-001/messages",
    );
    const response = await getMessages(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.messages).toHaveLength(1);
  });

  it("removed member cannot list messages (404)", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const request = makeRequest(
      "http://localhost/api/messaging/conversations/conv-001/messages",
    );
    const response = await getMessages(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("non-participant cannot list messages (404)", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const request = makeRequest(
      "http://localhost/api/messaging/conversations/conv-001/messages",
    );
    const response = await getMessages(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(404);
  });

  it("message list pagination hasMore is safe", async () => {
    db.conversationMessage.findMany.mockResolvedValue([
      makeMessageRow(),
      makeMessageRow({ id: "msg-002" }),
    ]);

    const request = makeRequest(
      "http://localhost/api/messaging/conversations/conv-001/messages?limit=2",
    );
    const response = await getMessages(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    const body = await response.json();
    expect(body.data.meta.hasMore).toBe(true);
    expect(body.data.meta.limit).toBe(2);
  });

  it("getMessageDetail returns null for non-participant", async () => {
    db.conversationMessage.findFirst.mockResolvedValue(makeMessageRow());
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const result = await getMessageDetail(ORG_A, MSG_ID, USER_3);
    expect(result).toBeNull();
  });

  it("getMessageDetail returns null when message does not exist", async () => {
    db.conversationMessage.findFirst.mockResolvedValue(null);

    const result = await getMessageDetail(ORG_A, "msg-missing", USER_1);
    expect(result).toBeNull();
  });
});

// ─── Participants read safety ─────────────────────────────────────────────────

describe("Sprint 3.3 — Participants read safety", () => {
  beforeEach(() => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationParticipant.findMany.mockResolvedValue([makeParticipantRow()]);
  });

  it("active participant can list participants", async () => {
    const request = makeRequest(
      "http://localhost/api/messaging/conversations/conv-001/participants",
    );
    const response = await getParticipants(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.participants).toHaveLength(1);
  });

  it("non-participant cannot enumerate participants (404)", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const request = makeRequest(
      "http://localhost/api/messaging/conversations/conv-001/participants",
    );
    const response = await getParticipants(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("removed member cannot enumerate participants (404)", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const request = makeRequest(
      "http://localhost/api/messaging/conversations/conv-001/participants",
    );
    const response = await getParticipants(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(404);
  });
});

// ─── Threads read safety ──────────────────────────────────────────────────────

describe("Sprint 3.3 — Threads read safety", () => {
  beforeEach(() => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversationThread.findMany.mockResolvedValue([makeThreadRow()]);
  });

  it("active participant can list threads", async () => {
    const request = makeRequest(
      "http://localhost/api/messaging/conversations/conv-001/threads",
    );
    const response = await getThreads(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.threads).toHaveLength(1);
  });

  it("non-participant cannot list threads (404)", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const request = makeRequest(
      "http://localhost/api/messaging/conversations/conv-001/threads",
    );
    const response = await getThreads(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("listThreadReplies rejects cross-conversation thread id", async () => {
    db.conversationThread.findFirst.mockResolvedValue(null);

    await expect(
      listThreadReplies(ORG_A, CONV_ID, "foreign-thread", USER_1),
    ).rejects.toThrow("listThreadReplies: thread not found or does not belong to conversation");
  });

  it("listThreadReplies rejects when participant not in thread's actual conversation", async () => {
    db.conversationThread.findFirst.mockResolvedValue(
      makeThreadRow({ conversationId: "conv-foreign" }),
    );
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    await expect(
      listThreadReplies(ORG_A, CONV_ID, THREAD_ID, USER_1),
    ).rejects.toThrow("listThreadReplies: active participant access required");
  });
});

// ─── Cross-org negative tests ─────────────────────────────────────────────────

describe("Sprint 3.3 — Cross-org read boundary enforcement", () => {
  beforeEach(() => {
    db.conversation.findFirst.mockResolvedValue(null);
    db.conversationParticipant.findFirst.mockResolvedValue(null);
  });

  it("listConversationSummariesForUser isolates across orgs", async () => {
    db.conversation.findMany.mockResolvedValue([]);

    const result = await listConversationSummariesForUser(ORG_B, USER_1);
    expect(result).toHaveLength(0);
  });

  it("getConversationDetail isolates across orgs", async () => {
    const result = await getConversationDetail(ORG_B, CONV_ID, USER_1);
    expect(result).toBeNull();
  });

  it("listConversationMessages isolates across orgs", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    await expect(
      listConversationMessages(ORG_B, CONV_ID, USER_1),
    ).rejects.toThrow("active participant access required");
  });

  it("listParticipantsForConversation isolates across orgs", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    await expect(
      listParticipantsForConversation(ORG_B, CONV_ID, USER_1),
    ).rejects.toThrow("active participant access required");
  });

  it("listThreadsForConversation isolates across orgs", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    await expect(
      listThreadsForConversation(ORG_B, CONV_ID, USER_1),
    ).rejects.toThrow("active participant access required");
  });

  it("route GET detail returns 404 for cross-org access", async () => {
    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const response = await getConversationDetailRoute(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(404);
  });

  it("route GET messages returns 404 for cross-org access", async () => {
    const request = makeRequest(
      "http://localhost/api/messaging/conversations/conv-001/messages",
    );
    const response = await getMessages(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(404);
  });
});

// ─── Restricted-state behavior ────────────────────────────────────────────────

describe("Sprint 3.3 — Restricted-state behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removed member gets identical 404 to non-existent conversation", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());

    // Removed member
    const removedRequest = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const removedResponse = await getConversationDetailRoute(removedRequest, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    // Non-existent conversation
    db.conversation.findFirst.mockResolvedValue(null);
    const missingRequest = makeRequest("http://localhost/api/messaging/conversations/conv-999");
    const missingResponse = await getConversationDetailRoute(missingRequest, {
      params: Promise.resolve({ id: "conv-999" }),
    });

    expect(removedResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);

    const removedBody = await removedResponse.json();
    const missingBody = await missingResponse.json();

    expect(removedBody.error.code).toBe(missingBody.error.code);
    expect(removedBody.error.message).toBe(missingBody.error.message);
  });

  it("private conversation is hidden from non-participants", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ visibility: "PRIVATE" }),
    );

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const response = await getConversationDetailRoute(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(404);
  });

  it("archived conversation remains readable for active participant", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }),
    );
    db.conversationParticipant.findMany.mockResolvedValue([makeParticipantRow()]);
    db.conversationMessage.findMany.mockResolvedValue([makeMessageRow()]);
    db.conversationThread.findMany.mockResolvedValue([makeThreadRow()]);
    db.conversationReadState.findFirst.mockResolvedValue(null);
    db.messageReaction.findMany.mockResolvedValue([]);
    db.conversationAttachment.findMany.mockResolvedValue([]);

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const response = await getConversationDetailRoute(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.archivedAt).not.toBeNull();
  });

  it("locked conversation remains readable for active participant", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }),
    );
    db.conversationParticipant.findMany.mockResolvedValue([makeParticipantRow()]);
    db.conversationMessage.findMany.mockResolvedValue([makeMessageRow()]);
    db.conversationThread.findMany.mockResolvedValue([makeThreadRow()]);
    db.conversationReadState.findFirst.mockResolvedValue(null);
    db.messageReaction.findMany.mockResolvedValue([]);
    db.conversationAttachment.findMany.mockResolvedValue([]);

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001");
    const response = await getConversationDetailRoute(request, {
      params: Promise.resolve({ id: CONV_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.lockedAt).not.toBeNull();
  });
});

// ─── Route contract consistency ───────────────────────────────────────────────

describe("Sprint 3.3 — Route contract consistency", () => {
  beforeEach(() => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);
  });

  it("all read routes return identical 404 shape for unauthorized access", async () => {
    const routes = [
      {
        name: "detail",
        request: makeRequest("http://localhost/api/messaging/conversations/conv-001"),
        handler: () =>
          getConversationDetailRoute(
            makeRequest("http://localhost/api/messaging/conversations/conv-001"),
            { params: Promise.resolve({ id: CONV_ID }) },
          ),
      },
      {
        name: "messages",
        request: makeRequest(
          "http://localhost/api/messaging/conversations/conv-001/messages",
        ),
        handler: () =>
          getMessages(
            makeRequest("http://localhost/api/messaging/conversations/conv-001/messages"),
            { params: Promise.resolve({ id: CONV_ID }) },
          ),
      },
      {
        name: "participants",
        request: makeRequest(
          "http://localhost/api/messaging/conversations/conv-001/participants",
        ),
        handler: () =>
          getParticipants(
            makeRequest(
              "http://localhost/api/messaging/conversations/conv-001/participants",
            ),
            { params: Promise.resolve({ id: CONV_ID }) },
          ),
      },
      {
        name: "threads",
        request: makeRequest(
          "http://localhost/api/messaging/conversations/conv-001/threads",
        ),
        handler: () =>
          getThreads(
            makeRequest(
              "http://localhost/api/messaging/conversations/conv-001/threads",
            ),
            { params: Promise.resolve({ id: CONV_ID }) },
          ),
      },
    ];

    for (const route of routes) {
      const response = await route.handler();
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Conversation not found or access denied.");
    }
  });

  it("invalid limit param is clamped safely", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversation.findMany.mockResolvedValue([]);

    const request = makeRequest(
      "http://localhost/api/messaging/conversations?limit=999999",
    );
    const response = await getConversationsList(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.meta.limit).toBe(100);
  });

  it("negative limit param is clamped to minimum 1", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow());
    db.conversation.findMany.mockResolvedValue([]);

    const request = makeRequest(
      "http://localhost/api/messaging/conversations?limit=-5",
    );
    const response = await getConversationsList(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.meta.limit).toBe(1);
  });
});

// ─── Service-layer read safety ────────────────────────────────────────────────

describe("Sprint 3.3 — Service-layer read safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listConversationMessages throws on missing membership", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    await expect(
      listConversationMessages(ORG_A, CONV_ID, USER_3),
    ).rejects.toThrow("active participant access required");
  });

  it("listParticipantsForConversation throws on missing membership", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    await expect(
      listParticipantsForConversation(ORG_A, CONV_ID, USER_3),
    ).rejects.toThrow("active participant access required");
  });

  it("listThreadsForConversation throws on missing membership", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    await expect(
      listThreadsForConversation(ORG_A, CONV_ID, USER_3),
    ).rejects.toThrow("active participant access required");
  });
});
