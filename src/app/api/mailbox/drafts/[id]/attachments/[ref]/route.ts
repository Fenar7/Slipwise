import { NextRequest } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import {
  removeDraftAttachment,
  AttachmentServiceError,
} from "@/lib/mailbox/attachment-service";

/**
 * DELETE /api/mailbox/drafts/{id}/attachments/{ref}
 *
 * Remove a staged attachment from a draft.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ref: string }> },
) {
  const { id, ref } = await params;

  const auth = await requireIntegrationMemberRoute(request);
  if (!auth.ok) return auth.error;
  const { orgId, userId, role } = auth.ctx;

  const rate = await rateLimitByOrg(orgId, "mailbox");
  if (!rate.success) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    await removeDraftAttachment({
      orgId,
      userId,
      role,
      draftId: id,
      attachmentId: ref,
    });

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof AttachmentServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode });
    }
    return Response.json({ error: "Failed to remove attachment" }, { status: 500 });
  }
}
