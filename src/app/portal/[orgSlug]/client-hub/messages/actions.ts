"use server";

import { db } from "@/lib/db";
import { requirePortalSession } from "@/lib/portal-auth";
import { sendMessage } from "@/lib/messaging";
import { revalidatePath } from "next/cache";
import { uploadFileServer, getSignedUrlServer } from "@/lib/storage/upload-server";
import { mintUploadToken, verifyUploadToken } from "@/lib/messaging/service-helpers";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function validateCustomerEligibility(customerId: string, orgId: string, orgSlug: string) {
  const org = await db.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, defaults: { select: { portalEnabled: true } } },
  });

  if (!org || org.id !== orgId) {
    throw new Error("Unauthorized: Organization mismatch");
  }

  if (!org.defaults?.portalEnabled) {
    throw new Error("Portal access is disabled for this organization");
  }

  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId: orgId },
    select: { id: true, lifecycleStage: true, name: true },
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  if (customer.lifecycleStage === "CHURNED") {
    throw new Error("Customer is churned and ineligible for portal access");
  }

  return customer;
}

export interface PortalConversationItem {
  id: string;
  portalState: string;
  updatedAt: Date;
  lastMessageAt: Date | null;
  lastMessageSnippet: string | null;
  unreadCount: number;
  linkedRecordType: string | null;
  linkedRecordId: string | null;
}

