-- CreateTable
CREATE TABLE "client_hub_customer_lifecycle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "enabledByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_hub_customer_lifecycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_hub_customer_lifecycle_customerId_key" ON "client_hub_customer_lifecycle"("customerId");

-- CreateIndex
CREATE INDEX "client_hub_customer_lifecycle_organizationId_customerId_idx" ON "client_hub_customer_lifecycle"("organizationId", "customerId");

-- AddForeignKey
ALTER TABLE "client_hub_customer_lifecycle" ADD CONSTRAINT "client_hub_customer_lifecycle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_hub_customer_lifecycle" ADD CONSTRAINT "client_hub_customer_lifecycle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
