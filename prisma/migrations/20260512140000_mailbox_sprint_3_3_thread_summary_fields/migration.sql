-- Sprint 3.3: Add thread-level preview snippet and attachment count columns.
-- These fields are derived from normalized message data during sync ingestion.

-- AlterTable
ALTER TABLE "mailbox_thread" ADD COLUMN "previewSnippet" TEXT NOT NULL DEFAULT '';
ALTER TABLE "mailbox_thread" ADD COLUMN "attachmentCount" INTEGER NOT NULL DEFAULT 0;
