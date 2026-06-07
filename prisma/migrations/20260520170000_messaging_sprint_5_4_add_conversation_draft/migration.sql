-- Sprint 5.4: Add ConversationDraft table for server-backed draft continuity

CREATE TABLE "conversation_draft" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "threadId" TEXT,
    "userId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "contentMeta" JSONB DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_draft_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "conversation_draft" ADD CONSTRAINT "conversation_draft_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_draft" ADD CONSTRAINT "conversation_draft_conversationId_orgId_fkey"
    FOREIGN KEY ("conversationId", "orgId") REFERENCES "conversation"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_draft" ADD CONSTRAINT "conversation_draft_threadId_orgId_fkey"
    FOREIGN KEY ("threadId", "orgId") REFERENCES "conversation_thread"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique constraint: one draft per user per conversation/thread
CREATE UNIQUE INDEX "conversation_draft_orgId_conversationId_userId_threadId_key"
    ON "conversation_draft"("orgId", "conversationId", "userId", "threadId");

-- Performance indexes
CREATE INDEX "conversation_draft_orgId_userId_updatedAt_idx"
    ON "conversation_draft"("orgId", "userId", "updatedAt");
