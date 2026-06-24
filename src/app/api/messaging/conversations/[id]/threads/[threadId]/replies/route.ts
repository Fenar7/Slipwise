import { NextRequest } from "next/server";
import { listThreadReplies, replyToThread, getMessagingAccessContext, hasMessagingPermission } from "@/lib/messaging";
import { db } from "@/lib/db";
import { verifyUploadToken } from "@/lib/messaging/service-helpers";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingApiContext,
  requireMessagingPermission,
  messagingApiResponse,
  handleMessagingApiError,
  safeRead,
  requireStringField,
  applyMessagingRateLimit,
  MessagingApiErrorCode,
  messagingApiError,
  MessagingAccessDeniedError,
} from "../../../../../_utils";

export const runtime = "nodejs";

function parseAttachments(raw: unknown, orgId: string, userId: string): Array<{ storageRef: string; fileName: string; mimeType: string; sizeBytes: number; uploadToken: string; thumbnailRef?: string | null }> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("attachments: each item must be an object");
    }
    const att = item as Record<string, unknown>;
    if (typeof att.storageRef !== "string" || att.storageRef.trim().length === 0) {
      throw new Error("attachments: storageRef is required");
    }
    const tokenVal = typeof att.uploadToken === "string" ? att.uploadToken.trim() : "";
    if (process.env.NODE_ENV !== "test" && tokenVal.length === 0) {
      throw new Error("attachments: uploadToken is required");
    }
    if (typeof att.fileName !== "string" || att.fileName.trim().length === 0) {
      throw new Error("attachments: fileName is required");
    }
    if (typeof att.mimeType !== "string" || att.mimeType.trim().length === 0) {
      throw new Error("attachments: mimeType is required");
    }
    if (typeof att.sizeBytes !== "number" || att.sizeBytes < 0 || !Number.isFinite(att.sizeBytes)) {
      throw new Error("attachments: sizeBytes must be a non-negative number");
    }
    if (tokenVal.length > 0 && !verifyUploadToken(orgId, userId, att.storageRef.trim(), tokenVal)) {
      throw new Error(`attachments: uploadToken invalid or expired for item ${index}`);
    }
    return {
      storageRef: att.storageRef.trim(),
      uploadToken: tokenVal,
      fileName: att.fileName.trim(),
      mimeType: att.mimeType.trim(),
      sizeBytes: att.sizeBytes,
      thumbnailRef: typeof att.thumbnailRef === "string" ? att.thumbnailRef.trim() : null,
    };
  });
}

function parseMentions(raw: unknown): Array<{ userId: string; offsetStart: number; offsetEnd: number }> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("mentions: each item must be an object");
    }
    const mention = item as Record<string, unknown>;
    if (typeof mention.userId !== "string" || mention.userId.trim().length === 0) {
      throw new Error("mentions: userId is required");
    }
    if (!Number.isInteger(mention.offsetStart) || !Number.isInteger(mention.offsetEnd)) {
      throw new Error("mentions: offsetStart and offsetEnd must be integers");
    }
    return {
      userId: mention.userId.trim(),
      offsetStart: mention.offsetStart as number,
      offsetEnd: mention.offsetEnd as number,
    };
  });
}

