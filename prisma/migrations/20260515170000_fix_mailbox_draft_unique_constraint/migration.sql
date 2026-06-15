-- Fix: Add missing unique constraint on mailbox_draft(id, orgId).
-- Required by the composite FK in mailbox_draft_attachment.
-- The Prisma schema defines @@unique([id, orgId]) but the original
-- migration that created mailbox_draft only included the PK on id.

CREATE UNIQUE INDEX "mailbox_draft_id_orgId_key" ON "mailbox_draft"("id", "orgId");
