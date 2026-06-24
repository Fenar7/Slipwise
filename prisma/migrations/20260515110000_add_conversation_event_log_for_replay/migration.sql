-- CreateTable
CREATE TABLE "conversation_event_log" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "cursor" BIGINT NOT NULL,
    "actorId" UUID,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_event_log_eventId_key" ON "conversation_event_log"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_event_log_conversationId_cursor_key" ON "conversation_event_log"("conversationId", "cursor");

-- CreateIndex
CREATE INDEX "conversation_event_log_orgId_conversationId_cursor_idx" ON "conversation_event_log"("orgId", "conversationId", "cursor");

-- CreateIndex
CREATE INDEX "conversation_event_log_eventId_idx" ON "conversation_event_log"("eventId");

-- CreateIndex
CREATE INDEX "conversation_event_log_createdAt_idx" ON "conversation_event_log"("createdAt");

-- AddForeignKey
ALTER TABLE "conversation_event_log" ADD CONSTRAINT "conversation_event_log_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_event_log" ADD CONSTRAINT "conversation_event_log_conversationId_orgId_fkey" FOREIGN KEY ("conversationId", "orgId") REFERENCES "conversation"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
