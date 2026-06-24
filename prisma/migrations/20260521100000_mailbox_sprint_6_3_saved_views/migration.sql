-- Migration: Add MailboxSavedView for Sprint 6.3 smart views and saved operational filters
-- Scope: minimal persisted saved-view model, org-scoped, per-user.

CREATE TABLE "mailbox_saved_view" (
  "id"          TEXT NOT NULL,
  "orgId"       TEXT NOT NULL,
  "createdBy"   UUID NOT NULL,
  "label"       TEXT NOT NULL,
  "filters"     JSONB NOT NULL DEFAULT '[]',
  "searchQuery" TEXT NOT NULL DEFAULT '',
  "smartViewId" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mailbox_saved_view_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mailbox_saved_view_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "mailbox_saved_view_orgId_createdBy_idx" ON "mailbox_saved_view"("orgId", "createdBy");
