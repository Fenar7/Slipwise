import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { downloadFileServer, getSignedUrlServer, uploadFileServer } from "@/lib/storage/upload-server";
import {
  requireMessagingApiContext,
  handleMessagingApiError,
} from "../../../_utils";

export const runtime = "nodejs";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_MIME = "application/msword";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLS_MIME = "application/vnd.ms-excel";

const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;

interface PreviewResult {
  kind: "html" | "url";
  html?: string;
  signedUrl?: string;
}

async function convertDocxToHtml(buffer: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(buffer) });
  return result.value;
}

async function convertXlsxToHtml(buffer: Uint8Array): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return "<p>No sheets found in workbook.</p>";
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_html(sheet, { header: "" });
}

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
        sizeBytes: true,
        scanStatus: true,
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Attachment not found" } },
        { status: 404 },
      );
    }

    if (attachment.scanStatus === "BLOCKED") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "This attachment has been blocked by security policy" } },
        { status: 403 },
      );
    }

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

    const isOrgAdmin = role === "owner" || role === "admin" || role === "co_owner";

    if (!isOrgAdmin) {
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

    const mime = attachment.mimeType || "";
    const isDocx = mime === DOCX_MIME || mime === DOC_MIME;
    const isXlsx = mime === XLSX_MIME || mime === XLS_MIME;

    if (!isDocx && !isXlsx) {
      const signedUrl = await resolveSignedUrl(attachment);
      const result: PreviewResult = { kind: "url", signedUrl };
      return NextResponse.json({ success: true, data: result });
    }

    if (attachment.sizeBytes && attachment.sizeBytes > MAX_PREVIEW_BYTES) {
      const signedUrl = await resolveSignedUrl(attachment);
      const result: PreviewResult = { kind: "url", signedUrl };
      return NextResponse.json({ success: true, data: result });
    }

    const isLocalDev =
      process.env.NODE_ENV === "development" ||
      process.env.SUPABASE_URL?.includes("localhost") ||
      process.env.SUPABASE_URL?.includes("127.0.0.1");

    let buffer: Uint8Array;
    try {
      buffer = await downloadFileServer(
        "attachments",
        attachment.storageRef,
        { useAdmin: true },
      );
    } catch (downloadErr) {
      const msg = downloadErr instanceof Error ? downloadErr.message.toLowerCase() : "";
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
        buffer = placeholder;
      } else {
        throw downloadErr;
      }
    }

    let html: string;
    try {
      if (isDocx) {
        html = await convertDocxToHtml(buffer);
      } else {
        html = await convertXlsxToHtml(buffer);
      }
    } catch (convError) {
      console.error("[api/messaging] Preview conversion error:", convError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PREVIEW_CONVERSION_FAILED",
            message: convError instanceof Error ? convError.message : "Conversion failed",
          },
        },
        { status: 422 },
      );
    }

    const result: PreviewResult = { kind: "html", html };
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

async function resolveSignedUrl(attachment: {
  storageRef: string;
  fileName: string;
  mimeType: string | null;
}): Promise<string> {
  const isLocalDev =
    process.env.NODE_ENV === "development" ||
    process.env.SUPABASE_URL?.includes("localhost") ||
    process.env.SUPABASE_URL?.includes("127.0.0.1");

  try {
    return await getSignedUrlServer(
      "attachments",
      attachment.storageRef,
      86400,
      { download: attachment.fileName, useAdmin: true },
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
        86400,
        { download: attachment.fileName, useAdmin: true },
      );
    }

    throw err;
  }
}
