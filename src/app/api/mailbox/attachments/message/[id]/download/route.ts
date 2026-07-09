import { NextRequest } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import {
  getMailboxAttachmentDownload,
  AttachmentServiceError,
} from "@/lib/mailbox/attachment-service";

/**
 * GET /api/mailbox/attachments/message/{id}/download
 *
 * Returns either:
 * - A signed URL (JSON with signedUrl) when the attachment is cached
 * - A direct binary stream (application/octet-stream) when fetched from provider
 *
 * The caller must have access to the parent thread/mailbox connection.
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
    const result = await getMailboxAttachmentDownload({
      orgId,
      userId,
      role,
      attachmentId: id,
    });

    if (result.kind === "signed-url") {
      return Response.json({
        signedUrl: result.signedUrl,
        filename: result.filename,
        mimeType: result.mimeType,
      });
    }

    // Direct byte stream fallback when cache unavailable
    return new Response(result.bytes, {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(result.bytes.byteLength),
      },
    });
  } catch (err) {
    if (err instanceof AttachmentServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode });
    }
    return Response.json({ error: "Failed to generate download URL" }, { status: 500 });
  }
}
