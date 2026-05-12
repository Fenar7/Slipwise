import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type {
  MailboxAttachmentRecord,
  MailboxMessageRecord,
  MailboxThreadRecord,
} from "./domain-types";
import type { MailboxMessageEnvelope, MailboxThreadEnvelope, MailboxAttachmentEnvelope } from "./provider-contracts";
import {
  classifyMessageDirection,
  normalizeParticipant,
  normalizeParticipants,
} from "./participant-service";
import { normalizeSnippet } from "./normalization-service";

export async function upsertMailboxThread(params: {
  orgId: string;
  mailboxConnectionId: string;
  envelope: MailboxThreadEnvelope;
}): Promise<MailboxThreadRecord> {
  const record = await db.mailboxThread.upsert({
    where: {
      orgId_mailboxConnectionId_providerThreadId: {
        orgId: params.orgId,
        mailboxConnectionId: params.mailboxConnectionId,
        providerThreadId: params.envelope.providerThreadId,
      },
    },
    update: {
      subject: params.envelope.subject,
      lastMessageAt: new Date(params.envelope.lastMessageAt),
      unreadCount: params.envelope.unreadCount,
    },
    create: {
      orgId: params.orgId,
      mailboxConnectionId: params.mailboxConnectionId,
      providerThreadId: params.envelope.providerThreadId,
      subject: params.envelope.subject,
      participantsSummary: [],
      lastMessageAt: new Date(params.envelope.lastMessageAt),
      unreadCount: params.envelope.unreadCount,
      status: "OPEN",
    },
  });
  return toThreadRecord(record);
}

export async function upsertMailboxMessage(params: {
  orgId: string;
  threadId: string;
  envelope: MailboxMessageEnvelope & { htmlBody: string; textBody: string | null };
  /** Mailbox connection email address for provider-neutral direction classification. */
  mailboxEmail: string;
}): Promise<MailboxMessageRecord> {
  const normalizedFrom = normalizeParticipant(params.envelope.from);
  const normalizedTo = normalizeParticipants(params.envelope.to);
  const normalizedCc = normalizeParticipants(params.envelope.cc);
  const normalizedBcc = normalizeParticipants(params.envelope.bcc);

  const senderEmail = normalizedFrom?.email ?? "";
  const direction = classifyMessageDirection(params.mailboxEmail, senderEmail);
  const snippet = normalizeSnippet(params.envelope.snippet);

  const record = await db.mailboxMessage.upsert({
    where: {
      orgId_threadId_providerMessageId: {
        orgId: params.orgId,
        threadId: params.threadId,
        providerMessageId: params.envelope.providerMessageId,
      },
    },
    update: {
      direction,
      from: normalizedFrom as unknown as Prisma.InputJsonValue,
      to: normalizedTo as unknown as Prisma.InputJsonValue,
      cc: normalizedCc as unknown as Prisma.InputJsonValue,
      bcc: normalizedBcc as unknown as Prisma.InputJsonValue,
      subject: params.envelope.subject,
      htmlBody: params.envelope.htmlBody,
      textBody: params.envelope.textBody,
      snippet,
      sentAt: new Date(params.envelope.sentAt),
      receivedAt: params.envelope.receivedAt ? new Date(params.envelope.receivedAt) : null,
      attachmentCount: params.envelope.attachmentCount,
      providerMetadata: params.envelope.providerMetadata as unknown as Prisma.InputJsonValue,
    },
    create: {
      orgId: params.orgId,
      threadId: params.threadId,
      providerMessageId: params.envelope.providerMessageId,
      rfcMessageId: params.envelope.rfcMessageId,
      direction,
      from: normalizedFrom as unknown as Prisma.InputJsonValue,
      to: normalizedTo as unknown as Prisma.InputJsonValue,
      cc: normalizedCc as unknown as Prisma.InputJsonValue,
      bcc: normalizedBcc as unknown as Prisma.InputJsonValue,
      subject: params.envelope.subject,
      htmlBody: params.envelope.htmlBody,
      textBody: params.envelope.textBody,
      snippet,
      sentAt: new Date(params.envelope.sentAt),
      receivedAt: params.envelope.receivedAt ? new Date(params.envelope.receivedAt) : null,
      attachmentCount: params.envelope.attachmentCount,
      providerMetadata: params.envelope.providerMetadata as unknown as Prisma.InputJsonValue,
    },
  });
  return toMessageRecord(record);
}

