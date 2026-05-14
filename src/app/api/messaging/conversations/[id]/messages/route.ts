import { NextRequest } from "next/server";
import { listConversationMessages, sendMessage } from "@/lib/messaging";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  parsePagination,
  requireStringField,
  safeRead,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/conversations/:id/messages
 * List top-level messages for a conversation.
 *
 * Hardening (Sprint 3.3): unauthorized access returns 404 to prevent existence
 * leakage. Only active participants can list messages.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
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
 * POST /api/messaging/conversations/:id/messages
 * Send a message (top-level or thread reply).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const messageBody = requireStringField(body.body, "body", 10000);
    const threadId =
      typeof body.threadId === "string" && body.threadId.trim().length > 0
        ? body.threadId.trim()
        : null;

    const attachments = parseAttachments(body.attachments);

    const message = await sendMessage({
      orgId,
      conversationId: id,
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
