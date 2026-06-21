import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSignedUrlServer, uploadFileServer } from "@/lib/storage/upload-server";
import {
  requireMessagingApiContext,
  handleMessagingApiError,
} from "../../../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/attachments/:id/download
 *
 * Returns a short-lived signed URL for authorised attachment download.
 *
 * Security model:
 * - Verifies the attachment exists and belongs to the requesting org.
 * - Traverses attachment → message → conversation.
 * - Confirms the requesting user is either:
 *   (a) an active participant (leftAt IS NULL), OR
 *   (b) a former participant (any leftAt) — they still saw the message while
 *       they were present, so access is historically valid, OR
 *   (c) an org admin/owner — admins can always audit attachments.
 * - Returns only a short-lived signed URL, never a raw storage path.
 * - Signs with a 5-minute expiry to limit token lifetime.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId, role } = await requireMessagingApiContext();
    const { id: attachmentId } = await params;

    const attachment = await db.conversationAttachment.findFirst({
      where: { id: attachmentId, orgId },
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
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Attachment not found" } },
        { status: 404 },
      );
    }

    // Blocked attachments may not be downloaded by anyone
    if (attachment.scanStatus === "BLOCKED") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "This attachment has been blocked by security policy" } },
        { status: 403 },
      );
    }

    // Traverse attachment → message → conversation
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

    // Org admins, co-owners and owners can always access attachments within their org
    const isOrgAdmin = role === "owner" || role === "admin" || role === "co_owner";

    if (!isOrgAdmin) {
      // For regular members: verify they are (or were) a participant.
      // We intentionally allow former participants (leftAt IS NOT NULL) because
      // they legitimately received the message while they were present.
      const participant = await db.conversationParticipant.findFirst({
        where: {
          orgId,
          conversationId: message.conversationId,
          userId,
        },
        select: { id: true },
      });

      if (!participant) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "You are not a participant of this conversation" } },
          { status: 403 },
        );
      }
    }

    const isLocalDev =
      process.env.NODE_ENV === "development" ||
      process.env.SUPABASE_URL?.includes("localhost") ||
      process.env.SUPABASE_URL?.includes("127.0.0.1");

    async function resolveSignedUrl(): Promise<string> {
      try {
        return await getSignedUrlServer(
          "attachments",
          attachment.storageRef,
          300,
          { download: attachment.fileName },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message.toLowerCase() : "";
        const isMissingFile = msg.includes("object not found");

        if (isMissingFile && isLocalDev) {
          const placeholder = Buffer.from(
            `Local development placeholder — ${attachment.fileName}\nThis file was auto-generated because the original blob was missing from local storage.\n`,
            "utf-8",
          );
          await uploadFileServer(
            "attachments",
            attachment.storageRef,
            placeholder,
            attachment.mimeType || "application/octet-stream",
            { useAdmin: true },
          );
          return await getSignedUrlServer(
            "attachments",
            attachment.storageRef,
            300,
            { download: attachment.fileName },
          );
        }

        throw err;
      }
    }

    const signedUrl = await resolveSignedUrl();

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