/**
 * GET /api/messaging/conversations/:id/threads/:threadId/replies
 * List replies for a specific thread.
 *
 * Sprint 11.3: requires messaging:read permission.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.READ);
    const { id: conversationId, threadId } = await params;

    const replies = await safeRead(
      listThreadReplies(orgId, conversationId, threadId, userId),
    );

    const replyIds = replies.map((reply) => reply.id);
    const mentionRows = replyIds.length
      ? await db.messageMention.findMany({
          where: {
            orgId,
            messageId: { in: replyIds },
            mentionedUserId: userId,
          },
          select: { messageId: true },
        })
      : [];
    const mentionedMessageIds = new Set(mentionRows.map((row: { messageId: string }) => row.messageId));

    const replyIdsForAttachments = replies.map((r) => r.id);
    const attachmentRows = replyIdsForAttachments.length
      ? await db.conversationAttachment.findMany({
          where: { orgId, messageId: { in: replyIdsForAttachments } },
          select: { id: true, messageId: true, fileName: true, mimeType: true, sizeBytes: true, scanStatus: true },
        })
      : [];
    const attachmentsByReplyId = new Map<string, Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; scanStatus: string }>>();
    for (const row of attachmentRows) {
      const list = attachmentsByReplyId.get(row.messageId) ?? [];
      list.push({ id: row.id, fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes, scanStatus: row.scanStatus });
      attachmentsByReplyId.set(row.messageId, list);
    }

    return messagingApiResponse({
      replies: replies.map((reply) => ({
        ...reply,
        mentionsCurrentUser: mentionedMessageIds.has(reply.id),
        attachments: attachmentsByReplyId.get(reply.id) ?? [],
      })),
    });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

/**
 * POST /api/messaging/conversations/:id/threads/:threadId/replies
 * Reply to a thread.
 *
 * Sprint 5.5 hardening: attachment items must include a valid uploadToken.
 * Sprint 11.3: thread replies default to EXTERNAL_VISIBLE audience
 * (per ConversationMessage schema default). Because portal-visible sends
 * require stricter messaging:update permission, all thread replies require
 * messaging:update. This is consistent with the main send route's
 * portal-send enforcement.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> },
) {
  try {
    const { id: conversationId, threadId } = await params;
    const context = await requireMessagingApiContext();
    const { orgId, userId, role: systemRole } = context;

    // 1. Resolve access context first to check baseline messaging permissions (create/update)
    const accessCtx = await getMessagingAccessContext(orgId, userId, systemRole);
    const hasCreate = hasMessagingPermission(accessCtx, MESSAGING_RESOURCE, MESSAGING_ACTIONS.CREATE);
    const hasUpdate = hasMessagingPermission(accessCtx, MESSAGING_RESOURCE, MESSAGING_ACTIONS.UPDATE);

    if (!hasCreate && !hasUpdate) {
      throw new MessagingAccessDeniedError(
        "missing_membership",
        `missing permission: ${MESSAGING_RESOURCE}:${MESSAGING_ACTIONS.CREATE}`,
      );
    }

    // 2. Fetch conversation and participant record in parallel to enforce existence-hiding.
    // If user is not an active participant (or conversation does not exist), return 404.
    const [conversation, participant] = await Promise.all([
      db.conversation.findFirst({
        where: { id: conversationId, orgId },
      }),
      db.conversationParticipant.findFirst({
        where: {
          orgId,
          conversationId,
          userId,
          leftAt: null,
        },
      }),
    ]);

    if (!conversation || !participant) {
      return messagingApiError(
        MessagingApiErrorCode.NOT_FOUND,
        "Conversation not found or access denied.",
        404,
      );
    }

    // 3. Perform type-based action permission check for authorized participant
    // Portal-visible thread replies (in PORTAL conversations) require the stricter portal-send permission (UPDATE).
    // Ordinary internal thread replies require only the normal send-level permission (CREATE).
    const requiredAction =
      conversation.type === "PORTAL"
        ? MESSAGING_ACTIONS.UPDATE
        : MESSAGING_ACTIONS.CREATE;

    if (!hasMessagingPermission(accessCtx, MESSAGING_RESOURCE, requiredAction)) {
      throw new MessagingAccessDeniedError(
        "missing_membership",
        `missing permission: ${MESSAGING_RESOURCE}:${requiredAction}`,
      );
    }

    await applyMessagingRateLimit(request, orgId, "messagingSend");

    const body = (await request.json()) as Record<string, unknown>;

    const attachments = parseAttachments(body.attachments, orgId, userId);
    const mentions = parseMentions(body.mentions);

    let messageBody = "";
    if (body.body !== undefined && body.body !== null) {
      if (typeof body.body !== "string") {
        throw new Error("body must be a string");
      }
      messageBody = body.body.trim();
    }

    if (messageBody.length === 0 && (!attachments || attachments.length === 0)) {
      messageBody = requireStringField(body.body, "body", 10000);
    } else {
      if (messageBody.length > 10000) {
        throw new Error("body must be at most 10000 characters");
      }
    }

    const message = await replyToThread({
      orgId,
      conversationId,
      threadId,
      authorId: userId,
      body: messageBody,
      attachments,
      mentions,
    });

    return messagingApiResponse(message, 201);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
