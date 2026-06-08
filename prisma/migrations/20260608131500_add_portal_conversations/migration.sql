-- CreateEnum
CREATE TYPE "conversation_portal_state" AS ENUM ('OPEN', 'WAITING_ON_INTERNAL', 'WAITING_ON_CLIENT', 'CLOSED');

-- CreateEnum
CREATE TYPE "linked_record_type" AS ENUM ('CUSTOMER', 'INVOICE', 'QUOTE', 'PAYMENT', 'STATEMENT', 'TICKET', 'GENERAL_SUPPORT');

-- CreateEnum
CREATE TYPE "message_audience" AS ENUM ('EXTERNAL_VISIBLE', 'INTERNAL_ONLY');

-- CreateEnum
CREATE TYPE "participant_kind" AS ENUM ('INTERNAL_MEMBER', 'PORTAL_CLIENT');

-- AlterEnum
ALTER TYPE "conversation_type" ADD VALUE 'PORTAL';

-- AlterEnum
ALTER TYPE "messaging_audit_action" ADD VALUE 'PORTAL_CONVERSATION_CREATED';
ALTER TYPE "messaging_audit_action" ADD VALUE 'PORTAL_MESSAGE_SENT';
ALTER TYPE "messaging_audit_action" ADD VALUE 'PORTAL_INTERNAL_NOTE_CREATED';
ALTER TYPE "messaging_audit_action" ADD VALUE 'PORTAL_CONVERSATION_CLOSED';
ALTER TYPE "messaging_audit_action" ADD VALUE 'PORTAL_CONVERSATION_REOPENED';
ALTER TYPE "messaging_audit_action" ADD VALUE 'PORTAL_CONVERSATION_ASSIGNED';
ALTER TYPE "messaging_audit_action" ADD VALUE 'PORTAL_ATTACHMENT_UPLOADED';
ALTER TYPE "messaging_audit_action" ADD VALUE 'PORTAL_CONVERSATION_ACCESS_BLOCKED';
ALTER TYPE "messaging_audit_action" ADD VALUE 'PORTAL_CONVERSATION_RATE_LIMITED';

-- AlterTable
ALTER TABLE "conversation" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "linkedRecordId" TEXT,
ADD COLUMN     "linkedRecordType" "linked_record_type",
ADD COLUMN     "portalState" "conversation_portal_state";

-- AlterTable
ALTER TABLE "conversation_participant" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "kind" "participant_kind" NOT NULL DEFAULT 'INTERNAL_MEMBER',
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "conversation_message" ADD COLUMN     "audience" "message_audience" NOT NULL DEFAULT 'EXTERNAL_VISIBLE',
ADD COLUMN     "customerId" TEXT,
ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "conversation_read_state" ADD COLUMN     "customerId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "conversation_orgId_customerId_idx" ON "conversation"("orgId", "customerId");

-- CreateIndex
CREATE INDEX "conversation_participant_orgId_customerId_leftAt_idx" ON "conversation_participant"("orgId", "customerId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participant_conversationId_customerId_key" ON "conversation_participant"("conversationId", "customerId");

-- CreateIndex
CREATE INDEX "conversation_message_orgId_customerId_createdAt_idx" ON "conversation_message"("orgId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_read_state_orgId_customerId_unreadCount_idx" ON "conversation_read_state"("orgId", "customerId", "unreadCount");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_read_state_conversationId_customerId_key" ON "conversation_read_state"("conversationId", "customerId");

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_message" ADD CONSTRAINT "conversation_message_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
