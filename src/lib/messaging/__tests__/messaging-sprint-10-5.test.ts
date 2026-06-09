import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock portal-auth
vi.mock("@/lib/portal-auth", () => {
  const requirePortalSession = vi.fn().mockImplementation(async (orgSlug?: string) => {
    if (orgSlug && orgSlug !== "test-org") {
      throw new Error("NEXT_REDIRECT_TO_LOGIN");
    }
    return {
      customerId: "cclient-1",
      orgId: "org-1",
      orgSlug: "test-org",
    };
  });
  return {
    requirePortalSession,
    getPortalSession: vi.fn().mockImplementation(async (orgSlug?: string) => {
      if (orgSlug && orgSlug !== "test-org") {
        return null;
      }
      return {
        customerId: "cclient-1",
        orgId: "org-1",
        orgSlug: "test-org",
      };
    }),
  };
});

// Mock service-helpers
vi.mock("@/lib/messaging/service-helpers", () => ({
  mintUploadToken: vi.fn().mockReturnValue("mock-token"),
  verifyUploadToken: vi.fn().mockReturnValue(true),
}));

// Mock email helper
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock storage server
vi.mock("@/lib/storage/upload-server", () => ({
  uploadFileServer: vi.fn().mockResolvedValue({ storageKey: "mock-storage-key" }),
  getSignedUrlServer: vi.fn().mockResolvedValue("https://storage.mock/signed-url"),
}));

// Mock notifications lib
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue({ id: "notif-id-123" }),
}));

// Mock downstream-seam
vi.mock("../realtime/downstream-seam", () => ({
  consumeDownstreamEvents: vi.fn().mockResolvedValue({ events: [], hasMore: false }),
  recordConsumptionCheckpoint: vi.fn().mockResolvedValue(undefined),
  getConsumptionCheckpoint: vi.fn().mockResolvedValue(null),
  buildNotificationPayload: vi.fn().mockImplementation((event) => event.payload),
}));

// Mock audit
vi.mock("../audit", () => ({
  logMessagingAudit: vi.fn().mockResolvedValue(undefined),
  logMessagingAuditTx: vi.fn().mockResolvedValue(undefined),
}));

// Mock messaging core
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
      count: vi.fn(),
      update: vi.fn(),
    },
    conversationMessage: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    conversationParticipant: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    conversationReadState: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    conversationAttachment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      createMany: vi.fn(),
    },
    messagingNotificationPreference: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    messagingAuditEvent: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    notificationDelivery: {
      count: vi.fn(),
    },
    notification: {
      count: vi.fn(),
    },
    messagingTask: {
      count: vi.fn(),
    },
    conversationMeeting: {
      count: vi.fn(),
    },
    messagingFollowUp: {
      count: vi.fn(),
    },
    member: {
      findFirst: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    orgDefaults: {
      findUnique: vi.fn(),
    },
    messagingAttachmentIndex: {
      count: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(mocks)),
  };
  return { db: mocks };
});

