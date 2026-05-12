import "server-only";

/**
 * Mailbox participant extraction and normalization.
 *
 * Sprint 3.3: participants are normalized at the message level first.
 * Thread-level participant summaries are derived from normalized message
 * participants. No global contacts/address-book subsystem is built here.
 *
 * Rules:
 * - email addresses are normalized (lowercased, trimmed)
 * - display names are trimmed; empty strings become null
 * - deduplication is deterministic (first-seen wins)
 * - direction classification is provider-neutral: compare mailbox identity
 *   against normalized sender email
 */

import type { MailboxMessageRecord, MailboxMessageDirection } from "./domain-types";
import type { MailboxParticipantRef } from "./provider-contracts";

// ─── Normalized participant shape ─────────────────────────────────────────────

export type { MailboxParticipantRef } from "./provider-contracts";

// ─── Email normalization ────────────────────────────────────────────────────

/**
 * Normalize an email address for deterministic comparison.
 * Lowercases and trims whitespace. Returns null if the input is not a
 * reasonable email shape (must contain '@' and have non-empty local/domain).
 */
export function normalizeEmail(email: string): string | null {
  const cleaned = email.toLowerCase().trim();
  if (!cleaned.includes("@")) return null;
  const [local, domain] = cleaned.split("@");
  if (!local || !domain) return null;
  return cleaned;
}

// ─── Participant normalization ────────────────────────────────────────────────

/**
 * Normalize a raw participant object into a stable MailboxParticipantRef.
 * Returns null if the email is missing or not a valid email shape.
 */
export function normalizeParticipant(raw: unknown): MailboxParticipantRef | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const rawEmail = typeof r.email === "string" ? r.email : null;
  if (!rawEmail) return null;
  const email = normalizeEmail(rawEmail);
  if (!email) return null;

  const rawDisplay = typeof r.displayName === "string" ? r.displayName : null;
  const displayName = rawDisplay?.trim() || null;

  return { email, displayName };
}

/**
 * Normalize every element in an array, filtering out nulls.
 */
export function normalizeParticipants(rawList: unknown[]): MailboxParticipantRef[] {
  return rawList.map(normalizeParticipant).filter(Boolean) as MailboxParticipantRef[];
}

// ─── Deduplication ──────────────────────────────────────────────────────────────

/**
 * Deduplicate participants by normalized email. First-seen wins.
 * Deterministic because it preserves input order for the first occurrence.
 */
export function deduplicateParticipants(
  participants: MailboxParticipantRef[],
): MailboxParticipantRef[] {
  const seen = new Set<string>();
  const result: MailboxParticipantRef[] = [];
  for (const p of participants) {
    if (seen.has(p.email)) continue;
    seen.add(p.email);
    result.push(p);
  }
  return result;
}

// ─── Direction classification ─────────────────────────────────────────────────

/**
 * Classify a message direction by comparing the mailbox identity
 * against the normalized sender email.
 *
 * If the sender email matches the mailbox email (after normalization),
 * the message is outbound; otherwise inbound.
 *
 * Edge case — self-sent messages: if a message is sent from the mailbox
 * to itself, this still returns "outbound" because the sender matches the
 * mailbox identity. The UI layer can disambiguate using recipient lists if
 * it chooses to.
 */
export function classifyMessageDirection(
  mailboxEmail: string,
  senderEmail: string,
): MailboxMessageDirection {
  const normalizedMailbox = normalizeEmail(mailboxEmail);
  const normalizedSender = normalizeEmail(senderEmail);
  if (!normalizedMailbox || !normalizedSender) return "inbound";
  return normalizedMailbox === normalizedSender ? "outbound" : "inbound";
}

// ─── Extraction from message record ───────────────────────────────────────────

/**
 * Extract all unique participants from a normalized message record.
 * Includes sender, to, cc, and bcc. Deduplicated by email.
 */
export function extractParticipantsFromMessage(
  message: MailboxMessageRecord,
): MailboxParticipantRef[] {
  const rawList: unknown[] = [
    message.from,
    ...(Array.isArray(message.to) ? message.to : []),
    ...(Array.isArray(message.cc) ? message.cc : []),
    ...(Array.isArray(message.bcc) ? message.bcc : []),
  ];
  return deduplicateParticipants(normalizeParticipants(rawList));
}

// ─── Thread-level participant derivation ──────────────────────────────────────

/**
 * Derive a thread-level participant summary from an array of normalized
 * message records. Collects all unique participants across all messages,
 * deduplicated by email. The result is deterministic and safe for UI
 * thread headers / participant pills.
 */
export function deriveThreadParticipants(
  messages: MailboxMessageRecord[],
): MailboxParticipantRef[] {
  const all: MailboxParticipantRef[] = [];
  for (const msg of messages) {
    all.push(...extractParticipantsFromMessage(msg));
  }
  return deduplicateParticipants(all);
}
