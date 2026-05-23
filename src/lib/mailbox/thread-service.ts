import "server-only";

import { db } from "@/lib/db";
import type { MailboxThreadRecord, MailboxMessageRecord } from "./domain-types";

export type MailboxFolder = "INBOX" | "SENT" | "SPAM" | "ARCHIVE";

export interface ListMailboxThreadsInput {
  orgId: string;
  mailboxConnectionId: string;
  folder: MailboxFolder;
  limit?: number;
  offset?: number;
}

export interface ListMailboxThreadsResult {
  threads: MailboxThreadRecord[];
  total: number;
}

function toThreadRecord(
  row: Awaited<ReturnType<typeof db.mailboxThread.findFirst>> & {},
): MailboxThreadRecord {
  if (!row) throw new Error("Thread row is null");
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
    primaryLinkSummary:
      row.primaryLinkSummary && typeof row.primaryLinkSummary === "object" && !Array.isArray(row.primaryLinkSummary)
        ? (row.primaryLinkSummary as Record<string, unknown>)
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildFolderWhere(
  folder: MailboxFolder,
): {
  status?: { equals?: string; not?: string };
  messages?: { some: Record<string, unknown> };
} {
  switch (folder) {
    case "INBOX":
      return {
        status: { not: "ARCHIVED" },
        messages: { some: { spamLabelDetected: false } },
      };
    case "SENT":
      return {
        messages: { some: { direction: "outbound" } },
      };
    case "SPAM":
      return {
        messages: { some: { spamLabelDetected: true } },
      };
    case "ARCHIVE":
      return {
        status: { equals: "ARCHIVED" },
      };
    default:
      return {};
  }
}

export async function listMailboxThreads(
  input: ListMailboxThreadsInput,
): Promise<ListMailboxThreadsResult> {
  const { orgId, mailboxConnectionId, folder, limit = 50, offset = 0 } = input;

  const folderWhere = buildFolderWhere(folder);

  const [rows, total] = await Promise.all([
    db.mailboxThread.findMany({
      where: {
        orgId,
        mailboxConnectionId,
        ...folderWhere,
      },
      orderBy: { lastMessageAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.mailboxThread.count({
      where: {
        orgId,
        mailboxConnectionId,
        ...folderWhere,
      },
    }),
  ]);

  return {
    threads: rows.map(toThreadRecord),
    total,
  };
}

export interface GetMailboxThreadDetailInput {
  orgId: string;
  threadId: string;
}

export interface MailboxThreadDetail {
  thread: MailboxThreadRecord;
  messages: MailboxMessageRecord[];
}

function toMessageRecord(
  row: Awaited<ReturnType<typeof db.mailboxMessage.findFirst>> & {},
): MailboxMessageRecord {
  if (!row) throw new Error("Message row is null");
  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

  return {
    id: row.id,
    orgId: row.orgId,
    threadId: row.threadId,
    providerMessageId: row.providerMessageId,
    rfcMessageId: row.rfcMessageId,
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    from: asRecord(row.from),
    to: asArray(row.to),
    cc: asArray(row.cc),
    bcc: asArray(row.bcc),
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

export async function getMailboxThreadDetail(
  input: GetMailboxThreadDetailInput,
): Promise<MailboxThreadDetail | null> {
  const threadRow = await db.mailboxThread.findFirst({
    where: {
      id: input.threadId,
      orgId: input.orgId,
    },
    include: {
      messages: {
        orderBy: { sentAt: "asc" },
      },
    },
  });

  if (!threadRow) return null;

  const { messages, ...threadRest } = threadRow;

  return {
    thread: toThreadRecord(threadRest),
    messages: messages.map(toMessageRecord),
  };
}