export async function listPortalConversations(
  orgSlug: string
): Promise<ActionResult<{ conversations: PortalConversationItem[] }>> {
  try {
    const session = await requirePortalSession(orgSlug);
    await validateCustomerEligibility(session.customerId, session.orgId, orgSlug);

    const conversations = await db.conversation.findMany({
      where: {
        orgId: session.orgId,
        customerId: session.customerId,
        type: "PORTAL",
        participants: {
          some: {
            customerId: session.customerId,
            leftAt: null,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        const latestMsg = await db.conversationMessage.findFirst({
          where: {
            orgId: session.orgId,
            conversationId: conv.id,
            status: { not: "DELETED" },
            audience: "EXTERNAL_VISIBLE",
          },
          orderBy: { createdAt: "desc" },
          select: { body: true, createdAt: true },
        });

        const readState = await db.conversationReadState.findFirst({
          where: {
            orgId: session.orgId,
            conversationId: conv.id,
            customerId: session.customerId,
          },
          select: { lastReadAt: true },
        });

        const unreadCount = await db.conversationMessage.count({
          where: {
            orgId: session.orgId,
            conversationId: conv.id,
            status: { not: "DELETED" },
            audience: "EXTERNAL_VISIBLE",
            ...(readState?.lastReadAt ? { createdAt: { gt: readState.lastReadAt } } : {}),
          },
        });

        return {
          id: conv.id,
          portalState: conv.portalState,
          updatedAt: conv.updatedAt,
          lastMessageAt: latestMsg?.createdAt ?? null,
          lastMessageSnippet: latestMsg?.body ?? null,
          unreadCount,
          linkedRecordType: conv.linkedRecordType,
          linkedRecordId: conv.linkedRecordId,
        };
      })
    );

    enriched.sort((a, b) => {
      const timeA = a.lastMessageAt ? a.lastMessageAt.getTime() : a.updatedAt.getTime();
      const timeB = b.lastMessageAt ? b.lastMessageAt.getTime() : b.updatedAt.getTime();
      return timeB - timeA;
    });

    return { success: true, data: { conversations: enriched } };
  } catch (error: any) {
    console.error("[portal-messages] listPortalConversations error:", error);
    return { success: false, error: error.message || "Failed to load conversations" };
  }
}

export interface PortalConversationDetail {
  id: string;
  portalState: string;
  linkedRecordType: string | null;
  linkedRecordId: string | null;
  linkedRecordLabel: string | null;
  messages: Array<{
    id: string;
    body: string;
    createdAt: Date;
    isFromClient: boolean;
    authorName: string;
    attachments: Array<{
      id: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      scanStatus: string;
    }>;
  }>;
}

export async function getPortalConversationDetail(
  orgSlug: string,
  conversationId: string
): Promise<ActionResult<PortalConversationDetail | null>> {
  try {
    const session = await requirePortalSession(orgSlug);
    await validateCustomerEligibility(session.customerId, session.orgId, orgSlug);

    const conversation = await db.conversation.findFirst({
      where: {
        id: conversationId,
        orgId: session.orgId,
        customerId: session.customerId,
        type: "PORTAL",
      },
    });

    if (!conversation) {
      return { success: false, error: "Conversation not found or access denied" };
    }

    const messages = await db.conversationMessage.findMany({
      where: {
        orgId: session.orgId,
        conversationId,
        audience: "EXTERNAL_VISIBLE",
        status: { not: "DELETED" },
      },
      orderBy: { createdAt: "asc" },
      include: {
        customer: { select: { name: true } },
        attachments: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            scanStatus: true,
          },
        },
      },
    });

    const internalAuthorIds = messages
      .filter((m) => m.authorId !== null)
      .map((m) => m.authorId as string);

    const profiles = await db.profile.findMany({
      where: { id: { in: internalAuthorIds } },
      select: { id: true, firstName: true, lastName: true },
    });

    const authorNameMap = new Map<string, string>();
    profiles.forEach((p) => {
      authorNameMap.set(p.id, `${p.firstName || ""} ${p.lastName || ""}`.trim() || "Team Member");
    });

    const formattedMessages = messages.map((m) => {
      const isFromClient = m.customerId !== null;
      let authorName = "System";

      if (isFromClient) {
        authorName = m.customer?.name || "You";
      } else if (m.authorId) {
        authorName = authorNameMap.get(m.authorId) || "Team Member";
      }

      return {
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        isFromClient,
        authorName,
        attachments: m.attachments,
      };
    });

    let linkedRecordLabel = null;
    if (conversation.linkedRecordType && conversation.linkedRecordId) {
      if (conversation.linkedRecordType === "INVOICE") {
        const inv = await db.invoice.findFirst({
          where: {
            id: conversation.linkedRecordId,
            organizationId: session.orgId,
            customerId: session.customerId,
          },
          select: { invoiceNumber: true },
        });
        if (inv) {
          linkedRecordLabel = `Invoice #${inv.invoiceNumber}`;
        } else {
          linkedRecordLabel = "Linked Invoice (Details unavailable)";
        }
      } else {
        linkedRecordLabel = `${conversation.linkedRecordType.replace("_", " ")} Context`;
      }
    }

    return {
      success: true,
      data: {
        id: conversation.id,
        portalState: conversation.portalState,
        linkedRecordType: conversation.linkedRecordType,
        linkedRecordId: conversation.linkedRecordId,
        linkedRecordLabel,
        messages: formattedMessages,
      },
    };
  } catch (error: any) {
    console.error("[portal-messages] getPortalConversationDetail error:", error);
    return { success: false, error: error.message || "Failed to load conversation details" };
  }
}

