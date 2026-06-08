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
import { sendMessage } from "../message-service";

const INTERNAL_USER_UUID = "e461b2e1-450f-48d8-9c1a-ee4a460ff609";
const CHARLIE_UUID = "charlie-user-uuid-123456789";
const PORTAL_CLIENT_CUID = "cclient1234567890";
const ORG_ID = "org-uuid-1234567890";

describe("Sprint 10.2 — Portal Conversations Assignment and State Transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Assignment Controls", () => {
    it("fails if conversation does not exist or is not a portal conversation", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue(null);

      // Mock actor participant to exist as OWNER
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        id: "part-actor",
        orgId: ORG_ID,
        conversationId: "conv-invalid",
        userId: INTERNAL_USER_UUID,
        kind: "INTERNAL_MEMBER",
        role: "OWNER",
        leftAt: null,
      } as any);

      await expect(
        updatePortalConversationAssignment({
          orgId: ORG_ID,
          conversationId: "conv-invalid",
          assigneeId: INTERNAL_USER_UUID,
          actorId: INTERNAL_USER_UUID,
        })
      ).rejects.toThrow();

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
      ).rejects.toThrow();
    });

    it("fails if actor is a standard MEMBER (unauthorized) and no override is present", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        type: "PORTAL",
        orgId: ORG_ID,
        portalState: "OPEN",
        customerId: "cust_999",
      } as any);

      // Actor is an active participant but only a MEMBER (unauthorized)
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        id: "part-actor",
        orgId: ORG_ID,
        conversationId: "conv-1",
        userId: INTERNAL_USER_UUID,
        kind: "INTERNAL_MEMBER",
        role: "MEMBER",
        leftAt: null,
      } as any);

      await expect(
        updatePortalConversationAssignment({
          orgId: ORG_ID,
          conversationId: "conv-1",
          assigneeId: CHARLIE_UUID,
          actorId: INTERNAL_USER_UUID,
        })
      ).rejects.toThrow("governance action requires OWNER or ADMIN role");
    });

    it("allows assignment if actor is OWNER", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        type: "PORTAL",
        orgId: ORG_ID,
        portalState: "OPEN",
        customerId: "cust_999",
      } as any);

      // Actor is OWNER
      vi.mocked(db.conversationParticipant.findFirst).mockImplementation(async (args: any) => {
        if (args.where.userId === INTERNAL_USER_UUID) {
          return {
            id: "part-actor",
            orgId: ORG_ID,
            conversationId: "conv-1",
            userId: INTERNAL_USER_UUID,
            kind: "INTERNAL_MEMBER",
            role: "OWNER",
            leftAt: null,
          } as any;
        }
        return null;
      });

      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([]);
      vi.mocked(db.member.findMany).mockResolvedValue([{ userId: CHARLIE_UUID }] as any);

      await updatePortalConversationAssignment({
        orgId: ORG_ID,
        conversationId: "conv-1",
        assigneeId: CHARLIE_UUID,
        actorId: INTERNAL_USER_UUID,
      });

      expect(db.conversationParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: CHARLIE_UUID,
            role: "OWNER",
          }),
        })
      );
    });

    it("allows assignment via admin override (orgRole = admin)", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        type: "PORTAL",
        orgId: ORG_ID,
        portalState: "OPEN",
        customerId: "cust_999",
      } as any);

      // Actor is not a participant (findFirst returns null)
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(null);

      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([]);
      vi.mocked(db.member.findMany).mockResolvedValue([{ userId: CHARLIE_UUID }] as any);

      await updatePortalConversationAssignment({
        orgId: ORG_ID,
        conversationId: "conv-1",
        assigneeId: CHARLIE_UUID,
        actorId: INTERNAL_USER_UUID,
        actorOrgRole: "admin", // Admin override
      });

      expect(db.conversationParticipant.create).toHaveBeenCalled();
    });
  });

  describe("Lifecycle State controls", () => {
    it("fails if actor is a standard MEMBER (unauthorized) and no override is present", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        type: "PORTAL",
        orgId: ORG_ID,
        portalState: "OPEN",
        customerId: "cust_999",
      } as any);

      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        id: "part-actor",
        orgId: ORG_ID,
        conversationId: "conv-1",
        userId: INTERNAL_USER_UUID,
        kind: "INTERNAL_MEMBER",
        role: "MEMBER",
        leftAt: null,
      } as any);

      await expect(
        updatePortalConversationState({
          orgId: ORG_ID,
          conversationId: "conv-1",
          portalState: "WAITING_ON_CLIENT",
          actorId: INTERNAL_USER_UUID,
        })
      ).rejects.toThrow("governance action requires OWNER or ADMIN role");
    });

    it("updates portalState directly and logs ADMIN_SUPPORT_ACTION if actor is OWNER", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        type: "PORTAL",
        orgId: ORG_ID,
        portalState: "OPEN",
        customerId: "cust_999",
      } as any);

      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        id: "part-actor",
        orgId: ORG_ID,
        conversationId: "conv-1",
        userId: INTERNAL_USER_UUID,
        kind: "INTERNAL_MEMBER",
        role: "OWNER",
        leftAt: null,
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
            action: "ADMIN_SUPPORT_ACTION",
            summary: "Updated portal conversation state to WAITING_ON_CLIENT",
          }),
        })
      );
    });
  });

  describe("Closed state message routing controls", () => {
    it("blocks portal client from sending messages to a closed portal conversation", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        type: "PORTAL",
        orgId: ORG_ID,
        portalState: "CLOSED",
        customerId: PORTAL_CLIENT_CUID,
      } as any);

      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        id: "part-client",
        orgId: ORG_ID,
        conversationId: "conv-1",
        customerId: PORTAL_CLIENT_CUID,
        kind: "PORTAL_CLIENT",
        role: "MEMBER",
        leftAt: null,
      } as any);

      await expect(
        sendMessage({
          orgId: ORG_ID,
          conversationId: "conv-1",
          authorId: PORTAL_CLIENT_CUID,
          body: "Hello client reply",
        })
      ).rejects.toThrow("cannot send messages to a closed portal conversation");
    });

    it("blocks operator from sending client-visible replies to a closed portal conversation", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        type: "PORTAL",
        orgId: ORG_ID,
        portalState: "CLOSED",
        customerId: PORTAL_CLIENT_CUID,
      } as any);

      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        id: "part-op",
        orgId: ORG_ID,
        conversationId: "conv-1",
        userId: INTERNAL_USER_UUID,
        kind: "INTERNAL_MEMBER",
        role: "OWNER",
        leftAt: null,
      } as any);

      await expect(
        sendMessage({
          orgId: ORG_ID,
          conversationId: "conv-1",
          authorId: INTERNAL_USER_UUID,
          body: "Hello operator client-visible reply",
          audience: "EXTERNAL_VISIBLE",
        })
      ).rejects.toThrow("Cannot send replies to a closed portal conversation");
    });

    it("allows operator to write INTERNAL_ONLY notes to a closed portal conversation", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        type: "PORTAL",
        orgId: ORG_ID,
        portalState: "CLOSED",
        customerId: PORTAL_CLIENT_CUID,
      } as any);

      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        id: "part-op",
        orgId: ORG_ID,
        conversationId: "conv-1",
        userId: INTERNAL_USER_UUID,
        kind: "INTERNAL_MEMBER",
        role: "OWNER",
        leftAt: null,
      } as any);

      vi.mocked(db.conversationMessage.create).mockResolvedValue({
        id: "msg-123",
        body: "Internal operator note detail",
        audience: "INTERNAL_ONLY",
      } as any);

      const res = await sendMessage({
        orgId: ORG_ID,
        conversationId: "conv-1",
        authorId: INTERNAL_USER_UUID,
        body: "Internal operator note detail",
        audience: "INTERNAL_ONLY",
      });

      expect(res.id).toBe("msg-123");
      expect(db.conversationMessage.create).toHaveBeenCalled();
    });
  });
});
