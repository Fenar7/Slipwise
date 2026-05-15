import { NextRequest } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import {
  getAttachmentDownloadUrl,
  AttachmentServiceError,
} from "@/lib/mailbox/attachment-service";

/**
 * GET /api/mailbox/attachments/{id}/download
 *
 * Returns a short-lived signed URL for downloading a draft attachment.
 * The caller must have access to the attachment's parent draft.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const auth = await requireIntegrationMemberRoute(request);
  if (!auth.ok) return auth.error;
  const { orgId, userId, role } = auth.ctx;

  const rate = await rateLimitByOrg(orgId, "mailbox");
  if (!rate.success) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const result = await getAttachmentDownloadUrl({
      orgId,
      userId,
      role,
      attachmentId: id,
    });

    return Response.json({
      signedUrl: result.signedUrl,
      filename: result.filename,
      mimeType: result.mimeType,
    });
  } catch (err) {
    if (err instanceof AttachmentServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode });
    }
    return Response.json({ error: "Failed to generate download URL" }, { status: 500 });
  }
}
