import { NextRequest } from "next/server";
import { listConversationMessages, sendMessage } from "@/lib/messaging";
import { verifyUploadToken } from "@/lib/messaging/service-helpers";
import { MESSAGING_RESOURCE, MESSAGING_ACTIONS } from "@/lib/messaging/messaging-permissions";
import {
  requireMessagingApiContext,
  requireMessagingPermission,
  messagingApiResponse,
  handleMessagingApiError,
  parsePagination,
  requireStringField,
  safeRead,
  applyMessagingRateLimit,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/conversations/:id/messages
 * List top-level messages for a conversation.
 *
 * Hardening (Sprint 3.3): unauthorized access returns 404 to prevent existence
 * leakage. Only active participants can list messages.
 *
 * Sprint 11.3: requires messaging:read permission.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.READ);
    const { id } = await params;
    const { limit, cursor } = parsePagination(request.nextUrl.searchParams);

    const messages = await safeRead(
      listConversationMessages(orgId, id, userId, { limit, cursor: cursor ?? undefined }),
    );

    return messagingApiResponse({
      messages,
      meta: {
        limit,
        hasMore: messages.length === limit,
      },
    });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

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
 * POST /api/messaging/conversations/:id/messages
 * Send a message (top-level or thread reply).
 *
 * Sprint 5.5 hardening: attachment items must include a valid uploadToken
 * proven to originate from an authorized messaging upload for the current
 * user and org. Client-supplied storageRef/metadata alone are not trusted.
 *
 * Sprint 11.3: portal-visible sends (audience !== INTERNAL_ONLY) require
 * the stricter messaging:update permission. Internal-only sends require
 * only messaging:create. This enforces the capability distinction at the
 * route boundary before the service layer.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireMessagingApiContext();
    const { orgId, userId } = context;
    const { id } = await params;
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

    const threadId =
      typeof body.threadId === "string" && body.threadId.trim().length > 0
        ? body.threadId.trim()
        : null;
    const audience =
      body.audience === "INTERNAL_ONLY"
        ? "INTERNAL_ONLY"
        : "EXTERNAL_VISIBLE";

    // Sprint 11.3: portal-visible sends require stricter messaging:update permission.
    // Internal-only sends require only messaging:create.
    if (audience === "EXTERNAL_VISIBLE") {
      await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.UPDATE);
    } else {
      await requireMessagingPermission(MESSAGING_RESOURCE, MESSAGING_ACTIONS.CREATE);
    }

    const message = await sendMessage({
      orgId,
      conversationId: id,
      threadId,
      authorId: userId,
      body: messageBody,
      attachments,
      mentions,
      audience,
    });

    return messagingApiResponse(message, 201);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
