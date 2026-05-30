-- AlterTable: Add lastHeartbeatAt to MailboxSyncRun for stalled-sync detection.
ALTER TABLE "mailbox_sync_run" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);
