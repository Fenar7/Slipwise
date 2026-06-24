import "server-only";

/**
 * Mailbox content and metadata normalization helpers.
 *
 * Sprint 3.3: makes normalized mailbox records fully UI-usable by ensuring
 * snippets are safe and preview-ready, thread summaries are derivable from
 * message state, and attachment metadata is coherent.
 *
 * Rules:
 * - snippet values are plain-text, safe, and stable
 * - thread summaries derive from normalized messages (not ad hoc provider metadata)
 * - no raw provider payload complexity leaks to UI consumers
 */

import type { MailboxMessageRecord, MailboxThreadRecord } from "./domain-types";

/** Maximum snippet length for thread/message previews. */
export const MAILBOX_SNIPPET_MAX_LENGTH = 300;

// ─── Snippet normalization ──────────────────────────────────────────────────

/**
 * Normalize a raw snippet into a safe, preview-ready plain-text string.
 *
 * - collapses whitespace (tabs, newlines, multiple spaces → single space)
 * - trims leading/trailing whitespace
 * - truncates to MAILBOX_SNIPPET_MAX_LENGTH with an ellipsis when truncated
 * - strips any residual HTML-like tags as a defensive measure
 */
export function normalizeSnippet(raw: string): string {
  let cleaned = raw
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/<[^>]+>/g, "") // defensive: strip any HTML tags
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length > MAILBOX_SNIPPET_MAX_LENGTH) {
    cleaned = cleaned.slice(0, MAILBOX_SNIPPET_MAX_LENGTH - 1) + "…";
  }
  return cleaned;
}

// ─── Thread summary derivation ────────────────────────────────────────────────

/**
 * Derive the last message timestamp for a thread from its normalized messages.
 * Returns the maximum sentAt. If no messages are provided, returns the thread's
 * own lastMessageAt as a fallback.
 */
export function deriveThreadLastMessageAt(
  messages: MailboxMessageRecord[],
  fallback: Date,
): Date {
  if (messages.length === 0) return fallback;
  let max = messages[0].sentAt;
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].sentAt > max) {
      max = messages[i].sentAt;
    }
  }
  return max;
}

/**
 * Compute the total attachment count for a thread from normalized message
 * records. Sums each message's attachmentCount.
 */
export function computeThreadAttachmentCount(
  messages: MailboxMessageRecord[],
): number {
  let total = 0;
  for (const msg of messages) {
    total += msg.attachmentCount;
  }
  return total;
}

/**
 * Compute the unread message count for a thread from normalized messages.
 * In Sprint 3.3 this is a simple count of messages where the provider
 * metadata includes an unread flag. When provider metadata does not expose
 * per-message unread state, this returns 0 and the thread-level unreadCount
 * remains authoritative.
 */
export function computeThreadUnreadCount(
  messages: MailboxMessageRecord[],
): number {
  let count = 0;
  for (const msg of messages) {
    const meta = msg.providerMetadata;
    if (
      meta &&
      typeof meta === "object" &&
      !Array.isArray(meta) &&
      meta.isUnread === true
    ) {
      count += 1;
    }
  }
  return count;
}

/**
 * Derive the latest normalized snippet for a thread preview.
 * Returns the snippet from the most recent message.
 */
export function deriveThreadPreviewSnippet(
  messages: MailboxMessageRecord[],
): string {
  if (messages.length === 0) return "";
  let latest = messages[0];
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].sentAt > latest.sentAt) {
      latest = messages[i];
    }
  }
  return latest.snippet ?? "";
}
