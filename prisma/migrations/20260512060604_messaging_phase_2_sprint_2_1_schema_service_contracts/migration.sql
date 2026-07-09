-- CreateEnum
CREATE TYPE "conversation_type" AS ENUM ('CHANNEL', 'DM', 'GROUP');

-- CreateEnum
CREATE TYPE "conversation_visibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "conversation_message_status" AS ENUM ('ACTIVE', 'EDITED', 'DELETED');

-- CreateEnum
CREATE TYPE "conversation_participant_role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "message_reaction_type" AS ENUM ('EMOJI', 'CUSTOM');

-- CreateEnum
CREATE TYPE "presence_status" AS ENUM ('ONLINE', 'AWAY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "typing_status" AS ENUM ('TYPING', 'STOPPED');

-- CreateEnum
CREATE TYPE "attachment_scan_status" AS ENUM ('pending', 'clean', 'blocked');

-- CreateEnum
CREATE TYPE "messaging_task_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "meeting_status" AS ENUM ('UPCOMING', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "calendar_provider" AS ENUM ('GOOGLE', 'OUTLOOK');

-- CreateEnum
CREATE TYPE "calendar_connection_status" AS ENUM ('active', 'reconnect_required', 'disconnected');

-- CreateEnum
CREATE TYPE "messaging_audit_action" AS ENUM ('CONVERSATION_CREATED', 'CONVERSATION_ARCHIVED', 'CONVERSATION_DELETED', 'CONVERSATION_RENAMED', 'CONVERSATION_VISIBILITY_CHANGED', 'PARTICIPANT_ADDED', 'PARTICIPANT_REMOVED', 'PARTICIPANT_ROLE_CHANGED', 'MESSAGE_SENT', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'THREAD_CREATED', 'THREAD_REPLIED', 'REACTION_ADDED', 'REACTION_REMOVED', 'MENTION_CREATED', 'READ_STATE_UPDATED', 'TASK_CREATED', 'TASK_UPDATED', 'TASK_ASSIGNED', 'TASK_COMPLETED', 'MEETING_SCHEDULED', 'MEETING_UPDATED', 'MEETING_CANCELLED', 'ATTACHMENT_UPLOADED', 'ATTACHMENT_DELETED', 'RETENTION_POLICY_CREATED', 'RETENTION_POLICY_UPDATED', 'ADMIN_SUPPORT_ACTION');

-- CreateEnum
CREATE TYPE "retention_policy_type" AS ENUM ('ORG_DEFAULT', 'CHANNEL_SPECIFIC', 'GROUP_SPECIFIC', 'DM_SPECIFIC');

-- CreateEnum
CREATE TYPE "retention_action" AS ENUM ('ARCHIVE', 'DELETE', 'FLAG');

-- CreateTable
CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "conversation_type" NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "visibility" "conversation_visibility",
    "dmPeerId" UUID,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" UUID,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" UUID,
    "lockReason" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participant" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "role" "conversation_participant_role" NOT NULL DEFAULT 'MEMBER',
    "leftAt" TIMESTAMP(3),
    "mutedUntil" TIMESTAMP(3),
    "displayName" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_message" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "threadId" TEXT,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "contentMeta" JSONB,
    "status" "conversation_message_status" NOT NULL DEFAULT 'ACTIVE',
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "participantCountAtSend" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_thread" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "anchorMessageId" TEXT NOT NULL,
    "title" TEXT,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reaction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "type" "message_reaction_type" NOT NULL DEFAULT 'EMOJI',
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_mention" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mentionedUserId" UUID NOT NULL,
    "offsetStart" INTEGER NOT NULL,
    "offsetEnd" INTEGER NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_read_state" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_read_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presence_session" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "status" "presence_status" NOT NULL DEFAULT 'OFFLINE',
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "activeConversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presence_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "typing_session" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "status" "typing_status" NOT NULL DEFAULT 'TYPING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "typing_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_attachment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "thumbnailRef" TEXT,
    "scanStatus" "attachment_scan_status" NOT NULL DEFAULT 'pending',
    "scannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_task" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "originatingMessageId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "messaging_task_status" NOT NULL DEFAULT 'OPEN',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "assigneeId" UUID,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedBy" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_meeting" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" "meeting_status" NOT NULL DEFAULT 'UPCOMING',
    "providerEventId" TEXT,
    "scheduledBy" UUID NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" UUID,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_connection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "calendar_provider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "tokenRef" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "status" "calendar_connection_status" NOT NULL DEFAULT 'active',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "disconnectedAt" TIMESTAMP(3),
    "connectedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_audit_event" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "threadId" TEXT,
    "taskId" TEXT,
    "meetingId" TEXT,
    "actorId" UUID NOT NULL,
    "action" "messaging_audit_action" NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaging_audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_policy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "retention_policy_type" NOT NULL DEFAULT 'ORG_DEFAULT',
    "conversationId" TEXT,
    "retentionDays" INTEGER,
    "action" "retention_action" NOT NULL DEFAULT 'ARCHIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastAppliedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_policy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_orgId_type_dmPeerId_idx" ON "conversation"("orgId", "type", "dmPeerId");

-- CreateIndex
CREATE INDEX "conversation_orgId_type_visibility_idx" ON "conversation"("orgId", "type", "visibility");

-- CreateIndex
CREATE INDEX "conversation_orgId_archivedAt_idx" ON "conversation"("orgId", "archivedAt");

-- CreateIndex
CREATE INDEX "conversation_orgId_createdAt_idx" ON "conversation"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_id_orgId_key" ON "conversation"("id", "orgId");

-- CreateIndex
CREATE INDEX "conversation_participant_orgId_userId_leftAt_idx" ON "conversation_participant"("orgId", "userId", "leftAt");

-- CreateIndex
CREATE INDEX "conversation_participant_orgId_conversationId_leftAt_idx" ON "conversation_participant"("orgId", "conversationId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participant_conversationId_userId_key" ON "conversation_participant"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "conversation_message_orgId_conversationId_createdAt_idx" ON "conversation_message"("orgId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_message_orgId_conversationId_threadId_createdA_idx" ON "conversation_message"("orgId", "conversationId", "threadId", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_message_orgId_authorId_createdAt_idx" ON "conversation_message"("orgId", "authorId", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_message_orgId_status_createdAt_idx" ON "conversation_message"("orgId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_message_id_orgId_key" ON "conversation_message"("id", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_message_id_conversationId_orgId_key" ON "conversation_message"("id", "conversationId", "orgId");

-- CreateIndex
CREATE INDEX "conversation_thread_orgId_conversationId_createdAt_idx" ON "conversation_thread"("orgId", "conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_thread_id_orgId_key" ON "conversation_thread"("id", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_thread_anchorMessageId_conversationId_orgId_key" ON "conversation_thread"("anchorMessageId", "conversationId", "orgId");

-- CreateIndex
CREATE INDEX "message_reaction_orgId_messageId_idx" ON "message_reaction"("orgId", "messageId");

-- CreateIndex
CREATE INDEX "message_reaction_orgId_userId_idx" ON "message_reaction"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "message_reaction_messageId_userId_value_key" ON "message_reaction"("messageId", "userId", "value");

-- CreateIndex
CREATE INDEX "message_mention_orgId_mentionedUserId_acknowledged_idx" ON "message_mention"("orgId", "mentionedUserId", "acknowledged");

-- CreateIndex
CREATE INDEX "message_mention_orgId_messageId_idx" ON "message_mention"("orgId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "message_mention_messageId_mentionedUserId_offsetStart_key" ON "message_mention"("messageId", "mentionedUserId", "offsetStart");

-- CreateIndex
CREATE INDEX "conversation_read_state_orgId_userId_unreadCount_idx" ON "conversation_read_state"("orgId", "userId", "unreadCount");

-- CreateIndex
CREATE INDEX "conversation_read_state_orgId_conversationId_updatedAt_idx" ON "conversation_read_state"("orgId", "conversationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_read_state_conversationId_userId_key" ON "conversation_read_state"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "presence_session_orgId_status_lastActivityAt_idx" ON "presence_session"("orgId", "status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "presence_session_orgId_expiresAt_idx" ON "presence_session"("orgId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "presence_session_orgId_userId_key" ON "presence_session"("orgId", "userId");

-- CreateIndex
CREATE INDEX "typing_session_orgId_conversationId_expiresAt_idx" ON "typing_session"("orgId", "conversationId", "expiresAt");

-- CreateIndex
CREATE INDEX "typing_session_orgId_userId_expiresAt_idx" ON "typing_session"("orgId", "userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "typing_session_conversationId_userId_key" ON "typing_session"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "conversation_attachment_orgId_messageId_idx" ON "conversation_attachment"("orgId", "messageId");

-- CreateIndex
CREATE INDEX "conversation_attachment_orgId_scanStatus_idx" ON "conversation_attachment"("orgId", "scanStatus");

-- CreateIndex
CREATE INDEX "messaging_task_orgId_conversationId_status_idx" ON "messaging_task"("orgId", "conversationId", "status");

-- CreateIndex
CREATE INDEX "messaging_task_orgId_assigneeId_status_idx" ON "messaging_task"("orgId", "assigneeId", "status");

-- CreateIndex
CREATE INDEX "messaging_task_orgId_status_dueDate_idx" ON "messaging_task"("orgId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "conversation_meeting_orgId_conversationId_scheduledAt_idx" ON "conversation_meeting"("orgId", "conversationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "conversation_meeting_orgId_status_scheduledAt_idx" ON "conversation_meeting"("orgId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "calendar_connection_orgId_status_idx" ON "calendar_connection"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_connection_orgId_provider_providerAccountId_key" ON "calendar_connection"("orgId", "provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "messaging_audit_event_orgId_createdAt_idx" ON "messaging_audit_event"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "messaging_audit_event_orgId_conversationId_createdAt_idx" ON "messaging_audit_event"("orgId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "messaging_audit_event_orgId_action_createdAt_idx" ON "messaging_audit_event"("orgId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "messaging_audit_event_orgId_actorId_createdAt_idx" ON "messaging_audit_event"("orgId", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "retention_policy_orgId_isActive_lastAppliedAt_idx" ON "retention_policy"("orgId", "isActive", "lastAppliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "retention_policy_orgId_type_conversationId_key" ON "retention_policy"("orgId", "type", "conversationId");

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_conversationId_orgId_fkey" FOREIGN KEY ("conversationId", "orgId") REFERENCES "conversation"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_message" ADD CONSTRAINT "conversation_message_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_message" ADD CONSTRAINT "conversation_message_conversationId_orgId_fkey" FOREIGN KEY ("conversationId", "orgId") REFERENCES "conversation"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_message" ADD CONSTRAINT "conversation_message_threadId_orgId_fkey" FOREIGN KEY ("threadId", "orgId") REFERENCES "conversation_thread"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_thread" ADD CONSTRAINT "conversation_thread_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_thread" ADD CONSTRAINT "conversation_thread_conversationId_orgId_fkey" FOREIGN KEY ("conversationId", "orgId") REFERENCES "conversation"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_thread" ADD CONSTRAINT "conversation_thread_anchorMessageId_conversationId_orgId_fkey" FOREIGN KEY ("anchorMessageId", "conversationId", "orgId") REFERENCES "conversation_message"("id", "conversationId", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reaction" ADD CONSTRAINT "message_reaction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reaction" ADD CONSTRAINT "message_reaction_messageId_orgId_fkey" FOREIGN KEY ("messageId", "orgId") REFERENCES "conversation_message"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_mention" ADD CONSTRAINT "message_mention_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_mention" ADD CONSTRAINT "message_mention_messageId_orgId_fkey" FOREIGN KEY ("messageId", "orgId") REFERENCES "conversation_message"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_conversationId_orgId_fkey" FOREIGN KEY ("conversationId", "orgId") REFERENCES "conversation"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presence_session" ADD CONSTRAINT "presence_session_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presence_session" ADD CONSTRAINT "presence_session_activeConversationId_orgId_fkey" FOREIGN KEY ("activeConversationId", "orgId") REFERENCES "conversation"("id", "orgId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "typing_session" ADD CONSTRAINT "typing_session_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "typing_session" ADD CONSTRAINT "typing_session_conversationId_orgId_fkey" FOREIGN KEY ("conversationId", "orgId") REFERENCES "conversation"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_attachment" ADD CONSTRAINT "conversation_attachment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_attachment" ADD CONSTRAINT "conversation_attachment_messageId_orgId_fkey" FOREIGN KEY ("messageId", "orgId") REFERENCES "conversation_message"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_task" ADD CONSTRAINT "messaging_task_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_task" ADD CONSTRAINT "messaging_task_conversationId_orgId_fkey" FOREIGN KEY ("conversationId", "orgId") REFERENCES "conversation"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_meeting" ADD CONSTRAINT "conversation_meeting_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_meeting" ADD CONSTRAINT "conversation_meeting_conversationId_orgId_fkey" FOREIGN KEY ("conversationId", "orgId") REFERENCES "conversation"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_connection" ADD CONSTRAINT "calendar_connection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_audit_event" ADD CONSTRAINT "messaging_audit_event_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_audit_event" ADD CONSTRAINT "messaging_audit_event_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_policy" ADD CONSTRAINT "retention_policy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
