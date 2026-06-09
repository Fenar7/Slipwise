import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock portal-auth
vi.mock("@/lib/portal-auth", () => ({
  requirePortalSession: vi.fn().mockResolvedValue({
    customerId: "cclient-1",
    orgId: "org-1",
    orgSlug: "test-org",
  }),
  getPortalSession: vi.fn().mockResolvedValue({
    customerId: "cclient-1",
    orgId: "org-1",
    orgSlug: "test-org",
  }),
}));

// Mock messaging services
vi.mock("@/lib/messaging", () => ({
  sendMessage: vi.fn(),
}));

// Mock db
vi.mock("@/lib/db", () => {
  const mocks = {
    customer: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    conversationMessage: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    conversationReadState: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    profile: {
      findMany: vi.fn(),
    },
    invoice: {
      findFirst: vi.fn(),
    },
  };
  return { db: mocks };
});

import { db } from "@/lib/db";
import { requirePortalSession } from "@/lib/portal-auth";
import { sendMessage } from "@/lib/messaging";
import {
  listPortalConversations,
  getPortalConversationDetail,
  submitPortalConversationReply,
  markPortalConversationAsRead,
} from "@/app/portal/[orgSlug]/client-hub/messages/actions";

const ORG_SLUG = "test-org";
const ORG_ID = "org-1";
const CUSTOMER_ID = "cclient-1";
const CONV_ID = "conv-1";

