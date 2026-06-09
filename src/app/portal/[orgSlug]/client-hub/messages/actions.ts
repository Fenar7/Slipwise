"use server";

import { db } from "@/lib/db";
import { requirePortalSession } from "@/lib/portal-auth";
import { sendMessage } from "@/lib/messaging";
import { revalidatePath } from "next/cache";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Validates that the session matches the org slug, that the customer exists
 * and is not churned, and that the portal is enabled for the organization.
 */
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

/**
 * Lists PORTAL conversations for the authenticated customer.
 */
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
        // Retrieve latest EXTERNAL_VISIBLE message
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

        // Retrieve read state
        const readState = await db.conversationReadState.findFirst({
          where: {
            orgId: session.orgId,
            conversationId: conv.id,
            customerId: session.customerId,
          },
          select: { lastReadAt: true },
        });

        // Calculate dynamic unreadCount for EXTERNAL_VISIBLE messages only
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

    // Sort by last message time or conversation updated time
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
  }>;
}

/**
 * Retrieves a detailed PORTAL conversation with message timeline.
 * Enforces customer scoping and filters out INTERNAL_ONLY notes.
 */
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

    // Retrieve EXTERNAL_VISIBLE messages only, excluding soft-deleted ones
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
      },
    });

    // Batch fetch members to display names for internal messages
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
      };
    });

    // Resolve safe linked context badge
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
        // Degrade truthfully for other context types
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

/**
 * Submits a message reply to a PORTAL conversation from the client.
 */
export async function submitPortalConversationReply(
  orgSlug: string,
  conversationId: string,
  body: string
): Promise<ActionResult<{ messageId: string }>> {
  try {
    const session = await requirePortalSession(orgSlug);
    await validateCustomerEligibility(session.customerId, session.orgId, orgSlug);

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      return { success: false, error: "Message content cannot be empty" };
    }

    // Access check
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

    // Idempotency / Double submit protection: check if client sent exact same message in last 10s
    const duplicate = await db.conversationMessage.findFirst({
      where: {
        orgId: session.orgId,
        conversationId,
        customerId: session.customerId,
        body: trimmedBody,
        createdAt: { gte: new Date(Date.now() - 10000) },
      },
    });

    if (duplicate) {
      return { success: true, data: { messageId: duplicate.id } };
    }

    const message = await sendMessage({
      orgId: session.orgId,
      conversationId,
      authorId: session.customerId,
      body: trimmedBody,
    });

    revalidatePath(`/portal/${orgSlug}/client-hub/messages`);
    revalidatePath(`/portal/${orgSlug}/client-hub/messages/${conversationId}`);

    return { success: true, data: { messageId: message.id } };
  } catch (error: any) {
    console.error("[portal-messages] submitPortalConversationReply error:", error);
    return { success: false, error: error.message || "Failed to send message" };
  }
}

/**
 * Marks a portal conversation as read for the client by updating the read state.
 */
export async function markPortalConversationAsRead(
  orgSlug: string,
  conversationId: string
): Promise<ActionResult<void>> {
  try {
    const session = await requirePortalSession(orgSlug);
    await validateCustomerEligibility(session.customerId, session.orgId, orgSlug);

    // Access check
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
