import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSignedUrlServer } from "@/lib/storage/upload-server";
import {
  requireMessagingApiContext,
  handleMessagingApiError,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/attachments/:id/download
 *
 * Returns a short-lived signed URL for authorized attachment download.
 *
 * Security:
 * - Verifies the attachment exists and belongs to the requesting org
 * - Traverses attachment → message → conversation → participant to confirm
 *   the requesting user is an active conversation participant
 * - Returns only a signed URL, never a raw storage path
 * - Signs with a short expiry (5 minutes) to limit token lifetime
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id: attachmentId } = await params;

    const attachment = await db.conversationAttachment.findFirst({
      where: { id: attachmentId, orgId },
      select: {
        id: true,
        storageRef: true,
        fileName: true,
        mimeType: true,
        messageId: true,
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Attachment not found" } },
        { status: 404 },
      );
    }

    // Traverse attachment → message → conversation, then verify membership
    const message = await db.conversationMessage.findFirst({
      where: { id: attachment.messageId, orgId },
      select: { conversationId: true },
    });

    if (!message) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Attachment not found" } },
        { status: 404 },
      );
    }

    const participant = await db.conversationParticipant.findFirst({
      where: {
        orgId,
        conversationId: message.conversationId,
        userId,
        leftAt: null,
      },
    });

    if (!participant) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Access denied" } },
        { status: 403 },
      );
    }

    const signedUrl = await getSignedUrlServer(
      "attachments",
      attachment.storageRef,
      300, // 5-minute expiry
      { download: attachment.fileName },
    );

    return NextResponse.json({
      success: true,
      data: {
        signedUrl,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
      },
    });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
