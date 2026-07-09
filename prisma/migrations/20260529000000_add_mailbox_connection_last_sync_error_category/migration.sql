-- AlterTable: Add missing lastSyncErrorCategory column to mailbox_connection.
-- This column was added to the Prisma schema but never included in a migration.
ALTER TABLE "mailbox_connection" ADD COLUMN "lastSyncErrorCategory" TEXT;
