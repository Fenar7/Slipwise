import "server-only";

import { db } from "@/lib/db";
import type { MailboxDraftRecord } from "./domain-types";

export interface ListMailboxDraftsInput {
  orgId: string;
  mailboxConnectionId: string;
  status?: "ACTIVE" | "DISCARDED" | "SENT";
}

export async function listMailboxDrafts(
  input: ListMailboxDraftsInput,
): Promise<MailboxDraftRecord[]> {
  const rows = await db.mailboxDraft.findMany({
    where: {
      orgId: input.orgId,
      mailboxConnectionId: input.mailboxConnectionId,
      status: input.status ?? "ACTIVE",
    },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    orgId: row.orgId,
    mailboxConnectionId: row.mailboxConnectionId,
    threadId: row.threadId,
    mode: row.mode,
    fromIdentity: row.fromIdentity,
    toRecipients: row.toRecipients as string[],
    ccRecipients: row.ccRecipients as string[],
    bccRecipients: row.bccRecipients as string[],
    subject: row.subject,
    htmlBody: row.htmlBody,
    textBody: row.textBody,
    attachmentRefs: row.attachmentRefs as string[],
    status: row.status,
    lastAutosavedAt: row.lastAutosavedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getMailboxDraft(
  orgId: string,
  draftId: string,
): Promise<MailboxDraftRecord | null> {
  const row = await db.mailboxDraft.findFirst({
    where: { id: draftId, orgId },
  });
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    mailboxConnectionId: row.mailboxConnectionId,
    threadId: row.threadId,
    mode: row.mode,
    fromIdentity: row.fromIdentity,
    toRecipients: row.toRecipients as string[],
    ccRecipients: row.ccRecipients as string[],
    bccRecipients: row.bccRecipients as string[],
    subject: row.subject,
    htmlBody: row.htmlBody,
    textBody: row.textBody,
    attachmentRefs: row.attachmentRefs as string[],
    status: row.status,
    lastAutosavedAt: row.lastAutosavedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