describe("Sprint 10.3 — Client Hub Messaging and Compose Surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock values
    vi.mocked(requirePortalSession).mockResolvedValue({
      customerId: CUSTOMER_ID,
      orgId: ORG_ID,
      orgSlug: ORG_SLUG,
    });

    vi.mocked(db.organization.findUnique).mockResolvedValue({
      id: ORG_ID,
      defaults: { portalEnabled: true },
    } as any);

    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: CUSTOMER_ID,
      organizationId: ORG_ID,
      lifecycleStage: "ACTIVE",
    } as any);
  });

  describe("Customer Eligibility Gating", () => {
    it("fails listPortalConversations if customer is churned", async () => {
      vi.mocked(db.customer.findFirst).mockResolvedValue({
        id: CUSTOMER_ID,
        organizationId: ORG_ID,
        lifecycleStage: "CHURNED",
      } as any);

      const result = await listPortalConversations(ORG_SLUG);
      expect(result.success).toBe(false);
      expect(result.error).toContain("churned");
    });

    it("fails listPortalConversations if portal is disabled for organization", async () => {
      vi.mocked(db.organization.findUnique).mockResolvedValue({
        id: ORG_ID,
        defaults: { portalEnabled: false },
      } as any);

      const result = await listPortalConversations(ORG_SLUG);
      expect(result.success).toBe(false);
      expect(result.error).toContain("disabled");
    });

    it("fails getPortalConversationDetail if customer eligibility is revoked", async () => {
      vi.mocked(db.customer.findFirst).mockResolvedValue({
        id: CUSTOMER_ID,
        organizationId: ORG_ID,
        lifecycleStage: "CHURNED",
      } as any);

      const result = await getPortalConversationDetail(ORG_SLUG, CONV_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain("churned");
    });
  });

  describe("Conversation List and Scope Gating", () => {
    it("lists only PORTAL conversations scoped to the customer/session", async () => {
      vi.mocked(db.conversation.findMany).mockResolvedValue([
        {
          id: CONV_ID,
          orgId: ORG_ID,
          customerId: CUSTOMER_ID,
          type: "PORTAL",
          portalState: "OPEN",
          updatedAt: new Date("2026-06-08T10:00:00Z"),
          linkedRecordType: null,
          linkedRecordId: null,
        },
      ] as any);

      vi.mocked(db.conversationMessage.findFirst).mockResolvedValue({
        body: "Hello world snippet",
        createdAt: new Date("2026-06-08T10:05:00Z"),
      } as any);

      vi.mocked(db.conversationReadState.findFirst).mockResolvedValue({
        lastReadAt: new Date("2026-06-08T10:02:00Z"),
      } as any);

      vi.mocked(db.conversationMessage.count).mockResolvedValue(1);

      const result = await listPortalConversations(ORG_SLUG);
      expect(result.success).toBe(true);
      expect(result.data?.conversations.length).toBe(1);

      const conv = result.data?.conversations[0];
      expect(conv?.id).toBe(CONV_ID);
      expect(conv?.lastMessageSnippet).toBe("Hello world snippet");
      expect(conv?.unreadCount).toBe(1);

      // Verify DB scoping query
      expect(db.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: ORG_ID,
            customerId: CUSTOMER_ID,
            type: "PORTAL",
          }),
        })
      );
    });

    it("filters out INTERNAL_ONLY notes from previews and count calculations", async () => {
      vi.mocked(db.conversation.findMany).mockResolvedValue([
        {
          id: CONV_ID,
          orgId: ORG_ID,
          customerId: CUSTOMER_ID,
          type: "PORTAL",
          portalState: "OPEN",
          updatedAt: new Date(),
        },
      ] as any);

      // Verify that the findFirst for latest message snippet filters by EXTERNAL_VISIBLE
      await listPortalConversations(ORG_SLUG);

      expect(db.conversationMessage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            audience: "EXTERNAL_VISIBLE",
          }),
        })
      );

      // Verify that count query for unread messages filters by EXTERNAL_VISIBLE
      expect(db.conversationMessage.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            audience: "EXTERNAL_VISIBLE",
          }),
        })
      );
    });
  });

  describe("Conversation Detail and Leak Prevention", () => {
    it("returns conversation detail only if owned by customer", async () => {
      // Return null when searching for this conversation indicating ownership mismatch or not found
      vi.mocked(db.conversation.findFirst).mockResolvedValue(null);

      const result = await getPortalConversationDetail(ORG_SLUG, "foreign-conv");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Conversation not found");
    });

    it("never includes INTERNAL_ONLY messages in detail timelines", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: CONV_ID,
        orgId: ORG_ID,
        customerId: CUSTOMER_ID,
        type: "PORTAL",
        portalState: "OPEN",
        linkedRecordType: null,
        linkedRecordId: null,
      } as any);

      vi.mocked(db.conversationMessage.findMany).mockResolvedValue([
        {
          id: "msg-1",
          body: "Visible reply",
          createdAt: new Date(),
          customerId: null,
          authorId: "user-1",
        },
      ] as any);

      vi.mocked(db.profile.findMany).mockResolvedValue([
        { id: "user-1", firstName: "Alice", lastName: "Support" },
      ] as any);

      const result = await getPortalConversationDetail(ORG_SLUG, CONV_ID);
      expect(result.success).toBe(true);
      expect(result.data?.messages.length).toBe(1);

      // Check query filters
      expect(db.conversationMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversationId: CONV_ID,
            audience: "EXTERNAL_VISIBLE", // STRICT RULE
          }),
        })
      );
    });

    it("truthfully degrades when linked context is missing", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: CONV_ID,
        orgId: ORG_ID,
        customerId: CUSTOMER_ID,
        type: "PORTAL",
        portalState: "OPEN",
        linkedRecordType: "INVOICE",
        linkedRecordId: "missing-inv-id",
      } as any);

      vi.mocked(db.invoice.findFirst).mockResolvedValue(null); // Missing invoice context
      vi.mocked(db.conversationMessage.findMany).mockResolvedValue([]);
      vi.mocked(db.profile.findMany).mockResolvedValue([]);

      const result = await getPortalConversationDetail(ORG_SLUG, CONV_ID);
      expect(result.success).toBe(true);
      expect(result.data?.linkedRecordLabel).toBe("Linked Invoice (Details unavailable)");
    });
  });

  describe("Portal-Safe Client Reply Flow", () => {
    it("delegates to sendMessage with client context on successful submit", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: CONV_ID,
        orgId: ORG_ID,
        customerId: CUSTOMER_ID,
        type: "PORTAL",
        portalState: "OPEN",
      } as any);

      // Mock duplicate check to return null
      vi.mocked(db.conversationMessage.findFirst).mockResolvedValue(null);

      vi.mocked(sendMessage).mockResolvedValue({
        id: "new-msg-1",
        body: "Replying now",
      } as any);

      const result = await submitPortalConversationReply(ORG_SLUG, CONV_ID, "Replying now");
      expect(result.success).toBe(true);
      expect(result.data?.messageId).toBe("new-msg-1");

      // Verify service layer delegation
      expect(sendMessage).toHaveBeenCalledWith({
        orgId: ORG_ID,
        conversationId: CONV_ID,
        authorId: CUSTOMER_ID,
        body: "Replying now",
      });
    });

    it("blocks reply submit if the conversation is CLOSED", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: CONV_ID,
        orgId: ORG_ID,
        customerId: CUSTOMER_ID,
        type: "PORTAL",
        portalState: "CLOSED",
      } as any);

      const result = await submitPortalConversationReply(ORG_SLUG, CONV_ID, "Hello on closed thread");
      expect(result.success).toBe(false);
      expect(result.error).toContain("closed");
      expect(sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("Client Read/Unread State Management", () => {
    it("updates portal client read state durably without internal note contamination", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: CONV_ID,
        orgId: ORG_ID,
        customerId: CUSTOMER_ID,
        type: "PORTAL",
        portalState: "OPEN",
      } as any);

      vi.mocked(db.conversationMessage.findFirst).mockResolvedValue({
        id: "msg-latest",
      } as any);

      const result = await markPortalConversationAsRead(ORG_SLUG, CONV_ID);
      expect(result.success).toBe(true);

      // Verify that the readState query for latest message targets EXTERNAL_VISIBLE only
      expect(db.conversationMessage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversationId: CONV_ID,
            audience: "EXTERNAL_VISIBLE",
          }),
        })
      );

      // Verify that the upsert targets conversationId_customerId
      expect(db.conversationReadState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversationId_customerId: {
              conversationId: CONV_ID,
              customerId: CUSTOMER_ID,
            },
          },
          update: expect.objectContaining({
            lastReadMessageId: "msg-latest",
            unreadCount: 0,
          }),
        })
      );
    });
  });
});
