-- CreateEnum
CREATE TYPE "mailbox_sync_trigger_source" AS ENUM ('MANUAL', 'SCHEDULED', 'RENEWAL', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "mailbox_sync_mode" AS ENUM ('INITIAL', 'DELTA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "mailbox_audit_action" ADD VALUE 'SYNC_SCHEDULED_TRIGGERED';
ALTER TYPE "mailbox_audit_action" ADD VALUE 'SYNC_RENEWAL_TRIGGERED';
ALTER TYPE "mailbox_audit_action" ADD VALUE 'SYNC_DELTA_COMPLETED';
ALTER TYPE "mailbox_audit_action" ADD VALUE 'WATCH_RENEWED';
ALTER TYPE "mailbox_audit_action" ADD VALUE 'WATCH_EXPIRED_DETECTED';

-- AlterTable
ALTER TABLE "mailbox_connection" ADD COLUMN     "watchExpiresAt" TIMESTAMP(3),
ADD COLUMN     "watchRenewedAt" TIMESTAMP(3),
ADD COLUMN     "syncLeaseToken" TEXT,
ADD COLUMN     "syncLeaseExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "mailbox_sync_run" ADD COLUMN     "syncMode" "mailbox_sync_mode" NOT NULL DEFAULT 'INITIAL',
ADD COLUMN     "triggerSource" "mailbox_sync_trigger_source" NOT NULL DEFAULT 'MANUAL';
