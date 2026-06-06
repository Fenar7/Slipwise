/*
  Warnings:

  - You are about to drop the `customer_default_tag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `invoice_tag_assignment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `vendor_default_tag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `voucher_tag_assignment` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SequenceChangeType" AS ENUM ('CREATED', 'UPDATED', 'DEACTIVATED', 'REACTIVATED');

-- CreateEnum
CREATE TYPE "mailbox_provider" AS ENUM ('GMAIL', 'ZOHO');

-- CreateEnum
CREATE TYPE "mailbox_connection_status" AS ENUM ('ACTIVE', 'RECONNECT_REQUIRED', 'DEGRADED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "mailbox_thread_status" AS ENUM ('OPEN', 'PENDING', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "mailbox_draft_mode" AS ENUM ('NEW', 'REPLY', 'REPLY_ALL', 'FORWARD');

-- CreateEnum
CREATE TYPE "mailbox_draft_status" AS ENUM ('ACTIVE', 'DISCARDED', 'SENT');

-- CreateEnum
CREATE TYPE "mailbox_assignment_status" AS ENUM ('ACTIVE', 'RESOLVED', 'REASSIGNED');

-- CreateEnum
CREATE TYPE "mailbox_audit_action" AS ENUM ('CONNECTION_CREATED', 'CONNECTION_DISCONNECTED', 'CONNECTION_RECONNECTED', 'CONNECTION_DEGRADED', 'CONNECTION_PERMISSION_CHANGED', 'THREAD_ASSIGNED', 'THREAD_UNASSIGNED', 'THREAD_STATUS_CHANGED', 'THREAD_LINKED', 'THREAD_UNLINKED', 'MESSAGE_SENT', 'MESSAGE_REPLIED', 'MESSAGE_FORWARDED', 'DRAFT_CREATED', 'DRAFT_DISCARDED', 'SYNC_MANUAL_TRIGGERED', 'ADMIN_SUPPORT_ACTION');

-- CreateEnum
CREATE TYPE "mailbox_cursor_type" AS ENUM ('HISTORY_ID', 'PAGE_TOKEN', 'WATCH_EXPIRY');

-- CreateEnum
CREATE TYPE "mailbox_thread_link_entity_type" AS ENUM ('CUSTOMER', 'INVOICE', 'VOUCHER', 'QUOTE');

-- DropForeignKey
ALTER TABLE "customer_default_tag" DROP CONSTRAINT "customer_default_tag_customerId_fkey";

-- DropForeignKey
ALTER TABLE "customer_default_tag" DROP CONSTRAINT "customer_default_tag_tagId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_tag_assignment" DROP CONSTRAINT "invoice_tag_assignment_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_tag_assignment" DROP CONSTRAINT "invoice_tag_assignment_tagId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_default_tag" DROP CONSTRAINT "vendor_default_tag_tagId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_default_tag" DROP CONSTRAINT "vendor_default_tag_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "voucher_tag_assignment" DROP CONSTRAINT "voucher_tag_assignment_tagId_fkey";

-- DropForeignKey
ALTER TABLE "voucher_tag_assignment" DROP CONSTRAINT "voucher_tag_assignment_voucherId_fkey";

-- AlterTable
ALTER TABLE "e_invoice_request" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- DropTable
DROP TABLE "customer_default_tag";

-- DropTable
DROP TABLE "invoice_tag_assignment";

-- DropTable
DROP TABLE "vendor_default_tag";

-- DropTable
DROP TABLE "voucher_tag_assignment";

-- CreateTable
CREATE TABLE "sequence_snapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "documentType" "SequenceDocumentType" NOT NULL,
    "periodicity" "SequencePeriodicity" NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "formatString" TEXT NOT NULL,
    "startCounter" INTEGER NOT NULL,
    "counterPadding" INTEGER NOT NULL,
    "totalConsumed" INTEGER NOT NULL DEFAULT 0,
    "periodsSnapshot" JSONB NOT NULL,
    "changeType" "SequenceChangeType" NOT NULL,
    "changeSummary" TEXT,
    "changedById" UUID NOT NULL,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequence_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_connection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "mailbox_provider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "mailbox_connection_status" NOT NULL DEFAULT 'ACTIVE',
    "tokenRef" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "watchMetadata" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "disabledAt" TIMESTAMP(3),
    "connectedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailbox_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_thread_link" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "entityType" "mailbox_thread_link_entity_type" NOT NULL,
    "entityId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mailbox_thread_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_draft" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "mailboxConnectionId" TEXT NOT NULL,
    "threadId" TEXT,
    "mode" "mailbox_draft_mode" NOT NULL,
    "fromIdentity" TEXT NOT NULL,
    "toRecipients" JSONB NOT NULL,
    "ccRecipients" JSONB NOT NULL DEFAULT '[]',
    "bccRecipients" JSONB NOT NULL DEFAULT '[]',
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT,
    "attachmentRefs" JSONB NOT NULL DEFAULT '[]',
    "status" "mailbox_draft_status" NOT NULL DEFAULT 'ACTIVE',
    "lastAutosavedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailbox_draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_assignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "assigneeId" UUID NOT NULL,
    "assignedBy" UUID NOT NULL,
    "status" "mailbox_assignment_status" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailbox_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_audit_event" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "mailboxConnectionId" TEXT,
    "threadId" TEXT,
    "messageId" TEXT,
    "actorId" UUID NOT NULL,
    "action" "mailbox_audit_action" NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mailbox_audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_provider_cursor" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "mailboxConnectionId" TEXT NOT NULL,
    "provider" "mailbox_provider" NOT NULL,
    "cursorType" "mailbox_cursor_type" NOT NULL,
    "cursorValue" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastAdvancedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailbox_provider_cursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sequence_snapshot_organizationId_documentType_idx" ON "sequence_snapshot"("organizationId", "documentType");

-- CreateIndex
CREATE INDEX "sequence_snapshot_sequenceId_createdAt_idx" ON "sequence_snapshot"("sequenceId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sequence_snapshot_sequenceId_version_key" ON "sequence_snapshot"("sequenceId", "version");

-- CreateIndex
CREATE INDEX "mailbox_connection_orgId_status_idx" ON "mailbox_connection"("orgId", "status");

-- CreateIndex
CREATE INDEX "mailbox_connection_orgId_provider_idx" ON "mailbox_connection"("orgId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "mailbox_connection_orgId_provider_providerAccountId_key" ON "mailbox_connection"("orgId", "provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "mailbox_connection_id_orgId_key" ON "mailbox_connection"("id", "orgId");

-- CreateIndex
CREATE INDEX "mailbox_thread_link_orgId_threadId_idx" ON "mailbox_thread_link"("orgId", "threadId");

-- CreateIndex
CREATE INDEX "mailbox_thread_link_orgId_entityType_entityId_idx" ON "mailbox_thread_link"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "mailbox_thread_link_threadId_entityType_entityId_key" ON "mailbox_thread_link"("threadId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "mailbox_draft_orgId_mailboxConnectionId_status_idx" ON "mailbox_draft"("orgId", "mailboxConnectionId", "status");

-- CreateIndex
CREATE INDEX "mailbox_draft_orgId_threadId_idx" ON "mailbox_draft"("orgId", "threadId");

-- CreateIndex
CREATE INDEX "mailbox_assignment_orgId_threadId_status_idx" ON "mailbox_assignment"("orgId", "threadId", "status");

-- CreateIndex
CREATE INDEX "mailbox_assignment_orgId_assigneeId_status_idx" ON "mailbox_assignment"("orgId", "assigneeId", "status");

-- CreateIndex
CREATE INDEX "mailbox_audit_event_orgId_createdAt_idx" ON "mailbox_audit_event"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "mailbox_audit_event_orgId_mailboxConnectionId_createdAt_idx" ON "mailbox_audit_event"("orgId", "mailboxConnectionId", "createdAt");

-- CreateIndex
CREATE INDEX "mailbox_audit_event_orgId_action_createdAt_idx" ON "mailbox_audit_event"("orgId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "mailbox_provider_cursor_orgId_mailboxConnectionId_idx" ON "mailbox_provider_cursor"("orgId", "mailboxConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "mailbox_provider_cursor_orgId_mailboxConnectionId_cursorTyp_key" ON "mailbox_provider_cursor"("orgId", "mailboxConnectionId", "cursorType");

-- AddForeignKey
ALTER TABLE "sequence_snapshot" ADD CONSTRAINT "sequence_snapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_snapshot" ADD CONSTRAINT "sequence_snapshot_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_snapshot" ADD CONSTRAINT "sequence_snapshot_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_connection" ADD CONSTRAINT "mailbox_connection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_thread_link" ADD CONSTRAINT "mailbox_thread_link_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_draft" ADD CONSTRAINT "mailbox_draft_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_draft" ADD CONSTRAINT "mailbox_draft_mailboxConnectionId_orgId_fkey" FOREIGN KEY ("mailboxConnectionId", "orgId") REFERENCES "mailbox_connection"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_assignment" ADD CONSTRAINT "mailbox_assignment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_audit_event" ADD CONSTRAINT "mailbox_audit_event_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_audit_event" ADD CONSTRAINT "mailbox_audit_event_mailboxConnectionId_fkey" FOREIGN KEY ("mailboxConnectionId") REFERENCES "mailbox_connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_provider_cursor" ADD CONSTRAINT "mailbox_provider_cursor_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_provider_cursor" ADD CONSTRAINT "mailbox_provider_cursor_mailboxConnectionId_orgId_fkey" FOREIGN KEY ("mailboxConnectionId", "orgId") REFERENCES "mailbox_connection"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "document_tag_orgId_slug_key" RENAME TO "document_tag_org_slug_unique";
