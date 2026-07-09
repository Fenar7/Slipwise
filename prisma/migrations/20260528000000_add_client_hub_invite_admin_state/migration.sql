-- AlterTable
ALTER TABLE "client_hub_customer_lifecycle" ADD COLUMN IF NOT EXISTS "latestInviteSentAt" TIMESTAMP(3);
ALTER TABLE "client_hub_customer_lifecycle" ADD COLUMN IF NOT EXISTS "latestInviteEmail" TEXT;
ALTER TABLE "client_hub_customer_lifecycle" ADD COLUMN IF NOT EXISTS "inviteSentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "client_hub_customer_lifecycle" ADD COLUMN IF NOT EXISTS "publicAccessHandle" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "client_hub_customer_lifecycle_publicAccessHandle_key" ON "client_hub_customer_lifecycle"("publicAccessHandle");
