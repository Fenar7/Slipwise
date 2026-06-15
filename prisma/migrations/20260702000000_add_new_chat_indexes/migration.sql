-- Sprint 7.3: New Chat indexes
--
-- 1. Filtered unique index on (orgId, displayName) for non-deleted connections.
--    Used by generateNewChatName() to find the max sequence efficiently.
-- 2. Index on displayName for prefix-based search (startsWith "New Chat #").

CREATE UNIQUE INDEX "MailboxConnection_org_displayName_unique"
    ON "mailbox_connection" ("orgId", "displayName")
    WHERE "deletedAt" IS NULL;

CREATE INDEX "MailboxConnection_displayName_idx"
    ON "mailbox_connection" ("displayName")
    WHERE "deletedAt" IS NULL;
