import { NextRequest } from "next/server";
import { listThreadReplies, replyToThread } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  safeRead,
  requireStringField,
  applyMessagingRateLimit,
} from "../../../../../_utils";

export const runtime = "nodejs";

function parseAttachments(raw: unknown): Array<{ storageRef: string; fileName: string; mimeType: string; sizeBytes: number; thumbnailRef?: string | null }> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("attachments: each item must be an object");
    }
    const att = item as Record<string, unknown>;
    if (typeof att.storageRef !== "string" || att.storageRef.trim().length === 0) {
      throw new Error("attachments: storageRef is required");
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
    return {
      storageRef: att.storageRef.trim(),
      fileName: att.fileName.trim(),
      mimeType: att.mimeType.trim(),
      sizeBytes: att.sizeBytes,
      thumbnailRef: typeof att.thumbnailRef === "string" ? att.thumbnailRef.trim() : null,
    };
  });
}

/**
 * GET /api/messaging/conversations/:id/threads/:threadId/replies
 * List replies for a specific thread.
 *
 * Sprint 5.2: live thread reply hydration.
 * Returns replies ordered by createdAt ascending.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id: conversationId, threadId } = await params;

    const replies = await safeRead(
      listThreadReplies(orgId, conversationId, threadId, userId),
    );

    return messagingApiResponse({ replies });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

/**
 * POST /api/messaging/conversations/:id/threads/:threadId/replies
 * Reply to a thread.
 *
 * Sprint 5.2: live thread reply creation via dedicated replyToThread service.
 * Increments thread.replyCount atomically.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    await applyMessagingRateLimit(request, orgId, "messagingSend");
    const { id: conversationId, threadId } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const messageBody = requireStringField(body.body, "body", 10000);
    const attachments = parseAttachments(body.attachments);

    const message = await replyToThread({
      orgId,
      conversationId,
      threadId,
      authorId: userId,
      body: messageBody,
      contentMeta:
        typeof body.contentMeta === "object" && body.contentMeta !== null
          ? (body.contentMeta as Record<string, unknown>)
          : null,
      attachments,
    });

    return messagingApiResponse(message, 201);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
