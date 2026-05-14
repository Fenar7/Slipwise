/**
 * Internal Messaging Platform — Phase 3 Sprint 3.2
 * Role-aware governance actions and admin/support control plane.
 *
 * Covers:
 * - Governance action matrix formalization
 * - Unarchive / lock / unlock service mutations
 * - Lifecycle state transitions (archive ↔ unarchive, lock ↔ unlock)
 * - Admin/support operational override (narrow, policy-bound)
 * - Audit metadata safety for governance actions
 * - DM governance constraints (archive/unarchive allowed, rename blocked)
 * - Route-level governance surface hardening
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

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

// ─── Authorization layer imports ──────────────────────────────────────────────

import {
  roleCanGovern,
  evaluateConversationAccess,
  evaluateGovernanceAccess,
  requireGovernanceAccess,
  canReadConversation,
  governanceMatrix,
} from "@/lib/messaging/authorization";

import type { ConversationRecord, ConversationParticipantRecord } from "@/lib/messaging/domain-types";

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
  addParticipant,
  removeParticipant,
  updateParticipantRole,
} from "@/lib/messaging/participant-service";

// ─── Route imports ─────────────────────────────────────────────────────────────

import { PATCH as patchLock } from "@/app/api/messaging/conversations/[id]/lock/route";
import { PATCH as patchUnlock } from "@/app/api/messaging/conversations/[id]/unlock/route";
import { PATCH as patchUnarchive } from "@/app/api/messaging/conversations/[id]/unarchive/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER_1 = "00000000-0000-0000-0000-000000000001";
const USER_2 = "00000000-0000-0000-0000-000000000002";
const USER_3 = "00000000-0000-0000-0000-000000000003";
const CONV_ID = "conv-001";

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

// ─── Governance matrix tests ──────────────────────────────────────────────────

describe("Sprint 3.2 — Governance action matrix", () => {
  it("marks all governance actions as requiring conversation governance role", () => {
    const governanceActions = [
      "ARCHIVE",
      "UNARCHIVE",
      "RENAME",
      "CHANGE_VISIBILITY",
      "LOCK",
      "UNLOCK",
      "ADD_PARTICIPANT",
      "REMOVE_PARTICIPANT",
      "CHANGE_PARTICIPANT_ROLE",
    ] as const;

    for (const action of governanceActions) {
      const matrix = governanceMatrix(action);
      expect(matrix.requiresConversationGovernanceRole).toBe(true);
    }
  });

  it("marks only operational actions as admin-overridable", () => {
    expect(governanceMatrix("ARCHIVE").adminOverridable).toBe(true);
    expect(governanceMatrix("UNARCHIVE").adminOverridable).toBe(true);
    expect(governanceMatrix("LOCK").adminOverridable).toBe(true);
    expect(governanceMatrix("UNLOCK").adminOverridable).toBe(true);
    expect(governanceMatrix("REMOVE_PARTICIPANT").adminOverridable).toBe(true);

    expect(governanceMatrix("RENAME").adminOverridable).toBe(false);
    expect(governanceMatrix("CHANGE_VISIBILITY").adminOverridable).toBe(false);
    expect(governanceMatrix("ADD_PARTICIPANT").adminOverridable).toBe(false);
    expect(governanceMatrix("CHANGE_PARTICIPANT_ROLE").adminOverridable).toBe(false);
  });

  it("allows OWNER to perform all governance actions", () => {
    const participant = makeParticipantRecord({ role: "OWNER" });

    const testCases: Array<{ action: ConversationAction; conversationOverrides: Partial<Record<string, unknown>> }> = [
      { action: "ARCHIVE", conversationOverrides: {} },
      { action: "UNARCHIVE", conversationOverrides: { archivedAt: new Date(), archivedBy: USER_1 } },
      { action: "RENAME", conversationOverrides: {} },
      { action: "CHANGE_VISIBILITY", conversationOverrides: {} },
      { action: "LOCK", conversationOverrides: {} },
      { action: "UNLOCK", conversationOverrides: { lockedAt: new Date(), lockedBy: USER_1 } },
      { action: "ADD_PARTICIPANT", conversationOverrides: {} },
      { action: "REMOVE_PARTICIPANT", conversationOverrides: {} },
      { action: "CHANGE_PARTICIPANT_ROLE", conversationOverrides: {} },
    ];

    for (const { action, conversationOverrides } of testCases) {
      const conversation = makeConversationRecord(conversationOverrides);
      const result = evaluateConversationAccess(conversation, participant, action);
      expect(result.allowed).toBe(true);
    }
  });

  it("allows ADMIN to perform all governance actions", () => {
    const participant = makeParticipantRecord({ role: "ADMIN" });

    const testCases: Array<{ action: ConversationAction; conversationOverrides: Partial<Record<string, unknown>> }> = [
      { action: "ARCHIVE", conversationOverrides: {} },
      { action: "UNARCHIVE", conversationOverrides: { archivedAt: new Date(), archivedBy: USER_1 } },
      { action: "RENAME", conversationOverrides: {} },
      { action: "CHANGE_VISIBILITY", conversationOverrides: {} },
      { action: "LOCK", conversationOverrides: {} },
      { action: "UNLOCK", conversationOverrides: { lockedAt: new Date(), lockedBy: USER_1 } },
      { action: "ADD_PARTICIPANT", conversationOverrides: {} },
      { action: "REMOVE_PARTICIPANT", conversationOverrides: {} },
      { action: "CHANGE_PARTICIPANT_ROLE", conversationOverrides: {} },
    ];

    for (const { action, conversationOverrides } of testCases) {
      const conversation = makeConversationRecord(conversationOverrides);
      const result = evaluateConversationAccess(conversation, participant, action);
      expect(result.allowed).toBe(true);
    }
  });

  it("denies MEMBER all governance actions", () => {
    const conversation = makeConversationRecord();
    const participant = makeParticipantRecord({ role: "MEMBER" });

    const actions = [
      "ARCHIVE",
      "UNARCHIVE",
      "RENAME",
      "CHANGE_VISIBILITY",
      "LOCK",
      "UNLOCK",
      "ADD_PARTICIPANT",
      "REMOVE_PARTICIPANT",
      "CHANGE_PARTICIPANT_ROLE",
    ] as const;

    for (const action of actions) {
      const result = evaluateConversationAccess(conversation, participant, action);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("OWNER or ADMIN");
    }
  });
});

// ─── Lifecycle transition tests ───────────────────────────────────────────────

describe("Sprint 3.2 — Lifecycle transitions", () => {
  beforeEach(() => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversation.update.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "OWNER" }));
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  describe("archive → unarchive", () => {
    it("unarchiveConversation restores an archived conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(
        makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }),
      );
      db.conversation.update.mockResolvedValue(
        makeConversationRow({ archivedAt: null, archivedBy: null }),
      );

      const result = await unarchiveConversation({
        orgId: ORG_A,
        conversationId: CONV_ID,
        unarchivedBy: USER_1,
      });

      expect(result.archivedAt).toBeNull();
      expect(result.archivedBy).toBeNull();
    });

    it("archiveConversation is blocked when already archived", async () => {
      db.conversation.findFirst.mockResolvedValue(
        makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }),
      );

      await expect(
        archiveConversation({
          orgId: ORG_A,
          conversationId: CONV_ID,
          archivedBy: USER_1,
        }),
      ).rejects.toThrow("archiveConversation: conversation is archived");
    });

    it("unarchiveConversation is blocked when not archived", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());

      await expect(
        unarchiveConversation({
          orgId: ORG_A,
          conversationId: CONV_ID,
          unarchivedBy: USER_1,
        }),
      ).rejects.toThrow("unarchiveConversation: conversation is not archived");
    });
  });

  describe("lock → unlock", () => {
    it("lockConversation locks an active conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());
      db.conversation.update.mockResolvedValue(
        makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1, lockReason: "spam" }),
      );

      const result = await lockConversation({
        orgId: ORG_A,
        conversationId: CONV_ID,
        lockedBy: USER_1,
        reason: "spam",
      });

      expect(result.lockedAt).not.toBeNull();
      expect(result.lockedBy).toBe(USER_1);
      expect(result.lockReason).toBe("spam");
    });

    it("unlockConversation unlocks a locked conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(
        makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1, lockReason: "spam" }),
      );
      db.conversation.update.mockResolvedValue(
        makeConversationRow({ lockedAt: null, lockedBy: null, lockReason: null }),
      );

      const result = await unlockConversation({
        orgId: ORG_A,
        conversationId: CONV_ID,
        unlockedBy: USER_1,
      });

      expect(result.lockedAt).toBeNull();
      expect(result.lockedBy).toBeNull();
      expect(result.lockReason).toBeNull();
    });

    it("lockConversation is blocked when already locked", async () => {
      db.conversation.findFirst.mockResolvedValue(
        makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }),
      );

      await expect(
        lockConversation({
          orgId: ORG_A,
          conversationId: CONV_ID,
          lockedBy: USER_1,
        }),
      ).rejects.toThrow("lockConversation: conversation is locked");
    });

    it("unlockConversation is blocked when not locked", async () => {
      db.conversation.findFirst.mockResolvedValue(makeConversationRow());

      await expect(
        unlockConversation({
          orgId: ORG_A,
          conversationId: CONV_ID,
          unlockedBy: USER_1,
        }),
      ).rejects.toThrow("unlockConversation: conversation is not locked");
    });

    it("lockConversation is blocked when archived", async () => {
      db.conversation.findFirst.mockResolvedValue(
        makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }),
      );

      await expect(
        lockConversation({
          orgId: ORG_A,
          conversationId: CONV_ID,
          lockedBy: USER_1,
        }),
      ).rejects.toThrow("lockConversation: conversation is archived");
    });

    it("unlockConversation is blocked when archived", async () => {
      db.conversation.findFirst.mockResolvedValue(
        makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1, lockedAt: new Date(), lockedBy: USER_1 }),
      );

      await expect(
        unlockConversation({
          orgId: ORG_A,
          conversationId: CONV_ID,
          unlockedBy: USER_1,
        }),
      ).rejects.toThrow("unlockConversation: conversation is archived");
    });
  });

  describe("ordinary mutations on locked conversations", () => {
    it("sendMessage blocked on locked conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(
        makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }),
      );

      const { sendMessage } = await import("@/lib/messaging/message-service");
      await expect(
        sendMessage({
          orgId: ORG_A,
          conversationId: CONV_ID,
          authorId: USER_1,
          body: "Hello",
        }),
      ).rejects.toThrow("sendMessage: conversation is locked");
    });
  });

  describe("governance on locked conversations", () => {
    it("rename blocked on locked conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(
        makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }),
      );

      await expect(
        renameConversation({
          orgId: ORG_A,
          conversationId: CONV_ID,
          name: "new-name",
          actorId: USER_1,
        }),
      ).rejects.toThrow("renameConversation: conversation is locked");
    });

    it("unlock allowed on locked conversation", async () => {
      db.conversation.findFirst.mockResolvedValue(
        makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }),
      );
      db.conversation.update.mockResolvedValue(
        makeConversationRow({ lockedAt: null, lockedBy: null }),
      );

      const result = await unlockConversation({
        orgId: ORG_A,
        conversationId: CONV_ID,
        unlockedBy: USER_1,
      });

      expect(result.lockedAt).toBeNull();
    });
  });
});

// ─── DM governance tests ──────────────────────────────────────────────────────

describe("Sprint 3.2 — DM governance constraints", () => {
  it("allows DM to be archived", () => {
    const conversation = makeConversationRecord({ type: "DM", name: null, visibility: null });
    const participant = makeParticipantRecord({ role: "OWNER" });
    const result = evaluateConversationAccess(conversation, participant, "ARCHIVE");
    expect(result.allowed).toBe(true);
  });

  it("allows DM to be unarchived", () => {
    const conversation = makeConversationRecord({
      type: "DM",
      name: null,
      visibility: null,
      archivedAt: new Date(),
      archivedBy: USER_1,
    });
    const participant = makeParticipantRecord({ role: "OWNER" });
    const result = evaluateConversationAccess(conversation, participant, "UNARCHIVE");
    expect(result.allowed).toBe(true);
  });

  it("allows DM to be locked", () => {
    const conversation = makeConversationRecord({ type: "DM", name: null, visibility: null });
    const participant = makeParticipantRecord({ role: "OWNER" });
    const result = evaluateConversationAccess(conversation, participant, "LOCK");
    expect(result.allowed).toBe(true);
  });

  it("allows DM to be unlocked", () => {
    const conversation = makeConversationRecord({
      type: "DM",
      name: null,
      visibility: null,
      lockedAt: new Date(),
      lockedBy: USER_1,
    });
    const participant = makeParticipantRecord({ role: "OWNER" });
    const result = evaluateConversationAccess(conversation, participant, "UNLOCK");
    expect(result.allowed).toBe(true);
  });

  it("blocks DM rename", () => {
    const conversation = makeConversationRecord({ type: "DM", name: null, visibility: null });
    const participant = makeParticipantRecord({ role: "OWNER" });
    const result = evaluateConversationAccess(conversation, participant, "RENAME");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("DM");
  });

  it("blocks DM visibility change", () => {
    const conversation = makeConversationRecord({ type: "DM", name: null, visibility: null });
    const participant = makeParticipantRecord({ role: "OWNER" });
    const result = evaluateConversationAccess(conversation, participant, "CHANGE_VISIBILITY");
    expect(result.allowed).toBe(false);
  });

  it("blocks DM add participant", () => {
    const conversation = makeConversationRecord({ type: "DM", name: null, visibility: null });
    const participant = makeParticipantRecord({ role: "OWNER" });
    const result = evaluateConversationAccess(conversation, participant, "ADD_PARTICIPANT");
    expect(result.allowed).toBe(false);
  });

  it("blocks DM remove participant", () => {
    const conversation = makeConversationRecord({ type: "DM", name: null, visibility: null });
    const participant = makeParticipantRecord({ role: "OWNER" });
    const result = evaluateConversationAccess(conversation, participant, "REMOVE_PARTICIPANT");
    expect(result.allowed).toBe(false);
  });
});

// ─── Admin/support override tests ─────────────────────────────────────────────

describe("Sprint 3.2 — Admin/support governance override", () => {
  it("allows org admin to archive without conversation governance role", () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "admin",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "ARCHIVE");
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("admin override");
  });

  it("allows platform admin to lock without conversation governance role", () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "member",
      isPlatformAdmin: true,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "LOCK");
    expect(result.allowed).toBe(true);
  });

  it("allows org admin to remove participant without conversation governance role", () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "admin",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "REMOVE_PARTICIPANT");
    expect(result.allowed).toBe(true);
  });

  it("denies org admin rename override", () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "admin",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "RENAME");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("OWNER or ADMIN");
  });

  it("denies org admin visibility change override", () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "admin",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "CHANGE_VISIBILITY");
    expect(result.allowed).toBe(false);
  });

  it("denies org admin add participant override", () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "admin",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "ADD_PARTICIPANT");
    expect(result.allowed).toBe(false);
  });

  it("denies org admin role change override", () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "admin",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "CHANGE_PARTICIPANT_ROLE");
    expect(result.allowed).toBe(false);
  });

  it("denies ordinary member with org member role", () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "member",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "ARCHIVE");
    expect(result.allowed).toBe(false);
  });

  it("admin override still respects org boundary", () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ orgId: ORG_B, role: "MEMBER" }),
      orgRole: "admin",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "ARCHIVE");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("org boundary violation");
  });

  it("admin override still respects archive state for archive action", () => {
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

  it("admin override allows unarchive on archived conversation", () => {
    const conversation = makeConversationRecord({ archivedAt: new Date(), archivedBy: USER_1 });
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "admin",
      isPlatformAdmin: false,
    };
    const result = evaluateGovernanceAccess(conversation, actor, "UNARCHIVE");
    expect(result.allowed).toBe(true);
  });

  it("requireGovernanceAccess throws when denied", () => {
    const conversation = makeConversationRecord();
    const actor = {
      participant: makeParticipantRecord({ role: "MEMBER" }),
      orgRole: "member",
      isPlatformAdmin: false,
    };
    expect(() => {
      requireGovernanceAccess(conversation, actor, "ARCHIVE", "test");
    }).toThrow("test: governance action requires OWNER or ADMIN role");
  });
});

// ─── Audit metadata safety tests ──────────────────────────────────────────────

describe("Sprint 3.2 — Audit metadata safety", () => {
  beforeEach(() => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversation.update.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "OWNER" }));
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("lockConversation emits audit with safe metadata", async () => {
    await lockConversation({
      orgId: ORG_A,
      conversationId: CONV_ID,
      lockedBy: USER_1,
      reason: "spam",
    });

    const auditCall = vi.mocked(db.messagingAuditEvent.create).mock.calls[0];
    const auditData = auditCall[0].data as Record<string, unknown>;
    expect(auditData.action).toBe("CONVERSATION_LOCKED");
    expect(auditData.actorId).toBe(USER_1);
    expect(auditData.conversationId).toBe(CONV_ID);
    expect(auditData.metadata).toEqual({ reason: "spam" });
  });

  it("unlockConversation emits audit without sensitive content", async () => {
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }),
    );
    db.conversation.update.mockResolvedValue(makeConversationRow());

    await unlockConversation({
      orgId: ORG_A,
      conversationId: CONV_ID,
      unlockedBy: USER_1,
    });

    const auditCall = vi.mocked(db.messagingAuditEvent.create).mock.calls[0];
    const auditData = auditCall[0].data as Record<string, unknown>;
    expect(auditData.action).toBe("CONVERSATION_UNLOCKED");
    expect(auditData.actorId).toBe(USER_1);
    // Prisma represents null metadata as DbNull; verify no sensitive payload is present
    expect(auditData.metadata).not.toHaveProperty("reason");
    expect(auditData.metadata).not.toHaveProperty("body");
    expect(auditData.metadata).not.toHaveProperty("attachments");
  });

  it("unarchiveConversation emits correct audit action", async () => {
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }),
    );
    db.conversation.update.mockResolvedValue(makeConversationRow());

    await unarchiveConversation({
      orgId: ORG_A,
      conversationId: CONV_ID,
      unarchivedBy: USER_1,
    });

    const auditCall = vi.mocked(db.messagingAuditEvent.create).mock.calls[0];
    const auditData = auditCall[0].data as Record<string, unknown>;
    expect(auditData.action).toBe("CONVERSATION_UNARCHIVED");
    expect(auditData.actorId).toBe(USER_1);
  });

  it("archiveConversation audit action unchanged", async () => {
    await archiveConversation({
      orgId: ORG_A,
      conversationId: CONV_ID,
      archivedBy: USER_1,
    });

    const auditCall = vi.mocked(db.messagingAuditEvent.create).mock.calls[0];
    const auditData = auditCall[0].data as Record<string, unknown>;
    expect(auditData.action).toBe("CONVERSATION_ARCHIVED");
  });
});

// ─── Route-level governance tests ─────────────────────────────────────────────

describe("Sprint 3.2 — Route-level governance surfaces", () => {
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
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversation.update.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "OWNER" }));
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("PATCH /lock returns 200 for OWNER", async () => {
    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/lock", {
      method: "PATCH",
      body: JSON.stringify({ reason: "spam" }),
    });
    const response = await patchLock(request, { params: Promise.resolve({ id: CONV_ID }) });
    expect(response.status).toBe(200);
  });

  it("PATCH /unlock returns 200 for OWNER", async () => {
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }),
    );
    db.conversation.update.mockResolvedValue(makeConversationRow());

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/unlock", {
      method: "PATCH",
    });
    const response = await patchUnlock(request, { params: Promise.resolve({ id: CONV_ID }) });
    expect(response.status).toBe(200);
  });

  it("PATCH /unarchive returns 200 for OWNER", async () => {
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }),
    );
    db.conversation.update.mockResolvedValue(makeConversationRow());

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/unarchive", {
      method: "PATCH",
    });
    const response = await patchUnarchive(request, { params: Promise.resolve({ id: CONV_ID }) });
    expect(response.status).toBe(200);
  });

  it("PATCH /lock returns 403 for MEMBER", async () => {
    (getOrgContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: USER_1,
      orgId: ORG_A,
      role: "member",
      representedId: null,
      proxyGrantId: null,
      proxyScope: [],
    });
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "MEMBER" }));

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/lock", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const response = await patchLock(request, { params: Promise.resolve({ id: CONV_ID }) });
    expect(response.status).toBe(403);
  });

  it("PATCH /unlock returns 403 for MEMBER", async () => {
    (getOrgContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: USER_1,
      orgId: ORG_A,
      role: "member",
      representedId: null,
      proxyGrantId: null,
      proxyScope: [],
    });
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ lockedAt: new Date(), lockedBy: USER_1 }),
    );
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "MEMBER" }));

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/unlock", {
      method: "PATCH",
    });
    const response = await patchUnlock(request, { params: Promise.resolve({ id: CONV_ID }) });
    expect(response.status).toBe(403);
  });

  it("PATCH /unarchive returns 403 for MEMBER", async () => {
    (getOrgContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: USER_1,
      orgId: ORG_A,
      role: "member",
      representedId: null,
      proxyGrantId: null,
      proxyScope: [],
    });
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ archivedAt: new Date(), archivedBy: USER_1 }),
    );
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "MEMBER" }));

    const request = makeRequest("http://localhost/api/messaging/conversations/conv-001/unarchive", {
      method: "PATCH",
    });
    const response = await patchUnarchive(request, { params: Promise.resolve({ id: CONV_ID }) });
    expect(response.status).toBe(403);
  });
});

// ─── Ownership invariant tests ────────────────────────────────────────────────

describe("Sprint 3.2 — Ownership invariants under governance", () => {
  beforeEach(() => {
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversation.update.mockResolvedValue(makeConversationRow());
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("removing sole owner is blocked even for OWNER self-removal", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "OWNER", userId: USER_1 }));
    db.conversationParticipant.count.mockResolvedValue(1);

    await expect(
      removeParticipant({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_1,
        removedBy: USER_1,
      }),
    ).rejects.toThrow("removeParticipant: cannot remove the sole owner");
  });

  it("demoting sole owner is blocked even for OWNER self-demotion", async () => {
    db.conversationParticipant.findFirst.mockResolvedValue(makeParticipantRow({ role: "OWNER", userId: USER_1 }));
    db.conversationParticipant.count.mockResolvedValue(1);

    await expect(
      updateParticipantRole({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_1,
        role: "ADMIN",
        updatedBy: USER_1,
      }),
    ).rejects.toThrow("updateParticipantRole: cannot demote the sole owner");
  });
});

describe("runtime override end-to-end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ visibility: "PUBLIC", archivedAt: new Date(), lockedAt: null }),
    );
    db.conversation.update.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(
      makeParticipantRow({ role: "MEMBER", userId: USER_1 }),
    );
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("ORG_ADMIN can unarchive via service even when only a MEMBER participant", async () => {
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ visibility: "PUBLIC", archivedAt: new Date(), lockedAt: null }),
    );
    db.conversationParticipant.findFirst.mockResolvedValue(
      makeParticipantRow({ role: "MEMBER", userId: USER_1 }),
    );

    const result = await unarchiveConversation({
      orgId: ORG_A,
      conversationId: CONV_ID,
      unarchivedBy: USER_1,
      actorOrgRole: "admin",
      isPlatformAdmin: false,
    });
    expect(result.id).toBe(CONV_ID);
    expect(db.conversation.update).toHaveBeenCalled();
  });

  it("PLATFORM_ADMIN can unlock via service even when not a participant at all", async () => {
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ visibility: "PUBLIC", archivedAt: null, lockedAt: new Date() }),
    );
    db.conversationParticipant.findFirst.mockResolvedValue(null);

    const result = await unlockConversation({
      orgId: ORG_A,
      conversationId: CONV_ID,
      unlockedBy: USER_1,
      actorOrgRole: "member",
      isPlatformAdmin: true,
    });
    expect(result.id).toBe(CONV_ID);
    expect(db.conversation.update).toHaveBeenCalled();
  });

  it("plain MEMBER without override is denied archive even if participant", async () => {
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ visibility: "PUBLIC", archivedAt: null, lockedAt: null }),
    );
    db.conversationParticipant.findFirst.mockResolvedValue(
      makeParticipantRow({ role: "MEMBER", userId: USER_1 }),
    );

    await expect(
      archiveConversation({
        orgId: ORG_A,
        conversationId: CONV_ID,
        archivedBy: USER_1,
        actorOrgRole: "member",
        isPlatformAdmin: false,
      }),
    ).rejects.toThrow("archiveConversation: governance action requires OWNER or ADMIN role");
  });
});

describe("addParticipant role-bypass prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.conversation.findFirst.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.create.mockResolvedValue(
      makeParticipantRow({ id: "p-new", role: "MEMBER" }),
    );
    db.conversationParticipant.update.mockResolvedValue(
      makeParticipantRow({ id: "p-existing", role: "ADMIN" }),
    );
    db.conversationParticipant.count.mockResolvedValue(2);
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("rejects adding an already-active participant with a different role", async () => {
    db.conversationParticipant.findFirst
      .mockResolvedValueOnce(makeParticipantRow({ role: "OWNER", userId: USER_1 }))
      .mockResolvedValueOnce(makeParticipantRow({ id: "p-existing", role: "MEMBER", leftAt: null }));

    await expect(
      addParticipant({
        orgId: ORG_A,
        conversationId: CONV_ID,
        userId: USER_2,
        role: "ADMIN",
        addedBy: USER_1,
      }),
    ).rejects.toThrow("addParticipant: participant already active with different role; use updateParticipantRole instead");
    expect(db.conversationParticipant.update).not.toHaveBeenCalled();
    expect(db.conversationParticipant.create).not.toHaveBeenCalled();
  });

  it("allows adding an already-active participant with the same role", async () => {
    db.conversationParticipant.findFirst
      .mockResolvedValueOnce(makeParticipantRow({ role: "OWNER", userId: USER_1 }))
      .mockResolvedValueOnce(makeParticipantRow({ id: "p-existing", role: "MEMBER", leftAt: null }));

    const result = await addParticipant({
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_2,
      role: "MEMBER",
      addedBy: USER_1,
    });

    expect(result.role).toBe("MEMBER");
    expect(db.conversationParticipant.update).not.toHaveBeenCalled();
    expect(db.conversationParticipant.create).not.toHaveBeenCalled();
  });

  it("reactivates with new role when participant had previously left", async () => {
    db.conversationParticipant.findFirst
      .mockResolvedValueOnce(makeParticipantRow({ role: "OWNER", userId: USER_1 }))
      .mockResolvedValueOnce(makeParticipantRow({ id: "p-left", role: "MEMBER", leftAt: new Date() }));

    const result = await addParticipant({
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_2,
      role: "ADMIN",
      addedBy: USER_1,
    });

    expect(db.conversationParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p-left" },
        data: expect.objectContaining({ leftAt: null, role: "ADMIN" }),
      }),
    );
    expect(result.role).toBe("ADMIN");
  });
});

describe("lock route reason validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.conversation.findFirst.mockResolvedValue(
      makeConversationRow({ visibility: "PUBLIC", archivedAt: null, lockedAt: null }),
    );
    db.conversation.update.mockResolvedValue(makeConversationRow());
    db.conversationParticipant.findFirst.mockResolvedValue(
      makeParticipantRow({ role: "OWNER", userId: USER_1 }),
    );
    db.messagingAuditEvent.create.mockResolvedValue({});
  });

  it("rejects lock reason over 100 characters", async () => {
    const request = makeRequest(`http://localhost/api/messaging/conversations/${CONV_ID}/lock`, {
      method: "PATCH",
      body: JSON.stringify({ reason: "a".repeat(101) }),
    });
    const response = await patchLock(request, { params: Promise.resolve({ id: CONV_ID }) });
    expect(response.status).toBe(422);
  });

  it("accepts lock reason at exactly 100 characters", async () => {
    const request = makeRequest(`http://localhost/api/messaging/conversations/${CONV_ID}/lock`, {
      method: "PATCH",
      body: JSON.stringify({ reason: "a".repeat(100) }),
    });
    const response = await patchLock(request, { params: Promise.resolve({ id: CONV_ID }) });
    expect(response.status).toBe(200);
  });

  it("treats whitespace-only reason as null", async () => {
    const request = makeRequest(`http://localhost/api/messaging/conversations/${CONV_ID}/lock`, {
      method: "PATCH",
      body: JSON.stringify({ reason: "   " }),
    });
    const response = await patchLock(request, { params: Promise.resolve({ id: CONV_ID }) });
    expect(response.status).toBe(200);
  });

  it("accepts empty body (no reason)", async () => {
    const request = makeRequest(`http://localhost/api/messaging/conversations/${CONV_ID}/lock`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const response = await patchLock(request, { params: Promise.resolve({ id: CONV_ID }) });
    expect(response.status).toBe(200);
  });
});
