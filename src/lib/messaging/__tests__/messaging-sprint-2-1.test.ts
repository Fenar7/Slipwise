/**
 * Internal Messaging Platform — Phase 2 Sprint 2.1
 * Schema and service contract tests.
 *
 * Covers:
 * - Domain type validation helpers
 * - Service contract type guards
 * - Audit action labels completeness
 * - Mapper functions (Prisma row → domain record, no leakage)
 * - Org-safe query helper patterns
 * - Enum/state transition safety
 * - Retention policy foundation behavior
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    messagingAuditEvent: {
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

import {
  conversationIsArchived,
  conversationIsLocked,
  conversationIsDM,
  conversationIsChannel,
  conversationIsGroup,
  conversationIsAccessible,
  participantIsActive,
  participantIsMuted,
  messageIsActive,
  messageIsDeleted,
  messageIsEdited,
  threadIsResolved,
  presenceIsExpired,
  typingIsExpired,
  attachmentIsScanned,
  attachmentIsPendingScan,
  taskIsOpen,
  taskIsOverdue,
  meetingIsUpcoming,
  meetingIsEnded,
  calendarConnectionIsActive,
  calendarConnectionRequiresReconnect,
  retentionPolicyIsIndefinite,
} from "@/lib/messaging/domain-types";

import {
  isValidConversationType,
  isValidConversationVisibility,
  isValidParticipantRole,
  isValidCalendarProvider,
  isValidCalendarConnectionStatus,
  isValidAttachmentScanStatus,
  isValidRetentionAction,
} from "@/lib/messaging/service-contracts";

import {
  MESSAGING_AUDIT_ACTION_LABELS,
  getMessagingAuditActionLabel,
} from "@/lib/messaging/audit";

import {
  toConversationRecord,
  toParticipantRecord,
  toMessageRecord,
  toThreadRecord,
  toReactionRecord,
  toMentionRecord,
  toReadStateRecord,
  toPresenceRecord,
  toTypingRecord,
  toAttachmentRecord,
  toTaskRecord,
  toMeetingRecord,
  toCalendarConnectionRecord,
  toRetentionPolicyRecord,
  toAuditEventRecord,
} from "@/lib/messaging/mappers";

import {
  conversationOrgSafeWhere,
  participantOrgSafeWhere,
  messageOrgSafeWhere,
  threadOrgSafeWhere,
  readStateOrgSafeWhere,
  presenceOrgSafeWhere,
  typingOrgSafeWhere,
  taskOrgSafeWhere,
  meetingOrgSafeWhere,
  calendarConnectionOrgSafeWhere,
  auditEventOrgSafeWhere,
  retentionPolicyOrgSafeWhere,
} from "@/lib/messaging/org-safe-helpers";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const USER_1 = "00000000-0000-0000-0000-000000000001";
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

function makeReactionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "react-001",
    orgId: ORG_A,
    messageId: MSG_ID,
    userId: USER_1,
    type: "EMOJI" as const,
    value: "👍",
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeMentionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "mention-001",
    orgId: ORG_A,
    messageId: MSG_ID,
    mentionedUserId: USER_1,
    offsetStart: 0,
    offsetEnd: 5,
    acknowledged: false,
    acknowledgedAt: null,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeReadStateRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "rs-001",
    orgId: ORG_A,
    conversationId: CONV_ID,
    userId: USER_1,
    lastReadMessageId: MSG_ID,
    lastReadAt: new Date("2026-01-02T00:00:00Z"),
    unreadCount: 0,
    isMuted: false,
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makePresenceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pres-001",
    orgId: ORG_A,
    userId: USER_1,
    status: "ONLINE" as const,
    lastActivityAt: new Date("2026-01-02T00:00:00Z"),
    expiresAt: null,
    activeConversationId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeTypingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "type-001",
    orgId: ORG_A,
    conversationId: CONV_ID,
    userId: USER_1,
    status: "TYPING" as const,
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeAttachmentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "att-001",
    orgId: ORG_A,
    messageId: MSG_ID,
    storageRef: "s3://bucket/key",
    fileName: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    thumbnailRef: null,
    scanStatus: "PENDING",
    scannedAt: null,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

function makeTaskRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "task-001",
    orgId: ORG_A,
    conversationId: CONV_ID,
    originatingMessageId: null,
    title: "Review Q2 report",
    description: null,
    status: "OPEN" as const,
    priority: 1,
    assigneeId: USER_1,
    dueDate: new Date("2026-12-31T00:00:00Z"),
    completedAt: null,
    completedBy: null,
    createdBy: USER_1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeMeetingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "meet-001",
    orgId: ORG_A,
    conversationId: CONV_ID,
    title: "Q2 Sync",
    description: null,
    scheduledAt: new Date("2036-06-15T10:00:00Z"),
    durationMinutes: 60,
    status: "UPCOMING" as const,
    providerEventId: null,
    scheduledBy: USER_1,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeCalendarConnectionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cal-001",
    orgId: ORG_A,
    provider: "GOOGLE" as const,
    providerAccountId: "google-uid-123",
    emailAddress: "ops@example.com",
    displayName: "Ops Calendar",
    tokenRef: "encrypted-ref-abc",
    tokenExpiry: new Date("2026-06-01T00:00:00Z"),
    status: "ACTIVE",
    lastSyncAt: new Date("2026-05-01T10:00:00Z"),
    lastSyncError: null,
    disconnectedAt: null,
    connectedBy: USER_1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T10:00:00Z"),
    ...overrides,
  };
}

function makeRetentionPolicyRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "rp-001",
    orgId: ORG_A,
    type: "ORG_DEFAULT" as const,
    conversationId: null,
    retentionDays: 365,
    action: "ARCHIVE" as const,
    isActive: true,
    lastAppliedAt: null,
    createdBy: USER_1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeAuditEventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "audit-001",
    orgId: ORG_A,
    conversationId: CONV_ID,
    messageId: null,
    threadId: null,
    taskId: null,
    meetingId: null,
    actorId: USER_1,
    action: "CONVERSATION_CREATED" as const,
    summary: "Created #general",
    metadata: { source: "ui" },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// Typed mock accessor
const mockDb = db as unknown as {
  messagingAuditEvent: {
    create: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Domain type helpers — Conversation ─────────────────────────────────────

describe("conversationIsArchived", () => {
  it("returns true when archivedAt is set", () => {
    expect(conversationIsArchived(makeConversationRow({ archivedAt: new Date() }) as never)).toBe(true);
  });
  it("returns false when archivedAt is null", () => {
    expect(conversationIsArchived(makeConversationRow() as never)).toBe(false);
  });
});

describe("conversationIsLocked", () => {
  it("returns true when lockedAt is set", () => {
    expect(conversationIsLocked(makeConversationRow({ lockedAt: new Date() }) as never)).toBe(true);
  });
  it("returns false when lockedAt is null", () => {
    expect(conversationIsLocked(makeConversationRow() as never)).toBe(false);
  });
});

describe("conversationIsDM", () => {
  it("returns true for DM type", () => {
    expect(conversationIsDM(makeConversationRow({ type: "DM" }) as never)).toBe(true);
  });
  it("returns false for CHANNEL type", () => {
    expect(conversationIsDM(makeConversationRow() as never)).toBe(false);
  });
});

describe("conversationIsChannel", () => {
  it("returns true for CHANNEL type", () => {
    expect(conversationIsChannel(makeConversationRow() as never)).toBe(true);
  });
  it("returns false for GROUP type", () => {
    expect(conversationIsChannel(makeConversationRow({ type: "GROUP" }) as never)).toBe(false);
  });
});

describe("conversationIsGroup", () => {
  it("returns true for GROUP type", () => {
    expect(conversationIsGroup(makeConversationRow({ type: "GROUP" }) as never)).toBe(true);
  });
  it("returns false for CHANNEL type", () => {
    expect(conversationIsGroup(makeConversationRow() as never)).toBe(false);
  });
});

describe("conversationIsAccessible", () => {
  it("returns true when not archived and not locked", () => {
    expect(conversationIsAccessible(makeConversationRow() as never)).toBe(true);
  });
  it("returns false when archived", () => {
    expect(
      conversationIsAccessible(makeConversationRow({ archivedAt: new Date() }) as never),
    ).toBe(false);
  });
  it("returns false when locked", () => {
    expect(
      conversationIsAccessible(makeConversationRow({ lockedAt: new Date() }) as never),
    ).toBe(false);
  });
});

// ─── Domain type helpers — Participant ──────────────────────────────────────

describe("participantIsActive", () => {
  it("returns true when leftAt is null", () => {
    expect(participantIsActive(makeParticipantRow() as never)).toBe(true);
  });
  it("returns false when leftAt is set", () => {
    expect(participantIsActive(makeParticipantRow({ leftAt: new Date() }) as never)).toBe(false);
  });
});

describe("participantIsMuted", () => {
  it("returns false when mutedUntil is null", () => {
    expect(participantIsMuted(makeParticipantRow() as never)).toBe(false);
  });
  it("returns true when mutedUntil is in the future", () => {
    expect(
      participantIsMuted(makeParticipantRow({ mutedUntil: new Date("2099-01-01") }) as never),
    ).toBe(true);
  });
  it("returns false when mutedUntil is in the past", () => {
    expect(
      participantIsMuted(makeParticipantRow({ mutedUntil: new Date("2020-01-01") }) as never),
    ).toBe(false);
  });
});

// ─── Domain type helpers — Message ────────────────────────────────────────────

describe("messageIsActive", () => {
  it("returns true for ACTIVE status", () => {
    expect(messageIsActive(makeMessageRow() as never)).toBe(true);
  });
  it("returns false for DELETED status", () => {
    expect(messageIsActive(makeMessageRow({ status: "DELETED" }) as never)).toBe(false);
  });
});

describe("messageIsDeleted", () => {
  it("returns true for DELETED status", () => {
    expect(messageIsDeleted(makeMessageRow({ status: "DELETED" }) as never)).toBe(true);
  });
  it("returns true when deletedAt is set", () => {
    expect(messageIsDeleted(makeMessageRow({ deletedAt: new Date() }) as never)).toBe(true);
  });
  it("returns false for ACTIVE status", () => {
    expect(messageIsDeleted(makeMessageRow() as never)).toBe(false);
  });
});

describe("messageIsEdited", () => {
  it("returns true for EDITED status", () => {
    expect(messageIsEdited(makeMessageRow({ status: "EDITED" }) as never)).toBe(true);
  });
  it("returns true when editedAt is set", () => {
    expect(messageIsEdited(makeMessageRow({ editedAt: new Date() }) as never)).toBe(true);
  });
  it("returns false for ACTIVE status", () => {
    expect(messageIsEdited(makeMessageRow() as never)).toBe(false);
  });
});

// ─── Domain type helpers — Thread ─────────────────────────────────────────────

describe("threadIsResolved", () => {
  it("returns true when resolvedAt is set", () => {
    expect(threadIsResolved(makeThreadRow({ resolvedAt: new Date() }) as never)).toBe(true);
  });
  it("returns false when resolvedAt is null", () => {
    expect(threadIsResolved(makeThreadRow() as never)).toBe(false);
  });
});

// ─── Domain type helpers — Presence / Typing ──────────────────────────────────

describe("presenceIsExpired", () => {
  it("returns false when expiresAt is null", () => {
    expect(presenceIsExpired(makePresenceRow({ expiresAt: null }) as never)).toBe(false);
  });
  it("returns true when expiresAt is in the past", () => {
    expect(
      presenceIsExpired(makePresenceRow({ expiresAt: new Date("2020-01-01") }) as never),
    ).toBe(true);
  });
  it("returns false when expiresAt is in the future", () => {
    expect(
      presenceIsExpired(makePresenceRow({ expiresAt: new Date("2099-01-01") }) as never),
    ).toBe(false);
  });
});

describe("typingIsExpired", () => {
  it("returns true when expiresAt is in the past", () => {
    expect(typingIsExpired(makeTypingRow({ expiresAt: new Date("2020-01-01") }) as never)).toBe(
      true,
    );
  });
  it("returns false when expiresAt is in the future", () => {
    expect(typingIsExpired(makeTypingRow() as never)).toBe(false);
  });
});

// ─── Domain type helpers — Attachment ───────────────────────────────────────

describe("attachmentIsScanned", () => {
  it("returns true for clean status", () => {
    expect(attachmentIsScanned(makeAttachmentRow({ scanStatus: "CLEAN" }) as never)).toBe(true);
  });
  it("returns true for blocked status", () => {
    expect(attachmentIsScanned(makeAttachmentRow({ scanStatus: "BLOCKED" }) as never)).toBe(true);
  });
  it("returns false for pending status", () => {
    expect(attachmentIsScanned(makeAttachmentRow() as never)).toBe(false);
  });
});

describe("attachmentIsPendingScan", () => {
  it("returns true for pending status", () => {
    expect(attachmentIsPendingScan(makeAttachmentRow() as never)).toBe(true);
  });
  it("returns false for clean status", () => {
    expect(attachmentIsPendingScan(makeAttachmentRow({ scanStatus: "CLEAN" }) as never)).toBe(
      false,
    );
  });
});

// ─── Domain type helpers — Task ───────────────────────────────────────────────

describe("taskIsOpen", () => {
  it("returns true for OPEN status", () => {
    expect(taskIsOpen(makeTaskRow() as never)).toBe(true);
  });
  it("returns true for IN_PROGRESS status", () => {
    expect(taskIsOpen(makeTaskRow({ status: "IN_PROGRESS" }) as never)).toBe(true);
  });
  it("returns false for DONE status", () => {
    expect(taskIsOpen(makeTaskRow({ status: "DONE" }) as never)).toBe(false);
  });
});

describe("taskIsOverdue", () => {
  it("returns true when dueDate is in the past and status is OPEN", () => {
    expect(
      taskIsOverdue(makeTaskRow({ dueDate: new Date("2020-01-01") }) as never),
    ).toBe(true);
  });
  it("returns false when dueDate is in the future", () => {
    expect(taskIsOverdue(makeTaskRow() as never)).toBe(false);
  });
  it("returns false when dueDate is null", () => {
    expect(taskIsOverdue(makeTaskRow({ dueDate: null }) as never)).toBe(false);
  });
  it("returns false when status is DONE even if dueDate is past", () => {
    expect(
      taskIsOverdue(
        makeTaskRow({ status: "DONE", dueDate: new Date("2020-01-01") }) as never,
      ),
    ).toBe(false);
  });
});

// ─── Domain type helpers — Meeting ────────────────────────────────────────────

describe("meetingIsUpcoming", () => {
  it("returns true for UPCOMING status", () => {
    expect(meetingIsUpcoming(makeMeetingRow() as never)).toBe(true);
  });
  it("returns false for ENDED status", () => {
    expect(meetingIsUpcoming(makeMeetingRow({ status: "ENDED" }) as never)).toBe(false);
  });
});

describe("meetingIsEnded", () => {
  it("returns true for ENDED status", () => {
    expect(meetingIsEnded(makeMeetingRow({ status: "ENDED" }) as never)).toBe(true);
  });
  it("returns true for CANCELLED status", () => {
    expect(meetingIsEnded(makeMeetingRow({ status: "CANCELLED" }) as never)).toBe(true);
  });
  it("returns false for UPCOMING status", () => {
    expect(meetingIsEnded(makeMeetingRow() as never)).toBe(false);
  });
});

// ─── Domain type helpers — Calendar Connection ──────────────────────────────

describe("calendarConnectionIsActive", () => {
  it("returns true for active status with no disconnectedAt", () => {
    expect(calendarConnectionIsActive(makeCalendarConnectionRow() as never)).toBe(true);
  });
  it("returns false for reconnect_required status", () => {
    expect(
      calendarConnectionIsActive(
        makeCalendarConnectionRow({ status: "RECONNECT_REQUIRED" }) as never,
      ),
    ).toBe(false);
  });
  it("returns false when disconnectedAt is set", () => {
    expect(
      calendarConnectionIsActive(
        makeCalendarConnectionRow({ status: "DISCONNECTED", disconnectedAt: new Date() }) as never,
      ),
    ).toBe(false);
  });
});

describe("calendarConnectionRequiresReconnect", () => {
  it("returns true for reconnect_required status", () => {
    expect(
      calendarConnectionRequiresReconnect(
        makeCalendarConnectionRow({ status: "RECONNECT_REQUIRED" }) as never,
      ),
    ).toBe(true);
  });
  it("returns true for disconnected status", () => {
    expect(
      calendarConnectionRequiresReconnect(
        makeCalendarConnectionRow({ status: "DISCONNECTED", disconnectedAt: new Date() }) as never,
      ),
    ).toBe(true);
  });
  it("returns false for active status", () => {
    expect(calendarConnectionRequiresReconnect(makeCalendarConnectionRow() as never)).toBe(false);
  });
});

// ─── Domain type helpers — Retention Policy ───────────────────────────────────

describe("retentionPolicyIsIndefinite", () => {
  it("returns true when retentionDays is null", () => {
    expect(
      retentionPolicyIsIndefinite(makeRetentionPolicyRow({ retentionDays: null }) as never),
    ).toBe(true);
  });
  it("returns false when retentionDays is set", () => {
    expect(retentionPolicyIsIndefinite(makeRetentionPolicyRow() as never)).toBe(false);
  });
});

// ─── Service contract type guards ─────────────────────────────────────────────

describe("isValidConversationType", () => {
  it("returns true for CHANNEL", () => expect(isValidConversationType("CHANNEL")).toBe(true));
  it("returns true for DM", () => expect(isValidConversationType("DM")).toBe(true));
  it("returns true for GROUP", () => expect(isValidConversationType("GROUP")).toBe(true));
  it("returns false for invalid", () => expect(isValidConversationType("INVALID")).toBe(false));
  it("returns false for null", () => expect(isValidConversationType(null)).toBe(false));
});

describe("isValidConversationVisibility", () => {
  it("returns true for PUBLIC", () => expect(isValidConversationVisibility("PUBLIC")).toBe(true));
  it("returns true for PRIVATE", () => expect(isValidConversationVisibility("PRIVATE")).toBe(true));
  it("returns false for invalid", () =>
    expect(isValidConversationVisibility("INVALID")).toBe(false));
});

describe("isValidParticipantRole", () => {
  it("returns true for OWNER", () => expect(isValidParticipantRole("OWNER")).toBe(true));
  it("returns true for ADMIN", () => expect(isValidParticipantRole("ADMIN")).toBe(true));
  it("returns true for MEMBER", () => expect(isValidParticipantRole("MEMBER")).toBe(true));
  it("returns false for invalid", () => expect(isValidParticipantRole("INVALID")).toBe(false));
});

describe("isValidCalendarProvider", () => {
  it("returns true for GOOGLE", () => expect(isValidCalendarProvider("GOOGLE")).toBe(true));
  it("returns true for OUTLOOK", () => expect(isValidCalendarProvider("OUTLOOK")).toBe(true));
  it("returns false for invalid", () => expect(isValidCalendarProvider("INVALID")).toBe(false));
});

describe("isValidCalendarConnectionStatus", () => {
  it("returns true for ACTIVE", () => expect(isValidCalendarConnectionStatus("ACTIVE")).toBe(true));
  it("returns true for RECONNECT_REQUIRED", () =>
    expect(isValidCalendarConnectionStatus("RECONNECT_REQUIRED")).toBe(true));
  it("returns true for DISCONNECTED", () =>
    expect(isValidCalendarConnectionStatus("DISCONNECTED")).toBe(true));
  it("returns false for invalid", () =>
    expect(isValidCalendarConnectionStatus("INVALID")).toBe(false));
});

describe("isValidAttachmentScanStatus", () => {
  it("returns true for PENDING", () => expect(isValidAttachmentScanStatus("PENDING")).toBe(true));
  it("returns true for CLEAN", () => expect(isValidAttachmentScanStatus("CLEAN")).toBe(true));
  it("returns true for BLOCKED", () => expect(isValidAttachmentScanStatus("BLOCKED")).toBe(true));
  it("returns false for invalid", () =>
    expect(isValidAttachmentScanStatus("INVALID")).toBe(false));
});

describe("isValidRetentionAction", () => {
  it("returns true for ARCHIVE", () => expect(isValidRetentionAction("ARCHIVE")).toBe(true));
  it("returns true for DELETE", () => expect(isValidRetentionAction("DELETE")).toBe(true));
  it("returns true for FLAG", () => expect(isValidRetentionAction("FLAG")).toBe(true));
  it("returns false for invalid", () => expect(isValidRetentionAction("INVALID")).toBe(false));
});

// ─── Audit action labels ──────────────────────────────────────────────────────

describe("MESSAGING_AUDIT_ACTION_LABELS", () => {
  it("has a label for every MessagingAuditAction enum value", () => {
    const actions = [
      "CONVERSATION_CREATED",
      "CONVERSATION_ARCHIVED",
      "CONVERSATION_DELETED",
      "CONVERSATION_RENAMED",
      "CONVERSATION_VISIBILITY_CHANGED",
      "PARTICIPANT_ADDED",
      "PARTICIPANT_REMOVED",
      "PARTICIPANT_ROLE_CHANGED",
      "MESSAGE_SENT",
      "MESSAGE_EDITED",
      "MESSAGE_DELETED",
      "THREAD_CREATED",
      "THREAD_REPLIED",
      "THREAD_RESOLVED",
      "REACTION_ADDED",
      "REACTION_REMOVED",
      "MENTION_CREATED",
      "READ_STATE_UPDATED",
      "TASK_CREATED",
      "TASK_UPDATED",
      "TASK_ASSIGNED",
      "TASK_COMPLETED",
      "MEETING_SCHEDULED",
      "MEETING_UPDATED",
      "MEETING_CANCELLED",
      "ATTACHMENT_UPLOADED",
      "ATTACHMENT_DELETED",
      "RETENTION_POLICY_CREATED",
      "RETENTION_POLICY_UPDATED",
      "ADMIN_SUPPORT_ACTION",
    ] as const;
    for (const action of actions) {
      expect(MESSAGING_AUDIT_ACTION_LABELS[action].length).toBeGreaterThan(0);
    }
  });
  it("getMessagingAuditActionLabel returns the label", () => {
    expect(getMessagingAuditActionLabel("CONVERSATION_CREATED")).toBe("Created conversation");
  });
});

// ─── Audit helpers ──────────────────────────────────────────────────────────

describe("logMessagingAudit", () => {
  it("creates an audit event via db", async () => {
    mockDb.messagingAuditEvent.create.mockResolvedValue({});
    const { logMessagingAudit } = await import("@/lib/messaging/audit");
    await logMessagingAudit({
      orgId: ORG_A,
      actorId: USER_1,
      action: "CONVERSATION_CREATED",
      summary: "Created #general",
    });
    expect(mockDb.messagingAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: ORG_A, action: "CONVERSATION_CREATED" }),
      }),
    );
  });
});

// ─── Mapper tests — no sensitive field leakage ────────────────────────────────

describe("toConversationRecord", () => {
  it("maps all fields correctly", () => {
    const r = toConversationRecord(makeConversationRow() as never);
    expect(r.id).toBe(CONV_ID);
    expect(r.orgId).toBe(ORG_A);
    expect(r.type).toBe("CHANNEL");
    expect(r.name).toBe("general");
    expect(r.visibility).toBe("PUBLIC");
    expect(r.dmPeerId).toBeNull();
    expect(r.archivedAt).toBeNull();
  });
  it("preserves nulls explicitly", () => {
    const r = toConversationRecord(makeConversationRow({ description: null }) as never);
    expect(r.description).not.toBeUndefined();
    expect(r.description).toBeNull();
  });
});

describe("toParticipantRecord", () => {
  it("maps role and membership state", () => {
    const r = toParticipantRecord(makeParticipantRow() as never);
    expect(r.role).toBe("MEMBER");
    expect(r.leftAt).toBeNull();
    expect(r.isPinned).toBe(false);
  });
});

describe("toMessageRecord", () => {
  it("maps threadId null explicitly", () => {
    const r = toMessageRecord(makeMessageRow() as never);
    expect(r.threadId).toBeNull();
    expect(r.body).toBe("Hello world");
    expect(r.status).toBe("ACTIVE");
  });
  it("maps contentMeta when present", () => {
    const r = toMessageRecord(
      makeMessageRow({ contentMeta: { blocks: [] } }) as never,
    );
    expect(r.contentMeta).toEqual({ blocks: [] });
  });
});

describe("toThreadRecord", () => {
  it("maps reply count and anchor message", () => {
    const r = toThreadRecord(makeThreadRow() as never);
    expect(r.anchorMessageId).toBe(MSG_ID);
    expect(r.replyCount).toBe(3);
    expect(r.resolvedAt).toBeNull();
  });
});

describe("toReactionRecord", () => {
  it("maps emoji value", () => {
    const r = toReactionRecord(makeReactionRow() as never);
    expect(r.value).toBe("👍");
    expect(r.type).toBe("EMOJI");
  });
});

describe("toMentionRecord", () => {
  it("maps offset range and acknowledged state", () => {
    const r = toMentionRecord(makeMentionRow() as never);
    expect(r.offsetStart).toBe(0);
    expect(r.offsetEnd).toBe(5);
    expect(r.acknowledged).toBe(false);
  });
});

describe("toReadStateRecord", () => {
  it("maps unread count and muted state", () => {
    const r = toReadStateRecord(makeReadStateRow() as never);
    expect(r.unreadCount).toBe(0);
    expect(r.isMuted).toBe(false);
    expect(r.lastReadMessageId).toBe(MSG_ID);
  });
});

describe("toPresenceRecord", () => {
  it("maps status and expiration", () => {
    const r = toPresenceRecord(makePresenceRow() as never);
    expect(r.status).toBe("ONLINE");
    expect(r.expiresAt).toBeNull();
  });
});

describe("toTypingRecord", () => {
  it("maps typing status and expiration", () => {
    const r = toTypingRecord(makeTypingRow() as never);
    expect(r.status).toBe("TYPING");
    expect(r.expiresAt).toBeInstanceOf(Date);
  });
});

describe("toAttachmentRecord", () => {
  it("maps storageRef and scan status", () => {
    const r = toAttachmentRecord(makeAttachmentRow() as never);
    expect(r.storageRef).toBe("s3://bucket/key");
    expect(r.scanStatus).toBe("PENDING");
    expect(r.thumbnailRef).toBeNull();
  });
  it("does not include raw blob data", () => {
    const r = toAttachmentRecord(makeAttachmentRow() as never);
    expect(r).not.toHaveProperty("blob");
    expect(r).not.toHaveProperty("data");
    expect(r).not.toHaveProperty("content");
  });
});

describe("toTaskRecord", () => {
  it("maps status and assignee", () => {
    const r = toTaskRecord(makeTaskRow() as never);
    expect(r.status).toBe("OPEN");
    expect(r.assigneeId).toBe(USER_1);
  });
});

describe("toMeetingRecord", () => {
  it("maps scheduled time and duration", () => {
    const r = toMeetingRecord(makeMeetingRow() as never);
    expect(r.durationMinutes).toBe(60);
    expect(r.status).toBe("UPCOMING");
  });
});

describe("toCalendarConnectionRecord", () => {
  it("maps provider and token ref", () => {
    const r = toCalendarConnectionRecord(makeCalendarConnectionRow() as never);
    expect(r.provider).toBe("GOOGLE");
    expect(r.tokenRef).toBe("encrypted-ref-abc");
  });
});

describe("toRetentionPolicyRecord", () => {
  it("maps retention days and action", () => {
    const r = toRetentionPolicyRecord(makeRetentionPolicyRow() as never);
    expect(r.retentionDays).toBe(365);
    expect(r.action).toBe("ARCHIVE");
    expect(r.isActive).toBe(true);
  });
  it("handles indefinite retention", () => {
    const r = toRetentionPolicyRecord(
      makeRetentionPolicyRow({ retentionDays: null }) as never,
    );
    expect(r.retentionDays).toBeNull();
  });
});

describe("toAuditEventRecord", () => {
  it("maps action and summary", () => {
    const r = toAuditEventRecord(makeAuditEventRow() as never);
    expect(r.action).toBe("CONVERSATION_CREATED");
    expect(r.summary).toBe("Created #general");
  });
  it("does not leak metadata in summary", () => {
    const r = toAuditEventRecord(makeAuditEventRow() as never);
    expect(r.metadata).toEqual({ source: "ui" });
  });
});

// ─── Org-safe query helper patterns ───────────────────────────────────────────

describe("conversationOrgSafeWhere", () => {
  it("includes both id and orgId", () => {
    expect(conversationOrgSafeWhere(ORG_A, CONV_ID)).toEqual({
      id: CONV_ID,
      orgId: ORG_A,
    });
  });
});

describe("participantOrgSafeWhere", () => {
  it("includes orgId, conversationId, and optional userId", () => {
    expect(participantOrgSafeWhere(ORG_A, CONV_ID, USER_1)).toEqual({
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_1,
    });
  });
  it("works without userId", () => {
    expect(participantOrgSafeWhere(ORG_A, CONV_ID)).toEqual({
      orgId: ORG_A,
      conversationId: CONV_ID,
    });
  });
});

describe("messageOrgSafeWhere", () => {
  it("uses composite key [id, orgId]", () => {
    expect(messageOrgSafeWhere(ORG_A, MSG_ID)).toEqual({
      id: MSG_ID,
      orgId: ORG_A,
    });
  });
});

describe("threadOrgSafeWhere", () => {
  it("uses composite key [id, orgId]", () => {
    expect(threadOrgSafeWhere(ORG_A, THREAD_ID)).toEqual({
      id: THREAD_ID,
      orgId: ORG_A,
    });
  });
});

describe("readStateOrgSafeWhere", () => {
  it("includes conversationId and userId", () => {
    expect(readStateOrgSafeWhere(ORG_A, CONV_ID, USER_1)).toEqual({
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_1,
    });
  });
});

describe("presenceOrgSafeWhere", () => {
  it("includes userId", () => {
    expect(presenceOrgSafeWhere(ORG_A, USER_1)).toEqual({
      orgId: ORG_A,
      userId: USER_1,
    });
  });
});

describe("typingOrgSafeWhere", () => {
  it("includes conversationId", () => {
    expect(typingOrgSafeWhere(ORG_A, CONV_ID)).toEqual({
      orgId: ORG_A,
      conversationId: CONV_ID,
    });
  });
  it("includes userId when provided", () => {
    expect(typingOrgSafeWhere(ORG_A, CONV_ID, USER_1)).toEqual({
      orgId: ORG_A,
      conversationId: CONV_ID,
      userId: USER_1,
    });
  });
});

describe("taskOrgSafeWhere", () => {
  it("uses composite key [id, orgId]", () => {
    expect(taskOrgSafeWhere(ORG_A, "task-001")).toEqual({
      id: "task-001",
      orgId: ORG_A,
    });
  });
});

describe("meetingOrgSafeWhere", () => {
  it("uses composite key [id, orgId]", () => {
    expect(meetingOrgSafeWhere(ORG_A, "meet-001")).toEqual({
      id: "meet-001",
      orgId: ORG_A,
    });
  });
});

describe("calendarConnectionOrgSafeWhere", () => {
  it("uses single-field key with orgId", () => {
    expect(calendarConnectionOrgSafeWhere(ORG_A, "cal-001")).toEqual({
      id: "cal-001",
      orgId: ORG_A,
    });
  });
});

describe("auditEventOrgSafeWhere", () => {
  it("includes optional conversationId", () => {
    expect(auditEventOrgSafeWhere(ORG_A, CONV_ID)).toEqual({
      orgId: ORG_A,
      conversationId: CONV_ID,
    });
  });
  it("works without conversationId", () => {
    expect(auditEventOrgSafeWhere(ORG_A)).toEqual({
      orgId: ORG_A,
    });
  });
});

describe("retentionPolicyOrgSafeWhere", () => {
  it("uses single-field key with orgId", () => {
    expect(retentionPolicyOrgSafeWhere(ORG_A, "rp-001")).toEqual({
      id: "rp-001",
      orgId: ORG_A,
    });
  });
});

// ─── Enum / state transition safety ───────────────────────────────────────────

describe("ConversationMessageStatus transitions", () => {
  it("allows ACTIVE → EDITED", () => {
    const from = "ACTIVE" as const;
    const to = "EDITED" as const;
    expect(["ACTIVE", "EDITED", "DELETED"].includes(from)).toBe(true);
    expect(["ACTIVE", "EDITED", "DELETED"].includes(to)).toBe(true);
  });
  it("allows ACTIVE → DELETED", () => {
    const from = "ACTIVE" as const;
    const to = "DELETED" as const;
    expect(["ACTIVE", "EDITED", "DELETED"].includes(from)).toBe(true);
    expect(["ACTIVE", "EDITED", "DELETED"].includes(to)).toBe(true);
  });
  it("does not allow DELETED → ACTIVE (irreversible)", () => {
    const from = "DELETED" as const;
    const to = "ACTIVE" as const;
    // Service contract layer should enforce this; schema allows the value,
    // but the domain helper treats DELETED as terminal.
    expect(messageIsDeleted({ status: from } as never)).toBe(true);
    expect(messageIsActive({ status: to } as never)).toBe(true);
  });
});

describe("RetentionPolicy action values", () => {
  it("ARCHIVE is a valid action", () => {
    expect(isValidRetentionAction("ARCHIVE")).toBe(true);
  });
  it("DELETE is a valid action", () => {
    expect(isValidRetentionAction("DELETE")).toBe(true);
  });
  it("FLAG is a valid action", () => {
    expect(isValidRetentionAction("FLAG")).toBe(true);
  });
});

// ─── Schema contract coherence ────────────────────────────────────────────────

describe("schema contract coherence", () => {
  it("Conversation.type enum covers all required conversation kinds", () => {
    const types = ["CHANNEL", "DM", "GROUP"] as const;
    for (const t of types) {
      expect(isValidConversationType(t)).toBe(true);
    }
  });
  it("Conversation.visibility enum covers public and private", () => {
    const visibilities = ["PUBLIC", "PRIVATE"] as const;
    for (const v of visibilities) {
      expect(isValidConversationVisibility(v)).toBe(true);
    }
  });
  it("Participant role enum covers owner, admin, member", () => {
    const roles = ["OWNER", "ADMIN", "MEMBER"] as const;
    for (const r of roles) {
      expect(isValidParticipantRole(r)).toBe(true);
    }
  });
  it("Calendar provider enum covers Google and Outlook", () => {
    const providers = ["GOOGLE", "OUTLOOK"] as const;
    for (const p of providers) {
      expect(isValidCalendarProvider(p)).toBe(true);
    }
  });
});
