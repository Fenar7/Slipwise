import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
  parsePagination,
  safeRead,
} from "../../../_utils";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { id: conversationId } = await params;

    const participant = await db.conversationParticipant.findFirst({
      where: { orgId, conversationId, userId, leftAt: null },
    });
    if (!participant) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Access denied" } },
        { status: 403 },
      );
    }

    const { limit, cursor } = parsePagination(request.nextUrl.searchParams);
    const category = request.nextUrl.searchParams.get("category");
    const sort = request.nextUrl.searchParams.get("sort") ?? "newest";

    const messageIds = await db.conversationMessage.findMany({
      where: { orgId, conversationId, status: { not: "DELETED" } },
      select: { id: true },
    });
    const idSet = new Set(messageIds.map((m: { id: string }) => m.id));

    const where: Record<string, unknown> = { orgId, messageId: { in: [...idSet] } };
    if (category === "image") {
      where.mimeType = { startsWith: "image/" };
    } else if (category === "document") {
      where.mimeType = {
        in: ["application/pdf", "text/plain", "application/msword",
             "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      };
    } else if (category === "spreadsheet") {
      where.mimeType = {
        in: ["text/csv", "application/vnd.ms-excel",
             "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      };
    }

    const orderBy: Record<string, string> = sort === "oldest"
      ? { createdAt: "asc" }
      : sort === "name"
        ? { fileName: "asc" }
        : { createdAt: "desc" };

    const rows = await safeRead(
      db.conversationAttachment.findMany({
        where,
        orderBy,
        take: Math.min(100, limit),
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
      }),
    );

    function deriveMimeCategory(mimeType: string): string {
      if (mimeType.startsWith("image/")) return "image";
      if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") return "spreadsheet";
      if (mimeType === "application/pdf" || mimeType.startsWith("text/") || mimeType.includes("word") || mimeType.includes("document")) return "document";
      return "other";
    }

    function formatSizeLabel(sizeBytes: number): string {
      if (sizeBytes < 1024) return `${sizeBytes} B`;
      if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(0)} KB`;
      return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    const files = rows.map((row: {
      id: string; storageRef: string; fileName: string; mimeType: string;
      sizeBytes: number; thumbnailRef: string | null; scanStatus: string;
      createdAt: Date; messageId: string;
    }) => ({
      id: row.id,
      storageRef: row.storageRef,
      name: row.fileName,
      mimeType: row.mimeType,
      mimeCategory: deriveMimeCategory(row.mimeType),
      sizeLabel: formatSizeLabel(row.sizeBytes),
      sizeBytes: row.sizeBytes,
      thumbnailRef: row.thumbnailRef,
      scanStatus: row.scanStatus,
      uploadedAt: row.createdAt.toISOString(),
      messageId: row.messageId,
    }));

    return messagingApiResponse({
      files,
      meta: { limit, hasMore: files.length === limit },
    });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}
