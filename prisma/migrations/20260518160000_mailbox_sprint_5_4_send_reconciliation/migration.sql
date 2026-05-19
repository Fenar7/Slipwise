-- Migration: Add MailboxSendAttempt for Sprint 5.4 send reconciliation and failure handling
-- Scope: durable outbound send-attempt modeling, duplicate protection, explicit reconciliation.

CREATE TYPE "mailbox_send_attempt_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'PENDING_RECONCILIATION', 'RECONCILED_SENT', 'RECONCILED_FAILED');

CREATE TABLE "mailbox_send_attempt" (
  "id"                  TEXT NOT NULL,
  "orgId"               TEXT NOT NULL,
  "draftId"             TEXT NOT NULL,
  "mailboxConnectionId" TEXT NOT NULL,
  "actorId"             UUID NOT NULL,
  "status"              "mailbox_send_attempt_status" NOT NULL,
  "mode"                "mailbox_draft_mode" NOT NULL,
  "fingerprint"         TEXT NOT NULL,
  "correlationKey"      TEXT NOT NULL,
  "rfcMessageId"        TEXT,
  "providerMessageId"   TEXT,
  "providerThreadId"    TEXT,
  "failureCategory"     TEXT,
  "failureSummary"      TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mailbox_send_attempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mailbox_send_attempt_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mailbox_send_attempt_mailboxConnectionId_orgId_fkey" FOREIGN KEY ("mailboxConnectionId", "orgId") REFERENCES "mailbox_connection"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mailbox_send_attempt_draftId_orgId_fkey" FOREIGN KEY ("draftId", "orgId") REFERENCES "mailbox_draft"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "mailbox_send_attempt_correlationKey_key" ON "mailbox_send_attempt"("correlationKey");
CREATE INDEX "mailbox_send_attempt_orgId_draftId_fingerprint_idx" ON "mailbox_send_attempt"("orgId", "draftId", "fingerprint");
CREATE INDEX "mailbox_send_attempt_orgId_correlationKey_idx" ON "mailbox_send_attempt"("orgId", "correlationKey");
CREATE INDEX "mailbox_send_attempt_orgId_status_idx" ON "mailbox_send_attempt"("orgId", "status");