export async function submitPortalConversationReply(
  orgSlug: string,
  conversationId: string,
  body: string,
  attachments?: Array<{
    storageRef: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadToken: string;
  }>
): Promise<ActionResult<{ messageId: string }>> {
  try {
    const session = await requirePortalSession(orgSlug);
    await validateCustomerEligibility(session.customerId, session.orgId, orgSlug);

    const trimmedBody = body.trim();
    if (!trimmedBody && (!attachments || attachments.length === 0)) {
      return { success: false, error: "Message content cannot be empty" };
    }

    const conversation = await db.conversation.findFirst({
      where: {
        id: conversationId,
        orgId: session.orgId,
        customerId: session.customerId,
        type: "PORTAL",
      },
    });

    if (!conversation) {
      return { success: false, error: "Conversation not found or access denied" };
    }

    if (conversation.portalState === "CLOSED") {
      return { success: false, error: "This conversation is closed. Replies are disabled." };
    }

    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (!verifyUploadToken(session.orgId, session.customerId, att.storageRef, att.uploadToken)) {
          await db.messagingAuditEvent.create({
            data: {
              orgId: session.orgId,
              actorId: session.customerId,
              action: "PORTAL_CONVERSATION_ACCESS_BLOCKED",
              summary: `Blocked portal reply: Invalid attachment upload token for ref: ${att.storageRef}`,
              conversationId,
            },
          });
          return { success: false, error: "Invalid upload token for attachment." };
        }
      }
    }

    const potentialDuplicates = await db.conversationMessage.findMany({
      where: {
        orgId: session.orgId,
        conversationId,
        customerId: session.customerId,
        body: trimmedBody,
        status: { not: "DELETED" },
        createdAt: { gte: new Date(Date.now() - 10000) },
      },
      select: {
        id: true,
        attachments: {
          select: { storageRef: true },
        },
      },
    });

    const duplicate = potentialDuplicates.find((dup) => {
      const dupRefs = dup.attachments.map((a) => a.storageRef).sort();
      const currentRefs = (attachments || []).map((a) => a.storageRef).sort();
      if (dupRefs.length !== currentRefs.length) return false;
      return dupRefs.every((ref, idx) => ref === currentRefs[idx]);
    });

    if (duplicate) {
      return { success: true, data: { messageId: duplicate.id } };
    }

    const message = await sendMessage({
      orgId: session.orgId,
      conversationId,
      authorId: session.customerId,
      body: trimmedBody,
      attachments: attachments ? attachments.map((att) => ({
        storageRef: att.storageRef,
        fileName: att.fileName,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
      })) : undefined,
    });

    revalidatePath(`/portal/${orgSlug}/client-hub/messages`);
    revalidatePath(`/portal/${orgSlug}/client-hub/messages/${conversationId}`);

    return { success: true, data: { messageId: message.id } };
  } catch (error: any) {
    console.error("[portal-messages] submitPortalConversationReply error:", error);
    return { success: false, error: error.message || "Failed to send message" };
  }
}

