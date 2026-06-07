"use server";

import { db } from "@/lib/db";
import { requirePortalSession } from "@/lib/portal-auth";

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

export async function uploadPortalAttachmentAction(
  fileName: string,
  fileSize: number,
  mimeType: string,
  storageKey: string
) {
  try {
    const { orgId, customerId } = await requirePortalSession();

    const trimmedName = fileName.trim();
    if (!trimmedName) {
      return { success: false, error: "File name is required" };
    }
    if (fileSize <= 0 || fileSize > MAX_ATTACHMENT_SIZE) {
      return { success: false, error: "Invalid file size" };
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return { success: false, error: "Unsupported file type" };
    }
    if (!storageKey.startsWith("portal/attachments/")) {
      return { success: false, error: "Invalid attachment storage path" };
    }

    const attachment = await db.fileAttachment.create({
      data: {
        organizationId: orgId,
        fileName: trimmedName,
        size: fileSize,
        mimeType,
        storageKey,
        entityType: "ticket_reply",
        entityId: "temp", // Temporary until linked to a reply
      },
    });

    try {
      const { recordExternalEvent } = await import("@/lib/portal-signals");
      await recordExternalEvent({
        orgId,
        customerId,
        eventType: "PROOF_UPLOADED",
        resourceType: "FileAttachment",
        resourceId: attachment.id,
        metadata: { isTicketAttachment: true, fileSize },
      });
    } catch {}

    return { success: true, id: attachment.id };
  } catch (error) {
    console.error("[portal-attachments] uploadPortalAttachmentAction error:", error);
    return { success: false, error: "Failed to register attachment" };
  }
}
