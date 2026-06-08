import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mock db client
vi.mock("@/lib/db", () => {
  const mocks = {
    customer: {
      findFirst: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    conversationParticipant: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    conversationMessage: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    conversationReadState: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    conversationThread: {
      findFirst: vi.fn(),
    },
    messagingAuditEvent: {
      create: vi.fn(),
    },
    conversationEventLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const db = {
    ...mocks,
    $transaction: vi.fn((cb: any) => cb(db)),
  };
  return { db };
});

import { db } from "@/lib/db";
import {
  updatePortalConversationAssignment,
  updatePortalConversationState,
} from "../conversation-service";

const INTERNAL_USER_UUID = "e461b2e1-450f-48d8-9c1a-ee4a460ff609";
const PORTAL_CLIENT_CUID = "cclient1234567890";
const ORG_ID = "org-uuid-1234567890";

describe("Sprint 10.2 — Portal Conversations Assignment and State Transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Assignment Controls", () => {
    it("fails if conversation does not exist or is not a portal conversation", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue(null);

      await expect(
        updatePortalConversationAssignment({
          orgId: ORG_ID,
          conversationId: "conv-invalid",
          assigneeId: INTERNAL_USER_UUID,
          actorId: INTERNAL_USER_UUID,
        })
      ).rejects.toThrow("Conversation not found");

      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-internal",
        type: "CHANNEL",
        orgId: ORG_ID,
      } as any);

      await expect(
        updatePortalConversationAssignment({
          orgId: ORG_ID,
          conversationId: "conv-internal",
          assigneeId: INTERNAL_USER_UUID,
          actorId: INTERNAL_USER_UUID,
        })
      ).rejects.toThrow("Assignment can only be updated for portal conversations");
    });

    it("assigns portal conversation to a team member and demotes others to MEMBER", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        type: "PORTAL",
        orgId: ORG_ID,
        portalState: "OPEN",
      } as any);

      // Current owner is charlie
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { id: "part-charlie", userId: "user-charlie", role: "OWNER" },
      ] as any);

      // Target assignee is valid org member
      vi.mocked(db.member.findMany).mockResolvedValue([{ userId: INTERNAL_USER_UUID }] as any);

      // Target assignee has no existing participant record
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(null);

      await updatePortalConversationAssignment({
        orgId: ORG_ID,
        conversationId: "conv-1",
        assigneeId: INTERNAL_USER_UUID,
        actorId: INTERNAL_USER_UUID,
      });

      // Creates new OWNER participant
      expect(db.conversationParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: INTERNAL_USER_UUID,
            role: "OWNER",
          }),
        })
      );

      // Demotes charlie to MEMBER
      expect(db.conversationParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "part-charlie" },
          data: { role: "MEMBER" },
        })
      );

      // Logs audit event
      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "PORTAL_CONVERSATION_ASSIGNED",
            summary: `Assigned portal conversation to user ${INTERNAL_USER_UUID}`,
          }),
        })
      );
    });

    it("unassigns portal conversation by demoting all current owners to MEMBER", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        type: "PORTAL",
        orgId: ORG_ID,
        portalState: "OPEN",
      } as any);

      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { id: "part-alice", userId: INTERNAL_USER_UUID, role: "OWNER" },
      ] as any);

      await updatePortalConversationAssignment({
        orgId: ORG_ID,
        conversationId: "conv-1",
        assigneeId: null,
        actorId: INTERNAL_USER_UUID,
      });

      expect(db.conversationParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "part-alice" },
          data: { role: "MEMBER" },
        })
      );

      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "PORTAL_CONVERSATION_ASSIGNED",
            summary: "Unassigned portal conversation",
          }),
        })
      );
    });
  });

  describe("Lifecycle State controls", () => {
    it("updates portalState to WAITING_ON_CLIENT directly and audits it", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        type: "PORTAL",
        orgId: ORG_ID,
        portalState: "OPEN",
      } as any);

      vi.mocked(db.conversation.update).mockResolvedValue({
        id: "conv-1",
        portalState: "WAITING_ON_CLIENT",
      } as any);

      await updatePortalConversationState({
        orgId: ORG_ID,
        conversationId: "conv-1",
        portalState: "WAITING_ON_CLIENT",
        actorId: INTERNAL_USER_UUID,
      });

      expect(db.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "conv-1", orgId: ORG_ID },
          data: { portalState: "WAITING_ON_CLIENT" },
        })
      );

      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "PORTAL_CONVERSATION_REOPENED",
            summary: "Updated portal conversation state to WAITING_ON_CLIENT",
          }),
        })
      );
    });
  });
});
