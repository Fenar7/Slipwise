import { NextRequest, NextResponse } from "next/server";
import { uploadFileServer } from "@/lib/storage/upload-server";
import { mintUploadToken } from "@/lib/messaging/service-helpers";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  applyMessagingRateLimit,
} from "../../_utils";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/zip", "application/x-zip-compressed",
]);

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".com", ".bat", ".cmd", ".msi", ".scr",
  ".vbs", ".ps1", ".sh", ".dll", ".sys",
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function deriveMimeCategory(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") return "spreadsheet";
  if (mimeType === "application/pdf" || mimeType.startsWith("text/") || mimeType.includes("word") || mimeType.includes("document")) return "document";
  return "other";
}

/**
 * POST /api/messaging/attachments/upload
 *
 * Accepts a multipart file upload, stores it securely in the attachments
 * bucket, and returns an opaque storageRef + uploadToken for authenticated
 * attachment linkage.
 *
 * Sprint 5.5 hardening: returns an uploadToken binding { orgId, userId, storageRef }
 * so downstream message/reply routes can reject forged linkage.
 */
export async function POST(request: NextRequest) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    await applyMessagingRateLimit(request, orgId, "messagingUpload");

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return errorResponse("VALIDATION_ERROR", "Request must be multipart/form-data", 422);
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return errorResponse("VALIDATION_ERROR", "A file must be provided.", 422);
    }

    const fileName = file.name;
    const mimeType = file.type;
    const sizeBytes = file.size;

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return errorResponse("VALIDATION_ERROR", `File type "${mimeType}" is not supported for messaging attachments.`, 422);
    }

    const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      return errorResponse("VALIDATION_ERROR", "Files with this extension are blocked for security reasons.", 422);
    }

    if (sizeBytes <= 0) {
      return errorResponse("VALIDATION_ERROR", "The uploaded file is empty.", 422);
    }

    if (sizeBytes > MAX_FILE_SIZE) {
      return errorResponse("VALIDATION_ERROR", `File size (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB) exceeds the 50 MB limit.`, 422);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `${orgId}/messaging/${Date.now()}-${safeName}`;

    const { storageKey: savedKey } = await uploadFileServer(
      "attachments",
      storageKey,
      buffer,
      mimeType,
    );

    const uploadToken = mintUploadToken(orgId, userId, savedKey);

    return messagingApiResponse({
      storageRef: savedKey,
      uploadToken,
      fileName,
      mimeType,
      mimeCategory: deriveMimeCategory(mimeType),
      sizeBytes,
    }, 201);
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

function errorResponse(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}