import { db } from "@/lib/db";
import { requirePortalSession } from "@/lib/portal-auth";
import { sendMessage } from "@/lib/messaging";
import { sendEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import { uploadFileServer, getSignedUrlServer } from "@/lib/storage/upload-server";
import { processNotificationEvents } from "../notification-service";
import { getMessagingDiagnostics } from "../diagnostics-service";
import {
  listPortalConversations,
  getPortalConversationDetail,
  submitPortalConversationReply,
  markPortalConversationAsRead,
  getPortalAttachmentDownloadUrl,
} from "@/app/portal/[orgSlug]/client-hub/messages/actions";
import { consumeDownstreamEvents, buildNotificationPayload } from "../realtime/downstream-seam";

const ORG_SLUG = "test-org";
const ORG_ID = "org-1";
const CUSTOMER_ID = "cclient-1";
const CONV_ID = "conv-1";

describe("Sprint 10.5 — Hardening, Regression, and Phase Closeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default valid mocks
    vi.mocked(requirePortalSession).mockResolvedValue({
      customerId: CUSTOMER_ID,
      orgId: ORG_ID,
      orgSlug: ORG_SLUG,
      jti: "session-jti",
    });

    vi.mocked(db.organization.findUnique).mockResolvedValue({
      id: ORG_ID,
      slug: ORG_SLUG,
      defaults: { portalEnabled: true },
    } as any);

    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: CUSTOMER_ID,
      organizationId: ORG_ID,
      lifecycleStage: "ACTIVE",
      name: "Acme Client",
    } as any);

    vi.mocked(db.customer.findUnique).mockResolvedValue({
      id: CUSTOMER_ID,
      organizationId: ORG_ID,
      lifecycleStage: "ACTIVE",
      name: "Acme Client",
    } as any);

    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      timezone: "UTC",
    } as any);

    vi.mocked(db.profile.findMany).mockResolvedValue([]);
    vi.mocked(db.profile.findUnique).mockResolvedValue(null);

    // Setup base counts for diagnostics tests
    vi.mocked(db.notificationDelivery.count).mockResolvedValue(0);
    vi.mocked(db.notification.count).mockResolvedValue(0);
    vi.mocked(db.messagingTask.count).mockResolvedValue(0);
    vi.mocked(db.conversationMeeting.count).mockResolvedValue(0);
    vi.mocked(db.messagingNotificationPreference.count).mockResolvedValue(0);
    vi.mocked(db.messagingFollowUp.count).mockResolvedValue(0);
    vi.mocked(db.conversationAttachment.count).mockResolvedValue(0);
    vi.mocked(db.messagingAttachmentIndex.count).mockResolvedValue(0);

    // Safe default values for .findMany operations
    vi.mocked(db.conversation.findMany).mockResolvedValue([]);
    vi.mocked(db.conversationMessage.findMany).mockResolvedValue([]);
    vi.mocked(db.conversationAttachment.findMany).mockResolvedValue([]);
    vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([]);
    vi.mocked(db.conversationReadState.findMany).mockResolvedValue([]);
    vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([]);
  });

  // 1 & 2. Fail-Closed Boundaries & Lifecycle Changes
  describe("Fail-Closed Boundaries & Lifecycle Changes", () => {
    it("fails portal operations if organization slug mismatch is detected", async () => {
      // Stub session to throw on wrong orgSlug
      vi.mocked(requirePortalSession).mockRejectedValueOnce(new Error("NEXT_REDIRECT_TO_LOGIN"));

      const res = await listPortalConversations("wrong-org");
      expect(res.success).toBe(false);
      expect(res.error).toBe("NEXT_REDIRECT_TO_LOGIN");
    });

    it("fails closed if the customer is CHURNED", async () => {
      vi.mocked(db.customer.findFirst).mockResolvedValueOnce({
        id: CUSTOMER_ID,
        organizationId: ORG_ID,
        lifecycleStage: "CHURNED",
      } as any);

      const res = await listPortalConversations(ORG_SLUG);
      expect(res.success).toBe(false);
      expect(res.error).toContain("churned");
    });

    it("fails closed if portal is disabled for organization", async () => {
      vi.mocked(db.organization.findUnique).mockResolvedValueOnce({
        id: ORG_ID,
        slug: ORG_SLUG,
        defaults: { portalEnabled: false },
      } as any);

      const res = await getPortalConversationDetail(ORG_SLUG, CONV_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("disabled");
    });
  });

  // 3. Closed Conversation Restrictions
  describe("Closed Conversation Restrictions", () => {
    it("rejects replies to CLOSED conversations", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValueOnce({
        id: CONV_ID,
        orgId: ORG_ID,
        customerId: CUSTOMER_ID,
        type: "PORTAL",
        portalState: "CLOSED",
      } as any);

      const res = await submitPortalConversationReply(ORG_SLUG, CONV_ID, "Should fail");
      expect(res.success).toBe(false);
      expect(res.error).toContain("closed");
      expect(sendMessage).not.toHaveBeenCalled();
    });
  });

  // 4 & 5. Non-Leakage (INTERNAL_ONLY and DELETED content)
  describe("Non-leakage of INTERNAL_ONLY and DELETED content", () => {
    it("filters out INTERNAL_ONLY and DELETED messages from details feed", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValueOnce({
        id: CONV_ID,
        orgId: ORG_ID,
        customerId: CUSTOMER_ID,
        type: "PORTAL",
      } as any);

      vi.mocked(db.conversationMessage.findMany).mockResolvedValueOnce([
        {
          id: "msg-visible",
          body: "Visible client message",
          createdAt: new Date(),
          customerId: CUSTOMER_ID,
          authorId: null,
          attachments: [],
        },
      ] as any);

      const res = await getPortalConversationDetail(ORG_SLUG, CONV_ID);
      expect(res.success).toBe(true);
      expect(res.data?.messages).toHaveLength(1);
      expect(res.data?.messages[0].id).toBe("msg-visible");

      // Verify that findMany was called with EXTERNAL_VISIBLE and status: { not: "DELETED" }
      expect(db.conversationMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            audience: "EXTERNAL_VISIBLE",
            status: { not: "DELETED" },
          }),
        })
      );
    });

    it("does not email portal client for INTERNAL_ONLY note created events", async () => {
      vi.mocked(consumeDownstreamEvents).mockResolvedValueOnce({
        events: [
          {
            cursor: 201n,
            eventId: "evt-internal",
            eventType: "conversation.message.created",
            payload: { messageId: "msg-internal" },
          },
        ],
        hasMore: false,
      });

      vi.mocked(db.conversationMessage.findUnique).mockResolvedValueOnce({
        id: "msg-internal",
        body: "Internal staff discussion note",
        deletedAt: null,
        conversationId: CONV_ID,
        audience: "INTERNAL_ONLY",
        customerId: null,
        authorId: "staff-1",
        conversation: {
          name: "Portal Discussion",
          type: "PORTAL",
          customerId: CUSTOMER_ID,
          assigneeId: "staff-1",
        },
      } as any);

      await processNotificationEvents(ORG_ID, CONV_ID);

      // Should not call sendEmail
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  // 6. Attachment scanStatus Gating
  describe("Attachment scanStatus Gating", () => {
    beforeEach(() => {
      vi.mocked(db.conversationMessage.findFirst).mockResolvedValue({
        conversationId: CONV_ID,
      } as any);
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: CONV_ID,
        customerId: CUSTOMER_ID,
        type: "PORTAL",
      } as any);
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        id: "part-1",
      } as any);
    });

    it("allows download of CLEAN attachments", async () => {
      vi.mocked(db.conversationAttachment.findFirst).mockResolvedValueOnce({
        id: "att-clean",
        storageRef: "clean-ref",
        fileName: "clean.pdf",
        mimeType: "application/pdf",
        messageId: "msg-1",
        scanStatus: "CLEAN",
      } as any);

      const res = await getPortalAttachmentDownloadUrl(ORG_SLUG, "att-clean");
      expect(res.success).toBe(true);
      expect(res.data?.signedUrl).toBe("https://storage.mock/signed-url");
    });

    it("rejects download of PENDING attachments", async () => {
      vi.mocked(db.conversationAttachment.findFirst).mockResolvedValueOnce({
        id: "att-pending",
        storageRef: "pending-ref",
        fileName: "pending.pdf",
        mimeType: "application/pdf",
        messageId: "msg-1",
        scanStatus: "PENDING",
      } as any);

      const res = await getPortalAttachmentDownloadUrl(ORG_SLUG, "att-pending");
      expect(res.success).toBe(false);
      expect(res.error).toContain("not available for download");
    });

    it("rejects download of BLOCKED attachments", async () => {
      vi.mocked(db.conversationAttachment.findFirst).mockResolvedValueOnce({
        id: "att-blocked",
        storageRef: "blocked-ref",
        fileName: "malicious.exe",
        mimeType: "application/octet-stream",
        messageId: "msg-1",
        scanStatus: "BLOCKED",
      } as any);

      const res = await getPortalAttachmentDownloadUrl(ORG_SLUG, "att-blocked");
      expect(res.success).toBe(false);
      expect(res.error).toContain("not available for download");
    });
  });

  // 7 & 10. Idempotency, Retry, and Attachment-aware Duplicate Submit Fixes
  describe("Idempotency, Retry, and Attachment-aware Duplicate Submit", () => {
    it("returns existing messageId on duplicate submit with identical text and attachments", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: CONV_ID,
        orgId: ORG_ID,
        customerId: CUSTOMER_ID,
        type: "PORTAL",
        portalState: "OPEN",
      } as any);

      const dupMessageId = "msg-duplicate-123";

      // Mock database matching previous message with same body and same attachments ref
      vi.mocked(db.conversationMessage.findMany).mockResolvedValueOnce([
        {
          id: dupMessageId,
          body: "My reply text",
          attachments: [{ storageRef: "ref-1" }],
        },
      ] as any);

      const res = await submitPortalConversationReply(ORG_SLUG, CONV_ID, "My reply text", [
        { storageRef: "ref-1", fileName: "f.txt", mimeType: "text/plain", sizeBytes: 100, uploadToken: "t1" },
      ]);

      expect(res.success).toBe(true);
      expect(res.data?.messageId).toBe(dupMessageId);
      // Should NOT submit a new message
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it("creates a new message if attachments differ, even if body is identical", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: CONV_ID,
        orgId: ORG_ID,
        customerId: CUSTOMER_ID,
        type: "PORTAL",
        portalState: "OPEN",
      } as any);

      // Mock database having previous message with same body but different attachment ref
      vi.mocked(db.conversationMessage.findMany).mockResolvedValueOnce([
        {
          id: "msg-first",
          body: "My reply text",
          attachments: [{ storageRef: "ref-1" }],
        },
      ] as any);

      // Setup mock return for sendMessage
      vi.mocked(sendMessage).mockResolvedValueOnce({
        id: "msg-new-unique",
        body: "My reply text",
      } as any);

      const res = await submitPortalConversationReply(ORG_SLUG, CONV_ID, "My reply text", [
        { storageRef: "ref-2", fileName: "f2.txt", mimeType: "text/plain", sizeBytes: 100, uploadToken: "t2" },
      ]);

      expect(res.success).toBe(true);
      expect(res.data?.messageId).toBe("msg-new-unique");
      expect(sendMessage).toHaveBeenCalled();
    });
  });

  // 8. Read State Durability
  describe("Read State Durability", () => {
    it("upserts read state durably on client read actions", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: CONV_ID,
        orgId: ORG_ID,
        customerId: CUSTOMER_ID,
        type: "PORTAL",
      } as any);

      vi.mocked(db.conversationMessage.findFirst).mockResolvedValue({
        id: "msg-latest",
      } as any);

      const res = await markPortalConversationAsRead(ORG_SLUG, CONV_ID);
      expect(res.success).toBe(true);
      expect(db.conversationReadState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversationId_customerId: {
              conversationId: CONV_ID,
              customerId: CUSTOMER_ID,
            },
          },
        })
      );
    });
  });

  // 9. Diagnostics Supportability Truth
  describe("Diagnostics Supportability Truth", () => {
    it("reports portal conversation diagnostics excluding INTERNAL_ONLY and DELETED content", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValue({ role: "admin" } as any);

      // Mock conversation details
      vi.mocked(db.conversation.findMany).mockResolvedValue([
        {
          id: CONV_ID,
          orgId: ORG_ID,
          type: "PORTAL",
          portalState: "OPEN",
          participants: [],
        },
      ] as any);

      // Verify that findMany query excludes deleted/internal notes
      await getMessagingDiagnostics(ORG_ID, "admin-1");

      // Verify conversation message queries used audience: "EXTERNAL_VISIBLE" and status not DELETED
      expect(db.conversationMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            audience: "EXTERNAL_VISIBLE",
            status: { not: "DELETED" },
          }),
        })
      );

      // Verify conversation attachment query used audience: "EXTERNAL_VISIBLE" and status not DELETED
      expect(db.conversationAttachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            message: expect.objectContaining({
              audience: "EXTERNAL_VISIBLE",
              status: { not: "DELETED" },
            }),
          }),
        })
      );
    });
  });
});
