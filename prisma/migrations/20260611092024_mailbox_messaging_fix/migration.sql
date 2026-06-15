/*
  Warnings:

  - You are about to drop the `mailbox_send_attempt` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "mailbox_send_attempt" DROP CONSTRAINT "mailbox_send_attempt_draftId_orgId_fkey";

-- DropForeignKey
ALTER TABLE "mailbox_send_attempt" DROP CONSTRAINT "mailbox_send_attempt_mailboxConnectionId_orgId_fkey";

-- DropForeignKey
ALTER TABLE "mailbox_send_attempt" DROP CONSTRAINT "mailbox_send_attempt_orgId_fkey";

-- AlterTable
ALTER TABLE "e_invoice_request" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "mailbox_saved_view" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "mailbox_send_attempt";

-- DropEnum
DROP TYPE "mailbox_send_attempt_status";
