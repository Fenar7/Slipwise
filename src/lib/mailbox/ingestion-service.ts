import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type {
  MailboxAttachmentRecord,
  MailboxMessageRecord,
  MailboxThreadRecord,
} from "./domain-types";
import type { MailboxMessageEnvelope, MailboxThreadEnvelope } from "./provider-contracts";

export async function upsertMailboxThread(params: {
  orgId: string;
  mailboxConnectionId: string;
  envelope: MailboxThreadEnvelope;
}): Promise<MailboxThreadRecord> {
  const row = await db.mailboxThread.upsert({
    where: {
      orgId_mailboxConnectionId_providerThreadId: {
        orgId: params.orgId,
        mailboxConnectionId: params.mailboxConnectionId,
        providerThreadId: params.envelope.providerThreadId,
      },
    },
    create: {
      orgId: params.orgId,
      mailboxConnectionId: params.mailboxConnectionId,
      providerThreadId: params.envelope.providerThreadId,
      subject: params.envelope.subject,
      participantsSummary: params.envelope.participants as Prisma.InputJsonValue,
      lastMessageAt: new Date(params.envelope.lastMessageAt),
      unreadCount: params.envelope.unreadCount,
    },
    update: {
      subject: params.envelope.subject,
      participantsSummary: params.envelope.participants as Prisma.InputJsonValue,
      lastMessageAt: new Date(params.envelope.lastMessageAt),
      unreadCount: params.envelope.unreadCount,
    },
  });
  return toThreadRecord(row);
}

export async function upsertMailboxMessage(params: {
  orgId: string;
  threadId: string;
  envelope: MailboxMessageEnvelope & { htmlBody: string; textBody: string | null };
}): Promise<MailboxMessageRecord> {
  const row = await db.mailboxMessage.upsert({
    where: {
      orgId_threadId_providerMessageId: {
        orgId: params.orgId,
        threadId: params.threadId,
        providerMessageId: params.envelope.providerMessageId,
      },
    },
    create: {
      orgId: params.orgId,
      threadId: params.threadId,
      providerMessageId: params.envelope.providerMessageId,
      rfcMessageId: params.envelope.rfcMessageId,
      direction: params.envelope.direction,
      from: params.envelope.from as Prisma.InputJsonValue,
      to: params.envelope.to as Prisma.InputJsonValue,
      cc: params.envelope.cc as Prisma.InputJsonValue,
      bcc: [] as Prisma.InputJsonValue,
      subject: params.envelope.subject,
      htmlBody: params.envelope.htmlBody,
      textBody: params.envelope.textBody,
      snippet: params.envelope.snippet,
      sentAt: new Date(params.envelope.sentAt),
      receivedAt: params.envelope.receivedAt ? new Date(params.envelope.receivedAt) : null,
      attachmentCount: params.envelope.attachmentCount,
      providerMetadata: params.envelope.providerMetadata as Prisma.InputJsonValue,
    },
    update: {
      rfcMessageId: params.envelope.rfcMessageId,
      direction: params.envelope.direction,
      from: params.envelope.from as Prisma.InputJsonValue,
      to: params.envelope.to as Prisma.InputJsonValue,
      cc: params.envelope.cc as Prisma.InputJsonValue,
      subject: params.envelope.subject,
      htmlBody: params.envelope.htmlBody,
      textBody: params.envelope.textBody,
      snippet: params.envelope.snippet,
      sentAt: new Date(params.envelope.sentAt),
      receivedAt: params.envelope.receivedAt ? new Date(params.envelope.receivedAt) : null,
      attachmentCount: params.envelope.attachmentCount,
      providerMetadata: params.envelope.providerMetadata as Prisma.InputJsonValue,
    },
  });
  return toMessageRecord(row);
}

export async function upsertMailboxAttachment(params: {
  messageId: string;
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  isInline: boolean;
}): Promise<MailboxAttachmentRecord> {
  const row = await db.mailboxAttachment.upsert({
    where: {
      messageId_providerAttachmentId: {
        messageId: params.messageId,
        providerAttachmentId: params.providerAttachmentId,
      },
    },
    create: {
      messageId: params.messageId,
      providerAttachmentId: params.providerAttachmentId,
      filename: params.filename,
      mimeType: params.mimeType,
      size: params.size,
      isInline: params.isInline,
      storageRef: null,
    },
    update: {
      filename: params.filename,
      mimeType: params.mimeType,
      size: params.size,
      isInline: params.isInline,
    },
  });
  return row;
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function toThreadRecord(row: Awaited<ReturnType<typeof db.mailboxThread.findFirstOrThrow>>): MailboxThreadRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    mailboxConnectionId: row.mailboxConnectionId,
    providerThreadId: row.providerThreadId,
    subject: row.subject,
    participantsSummary: row.participantsSummary as Record<string, unknown> | unknown[],
    lastMessageAt: row.lastMessageAt,
    unreadCount: row.unreadCount,
    status: row.status,
    assigneeId: row.assigneeId,
    isFlagged: row.isFlagged,
    primaryLinkSummary: asRecord(row.primaryLinkSummary),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessageRecord(row: Awaited<ReturnType<typeof db.mailboxMessage.findFirstOrThrow>>): MailboxMessageRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    threadId: row.threadId,
    providerMessageId: row.providerMessageId,
    rfcMessageId: row.rfcMessageId,
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    from: asRecord(row.from) ?? {},
    to: Array.isArray(row.to) ? row.to : [],
    cc: Array.isArray(row.cc) ? row.cc : [],
    bcc: Array.isArray(row.bcc) ? row.bcc : [],
    subject: row.subject,
    htmlBody: row.htmlBody,
    textBody: row.textBody,
    snippet: row.snippet,
    sentAt: row.sentAt,
    receivedAt: row.receivedAt,
    attachmentCount: row.attachmentCount,
    providerMetadata: asRecord(row.providerMetadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
