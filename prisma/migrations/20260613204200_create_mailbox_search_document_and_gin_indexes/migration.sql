-- CreateTable
CREATE TABLE "mailbox_search_document" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "mailboxConnectionId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL DEFAULT '',
    "documentType" TEXT NOT NULL,
    "providerThreadId" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "searchText" TEXT NOT NULL,
    "subjectText" TEXT NOT NULL,
    "snippetText" TEXT NOT NULL,
    "fromDisplayName" TEXT,
    "fromEmail" TEXT,
    "toRecipients" TEXT NOT NULL DEFAULT '',
    "lastActivityAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "isUnread" BOOLEAN NOT NULL DEFAULT false,
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assigneeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailbox_search_document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mailbox_search_document_orgId_mailboxConnectionId_threadId_messageId_key" ON "mailbox_search_document"("orgId", "mailboxConnectionId", "threadId", "messageId");

-- CreateIndex
CREATE INDEX "mailbox_search_document_orgId_mailboxConnectionId_idx" ON "mailbox_search_document"("orgId", "mailboxConnectionId");

-- CreateIndex
CREATE INDEX "mailbox_search_document_orgId_mailboxConnectionId_documentType_idx" ON "mailbox_search_document"("orgId", "mailboxConnectionId", "documentType");

-- CreateIndex
CREATE INDEX "mailbox_search_document_orgId_lastActivityAt_idx" ON "mailbox_search_document"("orgId", "lastActivityAt");

-- AddForeignKey
ALTER TABLE "mailbox_search_document" ADD CONSTRAINT "mailbox_search_document_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailbox_search_document" ADD CONSTRAINT "mailbox_search_document_mailboxConnectionId_orgId_fkey" FOREIGN KEY ("mailboxConnectionId", "orgId") REFERENCES "mailbox_connection"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create GIN index for full text search on mailbox_search_document
CREATE INDEX IF NOT EXISTS mailbox_search_document_search_text_idx 
ON "mailbox_search_document" 
USING gin(to_tsvector('english', "searchText"));

-- Create GIN index on mailbox_message providerMetadata JSONB column
CREATE INDEX IF NOT EXISTS mailbox_message_metadata_idx 
ON "mailbox_message" 
USING gin("providerMetadata");
