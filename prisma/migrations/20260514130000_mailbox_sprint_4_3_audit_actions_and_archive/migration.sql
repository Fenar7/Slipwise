-- Sprint 4.3: Core thread actions.
-- 1. Adds new audit action enum values for mark read/unread, flag/unflag.
-- 2. Adds preArchiveStatus column to mailbox_thread for status preservation on unarchive.

-- AlterEnum
-- Adds new audit actions for core thread triage (Sprint 4.3).
-- PostgreSQL 12+: multiple ADD VALUE statements are safe in one transaction.

ALTER TYPE "mailbox_audit_action" ADD VALUE 'THREAD_READ';
ALTER TYPE "mailbox_audit_action" ADD VALUE 'THREAD_UNREAD';
ALTER TYPE "mailbox_audit_action" ADD VALUE 'THREAD_FLAGGED';
ALTER TYPE "mailbox_audit_action" ADD VALUE 'THREAD_UNFLAGGED';

-- AlterTable
ALTER TABLE "mailbox_thread" ADD COLUMN "preArchiveStatus" "mailbox_thread_status";
