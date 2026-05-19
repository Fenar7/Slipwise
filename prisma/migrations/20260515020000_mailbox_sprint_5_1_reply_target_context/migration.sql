-- Sprint 5.1 hardening: reply target identity in draft persistence.
-- Adds replyToMessageId to mailbox_draft so canonical restore distinguishes
-- drafts for different reply targets within the same thread.

ALTER TABLE "mailbox_draft" ADD COLUMN "replyToMessageId" TEXT;
