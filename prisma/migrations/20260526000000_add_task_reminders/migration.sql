-- Add reminder fields to messaging_task

ALTER TABLE "messaging_task"
  ADD COLUMN "reminderAt" TIMESTAMPTZ,
  ADD COLUMN "reminderSentAt" TIMESTAMPTZ;

-- Index for efficient reminder querying
CREATE INDEX "messaging_task_orgId_reminderAt_reminderSentAt_idx"
  ON "messaging_task"("orgId", "reminderAt", "reminderSentAt");
