import "server-only";

/**
 * Compose context normalization.
 *
 * Provides a single clean path from UI-facing composer state into persisted
 * draft service inputs. This prevents compose initialization logic from being
 * duplicated across multiple UI components.
 */

import type { MailboxDraftMode } from "./domain-types";
import type { CreateDraftInput, AutosaveDraftInput } from "./draft-service";

// ─── UI-facing compose context ────────────────────────────────────────────────

export interface ComposeContext {
  mode: MailboxDraftMode;
  /** Which mailbox connection this sends from */
  mailboxConnectionId: string;
  /** threadId being replied to / forwarded; null for new message */
  threadId?: string | null;
  /** messageId being replied to / forwarded (optional, for future enrichment) */
  replyToMessageId?: string | null;
  fromIdentity?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  htmlBody?: string;
  textBody?: string | null;
  attachmentRefs?: string[];
}

export interface AutosaveContext {
  draftId: string;
  lastKnownUpdatedAt?: string | null;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  htmlBody?: string;
  textBody?: string | null;
  attachmentRefs?: string[];
}

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Normalize a UI compose context into a CreateDraftInput.
 *
 * Rules:
 * - Recipient arrays are deduplicated and trimmed.
 * - Subject is trimmed; empty string is preserved (caller may override).
 * - htmlBody is preserved as-is (Sprint 5.1 does not sanitize on save; Sprint 5.2 send path will).
 */
export function normalizeCreateDraftInput(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  context: ComposeContext,
): CreateDraftInput {
  return {
    orgId,
    userId,
    role,
    mailboxConnectionId: context.mailboxConnectionId,
    mode: context.mode,
    threadId: context.threadId ?? null,
    replyToMessageId: context.replyToMessageId ?? null,
    fromIdentity: context.fromIdentity,
    to: dedupeAndTrimStrings(context.to),
    cc: dedupeAndTrimStrings(context.cc),
    bcc: dedupeAndTrimStrings(context.bcc),
    subject: context.subject?.trim() ?? "",
    htmlBody: context.htmlBody ?? "",
    textBody: context.textBody ?? null,
    attachmentRefs: dedupeAndTrimStrings(context.attachmentRefs),
  };
}

/**
 * Normalize a UI autosave context into an AutosaveDraftInput.
 */
export function normalizeAutosaveDraftInput(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  context: AutosaveContext,
): AutosaveDraftInput {
  return {
    orgId,
    userId,
    role,
    draftId: context.draftId,
    lastKnownUpdatedAt: context.lastKnownUpdatedAt ?? null,
    to: context.to !== undefined ? dedupeAndTrimStrings(context.to) : undefined,
    cc: context.cc !== undefined ? dedupeAndTrimStrings(context.cc) : undefined,
    bcc: context.bcc !== undefined ? dedupeAndTrimStrings(context.bcc) : undefined,
    subject: context.subject?.trim(),
    htmlBody: context.htmlBody,
    textBody: context.textBody,
    attachmentRefs: context.attachmentRefs !== undefined ? dedupeAndTrimStrings(context.attachmentRefs) : undefined,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dedupeAndTrimStrings(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const trimmed = values.map((v) => v.trim()).filter((v) => v.length > 0);
  return [...new Set(trimmed)];
}
