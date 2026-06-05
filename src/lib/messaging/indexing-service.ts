import "server-only";

import { db } from "@/lib/db";
import { downloadFileServer } from "@/lib/storage/upload-server";
import { AttachmentScanStatus, AttachmentIndexingStatus } from "@/generated/prisma/client";
import {
  consumeDownstreamEvents,
  recordConsumptionCheckpoint,
  getConsumptionCheckpoint,
  buildSearchIndexPayload,
} from "./realtime";

// Limit text size to avoid performance/memory exhaustion
const MAX_EXTRACTED_TEXT_LENGTH = 100000;

// Resource limits for PDF indexing
const MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_PDF_PAGE_COUNT = 10;

// Timeout for PDF text extraction (30 seconds)
const PDF_EXTRACTION_TIMEOUT_MS = 30_000;

/**
 * Indexes a single attachment according to safe indexing rules.
 * - CLEAN: indexed if supported file type (text/plain, text/csv, application/pdf).
 * - PENDING: remains unindexed with status PENDING.
 * - BLOCKED: remains unindexed, text is empty, status UNINDEXED.
 * - Unsupported: status UNINDEXED, text empty.
 */
export async function indexAttachment(attachmentId: string): Promise<void> {
  const attachment = await db.conversationAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      message: {
        select: {
          conversationId: true,
        },
      },
    },
  });

  if (!attachment) {
    throw new Error(`Attachment not found: ${attachmentId}`);
  }

  const { orgId, messageId, fileName, mimeType, scanStatus, storageRef, sizeBytes } = attachment;
  const conversationId = attachment.message.conversationId;

  // Rule: PENDING attachments are not yet searchable and must remain truthfully unindexed
  if (scanStatus === AttachmentScanStatus.PENDING) {
    await db.messagingAttachmentIndex.upsert({
      where: { attachmentId },
      create: {
        orgId,
        attachmentId,
        messageId,
        conversationId,
        fileName,
        mimeType,
        scanStatus,
        indexingStatus: AttachmentIndexingStatus.PENDING,
        extractedText: "",
        extractedPreview: null,
      },
      update: {
        scanStatus,
        indexingStatus: AttachmentIndexingStatus.PENDING,
        extractedText: "",
        extractedPreview: null,
        lastIndexedAt: new Date(),
      },
    });
    return;
  }

  // Rule: BLOCKED attachments must not expose extracted text or content snippets
  if (scanStatus === AttachmentScanStatus.BLOCKED) {
    await db.messagingAttachmentIndex.upsert({
      where: { attachmentId },
      create: {
        orgId,
        attachmentId,
        messageId,
        conversationId,
        fileName,
        mimeType,
        scanStatus,
        indexingStatus: AttachmentIndexingStatus.UNINDEXED,
        extractedText: "",
        extractedPreview: "[Blocked due to security policy]",
        lastError: "Blocked by scan policy",
      },
      update: {
        scanStatus,
        indexingStatus: AttachmentIndexingStatus.UNINDEXED,
        extractedText: "",
        extractedPreview: "[Blocked due to security policy]",
        lastError: "Blocked by scan policy",
        lastIndexedAt: new Date(),
      },
    });
    return;
  }

  // Identify file type support
  const isPlain = mimeType === "text/plain";
  const isCsv = mimeType === "text/csv";
  const isPdf = mimeType === "application/pdf";

  if (!isPlain && !isCsv && !isPdf) {
    // Unsupported file types are stored as unindexed
    await db.messagingAttachmentIndex.upsert({
      where: { attachmentId },
      create: {
        orgId,
        attachmentId,
        messageId,
        conversationId,
        fileName,
        mimeType,
        scanStatus,
        indexingStatus: AttachmentIndexingStatus.UNINDEXED,
        extractedText: "",
        extractedPreview: null,
      },
      update: {
        scanStatus,
        indexingStatus: AttachmentIndexingStatus.UNINDEXED,
        extractedText: "",
        extractedPreview: null,
        lastIndexedAt: new Date(),
      },
    });
    return;
  }

  // Bounded resource check for large PDFs before starting download
  if (isPdf && sizeBytes > MAX_PDF_SIZE_BYTES) {
    await db.messagingAttachmentIndex.upsert({
      where: { attachmentId },
      create: {
        orgId,
        attachmentId,
        messageId,
        conversationId,
        fileName,
        mimeType,
        scanStatus,
        indexingStatus: AttachmentIndexingStatus.FAILED,
        extractedText: "",
        extractedPreview: null,
        lastError: "File size limit exceeded",
      },
      update: {
        scanStatus,
        indexingStatus: AttachmentIndexingStatus.FAILED,
        extractedText: "",
        extractedPreview: null,
        lastError: "File size limit exceeded",
        lastIndexedAt: new Date(),
      },
    });
    return;
  }

  try {
    const bytes = await downloadFileServer("attachments", storageRef, { useAdmin: true });
    let text = "";

    if (isPlain || isCsv) {
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } else if (isPdf) {
      text = await extractPdfText(bytes);
    }

    const truncatedText = text.slice(0, MAX_EXTRACTED_TEXT_LENGTH);
    const preview = truncatedText.slice(0, 200).trim();

    await db.messagingAttachmentIndex.upsert({
      where: { attachmentId },
      create: {
        orgId,
        attachmentId,
        messageId,
        conversationId,
        fileName,
        mimeType,
        scanStatus,
        indexingStatus: AttachmentIndexingStatus.INDEXED,
        extractedText: truncatedText,
        extractedPreview: preview || null,
      },
      update: {
        scanStatus,
        indexingStatus: AttachmentIndexingStatus.INDEXED,
        extractedText: truncatedText,
        extractedPreview: preview || null,
        lastError: null,
        lastIndexedAt: new Date(),
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const safeErrorMsg = errorMsg.includes("limit exceeded")
      ? errorMsg
      : "Failed to extract PDF text";

    await db.messagingAttachmentIndex.upsert({
      where: { attachmentId },
      create: {
        orgId,
        attachmentId,
        messageId,
        conversationId,
        fileName,
        mimeType,
        scanStatus,
        indexingStatus: AttachmentIndexingStatus.FAILED,
        extractedText: "",
        extractedPreview: null,
        lastError: safeErrorMsg,
      },
      update: {
        scanStatus,
        indexingStatus: AttachmentIndexingStatus.FAILED,
        extractedText: "",
        extractedPreview: null,
        lastError: safeErrorMsg,
        lastIndexedAt: new Date(),
      },
    });
  }
}

/**
 * Extracts text from PDF bytes using pdfjs-dist.
 * Includes a timeout guard to prevent indefinite hangs on malformed PDFs.
 */
async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdf: any = null;
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const extractionPromise = (async () => {
      pdf = await pdfjsLib.getDocument({
        data: pdfBytes,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        disableWorker: true,
      } as any).promise;

      if (pdf.numPages > MAX_PDF_PAGE_COUNT) {
        throw new Error("Page count limit exceeded");
      }

      let text = "";
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: unknown) => {
            const typedItem = item as Record<string, unknown>;
            return typeof typedItem.str === "string" ? typedItem.str : "";
          })
          .filter((str: string) => str.trim().length > 0)
          .join(" ");
        text += pageText + "\n";
        page.cleanup();
      }

      return text;
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("PDF extraction timeout")), PDF_EXTRACTION_TIMEOUT_MS);
    });

    return await Promise.race([extractionPromise, timeoutPromise]);
  } catch (err) {
    if (err instanceof Error && err.message === "Page count limit exceeded") {
      throw err;
    }
    if (err instanceof Error && err.message === "PDF extraction timeout") {
      throw err;
    }
    console.error("PDF text extraction error during search indexing:", err);
    throw new Error(`PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (pdf) {
      try {
        await pdf.destroy();
      } catch (destroyErr) {
        console.error("Error destroying PDF document:", destroyErr);
      }
    }
  }
}

/**
 * Processes search indexing events durably by consuming downstream events
 * and recording consumption checkpoints.
 *
 * Hardened (Sprint 9.5):
 * - Iterative loop instead of recursion to prevent stack overflow on high-volume conversations
 * - Batched attachment fetches per message to eliminate N+1 query pattern
 * - Bounded max iterations per invocation
 */
export async function processSearchIndexEvents(orgId: string, conversationId: string): Promise<void> {
  const checkpoint = await getConsumptionCheckpoint(db, {
    consumerType: "search_index",
    orgId,
    conversationId,
  });

  let currentCursor = checkpoint ? checkpoint.cursor : undefined;
  const maxIterations = 10;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const result = await consumeDownstreamEvents(db, {
      consumerType: "search_index",
      orgId,
      conversationId,
      afterCursor: currentCursor,
      eventTypes: ["conversation.message.created", "conversation.thread.replied"],
    });

    if (result.events.length === 0) break;

    // Batch-fetch all attachments for all messages in this batch (eliminates N+1)
    const messageIds = result.events
      .map((e) => buildSearchIndexPayload(e))
      .filter((p): p is NonNullable<typeof p> => p !== null && !!p.messageId)
      .map((p) => p.messageId!);

    const uniqueMessageIds = [...new Set(messageIds)];
    const allAttachments = uniqueMessageIds.length > 0
      ? await db.conversationAttachment.findMany({
          where: { messageId: { in: uniqueMessageIds } },
          select: { id: true, messageId: true },
        })
      : [];

    // Group attachments by messageId for O(1) lookup
    const attachmentsByMessage = new Map<string, Array<{ id: string }>>();
    for (const att of allAttachments) {
      const existing = attachmentsByMessage.get(att.messageId) ?? [];
      existing.push(att);
      attachmentsByMessage.set(att.messageId, existing);
    }

    // Index all attachments in this batch
    for (const event of result.events) {
      const payload = buildSearchIndexPayload(event);
      if (!payload || !payload.messageId) continue;

      const attachments = attachmentsByMessage.get(payload.messageId) ?? [];
      for (const attachment of attachments) {
        await indexAttachment(attachment.id);
      }
    }

    // Record checkpoint and prepare for next iteration
    if (result.nextCursor !== undefined) {
      await recordConsumptionCheckpoint(db, {
        consumerType: "search_index",
        orgId,
        conversationId,
        cursor: result.nextCursor,
      });
      currentCursor = result.nextCursor;
    }

    if (!result.hasMore) break;
  }
}

/**
 * Updates an attachment's scan status and triggers re-indexing.
 * - CLEAN: indexed if supported file type, file size, and page count limits.
 * - BLOCKED: removes any prior extracted text and marks as UNINDEXED.
 * - PENDING: remains unindexed.
 */
export async function updateAttachmentScanStatus(
  orgId: string,
  attachmentId: string,
  scanStatus: AttachmentScanStatus
): Promise<void> {
  await db.conversationAttachment.update({
    where: { id: attachmentId, orgId },
    data: { scanStatus },
  });

  // Re-run indexing to index / clear content matching the new scan status
  await indexAttachment(attachmentId);
}

/**
 * Background seam to trigger indexing for all attachments on a created message.
 * Utilizes the durable downstream event consumption seam.
 */
export function indexAttachmentsForMessage(messageId: string, orgId?: string, conversationId?: string): void {
  if (orgId && conversationId) {
    processSearchIndexEvents(orgId, conversationId).catch((err) =>
      console.error("Unhandled error processing search index events:", err)
    );
  } else {
    // Lookup conversation info asynchronously to remain backward-compatible
    db.conversationMessage.findUnique({
      where: { id: messageId },
      select: { orgId: true, conversationId: true },
    })
      .then((msg) => {
        if (msg) {
          processSearchIndexEvents(msg.orgId, msg.conversationId).catch((err) =>
            console.error("Unhandled error processing search index events:", err)
          );
        }
      })
      .catch((err) => {
        console.error("Error looking up message for indexAttachmentsForMessage:", err);
      });
  }
}
