-- CreateTable
CREATE TABLE IF NOT EXISTS "mailbox_folder_coverage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "mailboxConnectionId" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "lastAdvancedCursor" TEXT,
    "totalThreads" INTEGER NOT NULL DEFAULT 0,
    "lastCompletedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mailbox_folder_coverage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "mailbox_folder_coverage_orgId_mailboxConnectionId_folder_key" ON "mailbox_folder_coverage"("orgId", "mailboxConnectionId", "folder");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "mailbox_folder_coverage_orgId_mailboxConnectionId_idx" ON "mailbox_folder_coverage"("orgId", "mailboxConnectionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "mailbox_folder_coverage_orgId_mailboxConnectionId_state_idx" ON "mailbox_folder_coverage"("orgId", "mailboxConnectionId", "state");

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "mailbox_folder_coverage" ADD CONSTRAINT "mailbox_folder_coverage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "mailbox_folder_coverage" ADD CONSTRAINT "mailbox_folder_coverage_mailboxConnectionId_orgId_fkey" FOREIGN KEY ("mailboxConnectionId", "orgId") REFERENCES "mailbox_connection"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
