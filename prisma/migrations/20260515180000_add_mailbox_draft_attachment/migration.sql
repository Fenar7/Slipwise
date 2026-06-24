-- Migration: Add MailboxDraftAttachment table for Sprint 5.3
-- Scope: staging outbound attachments against drafts before send.

CREATE TABLE "mailbox_draft_attachment" (
  "id"         TEXT NOT NULL,
  "orgId"      TEXT NOT NULL,
  "draftId"    TEXT NOT NULL,
  "filename"   TEXT NOT NULL,
  "mimeType"   TEXT NOT NULL,
  "size"       INTEGER NOT NULL,
  "isInline"   BOOLEAN NOT NULL DEFAULT false,
  "storageRef" TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mailbox_draft_attachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mailbox_draft_attachment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mailbox_draft_attachment_draftId_orgId_fkey" FOREIGN KEY ("draftId", "orgId") REFERENCES "mailbox_draft"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "mailbox_draft_attachment_draftId_id_key" ON "mailbox_draft_attachment"("draftId", "id");
CREATE INDEX "mailbox_draft_attachment_orgId_draftId_idx" ON "mailbox_draft_attachment"("orgId", "draftId");
