import "server-only";

import { db } from "@/lib/db";
import { downloadFileServer } from "@/lib/storage/upload-server";
import { AttachmentScanStatus, AttachmentIndexingStatus } from "@/generated/prisma/client";

// Limit text size to avoid performance/memory exhaustion
const MAX_EXTRACTED_TEXT_LENGTH = 100000;

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

  const { orgId, messageId, fileName, mimeType, scanStatus, storageRef } = attachment;
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
        lastError: errorMsg,
      },
      update: {
        scanStatus,
        indexingStatus: AttachmentIndexingStatus.FAILED,
        extractedText: "",
        extractedPreview: null,
        lastError: errorMsg,
        lastIndexedAt: new Date(),
      },
    });
  }
}

/**
 * Extracts text from PDF bytes using pdfjs-dist.
 */
async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjsLib.getDocument({
      data: pdfBytes,
      disableWorker: true,
    }).promise;

    let text = "";
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: unknown) => {
          const typedItem = item as Record<string, unknown>;
          return typeof typedItem.str === "string" ? typedItem.str : "";
        })
        .filter((str) => str.trim().length > 0)
        .join(" ");
      text += pageText + "\n";
      page.cleanup();
    }

    await pdf.destroy();
    return text;
  } catch (err) {
    console.error("PDF text extraction error during search indexing:", err);
    throw new Error(`PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Background seam to trigger indexing for all attachments on a created message.
 */
export function indexAttachmentsForMessage(messageId: string): void {
  // Fire and forget / background execute to not block the synchronous path
  db.conversationAttachment.findMany({
    where: { messageId },
    select: { id: true },
  })
    .then((attachments) => {
      if (attachments.length > 0) {
        Promise.allSettled(attachments.map((att) => indexAttachment(att.id)))
          .catch((err) => console.error("Unhandled error indexing message attachments:", err));
      }
    })
    .catch((err) => console.error("Error finding attachments to index:", err));
}
