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
import { mintUploadToken, verifyUploadToken } from "@/lib/messaging/service-helpers";
import { processNotificationEvents } from "../notification-service";
import { getMessagingDiagnostics } from "../diagnostics-service";
import {
  uploadPortalAttachment,
  getPortalAttachmentDownloadUrl,
  submitPortalConversationReply,
} from "@/app/portal/[orgSlug]/client-hub/messages/actions";
import { consumeDownstreamEvents, buildNotificationPayload } from "../realtime/downstream-seam";

const ORG_SLUG = "test-org";
const ORG_ID = "org-1";
const CUSTOMER_ID = "cclient-1";
const CONV_ID = "conv-1";

describe("Sprint 10.4 — Portal Notifications, Attachments, and Supportability", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock values
    vi.mocked(requirePortalSession).mockImplementation(async (orgSlug?: string) => {
      if (orgSlug && orgSlug !== ORG_SLUG) {
        throw new Error("NEXT_REDIRECT_TO_LOGIN");
      }
      return {
        customerId: CUSTOMER_ID,
        orgId: ORG_ID,
        orgSlug: ORG_SLUG,
      };
    });

    vi.mocked(db.organization.findUnique).mockResolvedValue({
      id: ORG_ID,
      slug: ORG_SLUG,
      name: "Test Org",
      defaults: {
        portalEnabled: true,
      },
    } as any);

    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: CUSTOMER_ID,
      organizationId: ORG_ID,
      lifecycleStage: "ACTIVE",
      name: "Acme Corp",
      email: "client@acme.com",
    } as any);

    vi.mocked(db.customer.findUnique).mockResolvedValue({
      id: CUSTOMER_ID,
      organizationId: ORG_ID,
      lifecycleStage: "ACTIVE",
      name: "Acme Corp",
      email: "client@acme.com",
    } as any);

    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      timezone: "UTC",
    } as any);

    vi.mocked(db.notificationDelivery.count).mockResolvedValue(0);
    vi.mocked(db.notification.count).mockResolvedValue(0);
    vi.mocked(db.messagingTask.count).mockResolvedValue(0);
    vi.mocked(db.conversationMeeting.count).mockResolvedValue(0);
    vi.mocked(db.messagingNotificationPreference.count).mockResolvedValue(0);
    vi.mocked(db.messagingFollowUp.count).mockResolvedValue(0);
    vi.mocked(db.conversationAttachment.count).mockResolvedValue(0);
    vi.mocked(db.messagingAttachmentIndex.count).mockResolvedValue(0);
  });

  describe("1. Internal notifications for portal-client replies", () => {
    it("routes notifications to assignee and active internal participants when client sends EXTERNAL_VISIBLE message", async () => {
      vi.mocked(consumeDownstreamEvents).mockResolvedValueOnce({
        events: [
          {
            cursor: 101n,
            eventId: "evt-1",
            eventType: "conversation.message.created",
            payload: { messageId: "msg-1" },
          },
        ],
        hasMore: false,
      });

      vi.mocked(buildNotificationPayload).mockReturnValueOnce({
        messageId: "msg-1",
      });

      vi.mocked(db.conversationMessage.findUnique).mockResolvedValue({
        id: "msg-1",
        body: "Hello Support!",
        deletedAt: null,
        conversationId: CONV_ID,
        audience: "EXTERNAL_VISIBLE",
        customerId: CUSTOMER_ID,
        authorId: null,
        conversation: {
          name: "Client Support",
          type: "PORTAL",
          customerId: CUSTOMER_ID,
          assigneeId: "user-assignee",
        },
      } as any);

      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { userId: "user-assignee" },
        { userId: "user-participant" },
      ] as any);

      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([
        {
          userId: "user-assignee",
          allNotificationsEnabled: true,
          repliesEnabled: true,
        },
        {
          userId: "user-participant",
          allNotificationsEnabled: true,
          repliesEnabled: true,
        },
      ] as any);

      vi.mocked(db.conversationReadState.findMany).mockResolvedValue([]);
      vi.mocked(db.profile.findMany).mockResolvedValue([
        { id: "user-assignee", email: "assignee@test.com" },
        { id: "user-participant", email: "participant@test.com" },
      ] as any);

      await processNotificationEvents(ORG_ID, CONV_ID);

      expect(createNotification).toHaveBeenCalledTimes(2);
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-assignee",
          orgId: ORG_ID,
          type: "REPLY",
          title: "New portal reply from Acme Corp",
          body: "Acme Corp: Hello Support!",
        })
      );
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-participant",
          orgId: ORG_ID,
          type: "REPLY",
          title: "New portal reply from Acme Corp",
          body: "Acme Corp: Hello Support!",
        })
      );
    });

    it("respects quiet hours and mute states for internal notifications", async () => {
      vi.mocked(consumeDownstreamEvents).mockResolvedValueOnce({
        events: [
          {
            cursor: 101n,
            eventId: "evt-1",
            eventType: "conversation.message.created",
            payload: { messageId: "msg-1" },
          },
        ],
        hasMore: false,
      });

      vi.mocked(buildNotificationPayload).mockReturnValueOnce({
        messageId: "msg-1",
      });

      vi.mocked(db.conversationMessage.findUnique).mockResolvedValue({
        id: "msg-1",
        body: "Hello Support!",
        deletedAt: null,
        conversationId: CONV_ID,
        audience: "EXTERNAL_VISIBLE",
        customerId: CUSTOMER_ID,
        authorId: null,
        conversation: {
          name: "Client Support",
          type: "PORTAL",
          customerId: CUSTOMER_ID,
          assigneeId: "user-assignee",
        },
      } as any);

      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { userId: "user-assignee" },
      ] as any);

      vi.mocked(db.messagingNotificationPreference.findMany).mockResolvedValue([
        {
          userId: "user-assignee",
          allNotificationsEnabled: true,
          repliesEnabled: true,
        },
      ] as any);

      // Mute user-assignee
      vi.mocked(db.conversationReadState.findMany).mockResolvedValue([
        { userId: "user-assignee", isMuted: true },
      ] as any);
      vi.mocked(db.profile.findMany).mockResolvedValue([
        { id: "user-assignee", email: "assignee@test.com" },
      ] as any);

      await processNotificationEvents(ORG_ID, CONV_ID);

      expect(createNotification).not.toHaveBeenCalled();
    });
  });

  describe("2. Client notifications for internal EXTERNAL_VISIBLE replies", () => {
    it("emails portal client for internal EXTERNAL_VISIBLE replies and registers audit event", async () => {
      vi.mocked(consumeDownstreamEvents).mockResolvedValueOnce({
        events: [
          {
            cursor: 102n,
            eventId: "evt-2",
            eventType: "conversation.message.created",
            payload: { messageId: "msg-2" },
          },
        ],
        hasMore: false,
      });

      vi.mocked(buildNotificationPayload).mockReturnValueOnce({
        messageId: "msg-2",
      });

      vi.mocked(db.conversationMessage.findUnique).mockResolvedValue({
        id: "msg-2",
        body: "This is support replying to you.",
        deletedAt: null,
        conversationId: CONV_ID,
        audience: "EXTERNAL_VISIBLE",
        customerId: null,
        authorId: "user-operator",
        conversation: {
          name: "Client Support",
          type: "PORTAL",
          customerId: CUSTOMER_ID,
          assigneeId: "user-operator",
        },
      } as any);

      vi.mocked(db.messagingAuditEvent.findFirst).mockResolvedValue(null);

      await processNotificationEvents(ORG_ID, CONV_ID);

      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "client@acme.com",
          subject: "New message from Test Org",
        })
      );
    });

    it("does not email client for INTERNAL_ONLY notes", async () => {
      vi.mocked(consumeDownstreamEvents).mockResolvedValueOnce({
        events: [
          {
            cursor: 103n,
            eventId: "evt-3",
            eventType: "conversation.message.created",
            payload: { messageId: "msg-3" },
          },
        ],
        hasMore: false,
      });

      vi.mocked(buildNotificationPayload).mockReturnValueOnce({
        messageId: "msg-3",
      });

      vi.mocked(db.conversationMessage.findUnique).mockResolvedValue({
        id: "msg-3",
        body: "Internal note: check customer billing history.",
        deletedAt: null,
        conversationId: CONV_ID,
        audience: "INTERNAL_ONLY",
        customerId: null,
        authorId: "user-operator",
        conversation: {
          name: "Client Support",
          type: "PORTAL",
          customerId: CUSTOMER_ID,
          assigneeId: "user-operator",
        },
      } as any);

      await processNotificationEvents(ORG_ID, CONV_ID);

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("deduplicates notification sends for the same message", async () => {
      vi.mocked(consumeDownstreamEvents).mockResolvedValueOnce({
        events: [
          {
            cursor: 104n,
            eventId: "evt-4",
            eventType: "conversation.message.created",
            payload: { messageId: "msg-4" },
          },
        ],
        hasMore: false,
      });

      vi.mocked(buildNotificationPayload).mockReturnValueOnce({
        messageId: "msg-4",
      });

      vi.mocked(db.conversationMessage.findUnique).mockResolvedValue({
        id: "msg-4",
        body: "Another response.",
        deletedAt: null,
        conversationId: CONV_ID,
        audience: "EXTERNAL_VISIBLE",
        customerId: null,
        authorId: "user-operator",
        conversation: {
          name: "Client Support",
          type: "PORTAL",
          customerId: CUSTOMER_ID,
          assigneeId: "user-operator",
        },
      } as any);

      // Mock that audit log already exists for this client notification
      vi.mocked(db.messagingAuditEvent.findFirst).mockResolvedValue({
        id: "audit-1",
      } as any);

      await processNotificationEvents(ORG_ID, CONV_ID);

      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("3. Secure attachment handling", () => {
    it("validates file constraints (mime, extension, size) on upload", async () => {
      // Empty file
      const emptyFile = new File([], "empty.png", { type: "image/png" });
      const fd1 = new FormData();
      fd1.append("file", emptyFile);
      const res1 = await uploadPortalAttachment(ORG_SLUG, fd1);
      expect(res1.success).toBe(false);
      expect(res1.error).toContain("empty");

      // Blocked extension (passes mime-type check but blocked by extension)
      const badFile = new File(["hacking content"], "virus.exe", { type: "image/png" });
      const fd2 = new FormData();
      fd2.append("file", badFile);
      const res2 = await uploadPortalAttachment(ORG_SLUG, fd2);
      expect(res2.success).toBe(false);
      expect(res2.error).toContain("extension");

      // Valid upload
      const okFile = new File(["valid image data"], "screenshot.png", { type: "image/png" });
      const fd3 = new FormData();
      fd3.append("file", okFile);
      const res3 = await uploadPortalAttachment(ORG_SLUG, fd3);
      expect(res3.success).toBe(true);
      expect(res3.data?.uploadToken).toBeDefined();
    });

    it("verifies upload token during submitPortalConversationReply", async () => {
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: CONV_ID,
        orgId: ORG_ID,
        customerId: CUSTOMER_ID,
        type: "PORTAL",
        portalState: "OPEN",
      } as any);

      // Wrong upload token
      const attachments = [
        {
          storageRef: "mock-storage-key",
          fileName: "screenshot.png",
          mimeType: "image/png",
          sizeBytes: 100,
          uploadToken: "invalid-token",
        },
      ];

      const res = await submitPortalConversationReply(ORG_SLUG, CONV_ID, "Here is attachment", attachments);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Invalid upload token");
    });

    it("enforces customer-scoped download access checks", async () => {
      vi.mocked(db.conversationAttachment.findFirst).mockResolvedValue({
        id: "att-1",
        storageRef: "some-key",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        messageId: "msg-1",
        scanStatus: "CLEAN",
      } as any);

      // Case A: Message is INTERNAL_ONLY -> fails closed
      vi.mocked(db.conversationMessage.findFirst).mockResolvedValue(null); // not found under EXTERNAL_VISIBLE

      const resA = await getPortalAttachmentDownloadUrl(ORG_SLUG, "att-1");
      expect(resA.success).toBe(false);
      expect(resA.error).toContain("not found or access denied");

      // Case B: Message is EXTERNAL_VISIBLE but client is not active participant -> fails closed
      vi.mocked(db.conversationMessage.findFirst).mockResolvedValue({
        conversationId: CONV_ID,
      } as any);
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: CONV_ID,
        customerId: CUSTOMER_ID,
      } as any);
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue(null); // not active

      const resB = await getPortalAttachmentDownloadUrl(ORG_SLUG, "att-1");
      expect(resB.success).toBe(false);
      expect(resB.error).toContain("not found or access denied");

      // Case C: Valid participant and message -> signs URL successfully
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        id: "part-1",
      } as any);

      const resC = await getPortalAttachmentDownloadUrl(ORG_SLUG, "att-1");
      expect(resC.success).toBe(true);
      expect(resC.data?.signedUrl).toBe("https://storage.mock/signed-url");
    });

    it("gates portal downloads based on attachment scanStatus", async () => {
      // Setup base valid mocks for visibility and membership checks
      vi.mocked(db.conversationMessage.findFirst).mockResolvedValue({
        conversationId: CONV_ID,
      } as any);
      vi.mocked(db.conversation.findFirst).mockResolvedValue({
        id: CONV_ID,
        customerId: CUSTOMER_ID,
      } as any);
      vi.mocked(db.conversationParticipant.findFirst).mockResolvedValue({
        id: "part-1",
      } as any);

      // 1. PENDING attachment: not downloadable yet
      vi.mocked(db.conversationAttachment.findFirst).mockResolvedValue({
        id: "att-pending",
        storageRef: "some-key",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        messageId: "msg-1",
        scanStatus: "PENDING",
      } as any);
      const resPending = await getPortalAttachmentDownloadUrl(ORG_SLUG, "att-pending");
      expect(resPending.success).toBe(false);
      expect(resPending.error).toContain("not available for download");

      // 2. BLOCKED attachment: never downloadable
      vi.mocked(db.conversationAttachment.findFirst).mockResolvedValue({
        id: "att-blocked",
        storageRef: "some-key",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        messageId: "msg-1",
        scanStatus: "BLOCKED",
      } as any);
      const resBlocked = await getPortalAttachmentDownloadUrl(ORG_SLUG, "att-blocked");
      expect(resBlocked.success).toBe(false);
      expect(resBlocked.error).toContain("not available for download");

      // 3. CLEAN attachment: downloadable
      vi.mocked(db.conversationAttachment.findFirst).mockResolvedValue({
        id: "att-clean",
        storageRef: "some-key",
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        messageId: "msg-1",
        scanStatus: "CLEAN",
      } as any);
      const resClean = await getPortalAttachmentDownloadUrl(ORG_SLUG, "att-clean");
      expect(resClean.success).toBe(true);
      expect(resClean.data?.signedUrl).toBe("https://storage.mock/signed-url");
    });
  });

  describe("4. Operator diagnostics & supportability", () => {
    it("reports portal conversation activity, assignment, and waiting states truthfully", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValue({ role: "admin" } as any);

      // Mock portal conversations: one open, one closed, one unassigned
      vi.mocked(db.conversation.findMany).mockResolvedValue([
        {
          id: "conv-open",
          orgId: ORG_ID,
          type: "PORTAL",
          portalState: "WAITING_ON_INTERNAL",
          participants: [], // unassigned
        },
        {
          id: "conv-closed",
          orgId: ORG_ID,
          type: "PORTAL",
          portalState: "CLOSED",
          participants: [{ userId: "owner-1" }],
        },
      ] as any);

      // Mock messages for timing & coherence checks
      vi.mocked(db.conversationMessage.findMany).mockResolvedValue([
        {
          id: "msg-1",
          conversationId: "conv-open",
          customerId: CUSTOMER_ID, // external client sent last message
          authorId: null,
          createdAt: new Date("2026-06-09T10:00:00Z"),
          audience: "EXTERNAL_VISIBLE",
        },
      ] as any);

      vi.mocked(db.conversationAttachment.findMany).mockResolvedValue([]);

      const diagnostics = await getMessagingDiagnostics(ORG_ID, "user-admin");
      expect(diagnostics).not.toBeNull();
      expect(diagnostics!.portalConversationHealth).toBeDefined();

      const ph = diagnostics!.portalConversationHealth;
      expect(ph.totalPortalConversations).toBe(2);
      expect(ph.waitingOnInternalCount).toBe(1);
      expect(ph.closedCount).toBe(1);
      expect(ph.unassignedCount).toBe(1);
      expect(ph.incoherentStateCount).toBe(0); // WAITING_ON_INTERNAL and last message is customer => coherent!
    });
  });
});