export async function upsertMailboxAttachment(params: {
  messageId: string;
  envelope: MailboxAttachmentEnvelope;
}): Promise<MailboxAttachmentRecord> {
  const record = await db.mailboxAttachment.upsert({
    where: {
      messageId_providerAttachmentId: {
        messageId: params.messageId,
        providerAttachmentId: params.envelope.providerAttachmentId,
      },
    },
    update: {
      filename: params.envelope.filename,
      mimeType: params.envelope.mimeType,
      size: params.envelope.size,
      isInline: params.envelope.isInline,
    },
    create: {
      messageId: params.messageId,
      providerAttachmentId: params.envelope.providerAttachmentId,
      filename: params.envelope.filename,
      mimeType: params.envelope.mimeType,
      size: params.envelope.size,
      isInline: params.envelope.isInline,
    },
  });
  return toAttachmentRecord(record);
}

/**
 * Update a thread's derived summary fields after its messages have been
 * normalized and ingested. Call this once per thread at the end of sync
 * (or per-batch) so thread-level metadata stays coherent.
 *
 * Sprint 3.3: participantsSummary is derived from normalized message
 * participants, not from raw provider envelope data.
 */
export async function updateMailboxThreadSummary(params: {
  orgId: string;
  threadId: string;
  participantsSummary: Prisma.InputJsonValue;
  lastMessageAt: Date;
}): Promise<void> {
  await db.mailboxThread.updateMany({
    where: { id: params.threadId, orgId: params.orgId },
    data: {
      participantsSummary: params.participantsSummary,
      lastMessageAt: params.lastMessageAt,
    },
  });
}

function toThreadRecord(record: Awaited<ReturnType<typeof db.mailboxThread.upsert>>): MailboxThreadRecord {
  return {
    id: record.id,
    orgId: record.orgId,
    mailboxConnectionId: record.mailboxConnectionId,
    providerThreadId: record.providerThreadId,
    subject: record.subject,
    participantsSummary: record.participantsSummary as Record<string, unknown> | unknown[],
    lastMessageAt: record.lastMessageAt,
    unreadCount: record.unreadCount,
    status: record.status,
    assigneeId: record.assigneeId,
    isFlagged: record.isFlagged,
    primaryLinkSummary: record.primaryLinkSummary as Record<string, unknown> | null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toMessageRecord(record: Awaited<ReturnType<typeof db.mailboxMessage.upsert>>): MailboxMessageRecord {
  return {
    id: record.id,
    orgId: record.orgId,
    threadId: record.threadId,
    providerMessageId: record.providerMessageId,
    rfcMessageId: record.rfcMessageId,
    direction: record.direction as "inbound" | "outbound",
    from: record.from as Record<string, unknown>,
    to: record.to as unknown[],
    cc: record.cc as unknown[],
    bcc: record.bcc as unknown[],
    subject: record.subject,
    htmlBody: record.htmlBody,
    textBody: record.textBody,
    snippet: record.snippet,
    sentAt: record.sentAt,
    receivedAt: record.receivedAt,
    attachmentCount: record.attachmentCount,
    providerMetadata: record.providerMetadata as Record<string, unknown> | null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toAttachmentRecord(record: Awaited<ReturnType<typeof db.mailboxAttachment.upsert>>): MailboxAttachmentRecord {
  return {
    id: record.id,
    messageId: record.messageId,
    providerAttachmentId: record.providerAttachmentId,
    filename: record.filename,
    mimeType: record.mimeType,
    size: record.size,
    isInline: record.isInline,
    storageRef: record.storageRef,
  };
}
