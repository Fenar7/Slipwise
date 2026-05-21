import { NextRequest } from "next/server";
import { getDraft, saveDraft, deleteDraft } from "@/lib/messaging/draft-service";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  requireStringField,
  safeRead,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/conversations/:id/draft
 * Retrieve the current user's draft for this conversation/thread.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;
    const threadId = request.nextUrl.searchParams.get("threadId");

    const draft = await safeRead(
      getDraft({
        orgId,
        conversationId: id,
        userId,
        threadId: threadId ?? undefined,
      }),
    );

    return messagingApiResponse({ draft });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

/**
 * POST /api/messaging/conversations/:id/draft
 * Upsert the current user's draft for this conversation/thread.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const draftBody = requireStringField(body.body, "body", 10000);
    const threadId =
      typeof body.threadId === "string" && body.threadId.trim().length > 0
        ? body.threadId.trim()
        : null;

    const draft = await saveDraft({
      orgId,
      conversationId: id,
      userId,
      threadId,
      body: draftBody,
      contentMeta:
        typeof body.contentMeta === "object" && body.contentMeta !== null
          ? (body.contentMeta as Record<string, unknown>)
          : null,
    });

    return messagingApiResponse(draft, 201);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

/**
 * DELETE /api/messaging/conversations/:id/draft
 * Remove the current user's draft for this conversation/thread.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id } = await params;
    const threadId = request.nextUrl.searchParams.get("threadId");

    await deleteDraft({
      orgId,
      conversationId: id,
      userId,
      threadId: threadId ?? undefined,
    });

    return messagingApiResponse({ deleted: true });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
