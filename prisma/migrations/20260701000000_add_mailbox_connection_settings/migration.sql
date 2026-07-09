-- Sprint 7.2 — Add notificationSettings and deletedAt to mailbox_connection
-- notificationSettings: nullable JSON column storing { email: boolean, sms: boolean }
-- deletedAt: nullable timestamp for soft-delete (replaces administrative disable)

ALTER TABLE "mailbox_connection"
  ADD COLUMN "notificationSettings" JSONB,
  ADD COLUMN "deletedAt" TIMESTAMPTZ;

-- Existing soft-disabled connections (disabledAt IS NOT NULL) remain as-is.
-- New soft-delete operations will set deletedAt instead of/responsively with disabledAt.

CREATE INDEX IF NOT EXISTS idx_mailbox_connection_org_deleted
  ON "mailbox_connection" ("orgId", "deletedAt")
  WHERE "deletedAt" IS NULL;
