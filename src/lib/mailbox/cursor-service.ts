import "server-only";

import { db } from "@/lib/db";
import type { MailboxProviderCursorRecord } from "./domain-types";
import type { MailboxCursorType, MailboxProvider } from "./domain-types";

/**
 * Get the current cursor for a connection and cursor type.
 * Returns null if no cursor exists yet (initial sync).
 */
export async function getMailboxCursor(
  orgId: string,
  mailboxConnectionId: string,
  cursorType: MailboxCursorType,
): Promise<MailboxProviderCursorRecord | null> {
  const row = await db.mailboxProviderCursor.findFirst({
    where: { orgId, mailboxConnectionId, cursorType },
  });
  return row ? toCursorRecord(row) : null;
}

/**
 * Upsert a provider cursor. Creates if absent, updates if present.
 * Called after each successful sync delta to advance the checkpoint.
 *
 * Org safety: keyed on (orgId, mailboxConnectionId, cursorType) — the schema
 * unique constraint includes orgId, so the update leg cannot touch a cursor
 * belonging to a different org.
 *
 * Provider mismatch guard: if a cursor row already exists for this key, the
 * update does not change the provider field. If the caller passes a different
 * provider than what was stored, this function throws to surface the mismatch
 * rather than silently overwriting it.
 */
export async function upsertMailboxCursor(params: {
  orgId: string;
  mailboxConnectionId: string;
  provider: MailboxProvider;
  cursorType: MailboxCursorType;
  cursorValue: string;
  expiresAt: Date | null;
}): Promise<MailboxProviderCursorRecord> {
  // Check for provider mismatch before upsert.
  const existing = await db.mailboxProviderCursor.findFirst({
    where: {
      orgId: params.orgId,
      mailboxConnectionId: params.mailboxConnectionId,
      cursorType: params.cursorType,
    },
    select: { provider: true },
  });
  if (existing && existing.provider !== params.provider) {
    throw new Error(
      `Provider mismatch on cursor upsert: stored=${existing.provider}, requested=${params.provider}`,
    );
  }

  const row = await db.mailboxProviderCursor.upsert({
    where: {
      orgId_mailboxConnectionId_cursorType: {
        orgId: params.orgId,
        mailboxConnectionId: params.mailboxConnectionId,
        cursorType: params.cursorType,
      },
    },
    create: {
      orgId: params.orgId,
      mailboxConnectionId: params.mailboxConnectionId,
      provider: params.provider,
      cursorType: params.cursorType,
      cursorValue: params.cursorValue,
      expiresAt: params.expiresAt,
      lastAdvancedAt: new Date(),
    },
    update: {
      cursorValue: params.cursorValue,
      expiresAt: params.expiresAt,
      lastAdvancedAt: new Date(),
    },
  });
  return toCursorRecord(row);
}

/**
 * Delete all cursors for a connection (e.g. on disconnect or full re-sync).
 */
export async function deleteMailboxCursors(
  orgId: string,
  mailboxConnectionId: string,
): Promise<void> {
  await db.mailboxProviderCursor.deleteMany({
    where: { orgId, mailboxConnectionId },
  });
}

function toCursorRecord(
  row: Awaited<ReturnType<typeof db.mailboxProviderCursor.findFirstOrThrow>>,
): MailboxProviderCursorRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    mailboxConnectionId: row.mailboxConnectionId,
    provider: row.provider,
    cursorType: row.cursorType,
    cursorValue: row.cursorValue,
    expiresAt: row.expiresAt,
    lastAdvancedAt: row.lastAdvancedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
