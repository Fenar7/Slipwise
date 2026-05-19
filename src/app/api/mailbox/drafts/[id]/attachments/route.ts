import { NextRequest } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import {
  stageDraftAttachment,
  AttachmentServiceError,
} from "@/lib/mailbox/attachment-service";

/**
 * POST /api/mailbox/drafts/{id}/attachments
 *
 * Upload a file attachment to a draft.
 * Expects multipart/form-data with a `file` field.
 * Optional `isInline` field (defaults to false).
 */
export async function POST(
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return Response.json({ error: "Missing file field" }, { status: 400 });
  }

  const isInline = formData.get("isInline") === "true";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await stageDraftAttachment({
      orgId,
      userId,
      role,
      draftId: id,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      isInline,
      fileBuffer: buffer,
    });

    return Response.json({
      attachmentId: result.attachmentId,
      storageKey: result.storageKey,
    });
  } catch (err) {
    if (err instanceof AttachmentServiceError) {
      return Response.json({ error: err.message }, { status: err.statusCode });
    }
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
