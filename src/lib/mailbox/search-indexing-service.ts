import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

/**
 * Clean up text helper for search terms.
 */
function cleanSearchText(parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .map(p => p!.trim())
    .join(" ")
    .replace(/\s+/g, " ");
}

/**
 * Indexes or updates a MailboxSearchDocument for a MailboxThread.
 * A thread-level search document has messageId: null.
 */
export async function indexMailboxThread(
  orgId: string,
  threadId: string,
): Promise<void> {
  try {
    const thread = await db.mailboxThread.findFirst({
      where: { id: threadId, orgId },
      include: {
        messages: {
          orderBy: { sentAt: "asc" },
        },
      },
    });

    if (!thread) {
      return;
    }

    const senders: string[] = [];
    const recipients: string[] = [];
    let latestFromDisplayName: string | null = null;
    let latestFromEmail: string | null = null;

    for (const msg of thread.messages) {
      const fromRef = msg.from as any;
      if (fromRef?.displayName) {
        senders.push(fromRef.displayName);
        latestFromDisplayName = fromRef.displayName;
      }
      if (fromRef?.email) {
        senders.push(fromRef.email);
        latestFromEmail = fromRef.email;
      }

      const toRefs = (msg.to || []) as any[];
      const ccRefs = (msg.cc || []) as any[];
      const bccRefs = (msg.bcc || []) as any[];
      for (const p of [...toRefs, ...ccRefs, ...bccRefs]) {
        if (p?.displayName) recipients.push(p.displayName);
        if (p?.email) recipients.push(p.email);
      }
    }

    const toRecipients = cleanSearchText(recipients);
    const searchText = cleanSearchText([
      thread.subject,
      thread.previewSnippet,
      ...senders,
      ...recipients,
    ]);

    await db.mailboxSearchDocument.upsert({
      where: {
        orgId_mailboxConnectionId_threadId_messageId: {
          orgId,
          mailboxConnectionId: thread.mailboxConnectionId,
          threadId: thread.id,
          messageId: null,
        },
      },
      update: {
        documentType: "THREAD",
        providerThreadId: thread.providerThreadId,
        providerMessageId: null,
        searchText,
        subjectText: thread.subject,
        snippetText: thread.previewSnippet,
        fromDisplayName: latestFromDisplayName,
        fromEmail: latestFromEmail,
        toRecipients,
        lastActivityAt: thread.lastMessageAt,
        sentAt: thread.lastMessageAt,
        isUnread: thread.unreadCount > 0,
        isFlagged: thread.isFlagged,
        status: thread.status,
        assigneeId: thread.assigneeId,
      },
      create: {
        orgId,
        mailboxConnectionId: thread.mailboxConnectionId,
        threadId: thread.id,
        messageId: null,
        documentType: "THREAD",
        providerThreadId: thread.providerThreadId,
        providerMessageId: null,
        searchText,
        subjectText: thread.subject,
        snippetText: thread.previewSnippet,
        fromDisplayName: latestFromDisplayName,
        fromEmail: latestFromEmail,
        toRecipients,
        lastActivityAt: thread.lastMessageAt,
        sentAt: thread.lastMessageAt,
        isUnread: thread.unreadCount > 0,
        isFlagged: thread.isFlagged,
        status: thread.status,
        assigneeId: thread.assigneeId,
      },
    });
  } catch (error) {
    console.error(`[SearchIndexing] Failed to index thread ${threadId}:`, error);
  }
}

/**
 * Indexes or updates a MailboxSearchDocument for a MailboxMessage.
 */
export async function indexMailboxMessage(
  orgId: string,
  messageId: string,
): Promise<void> {
  try {
    const message = await db.mailboxMessage.findFirst({
      where: { id: messageId, orgId },
      include: {
        thread: true,
      },
    });

    if (!message) {
      return;
    }

    const fromRef = message.from as any;
    const toRefs = (message.to || []) as any[];
    const ccRefs = (message.cc || []) as any[];
    const bccRefs = (message.bcc || []) as any[];

    const fromDisplayName = fromRef?.displayName || null;
    const fromEmail = fromRef?.email || null;

    const recipientList: string[] = [];
    for (const p of [...toRefs, ...ccRefs, ...bccRefs]) {
      if (p?.displayName) recipientList.push(p.displayName);
      if (p?.email) recipientList.push(p.email);
    }
    const toRecipients = cleanSearchText(recipientList);

    const searchText = cleanSearchText([
      message.subject,
      message.snippet,
      message.textBody || "",
      fromDisplayName || "",
      fromEmail || "",
      toRecipients,
    ]);

    await db.mailboxSearchDocument.upsert({
      where: {
        orgId_mailboxConnectionId_threadId_messageId: {
          orgId,
          mailboxConnectionId: message.thread.mailboxConnectionId,
          threadId: message.threadId,
          messageId: message.id,
        },
      },
      update: {
        documentType: "MESSAGE",
        providerThreadId: message.thread.providerThreadId,
        providerMessageId: message.providerMessageId,
        searchText,
        subjectText: message.subject,
        snippetText: message.snippet,
        fromDisplayName,
        fromEmail,
        toRecipients,
        lastActivityAt: message.sentAt,
        sentAt: message.sentAt,
        isUnread: message.thread.unreadCount > 0,
        isFlagged: message.thread.isFlagged,
        status: message.thread.status,
        assigneeId: message.thread.assigneeId,
      },
      create: {
        orgId,
        mailboxConnectionId: message.thread.mailboxConnectionId,
        threadId: message.threadId,
        messageId: message.id,
        documentType: "MESSAGE",
        providerThreadId: message.thread.providerThreadId,
        providerMessageId: message.providerMessageId,
        searchText,
        subjectText: message.subject,
        snippetText: message.snippet,
        fromDisplayName,
        fromEmail,
        toRecipients,
        lastActivityAt: message.sentAt,
        sentAt: message.sentAt,
        isUnread: message.thread.unreadCount > 0,
        isFlagged: message.thread.isFlagged,
        status: message.thread.status,
        assigneeId: message.thread.assigneeId,
      },
    });
  } catch (error) {
    console.error(`[SearchIndexing] Failed to index message ${messageId}:`, error);
  }
}

/**
 * Removes all MailboxSearchDocuments associated with a specific MailboxThread.
 */
export async function deleteMailboxSearchDocumentsForThread(
  orgId: string,
  mailboxConnectionId: string,
  threadId: string,
): Promise<void> {
  try {
    await db.mailboxSearchDocument.deleteMany({
      where: {
        orgId,
        mailboxConnectionId,
        threadId,
      },
    });
  } catch (error) {
    console.error(`[SearchIndexing] Failed to delete search docs for thread ${threadId}:`, error);
  }
}

/**
 * Removes a MailboxSearchDocument associated with a specific MailboxMessage.
 */
export async function deleteMailboxSearchDocumentForMessage(
  orgId: string,
  messageId: string,
): Promise<void> {
  try {
    await db.mailboxSearchDocument.deleteMany({
      where: {
        orgId,
        messageId,
      },
    });
  } catch (error) {
    console.error(`[SearchIndexing] Failed to delete search doc for message ${messageId}:`, error);
  }
}
