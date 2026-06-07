/*
  Warnings:

  - You are about to drop the `mailbox_send_attempt` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[id,orgId]` on the table `conversation_draft` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orgId,userId,dedupeKey]` on the table `notification` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "meeting_rsvp_status" AS ENUM ('PENDING', 'ACCEPTED', 'TENTATIVE', 'DECLINED');

-- CreateEnum
CREATE TYPE "meeting_reminder_window" AS ENUM ('SIXTY_MINUTES', 'FIFTEEN_MINUTES');

-- CreateEnum
CREATE TYPE "attachment_indexing_status" AS ENUM ('indexed', 'unindexed', 'pending', 'failed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "messaging_audit_action" ADD VALUE 'CONVERSATION_UNARCHIVED';
ALTER TYPE "messaging_audit_action" ADD VALUE 'CONVERSATION_LOCKED';
ALTER TYPE "messaging_audit_action" ADD VALUE 'CONVERSATION_UNLOCKED';
ALTER TYPE "messaging_audit_action" ADD VALUE 'MEETING_RESCHEDULED';
ALTER TYPE "messaging_audit_action" ADD VALUE 'MEETING_ATTENDEE_RSVP';
ALTER TYPE "messaging_audit_action" ADD VALUE 'MEETING_REMINDER_DISPATCHED';

-- DropForeignKey
ALTER TABLE "mailbox_send_attempt" DROP CONSTRAINT "mailbox_send_attempt_draftId_orgId_fkey";

-- DropForeignKey
ALTER TABLE "mailbox_send_attempt" DROP CONSTRAINT "mailbox_send_attempt_mailboxConnectionId_orgId_fkey";

-- DropForeignKey
ALTER TABLE "mailbox_send_attempt" DROP CONSTRAINT "mailbox_send_attempt_orgId_fkey";

-- DropForeignKey
ALTER TABLE "presence_session" DROP CONSTRAINT "presence_session_activeConversationId_orgId_fkey";

-- AlterTable
ALTER TABLE "conversation_draft" ALTER COLUMN "contentMeta" DROP DEFAULT;

-- AlterTable
ALTER TABLE "conversation_meeting" ADD COLUMN     "joinUrl" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "e_invoice_request" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "messaging_task" ADD COLUMN     "providerEventId" TEXT,
ALTER COLUMN "reminderAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "reminderSentAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "dedupeKey" TEXT;

-- DropTable
DROP TABLE "mailbox_send_attempt";

-- DropEnum
DROP TYPE "mailbox_send_attempt_status";

-- CreateTable
CREATE TABLE "messaging_attachment_index" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "scanStatus" "attachment_scan_status" NOT NULL,
    "indexingStatus" "attachment_indexing_status" NOT NULL,
    "extractedText" TEXT NOT NULL,
    "extractedPreview" TEXT,
    "lastIndexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "messaging_attachment_index_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attendee" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "rsvpStatus" "meeting_rsvp_status" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "providerAttendeeId" TEXT,
    "providerStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_attendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_reminder" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "window" "meeting_reminder_window" NOT NULL,
    "sentAt" TIMESTAMP(3),
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downstream_consumption_checkpoint" (
    "id" TEXT NOT NULL,
    "consumerType" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "cursor" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "downstream_consumption_checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_notification_preference" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "allNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mentionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "repliesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "taskRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "meetingRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dndEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dndStart" TEXT NOT NULL DEFAULT '22:00',
    "dndEnd" TEXT NOT NULL DEFAULT '08:00',
    "digestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "digestFrequency" TEXT NOT NULL DEFAULT 'DAILY',
    "lastDigestSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_follow_up" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "note" VARCHAR(500),
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_follow_up_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messaging_attachment_index_attachmentId_key" ON "messaging_attachment_index"("attachmentId");

-- CreateIndex
CREATE INDEX "messaging_attachment_index_orgId_conversationId_idx" ON "messaging_attachment_index"("orgId", "conversationId");

-- CreateIndex
CREATE INDEX "messaging_attachment_index_orgId_indexingStatus_idx" ON "messaging_attachment_index"("orgId", "indexingStatus");

-- CreateIndex
CREATE INDEX "meeting_attendee_orgId_meetingId_idx" ON "meeting_attendee"("orgId", "meetingId");

-- CreateIndex
CREATE INDEX "meeting_attendee_orgId_userId_rsvpStatus_idx" ON "meeting_attendee"("orgId", "userId", "rsvpStatus");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_attendee_meetingId_userId_key" ON "meeting_attendee"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "meeting_reminder_orgId_meetingId_idx" ON "meeting_reminder"("orgId", "meetingId");

-- CreateIndex
CREATE INDEX "meeting_reminder_sentAt_skipped_idx" ON "meeting_reminder"("sentAt", "skipped");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_reminder_meetingId_window_key" ON "meeting_reminder"("meetingId", "window");

-- CreateIndex
CREATE INDEX "downstream_consumption_checkpoint_orgId_conversationId_idx" ON "downstream_consumption_checkpoint"("orgId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "downstream_consumption_checkpoint_consumerType_orgId_conver_key" ON "downstream_consumption_checkpoint"("consumerType", "orgId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_notification_preference_orgId_userId_key" ON "messaging_notification_preference"("orgId", "userId");

-- CreateIndex
CREATE INDEX "messaging_follow_up_orgId_userId_resolvedAt_idx" ON "messaging_follow_up"("orgId", "userId", "resolvedAt");

-- CreateIndex
CREATE INDEX "messaging_follow_up_orgId_conversationId_idx" ON "messaging_follow_up"("orgId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_follow_up_orgId_userId_messageId_key" ON "messaging_follow_up"("orgId", "userId", "messageId");

-- CreateIndex
CREATE INDEX "conversation_draft_orgId_conversationId_threadId_idx" ON "conversation_draft"("orgId", "conversationId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_draft_id_orgId_key" ON "conversation_draft"("id", "orgId");

-- CreateIndex
CREATE INDEX "conversation_meeting_orgId_reminderSentAt_idx" ON "conversation_meeting"("orgId", "reminderSentAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_orgId_userId_dedupeKey_key" ON "notification"("orgId", "userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "presence_session" ADD CONSTRAINT "presence_session_activeConversationId_orgId_fkey" FOREIGN KEY ("activeConversationId", "orgId") REFERENCES "conversation"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_attachment_index" ADD CONSTRAINT "messaging_attachment_index_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_attachment_index" ADD CONSTRAINT "messaging_attachment_index_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "conversation_attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendee" ADD CONSTRAINT "meeting_attendee_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "conversation_meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_reminder" ADD CONSTRAINT "meeting_reminder_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "conversation_meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downstream_consumption_checkpoint" ADD CONSTRAINT "downstream_consumption_checkpoint_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_notification_preference" ADD CONSTRAINT "messaging_notification_preference_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_follow_up" ADD CONSTRAINT "messaging_follow_up_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_follow_up" ADD CONSTRAINT "messaging_follow_up_conversationId_orgId_fkey" FOREIGN KEY ("conversationId", "orgId") REFERENCES "conversation"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_follow_up" ADD CONSTRAINT "messaging_follow_up_messageId_orgId_fkey" FOREIGN KEY ("messageId", "orgId") REFERENCES "conversation_message"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
