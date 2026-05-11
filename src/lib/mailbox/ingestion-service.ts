import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type {
  MailboxThreadRecord,
  MailboxMessageRecord,
  MailboxAttachmentRecord,
} from "./domain-types";
import type { MailboxThreadEnvelope, MailboxMessageEnvelope, MailboxAttachmentEnvelope } from "./provider-contracts";

interface UpsertThreadParams {
  orgId: string;
  mailboxConnectionId: string;
  envelope: MailboxThreadEnvelope;
}

export async function upsertMailboxThread(params: UpsertThreadParams): Promise<MailboxThreadRecord> {
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
      participantsSummary: params.envelope.participants as unknown as Prisma.InputJsonValue,
      lastMessageAt: new Date(params.envelope.lastMessageAt),
      unreadCount: params.envelope.unreadCount,
      providerMetadata: params.envelope.providerMetadata as Prisma.InputJsonValue,
    },
    create: {
      orgId: params.orgId,
      mailboxConnectionId: params.mailboxConnectionId,
      providerThreadId: params.envelope.providerThreadId,
      subject: params.envelope.subject,
      participantsSummary: params.envelope.participants as unknown as Prisma.InputJsonValue,
      lastMessageAt: new Date(params.envelope.lastMessageAt),
      unreadCount: params.envelope.unreadCount,
      status: "OPEN",
      providerMetadata: params.envelope.providerMetadata as Prisma.InputJsonValue,
    },
  });
  return toThreadRecord(record);
}

interface UpsertMessageParams {
  orgId: string;
  threadId: string;
  envelope: MailboxMessageEnvelope;
}

export async function upsertMailboxMessage(params: UpsertMessageParams): Promise<MailboxMessageRecord> {
  const record = await db.mailboxMessage.upsert({
    where: {
      orgId_threadId_providerMessageId: {
        orgId: params.orgId,
        threadId: params.threadId,
        providerMessageId: params.envelope.providerMessageId,
      },
    },
    update: {
      direction: params.envelope.direction,
      from: params.envelope.from as unknown as Prisma.InputJsonValue,
      to: params.envelope.to as unknown as Prisma.InputJsonValue,
      cc: params.envelope.cc as unknown as Prisma.InputJsonValue,
      bcc: params.envelope.bcc as unknown as Prisma.InputJsonValue,
      subject: params.envelope.subject,
      snippet: params.envelope.snippet,
      sentAt: new Date(params.envelope.sentAt),
      receivedAt: params.envelope.receivedAt ? new Date(params.envelope.receivedAt) : null,
      attachmentCount: params.envelope.attachmentCount,
      providerMetadata: params.envelope.providerMetadata as Prisma.InputJsonValue,
    },
    create: {
      orgId: params.orgId,
      threadId: params.threadId,
      providerMessageId: params.envelope.providerMessageId,
      rfcMessageId: params.envelope.rfcMessageId,
      direction: params.envelope.direction,
      from: params.envelope.from as unknown as Prisma.InputJsonValue,
      to: params.envelope.to as unknown as Prisma.InputJsonValue,
      cc: params.envelope.cc as unknown as Prisma.InputJsonValue,
      bcc: params.envelope.bcc as unknown as Prisma.InputJsonValue,
      subject: params.envelope.subject,
      snippet: params.envelope.snippet,
      sentAt: new Date(params.envelope.sentAt),
      receivedAt: params.envelope.receivedAt ? new Date(params.envelope.receivedAt) : null,
      attachmentCount: params.envelope.attachmentCount,
      providerMetadata: params.envelope.providerMetadata as Prisma.InputJsonValue,
    },
  });
  return toMessageRecord(record);
}

interface UpsertAttachmentParams {
  messageId: string;
  envelope: MailboxAttachmentEnvelope;
}

export async function upsertMailboxAttachment(params: UpsertAttachmentParams): Promise<MailboxAttachmentRecord> {
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
