import { describe, it, expect, vi, beforeEach } from "vitest";
import "./local-setup";

beforeEach(() => {
  (global as any).__mockActiveMembership = true;
});

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
      createMany: vi.fn(),
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

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 5 }),
}));

import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  createConversation,
  closePortalConversation,
  reopenPortalConversation,
} from "../conversation-service";
import {
  sendMessage,
  listConversationMessages,
} from "../message-service";
import { listThreadReplies } from "../thread-service";
import {
  evaluateConversationAccess,
  evaluateGovernanceAccess,
} from "../authorization";

const INTERNAL_USER_UUID = "e461b2e1-450f-48d8-9c1a-ee4a460ff609";
const OTHER_INTERNAL_UUID = "b687f879-11c5-4d0f-a316-c9569fa12123";
const PORTAL_CLIENT_CUID = "cclient1234567890";
const OTHER_CLIENT_CUID = "cclient9999999999";
const ORG_ID = "org-uuid-1234567890";

describe("Sprint 10.1 — Portal Conversations Domain Boundaries and Security Backbone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 5 });
    vi.mocked(db.conversationParticipant.count).mockResolvedValue(2);
    vi.mocked(db.conversationEventLog.findFirst).mockResolvedValue({ cursor: 1n } as any);
  });

  describe("Portal Conversation Creation Boundaries", () => {
    it("enforces portal client rate limits and logs PORTAL_CONVERSATION_RATE_LIMITED on failure", async () => {
      vi.mocked(rateLimit).mockResolvedValue({ success: false, remaining: 0 });

      await expect(
        createConversation({
          orgId: ORG_ID,
          type: "PORTAL",
          createdBy: PORTAL_CLIENT_CUID,
          customerId: PORTAL_CLIENT_CUID,
        })
      ).rejects.toThrow("Rate limit exceeded");

      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "PORTAL_CONVERSATION_RATE_LIMITED",
            actorId: PORTAL_CLIENT_CUID,
          }),
        })
      );
    });

    it("fails creation if the customer record is not found in the organization", async () => {
      vi.mocked(db.customer.findFirst).mockResolvedValue(null);

      await expect(
        createConversation({
          orgId: ORG_ID,
          type: "PORTAL",
          createdBy: INTERNAL_USER_UUID,
          customerId: PORTAL_CLIENT_CUID,
        })
      ).rejects.toThrow("Customer not found in this organization");

      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "PORTAL_CONVERSATION_ACCESS_BLOCKED",
            actorId: INTERNAL_USER_UUID,
          }),
        })
      );
    });

    it("fails creation if the customer is churned", async () => {
      vi.mocked(db.customer.findFirst).mockResolvedValue({
        id: PORTAL_CLIENT_CUID,
        organizationId: ORG_ID,
        lifecycleStage: "CHURNED",
        organization: {
          defaults: {
            portalEnabled: true,
          },
        },
      } as any);

      await expect(
        createConversation({
          orgId: ORG_ID,
          type: "PORTAL",
          createdBy: INTERNAL_USER_UUID,
          customerId: PORTAL_CLIENT_CUID,
        })
      ).rejects.toThrow("Customer is churned and ineligible for portal access");

      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "PORTAL_CONVERSATION_ACCESS_BLOCKED",
            metadata: expect.objectContaining({
              reason: "customer_churned",
            }),
          }),
        })
      );
    });

    it("fails creation if organization portal access is disabled", async () => {
      vi.mocked(db.customer.findFirst).mockResolvedValue({
        id: PORTAL_CLIENT_CUID,
        organizationId: ORG_ID,
        lifecycleStage: "ACTIVE",
        organization: {
          defaults: {
            portalEnabled: false,
          },
        },
      } as any);

      await expect(
        createConversation({
          orgId: ORG_ID,
          type: "PORTAL",
          createdBy: INTERNAL_USER_UUID,
          customerId: PORTAL_CLIENT_CUID,
        })
      ).rejects.toThrow("Portal access is disabled for this organization");

      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "PORTAL_CONVERSATION_ACCESS_BLOCKED",
            metadata: expect.objectContaining({
              reason: "portal_disabled",
            }),
          }),
        })
      );
    });

    it("validates linkedRecordType and rejects invalid types", async () => {
      vi.mocked(db.customer.findFirst).mockResolvedValue({
        id: PORTAL_CLIENT_CUID,
        organizationId: ORG_ID,
        lifecycleStage: "ACTIVE",
        organization: {
          defaults: {
            portalEnabled: true,
          },
        },
      } as any);

      await expect(
        createConversation({
          orgId: ORG_ID,
          type: "PORTAL",
          createdBy: INTERNAL_USER_UUID,
          customerId: PORTAL_CLIENT_CUID,
          linkedRecordType: "MALICIOUS_TYPE" as any,
          linkedRecordId: "123",
        })
      ).rejects.toThrow("Invalid linkedRecordType: MALICIOUS_TYPE");

      // Verify that valid types work
      vi.mocked(db.conversation.create).mockResolvedValue({
        id: "conv-123",
        orgId: ORG_ID,
        type: "PORTAL",
        customerId: PORTAL_CLIENT_CUID,
        portalState: "OPEN",
        linkedRecordType: "INVOICE",
        linkedRecordId: "invoice-999",
        archivedAt: null,
        lockedAt: null,
      } as any);

      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { id: "part-1", orgId: ORG_ID, conversationId: "conv-123", userId: INTERNAL_USER_UUID, customerId: null, kind: "INTERNAL_MEMBER", role: "OWNER", leftAt: null },
        { id: "part-2", orgId: ORG_ID, conversationId: "conv-123", userId: null, customerId: PORTAL_CLIENT_CUID, kind: "PORTAL_CLIENT", role: "MEMBER", leftAt: null },
      ] as any);

      const res = await createConversation({
        orgId: ORG_ID,
        type: "PORTAL",
        createdBy: INTERNAL_USER_UUID,
        customerId: PORTAL_CLIENT_CUID,
        linkedRecordType: "INVOICE",
        linkedRecordId: "invoice-999",
      });

      expect(res.conversation.linkedRecordType).toBe("INVOICE");
      expect(res.conversation.linkedRecordId).toBe("invoice-999");
      expect(db.conversationParticipant.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ kind: "INTERNAL_MEMBER", userId: INTERNAL_USER_UUID }),
            expect.objectContaining({ kind: "PORTAL_CLIENT", customerId: PORTAL_CLIENT_CUID }),
          ]),
        })
      );
    });
  });

  describe("Portal Access Authorization Policies", () => {
    const portalConv = {
      id: "portal-conv-1",
      orgId: ORG_ID,
      type: "PORTAL",
      customerId: PORTAL_CLIENT_CUID,
      portalState: "OPEN",
      archivedAt: null,
      lockedAt: null,
    } as any;

    const portalClientParticipant = {
      id: "part-client-1",
      orgId: ORG_ID,
      conversationId: "portal-conv-1",
      userId: null,
      customerId: PORTAL_CLIENT_CUID,
      kind: "PORTAL_CLIENT",
      role: "MEMBER",
      leftAt: null,
    } as any;

    const internalMemberParticipant = {
      id: "part-internal-1",
      orgId: ORG_ID,
      conversationId: "portal-conv-1",
      userId: INTERNAL_USER_UUID,
      customerId: null,
      kind: "INTERNAL_MEMBER",
      role: "OWNER",
      leftAt: null,
    } as any;

    it("allows portal client only restricted actions (READ, SEND_MESSAGE, etc.) inside their customer boundary", () => {
      const readResult = evaluateConversationAccess(portalConv, portalClientParticipant, "READ");
      expect(readResult.allowed).toBe(true);

      const sendResult = evaluateConversationAccess(portalConv, portalClientParticipant, "SEND_MESSAGE");
      expect(sendResult.allowed).toBe(true);

      const renameResult = evaluateConversationAccess(portalConv, portalClientParticipant, "RENAME");
      expect(renameResult.allowed).toBe(false);
      expect(renameResult.reason).toContain("not permitted for portal clients");
    });

    it("denies access if portal client tries to access conversation of a different customer", () => {
      const foreignClientParticipant = {
        ...portalClientParticipant,
        customerId: OTHER_CLIENT_CUID,
      };

      const result = evaluateConversationAccess(portalConv, foreignClientParticipant, "READ");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("customer boundary violation");
    });

    it("denies portal clients from performing any governance actions", () => {
      const actor = {
        participant: portalClientParticipant,
        orgRole: "member",
        isPlatformAdmin: false,
      };

      const result = evaluateGovernanceAccess(portalConv, actor, "ARCHIVE");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("portal clients cannot perform governance actions");
    });

    it("denies message sends from client if conversation is CLOSED", () => {
      const closedConv = {
        ...portalConv,
        portalState: "CLOSED",
      };

      const result = evaluateConversationAccess(closedConv, portalClientParticipant, "SEND_MESSAGE");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("cannot send messages to a closed portal conversation");
    });
  });

  describe("Portal Messages: State Transitions and Audience Filtering", () => {
    it("handles WAITING_ON_INTERNAL state transition and rate limiting for external clients", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        orgId: ORG_ID,
        type: "PORTAL",
        customerId: PORTAL_CLIENT_CUID,
        portalState: "OPEN",
        archivedAt: null,
        lockedAt: null,
      } as any);

      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        orgId: ORG_ID,
        conversationId: "conv-1",
        customerId: PORTAL_CLIENT_CUID,
        kind: "PORTAL_CLIENT",
        role: "MEMBER",
        leftAt: null,
      } as any);

      vi.mocked(db.conversationMessage.create).mockResolvedValue({
        id: "msg-client-1",
        orgId: ORG_ID,
        conversationId: "conv-1",
        body: "Hello from client",
        authorId: null,
        customerId: PORTAL_CLIENT_CUID,
        audience: "EXTERNAL_VISIBLE",
      } as any);

      const res = await sendMessage({
        orgId: ORG_ID,
        conversationId: "conv-1",
        authorId: PORTAL_CLIENT_CUID, // Non-UUID is client
        body: "Hello from client",
      });

      expect(res.body).toBe("Hello from client");
      expect(db.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "conv-1", orgId: ORG_ID },
          data: { portalState: "WAITING_ON_INTERNAL" },
        })
      );
      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "PORTAL_MESSAGE_SENT",
            summary: "Client sent portal message",
          }),
        })
      );
    });

    it("handles WAITING_ON_CLIENT state transition for external messages sent by internal users", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        orgId: ORG_ID,
        type: "PORTAL",
        customerId: PORTAL_CLIENT_CUID,
        portalState: "WAITING_ON_INTERNAL",
        archivedAt: null,
        lockedAt: null,
      } as any);

      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        orgId: ORG_ID,
        conversationId: "conv-1",
        userId: INTERNAL_USER_UUID,
        kind: "INTERNAL_MEMBER",
        role: "MEMBER",
        leftAt: null,
      } as any);

      vi.mocked(db.conversationMessage.create).mockResolvedValue({
        id: "msg-internal-1",
        orgId: ORG_ID,
        conversationId: "conv-1",
        body: "Hello from support",
        authorId: INTERNAL_USER_UUID,
        customerId: null,
        audience: "EXTERNAL_VISIBLE",
      } as any);

      const res = await sendMessage({
        orgId: ORG_ID,
        conversationId: "conv-1",
        authorId: INTERNAL_USER_UUID,
        body: "Hello from support",
        audience: "EXTERNAL_VISIBLE",
      });

      expect(res.body).toBe("Hello from support");
      expect(db.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "conv-1", orgId: ORG_ID },
          data: { portalState: "WAITING_ON_CLIENT" },
        })
      );
    });

    it("does not trigger WAITING transition and creates PORTAL_INTERNAL_NOTE_CREATED audit event for internal notes", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        orgId: ORG_ID,
        type: "PORTAL",
        customerId: PORTAL_CLIENT_CUID,
        portalState: "WAITING_ON_INTERNAL",
        archivedAt: null,
        lockedAt: null,
      } as any);

      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        orgId: ORG_ID,
        conversationId: "conv-1",
        userId: INTERNAL_USER_UUID,
        kind: "INTERNAL_MEMBER",
        role: "MEMBER",
        leftAt: null,
      } as any);

      vi.mocked(db.conversationMessage.create).mockResolvedValue({
        id: "msg-note-1",
        orgId: ORG_ID,
        conversationId: "conv-1",
        body: "Support internal note",
        authorId: INTERNAL_USER_UUID,
        customerId: null,
        audience: "INTERNAL_ONLY",
      } as any);

      const res = await sendMessage({
        orgId: ORG_ID,
        conversationId: "conv-1",
        authorId: INTERNAL_USER_UUID,
        body: "Support internal note",
        audience: "INTERNAL_ONLY",
      });

      expect(res.audience).toBe("INTERNAL_ONLY");
      // Verify no conversation update (state change) was called for state transition
      expect(db.conversation.update).not.toHaveBeenCalled();
      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "PORTAL_INTERNAL_NOTE_CREATED",
            summary: "Created internal note",
          }),
        })
      );
    });

    it("hides INTERNAL_ONLY messages from portal clients but shows them to internal members", async () => {
      const mockMessages = [
        { id: "m-1", orgId: ORG_ID, conversationId: "conv-1", body: "External Msg", audience: "EXTERNAL_VISIBLE" },
        { id: "m-2", orgId: ORG_ID, conversationId: "conv-1", body: "Internal Note", audience: "INTERNAL_ONLY" },
      ];

      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        orgId: ORG_ID,
        type: "PORTAL",
        customerId: PORTAL_CLIENT_CUID,
        archivedAt: null,
        lockedAt: null,
      } as any);

      // 1. Retrieve as PORTAL_CLIENT
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        orgId: ORG_ID,
        conversationId: "conv-1",
        customerId: PORTAL_CLIENT_CUID,
        kind: "PORTAL_CLIENT",
        role: "MEMBER",
        leftAt: null,
      } as any);

      vi.mocked(db.conversationMessage.findMany).mockResolvedValue([mockMessages[0]] as any);

      const clientMsgs = await listConversationMessages(ORG_ID, "conv-1", PORTAL_CLIENT_CUID);
      expect(clientMsgs.length).toBe(1);
      expect(clientMsgs[0].body).toBe("External Msg");
      expect(db.conversationMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            audience: "EXTERNAL_VISIBLE",
          }),
        })
      );

      // 2. Retrieve as INTERNAL_MEMBER
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        orgId: ORG_ID,
        conversationId: "conv-1",
        userId: INTERNAL_USER_UUID,
        kind: "INTERNAL_MEMBER",
        role: "MEMBER",
        leftAt: null,
      } as any);

      vi.mocked(db.conversationMessage.findMany).mockResolvedValue(mockMessages as any);

      const memberMsgs = await listConversationMessages(ORG_ID, "conv-1", INTERNAL_USER_UUID);
      expect(memberMsgs.length).toBe(2);
      expect(db.conversationMessage.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            audience: undefined,
          }),
        })
      );
    });

    it("filters out INTERNAL_ONLY replies from thread replies for portal clients", async () => {
      vi.mocked(db.conversationThread.findFirst).mockResolvedValue({
        id: "thread-1",
        orgId: ORG_ID,
        conversationId: "conv-1",
        conversation: {
          type: "PORTAL",
          customerId: PORTAL_CLIENT_CUID,
          archivedAt: null,
          lockedAt: null,
        },
      } as any);

      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        orgId: ORG_ID,
        conversationId: "conv-1",
        customerId: PORTAL_CLIENT_CUID,
        kind: "PORTAL_CLIENT",
        role: "MEMBER",
        leftAt: null,
      } as any);

      vi.mocked(db.conversationMessage.findMany).mockResolvedValue([
        { id: "reply-1", orgId: ORG_ID, threadId: "thread-1", body: "External Reply", audience: "EXTERNAL_VISIBLE" },
      ] as any);

      const replies = await listThreadReplies(ORG_ID, "conv-1", "thread-1", PORTAL_CLIENT_CUID);
      expect(replies.length).toBe(1);
      expect(db.conversationMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            threadId: "thread-1",
            audience: "EXTERNAL_VISIBLE",
          }),
        })
      );
    });
  });

  describe("Operational State Lifecycle Transitions", () => {
    it("closes a portal conversation and records PORTAL_CONVERSATION_CLOSED audit", async () => {
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        orgId: ORG_ID,
        conversationId: "conv-1",
        userId: INTERNAL_USER_UUID,
        role: "OWNER",
        kind: "INTERNAL_MEMBER",
        leftAt: null,
      } as any);

      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        orgId: ORG_ID,
        type: "PORTAL",
        customerId: PORTAL_CLIENT_CUID,
        portalState: "OPEN",
        archivedAt: null,
        lockedAt: null,
      } as any);

      vi.mocked(db.conversation.update).mockResolvedValue({
        id: "conv-1",
        orgId: ORG_ID,
        type: "PORTAL",
        customerId: PORTAL_CLIENT_CUID,
        portalState: "CLOSED",
        archivedAt: null,
        lockedAt: null,
      } as any);

      const updated = await closePortalConversation({
        orgId: ORG_ID,
        conversationId: "conv-1",
        actorId: INTERNAL_USER_UUID,
      });

      expect(updated.portalState).toBe("CLOSED");
      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "PORTAL_CONVERSATION_CLOSED",
          }),
        })
      );
    });

    it("reopens a closed portal conversation after verifying customer eligibility", async () => {
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        orgId: ORG_ID,
        conversationId: "conv-1",
        userId: INTERNAL_USER_UUID,
        role: "OWNER",
        kind: "INTERNAL_MEMBER",
        leftAt: null,
      } as any);

      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        orgId: ORG_ID,
        type: "PORTAL",
        customerId: PORTAL_CLIENT_CUID,
        portalState: "CLOSED",
        archivedAt: null,
        lockedAt: null,
      } as any);

      // Customer is eligible
      vi.mocked(db.customer.findFirst).mockResolvedValue({
        id: PORTAL_CLIENT_CUID,
        organizationId: ORG_ID,
        lifecycleStage: "ACTIVE",
        organization: {
          defaults: {
            portalEnabled: true,
          },
        },
      } as any);

      vi.mocked(db.conversation.update).mockResolvedValue({
        id: "conv-1",
        orgId: ORG_ID,
        type: "PORTAL",
        customerId: PORTAL_CLIENT_CUID,
        portalState: "OPEN",
        archivedAt: null,
        lockedAt: null,
      } as any);

      const updated = await reopenPortalConversation({
        orgId: ORG_ID,
        conversationId: "conv-1",
        actorId: INTERNAL_USER_UUID,
      });

      expect(updated.portalState).toBe("OPEN");
      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "PORTAL_CONVERSATION_REOPENED",
          }),
        })
      );
    });

    it("rejects reopening if the customer is ineligible (e.g. churned) and logs PORTAL_CONVERSATION_ACCESS_BLOCKED", async () => {
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        orgId: ORG_ID,
        conversationId: "conv-1",
        userId: INTERNAL_USER_UUID,
        role: "OWNER",
        kind: "INTERNAL_MEMBER",
        leftAt: null,
      } as any);

      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: "conv-1",
        orgId: ORG_ID,
        type: "PORTAL",
        customerId: PORTAL_CLIENT_CUID,
        portalState: "CLOSED",
        archivedAt: null,
        lockedAt: null,
      } as any);

      // Customer is churned
      vi.mocked(db.customer.findFirst).mockResolvedValue({
        id: PORTAL_CLIENT_CUID,
        organizationId: ORG_ID,
        lifecycleStage: "CHURNED",
        organization: {
          defaults: {
            portalEnabled: true,
          },
        },
      } as any);

      await expect(
        reopenPortalConversation({
          orgId: ORG_ID,
          conversationId: "conv-1",
          actorId: INTERNAL_USER_UUID,
        })
      ).rejects.toThrow("Customer is ineligible for portal access");

      expect(db.messagingAuditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "PORTAL_CONVERSATION_ACCESS_BLOCKED",
            metadata: expect.objectContaining({
              reason: "customer_ineligible",
            }),
          }),
        })
      );
    });
  });
});
