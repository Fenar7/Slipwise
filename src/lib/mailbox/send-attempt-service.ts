import "server-only";

/**
 * Sprint 5.4 — Durable outbound send-attempt modeling.
 *
 * Provides:
 * - deterministic draft fingerprinting for duplicate protection
 * - explicit send-attempt state machine (PENDING → SENT/FAILED/PENDING_RECONCILIATION → RECONCILED_*)
 * - idempotent send: repeated requests for the same fingerprint reuse prior attempts
 * - safe failure persistence without raw payload leakage
 */

import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { MailboxSendAttemptStatus } from "@/generated/prisma/client";

// ─── Fingerprinting ───────────────────────────────────────────────────────────

export interface DraftFingerprintInput {
  mailboxConnectionId: string;
  fromIdentity: string;
  toRecipients: string[];
  ccRecipients: string[];
  bccRecipients: string[];
  subject: string;
  htmlBody: string;
  textBody: string | null;
  attachmentRefs: string[];
  mode: string;
  threadId: string | null;
  replyToMessageId: string | null;
}

/**
 * Compute a deterministic SHA-256 fingerprint of the effective outbound payload.
 * The order of keys and arrays is normalized so equivalent drafts produce the same hash.
 */
export function computeDraftFingerprint(input: DraftFingerprintInput): string {
  const payload = {
    mailboxConnectionId: input.mailboxConnectionId,
    fromIdentity: input.fromIdentity.trim().toLowerCase(),
    toRecipients: [...input.toRecipients].map((e) => e.trim().toLowerCase()).sort(),
    ccRecipients: [...input.ccRecipients].map((e) => e.trim().toLowerCase()).sort(),
    bccRecipients: [...input.bccRecipients].map((e) => e.trim().toLowerCase()).sort(),
    subject: input.subject.trim(),
    htmlBody: input.htmlBody.trim(),
    textBody: (input.textBody ?? "").trim(),
    attachmentRefs: [...input.attachmentRefs].sort(),
    mode: input.mode,
    threadId: input.threadId ?? null,
    replyToMessageId: input.replyToMessageId ?? null,
  };
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Generate a stable Slipwise correlation key for a send attempt.
 */
export function generateCorrelationKey(): string {
  return `sw-send-${randomUUID()}`;
}

/**
 * Generate a deterministic RFC Message-ID for a send attempt.
 */
export function generateRfcMessageId(correlationKey: string): string {
  const host = process.env.MAILBOX_MESSAGE_ID_HOST ?? "slipwise.io";
  return `<${correlationKey}@${host}>`;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function findLatestSendAttemptForFingerprint(
  orgId: string,
  draftId: string,
  fingerprint: string,
): Promise<SendAttemptRecord | null> {
  const row = await db.mailboxSendAttempt.findFirst({
    where: { orgId, draftId, fingerprint },
    orderBy: { createdAt: "desc" },
  });
  return row ? toSendAttemptRecord(row) : null;
}

export async function getSendAttemptById(
  orgId: string,
  attemptId: string,
): Promise<SendAttemptRecord | null> {
  const row = await db.mailboxSendAttempt.findFirst({
    where: { id: attemptId, orgId },
  });
  return row ? toSendAttemptRecord(row) : null;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createSendAttempt(
  tx: Prisma.TransactionClient,
  params: {
    orgId: string;
    draftId: string;
    mailboxConnectionId: string;
    actorId: string;
    mode: string;
    fingerprint: string;
    correlationKey: string;
    rfcMessageId: string;
  },
): Promise<SendAttemptRecord> {
  const row = await tx.mailboxSendAttempt.create({
    data: {
      orgId: params.orgId,
      draftId: params.draftId,
      mailboxConnectionId: params.mailboxConnectionId,
      actorId: params.actorId,
      status: "PENDING",
      mode: params.mode as Prisma.MailboxSendAttemptCreateInput["mode"],
      fingerprint: params.fingerprint,
      correlationKey: params.correlationKey,
      rfcMessageId: params.rfcMessageId,
    },
  });
  return toSendAttemptRecord(row);
}

export async function markSendAttemptSent(
  tx: Prisma.TransactionClient,
  attemptId: string,
  providerMessageId: string,
  providerThreadId: string,
  rfcMessageId: string | null,
): Promise<void> {
  await tx.mailboxSendAttempt.update({
    where: { id: attemptId },
    data: {
      status: "SENT",
      providerMessageId,
      providerThreadId,
      rfcMessageId: rfcMessageId ?? undefined,
    },
  });
}

export async function markSendAttemptFailed(
  tx: Prisma.TransactionClient,
  attemptId: string,
  failureCategory: string,
  failureSummary: string,
): Promise<void> {
  await tx.mailboxSendAttempt.update({
    where: { id: attemptId },
    data: {
      status: "FAILED",
      failureCategory,
      failureSummary,
    },
  });
}

export async function markSendAttemptPendingReconciliation(
  tx: Prisma.TransactionClient,
  attemptId: string,
): Promise<void> {
  await tx.mailboxSendAttempt.update({
    where: { id: attemptId },
    data: {
      status: "PENDING_RECONCILIATION",
    },
  });
}

export async function markSendAttemptReconciled(
  tx: Prisma.TransactionClient,
  attemptId: string,
  outcome: "RECONCILED_SENT" | "RECONCILED_FAILED",
  providerMessageId?: string | null,
  providerThreadId?: string | null,
  rfcMessageId?: string | null,
): Promise<void> {
  const data: Prisma.MailboxSendAttemptUpdateInput = {
    status: outcome,
  };
  if (providerMessageId !== undefined) data.providerMessageId = providerMessageId;
  if (providerThreadId !== undefined) data.providerThreadId = providerThreadId;
  if (rfcMessageId !== undefined) data.rfcMessageId = rfcMessageId;
  await tx.mailboxSendAttempt.update({ where: { id: attemptId }, data });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SendAttemptRecord {
  id: string;
  orgId: string;
  draftId: string;
  mailboxConnectionId: string;
  actorId: string;
  status: MailboxSendAttemptStatus;
  mode: string;
  fingerprint: string;
  correlationKey: string;
  rfcMessageId: string | null;
  providerMessageId: string | null;
  providerThreadId: string | null;
  failureCategory: string | null;
  failureSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toSendAttemptRecord(
  row: Awaited<ReturnType<typeof db.mailboxSendAttempt.findFirst>> & {},
): SendAttemptRecord {
  if (!row) throw new Error("Attempt row is null");
  return {
    id: row.id,
    orgId: row.orgId,
    draftId: row.draftId,
    mailboxConnectionId: row.mailboxConnectionId,
    actorId: row.actorId,
    status: row.status as MailboxSendAttemptStatus,
    mode: row.mode,
    fingerprint: row.fingerprint,
    correlationKey: row.correlationKey,
    rfcMessageId: row.rfcMessageId,
    providerMessageId: row.providerMessageId,
    providerThreadId: row.providerThreadId,
    failureCategory: row.failureCategory,
    failureSummary: row.failureSummary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Duplicate-protection decision ─────────────────────────────────────────────

export type SendAttemptResolution =
  | { action: "proceed"; existingAttempt: SendAttemptRecord | null }
  | { action: "return_idempotent_success"; existingAttempt: SendAttemptRecord }
  | { action: "return_pending_reconciliation"; existingAttempt: SendAttemptRecord };

/**
 * Decide what to do when a send request arrives for a draft with a known fingerprint.
 *
 * Rules:
 * - If no prior attempt exists → proceed (create new attempt).
 * - If the latest attempt is SENT or RECONCILED_SENT → return idempotent success.
 * - If the latest attempt is PENDING_RECONCILIATION → return pending (do not resend).
 * - If the latest attempt is FAILED or RECONCILED_FAILED → proceed (allow retry).
 * - If the latest attempt is PENDING → this should not normally happen for a persisted
 *   request, but treat as pending to avoid double-send.
 */
export function resolveDuplicateSendAttempt(
  latest: SendAttemptRecord | null,
): SendAttemptResolution {
  if (!latest) {
    return { action: "proceed", existingAttempt: null };
  }

  switch (latest.status) {
    case "SENT":
    case "RECONCILED_SENT":
      return { action: "return_idempotent_success", existingAttempt: latest };
    case "PENDING":
    case "PENDING_RECONCILIATION":
      return { action: "return_pending_reconciliation", existingAttempt: latest };
    case "FAILED":
    case "RECONCILED_FAILED":
      return { action: "proceed", existingAttempt: latest };
    default:
      // Defensive: unknown state should not proceed blindly.
      return { action: "return_pending_reconciliation", existingAttempt: latest };
  }
}