export async function markPortalConversationAsRead(
  orgSlug: string,
  conversationId: string
): Promise<ActionResult<void>> {
  try {
    const session = await requirePortalSession(orgSlug);
    await validateCustomerEligibility(session.customerId, session.orgId, orgSlug);

    const conversation = await db.conversation.findFirst({
      where: {
        id: conversationId,
        orgId: session.orgId,
        customerId: session.customerId,
        type: "PORTAL",
      },
    });

    if (!conversation) {
      return { success: false, error: "Conversation not found or access denied" };
    }

    const latestMsg = await db.conversationMessage.findFirst({
      where: {
        orgId: session.orgId,
        conversationId,
        status: { not: "DELETED" },
        audience: "EXTERNAL_VISIBLE",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    await db.conversationReadState.upsert({
      where: {
        conversationId_customerId: {
          conversationId,
          customerId: session.customerId,
        },
      },
      create: {
        orgId: session.orgId,
        conversationId,
        customerId: session.customerId,
        lastReadMessageId: latestMsg?.id || null,
        lastReadAt: new Date(),
        unreadCount: 0,
      },
      update: {
        lastReadMessageId: latestMsg?.id || null,
        lastReadAt: new Date(),
        unreadCount: 0,
      },
    });

    revalidatePath(`/portal/${orgSlug}/client-hub/messages`);
    revalidatePath(`/portal/${orgSlug}/client-hub/messages/${conversationId}`);

    return { success: true, data: undefined };
  } catch (error: any) {
    console.error("[portal-messages] markPortalConversationAsRead error:", error);
    return { success: false, error: error.message || "Failed to update read state" };
  }
}

const PORTAL_ALLOWED_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/zip", "application/x-zip-compressed",
]);

const PORTAL_BLOCKED_EXTENSIONS = new Set([
  ".exe", ".com", ".bat", ".cmd", ".msi", ".scr",
  ".vbs", ".ps1", ".sh", ".dll", ".sys",
]);

const PORTAL_MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function uploadPortalAttachment(
  orgSlug: string,
  formData: FormData
): Promise<ActionResult<{ storageRef: string; uploadToken: string; fileName: string; mimeType: string; sizeBytes: number }>> {
  try {
    const session = await requirePortalSession(orgSlug);
    await validateCustomerEligibility(session.customerId, session.orgId, orgSlug);

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return { success: false, error: "No file provided" };
    }

    const fileName = file.name;
    const mimeType = file.type;
    const sizeBytes = file.size;

    if (!PORTAL_ALLOWED_MIME_TYPES.has(mimeType)) {
      return { success: false, error: `File type "${mimeType}" is not supported.` };
    }

    const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
    if (PORTAL_BLOCKED_EXTENSIONS.has(ext)) {
      return { success: false, error: "File extension is blocked for security reasons." };
    }

    if (sizeBytes <= 0) {
      return { success: false, error: "The uploaded file is empty." };
    }

    if (sizeBytes > PORTAL_MAX_FILE_SIZE) {
      return { success: false, error: "File size exceeds the 50 MB limit." };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `${session.orgId}/messaging/${Date.now()}-${safeName}`;

    const { storageKey: savedKey } = await uploadFileServer(
      "attachments",
      storageKey,
      buffer,
      mimeType,
    );

    const uploadToken = mintUploadToken(session.orgId, session.customerId, savedKey);

    await db.messagingAuditEvent.create({
      data: {
        orgId: session.orgId,
        actorId: session.customerId,
        action: "PORTAL_ATTACHMENT_UPLOADED",
        summary: `Client uploaded portal attachment: ${fileName}`,
        metadata: {
          fileName,
          mimeType,
          sizeBytes,
        },
      },
    });

    return {
      success: true,
      data: {
        storageRef: savedKey,
        uploadToken,
        fileName,
        mimeType,
        sizeBytes,
      },
    };
  } catch (error: any) {
    console.error("[portal-messages] uploadPortalAttachment error:", error);
    return { success: false, error: error.message || "Upload failed" };
  }
}

export async function getPortalAttachmentDownloadUrl(
  orgSlug: string,
  attachmentId: string
): Promise<ActionResult<{ signedUrl: string; fileName: string; mimeType: string }>> {
  try {
    const session = await requirePortalSession(orgSlug);
    await validateCustomerEligibility(session.customerId, session.orgId, orgSlug);

    const attachment = await db.conversationAttachment.findFirst({
      where: { id: attachmentId, orgId: session.orgId },
      select: {
        id: true,
        storageRef: true,
        fileName: true,
        mimeType: true,
        messageId: true,
        scanStatus: true,
      },
    });

    if (!attachment) {
      return { success: false, error: "Attachment not found or access denied" };
    }

    if (attachment.scanStatus !== "CLEAN") {
      return { success: false, error: "This attachment is not available for download" };
    }

    const message = await db.conversationMessage.findFirst({
      where: {
        id: attachment.messageId,
        orgId: session.orgId,
        audience: "EXTERNAL_VISIBLE",
        status: { not: "DELETED" },
      },
      select: { conversationId: true },
    });

    if (!message) {
      return { success: false, error: "Attachment not found or access denied" };
    }

    const conversation = await db.conversation.findFirst({
      where: {
        id: message.conversationId,
        orgId: session.orgId,
        customerId: session.customerId,
        type: "PORTAL",
      },
    });

    if (!conversation) {
      return { success: false, error: "Attachment not found or access denied" };
    }

    const participant = await db.conversationParticipant.findFirst({
      where: {
        orgId: session.orgId,
        conversationId: message.conversationId,
        customerId: session.customerId,
        leftAt: null,
      },
    });

    if (!participant) {
      return { success: false, error: "Attachment not found or access denied" };
    }

    const signedUrl = await getSignedUrlServer(
      "attachments",
      attachment.storageRef,
      300,
      { download: attachment.fileName },
    );

    return {
      success: true,
      data: {
        signedUrl,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
      },
    };
  } catch (error: any) {
    console.error("[portal-messages] getPortalAttachmentDownloadUrl error:", error);
    return { success: false, error: error.message || "Failed to generate download link" };
  }
}
